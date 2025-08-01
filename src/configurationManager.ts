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
    initializationOptions?: any;
    settings?: any;
    env?: { [key: string]: string };
    transport?: 'stdio' | 'tcp' | 'websocket';
    tcpPort?: number;
    websocketUrl?: string;
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

    private validateConfig(config: any): config is LSPServerConfig {
        if (!config.languageId || typeof config.languageId !== 'string') {
            this.logger.error('Invalid config: missing or invalid languageId');
            return false;
        }

        if (!config.command || typeof config.command !== 'string') {
            this.logger.error(`Invalid config for ${config.languageId}: missing or invalid command`);
            return false;
        }

        if (!config.fileExtensions || !Array.isArray(config.fileExtensions) || config.fileExtensions.length === 0) {
            this.logger.error(`Invalid config for ${config.languageId}: missing or invalid fileExtensions`);
            return false;
        }

        if (config.transport && !['stdio', 'tcp', 'websocket'].includes(config.transport)) {
            this.logger.error(`Invalid config for ${config.languageId}: invalid transport ${config.transport}`);
            return false;
        }

        return true;
    }

    private buildMaps(): void {
        for (const config of this.configs) {
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
                if (cfg.filePatterns) {
                    for (const pattern of cfg.filePatterns) {
                        const globPattern = new vscode.RelativePattern(
                            cfg.workspacePattern || vscode.workspace.workspaceFolders![0],
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
}