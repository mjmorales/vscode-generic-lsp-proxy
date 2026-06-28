import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

export interface LSPServerConfig {
    id?: string; // populated after load; stable identity
    languageId: string;
    command: string;
    args?: string[];
    fileExtensions: string[];
    filePatterns?: string[];
    workspacePattern?: string;
    initializationOptions?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    env?: { [key: string]: string };
    transport?: 'stdio' | 'tcp';
    tcpPort?: number;
    tcpHost?: string; // optional, default applied in lspProxyManager
    disabled?: boolean;
}

/**
 * Resolve `p` against `folderFsPath`, returning the absolute path only if it stays
 * within `folderFsPath`. Returns `undefined` for inputs that escape the folder (via `..`)
 * or are absolute. Applied only to a *workspace/folder-scoped* `configPath` (untrusted in
 * unverified repos), so this guards path-traversal out of the workspace. A user/profile-scoped
 * value is set by the user, not the repo, and bypasses this guard (see `loadConfiguration`).
 */
export function resolveWithinFolder(folderFsPath: string, p: string): string | undefined {
    const resolved = path.resolve(folderFsPath, p);
    const rel = path.relative(folderFsPath, resolved);
    if (path.isAbsolute(rel) || rel === '..' || rel.startsWith(`..${path.sep}`)) {
        return undefined;
    }
    return resolved;
}

export class ConfigurationManager {
    private configs: LSPServerConfig[] = [];
    // Multiple configs may register for one extension/languageId (e.g. a language
    // server alongside a linter); maps hold every match, not a last-wins single.
    private fileExtensionMap: Map<string, LSPServerConfig[]> = new Map();
    private languageIdMap: Map<string, LSPServerConfig[]> = new Map();

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

        // A user/profile-scoped (or default) `configPath` is set by the user and is trusted:
        // absolute paths and `..` are honored, and an absolute one is workspace-independent
        // (loaded once, applied across all folders). A workspace/folder-scoped value is
        // repo-controlled and stays subject to the path-containment guard (CFG-5), since an
        // unverified repo could otherwise point it outside the workspace. Scope is read via
        // inspect() per folder so multi-root overrides are honored.
        const loadedAbsolute = new Set<string>();
        for (const folder of workspaceFolders) {
            const inspected = vscode.workspace
                .getConfiguration('genericLspProxy', folder.uri)
                .inspect<string>('configPath');
            const configPath = inspected?.workspaceFolderValue
                ?? inspected?.workspaceValue
                ?? inspected?.globalValue
                ?? inspected?.defaultValue
                ?? '.vscode/lsp-proxy.json';
            const trusted = inspected?.workspaceFolderValue === undefined
                && inspected?.workspaceValue === undefined;

            if (trusted && path.isAbsolute(configPath)) {
                // Workspace-independent; load once even across multiple folders.
                if (!loadedAbsolute.has(configPath)) {
                    loadedAbsolute.add(configPath);
                    await this.loadTrustedConfig(configPath);
                }
                continue;
            }

            await this.loadConfigFromWorkspace(folder, configPath, trusted);
        }

        await this.loadGlobalConfig();

        // Restore disabled state from workspace state (keyed by stable id).
        // Merge with the file-declared flag so either source can disable a config.
        const disabledIds = this.context.workspaceState.get<string[]>('disabledLspConfigs', []);
        for (const config of this.configs) {
            config.disabled = disabledIds.includes(config.id!) || config.disabled;
        }
        
        this.buildMaps();
        this.logger.info(`Loaded ${this.configs.length} LSP configurations`);
    }

    private async loadConfigFromWorkspace(folder: vscode.WorkspaceFolder, configPath: string, trusted: boolean): Promise<void> {
        // Trusted (user/profile/default) values resolve plainly; untrusted (repo-supplied)
        // values stay within the folder via the containment guard.
        const absolutePath = trusted
            ? path.resolve(folder.uri.fsPath, configPath)
            : resolveWithinFolder(folder.uri.fsPath, configPath);
        if (absolutePath === undefined) {
            this.logger.error(`Invalid configPath "${configPath}": escapes workspace folder ${folder.uri.fsPath}; skipping`);
            return;
        }

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
                        const stored: LSPServerConfig = {
                            ...config,
                            id: this.configId(config),
                            workspacePattern: config.workspacePattern ?? folder?.uri.fsPath,
                        };
                        this.configs.push(stored);
                        this.logger.info(`Loaded config for ${stored.languageId} from ${filePath}`);
                    }
                }
            } else if (this.validateConfig(configs)) {
                const stored: LSPServerConfig = {
                    ...configs,
                    id: this.configId(configs),
                    workspacePattern: configs.workspacePattern ?? folder?.uri.fsPath,
                };
                this.configs.push(stored);
                this.logger.info(`Loaded config for ${stored.languageId} from ${filePath}`);
            }
        } catch (error) {
            this.logger.error(`Failed to load config from ${filePath}: ${error}`);
        }
    }

    /**
     * Load a user/profile-scoped absolute `configPath`. It is workspace-independent, so it is
     * loaded once with no folder binding (its configs apply across all workspace folders).
     * A missing file is a warning, not an error — the user may not have created it yet.
     */
    private async loadTrustedConfig(absolutePath: string): Promise<void> {
        if (fs.existsSync(absolutePath)) {
            await this.loadConfigFile(absolutePath);
        } else {
            this.logger.warn(`configPath "${absolutePath}" not found; skipping`);
        }
    }

    private async loadGlobalConfig(): Promise<void> {
        const globalConfigPath = path.join(this.context.globalStorageUri.fsPath, 'lsp-proxy.json');
        if (fs.existsSync(globalConfigPath)) {
            await this.loadConfigFile(globalConfigPath);
        }
    }

    /** Deterministic stable identity. pylsp/pyright (same languageId) get distinct ids via their command. */
    private configId(c: LSPServerConfig): string {
        return `${c.languageId}::${c.command}`;
    }

    private validateConfig(config: unknown): config is LSPServerConfig {
        const cfg = config as Record<string, unknown>;
        if (!cfg.languageId || typeof cfg.languageId !== 'string') {
            this.logger.error('Invalid config: missing or invalid languageId');
            return false;
        }
        const languageId = cfg.languageId;

        if (!cfg.command || typeof cfg.command !== 'string') {
            this.logger.error(`Invalid config for ${languageId}: missing or invalid command`);
            return false;
        }

        if (!Array.isArray(cfg.fileExtensions) || cfg.fileExtensions.length === 0) {
            this.logger.error(`Invalid config for ${languageId}: missing or invalid fileExtensions`);
            return false;
        }
        if (!cfg.fileExtensions.every(e => typeof e === 'string')) {
            this.logger.error(`Invalid config for ${languageId}: fileExtensions must be an array of strings`);
            return false;
        }

        if (cfg.filePatterns !== undefined &&
            (!Array.isArray(cfg.filePatterns) || !cfg.filePatterns.every(p => typeof p === 'string'))) {
            this.logger.error(`Invalid config for ${languageId}: filePatterns must be an array of strings`);
            return false;
        }

        if (cfg.args !== undefined &&
            (!Array.isArray(cfg.args) || !cfg.args.every(a => typeof a === 'string'))) {
            this.logger.error(`Invalid config for ${languageId}: args must be an array of strings`);
            return false;
        }

        if (cfg.env !== undefined) {
            const env = cfg.env;
            if (typeof env !== 'object' || env === null || Array.isArray(env) ||
                !Object.values(env).every(v => typeof v === 'string')) {
                this.logger.error(`Invalid config for ${languageId}: env must be a record of string to string`);
                return false;
            }
        }

        if (cfg.tcpPort !== undefined && !this.isValidTcpPort(cfg.tcpPort)) {
            this.logger.error(`Invalid config for ${languageId}: tcpPort must be an integer in 1..65535`);
            return false;
        }

        if (cfg.transport && !['stdio', 'tcp'].includes(cfg.transport as string)) {
            this.logger.error(`Invalid config for ${languageId}: invalid transport ${cfg.transport}`);
            return false;
        }

        // Cross-field: tcp transport requires a valid port.
        if (cfg.transport === 'tcp' && !this.isValidTcpPort(cfg.tcpPort)) {
            this.logger.error(`Invalid config for ${languageId}: transport 'tcp' requires an integer tcpPort in 1..65535`);
            return false;
        }

        return true;
    }

    private isValidTcpPort(port: unknown): boolean {
        return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
    }

    private buildMaps(): void {
        for (const config of this.configs) {
            // Skip disabled configurations
            if (config.disabled) {
                this.logger.info(`Skipping disabled configuration for ${config.languageId}`);
                continue;
            }

            // Co-registration is intended (multiple clients per file); append rather
            // than shadow. Log at debug so collisions stay diagnosable.
            this.appendToMap(this.languageIdMap, config.languageId, config);

            for (const ext of config.fileExtensions) {
                const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
                this.appendToMap(this.fileExtensionMap, normalizedExt, config);
            }
        }
    }

    private appendToMap(map: Map<string, LSPServerConfig[]>, key: string, config: LSPServerConfig): void {
        const existing = map.get(key);
        if (existing) {
            this.logger.debug(`Additional config for '${key}': '${config.command}' co-registered`);
            existing.push(config);
        } else {
            map.set(key, [config]);
        }
    }

    /**
     * Every config that matches the document, by extension OR languageId OR
     * filePattern (union, deduped by stable id). VS Code merges results across
     * multiple language clients, so a file may legitimately drive several servers.
     */
    getConfigsForDocument(document: vscode.TextDocument): LSPServerConfig[] {
        const fileName = document.fileName;
        const ext = path.extname(fileName);

        // Dedup by id: a config can match by both extension and languageId.
        const matched = new Map<string, LSPServerConfig>();
        const add = (cfg: LSPServerConfig) => {
            if (this.matchesWorkspacePattern(cfg, fileName)) {
                matched.set(this.configId(cfg), cfg);
            }
        };

        for (const cfg of this.fileExtensionMap.get(ext) ?? []) {
            add(cfg);
        }
        for (const cfg of this.languageIdMap.get(document.languageId) ?? []) {
            add(cfg);
        }

        for (const cfg of this.configs) {
            // Skip disabled configs and any already matched by extension/languageId.
            if (cfg.disabled || matched.has(this.configId(cfg)) || !cfg.filePatterns) continue;

            // RelativePattern base must be the WorkspaceFolder object, not the
            // workspacePattern string (which is an fsPath/glob, not a folder).
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
                ?? vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) continue;

            for (const pattern of cfg.filePatterns) {
                const globPattern = new vscode.RelativePattern(workspaceFolder, pattern);
                if (vscode.languages.match({ pattern: globPattern }, document)) {
                    add(cfg);
                    break;
                }
            }
        }

        return [...matched.values()];
    }

    /**
     * Scope by workspacePattern only when it is an absolute path prefix;
     * glob-shaped values (e.g. '**\/*') are not path prefixes and must not gate.
     */
    private matchesWorkspacePattern(config: LSPServerConfig, fileName: string): boolean {
        if (config.workspacePattern && path.isAbsolute(config.workspacePattern)) {
            return fileName.startsWith(config.workspacePattern);
        }
        return true;
    }

    getConfigsByLanguageId(languageId: string): LSPServerConfig[] {
        return this.languageIdMap.get(languageId) ?? [];
    }

    getConfigById(id: string): LSPServerConfig | undefined {
        return this.configs.find(c => c.id === id);
    }

    getAllConfigs(): LSPServerConfig[] {
        return [...this.configs];
    }

    async markConfigAsDisabled(id: string): Promise<void> {
        const config = this.configs.find(c => c.id === id);
        if (config) {
            config.disabled = true;
            this.logger.info(`Marked configuration ${id} as disabled`);

            // Save the disabled state to workspace state (keyed by stable id)
            const disabledIds = this.context.workspaceState.get<string[]>('disabledLspConfigs', []);
            if (!disabledIds.includes(id)) {
                disabledIds.push(id);
                await this.persistDisabledIds(disabledIds);
            }

            // Rebuild maps to remove disabled config
            this.fileExtensionMap.clear();
            this.languageIdMap.clear();
            this.buildMaps();
        }
    }

    async enableConfig(id: string): Promise<void> {
        const config = this.configs.find(c => c.id === id);
        if (config) {
            config.disabled = false;
            this.logger.info(`Re-enabled configuration ${id}`);

            // Update workspace state (keyed by stable id)
            const disabledIds = this.context.workspaceState.get<string[]>('disabledLspConfigs', []);
            const index = disabledIds.indexOf(id);
            if (index > -1) {
                disabledIds.splice(index, 1);
                await this.persistDisabledIds(disabledIds);
            }

            // Rebuild maps to include re-enabled config
            this.fileExtensionMap.clear();
            this.languageIdMap.clear();
            this.buildMaps();
        }
    }

    private async persistDisabledIds(disabledIds: string[]): Promise<void> {
        try {
            await this.context.workspaceState.update('disabledLspConfigs', disabledIds);
        } catch (error) {
            this.logger.error(`Failed to persist disabledLspConfigs: ${error}`);
        }
    }

    getDisabledConfigs(): LSPServerConfig[] {
        return this.configs.filter(c => c.disabled);
    }
}