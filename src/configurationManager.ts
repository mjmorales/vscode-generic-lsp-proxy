import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

export interface LSPServerConfig {
    languageId: string;
    command: string;
    args?: string[];
    fileExtensions: string[];
    filePatterns?: string[];
    workspacePattern?: string;
    initializationOptions?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    env?: { [key: string]: string };
    transport?: 'stdio' | 'tcp' | 'websocket';
    tcpPort?: number;
    websocketUrl?: string;
    disabled?: boolean;
}

export class ConfigurationManager {
    private configs: LSPServerConfig[] = [];
    private fileExtensionMap: Map<string, LSPServerConfig> = new Map();
    private languageIdMap: Map<string, LSPServerConfig> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}

    async loadConfiguration(): Promise<void> {
        this.configs = [];
        this.fileExtensionMap.clear();
        this.languageIdMap.clear();

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            this.logger.warn('No workspace folders found');
            return;
        }

        const configPath = vscode.workspace.getConfiguration('genericLspProxy').get<string>('configPath', '.vscode/lsp-proxy.json');

        for (const folder of workspaceFolders) {
            await this.loadConfigFromWorkspace(folder, configPath);
        }

        await this.loadGlobalConfig();

        // Restore disabled state from workspace state
        const disabledConfigs = this.context.workspaceState.get<string[]>('disabledLspConfigs', []);
        for (const config of this.configs) {
            if (disabledConfigs.includes(config.languageId)) {
                config.disabled = true;
            }
        }
        
        this.buildMaps();
        this.logger.info(`Loaded ${this.configs.length} LSP configurations`);
    }

    private async loadConfigFromWorkspace(folder: vscode.WorkspaceFolder, configPath: string): Promise<void> {
        const absolutePath = path.join(folder.uri.fsPath, configPath);
        
        if (!fs.existsSync(absolutePath)) {
            const alternativePath = path.join(folder.uri.fsPath, '.lsp-proxy.json');
            if (fs.existsSync(alternativePath)) {
                await this.loadConfigFile(alternativePath, folder);
            }
            return;
        }

        await this.loadConfigFile(absolutePath, folder);
    }

    private async loadConfigFile(filePath: string, folder?: vscode.WorkspaceFolder): Promise<void> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const configs = JSON.parse(content);
            
            if (Array.isArray(configs)) {
                for (const config of configs) {
                    if (this.validateConfig(config)) {
                        if (folder && config.workspacePattern === undefined) {
                            config.workspacePattern = folder.uri.fsPath;
                        }
                        this.configs.push(config);
                        this.logger.info(`Loaded config for ${config.languageId} from ${filePath}`);
                    }
                }
            } else if (this.validateConfig(configs)) {
                if (folder && configs.workspacePattern === undefined) {
                    configs.workspacePattern = folder.uri.fsPath;
                }
                this.configs.push(configs);
                this.logger.info(`Loaded config for ${configs.languageId} from ${filePath}`);
            }
        } catch (error) {
            this.logger.error(`Failed to load config from ${filePath}: ${error}`);
        }
    }

    private async loadGlobalConfig(): Promise<void> {
        const globalConfigPath = path.join(this.context.globalStorageUri.fsPath, 'lsp-proxy.json');
        if (fs.existsSync(globalConfigPath)) {
            await this.loadConfigFile(globalConfigPath);
        }
    }

    private validateConfig(config: unknown): config is LSPServerConfig {
        const cfg = config as Record<string, unknown>;
        if (!cfg.languageId || typeof cfg.languageId !== 'string') {
            this.logger.error('Invalid config: missing or invalid languageId');
            return false;
        }

        if (!cfg.command || typeof cfg.command !== 'string') {
            this.logger.error(`Invalid config for ${cfg.languageId}: missing or invalid command`);
            return false;
        }

        if (!cfg.fileExtensions || !Array.isArray(cfg.fileExtensions) || cfg.fileExtensions.length === 0) {
            this.logger.error(`Invalid config for ${cfg.languageId}: missing or invalid fileExtensions`);
            return false;
        }

        if (cfg.transport && !['stdio', 'tcp', 'websocket'].includes(cfg.transport as string)) {
            this.logger.error(`Invalid config for ${cfg.languageId}: invalid transport ${cfg.transport}`);
            return false;
        }

        return true;
    }

    private buildMaps(): void {
        for (const config of this.configs) {
            // Skip disabled configurations
            if (config.disabled) {
                this.logger.info(`Skipping disabled configuration for ${config.languageId}`);
                continue;
            }
            
            this.languageIdMap.set(config.languageId, config);
            
            for (const ext of config.fileExtensions) {
                const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
                this.fileExtensionMap.set(normalizedExt, config);
            }
        }
    }

    getConfigForDocument(document: vscode.TextDocument): LSPServerConfig | undefined {
        const fileName = document.fileName;
        const ext = path.extname(fileName);
        
        let config = this.fileExtensionMap.get(ext);
        
        if (!config) {
            for (const [languageId, cfg] of this.languageIdMap) {
                if (document.languageId === languageId) {
                    config = cfg;
                    break;
                }
            }
        }

        if (!config) {
            for (const cfg of this.configs) {
                // Skip disabled configurations
                if (cfg.disabled) continue;
                
                if (cfg.filePatterns) {
                    for (const pattern of cfg.filePatterns) {
                        const workspaceFolder = cfg.workspacePattern || 
                            (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]);
                        if (!workspaceFolder) continue;
                        
                        const globPattern = new vscode.RelativePattern(
                            workspaceFolder,
                            pattern
                        );
                        if (vscode.languages.match({ pattern: globPattern }, document)) {
                            config = cfg;
                            break;
                        }
                    }
                }
                if (config) break;
            }
        }

        if (config && config.workspacePattern) {
            if (!fileName.startsWith(config.workspacePattern)) {
                return undefined;
            }
        }

        return config;
    }

    getConfigByLanguageId(languageId: string): LSPServerConfig | undefined {
        return this.languageIdMap.get(languageId);
    }

    getAllConfigs(): LSPServerConfig[] {
        return [...this.configs];
    }

    markConfigAsDisabled(languageId: string): void {
        const config = this.configs.find(c => c.languageId === languageId);
        if (config) {
            config.disabled = true;
            this.logger.info(`Marked configuration for ${languageId} as disabled`);
            
            // Save the disabled state to workspace state
            const disabledConfigs = this.context.workspaceState.get<string[]>('disabledLspConfigs', []);
            if (!disabledConfigs.includes(languageId)) {
                disabledConfigs.push(languageId);
                this.context.workspaceState.update('disabledLspConfigs', disabledConfigs);
            }
            
            // Rebuild maps to remove disabled config
            this.fileExtensionMap.clear();
            this.languageIdMap.clear();
            this.buildMaps();
        }
    }

    enableConfig(languageId: string): void {
        const config = this.configs.find(c => c.languageId === languageId);
        if (config) {
            config.disabled = false;
            this.logger.info(`Re-enabled configuration for ${languageId}`);
            
            // Update workspace state
            const disabledConfigs = this.context.workspaceState.get<string[]>('disabledLspConfigs', []);
            const index = disabledConfigs.indexOf(languageId);
            if (index > -1) {
                disabledConfigs.splice(index, 1);
                this.context.workspaceState.update('disabledLspConfigs', disabledConfigs);
            }
            
            // Rebuild maps to include re-enabled config
            this.fileExtensionMap.clear();
            this.languageIdMap.clear();
            this.buildMaps();
        }
    }

    getDisabledConfigs(): LSPServerConfig[] {
        return this.configs.filter(c => c.disabled);
    }
}