import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    StreamInfo,
    State,
    StateChangeEvent
} from 'vscode-languageclient/node';
import * as net from 'net';
import { ConfigurationManager, LSPServerConfig } from './configurationManager';
import { Logger } from './logger';
import { EventEmitter } from 'events';

/** Connection timeout (ms) for the tcp transport. */
const TCP_CONNECT_TIMEOUT_MS = 10000;

interface ClientInfo {
    client: LanguageClient;
    config: LSPServerConfig;
    // `status` is owned solely by onDidChangeState (see handleClientStateChange).
    status: 'starting' | 'running' | 'stopped' | 'error';
    // Raw tcp socket (transport === 'tcp' only); tracked so teardown can destroy it.
    socket?: net.Socket;
    // File watcher backing synchronize.fileEvents; tracked so teardown can dispose it.
    watcher?: vscode.FileSystemWatcher;
}

export class LspProxyManager extends EventEmitter {
    // All maps are keyed by the config's stable id (config.id, fallback config.languageId).
    private clients: Map<string, ClientInfo> = new Map();
    private documentTracking: Map<string, Set<string>> = new Map();
    // In-flight start promises keyed by id, so concurrent ensureClientForConfig calls
    // for the same id await one start instead of double-constructing clients (H4).
    private starting: Map<string, Promise<void>> = new Map();

    constructor(
        private configManager: ConfigurationManager,
        private logger: Logger
    ) {
        super();
    }

    /** Stable identity used as the key across clients/documentTracking/starting maps. */
    private idFor(config: LSPServerConfig): string {
        return config.id ?? config.languageId;
    }

    async ensureClientForConfig(config: LSPServerConfig, document: vscode.TextDocument): Promise<void> {
        const id = this.idFor(config);
        const existing = this.clients.get(id);

        if (existing && (existing.status === 'running' || existing.status === 'starting')) {
            this.trackDocument(id, document.uri.toString());
            return;
        }

        // A start is already in flight for this id: await it instead of starting again.
        const inFlight = this.starting.get(id);
        if (inFlight) {
            await inFlight;
            this.trackDocument(id, document.uri.toString());
            return;
        }

        const p = this.startClient(config, document);
        this.starting.set(id, p);
        try {
            await p;
        } finally {
            this.starting.delete(id);
        }
    }

    private async startClient(config: LSPServerConfig, document?: vscode.TextDocument): Promise<void> {
        const id = this.idFor(config);
        let clientInfo: ClientInfo | undefined;
        try {
            this.logger.info(`Starting LSP client for ${id}`);

            // Tear down any existing client (esp. an 'error' zombie) before overwriting it,
            // so no started client is left orphaned in the map (H4).
            const existing = this.clients.get(id);
            if (existing) {
                await this.disposeClient(existing);
            }

            const socketHolder: { socket?: net.Socket } = {};
            const serverOptions = this.createServerOptions(config, socketHolder);
            const watcher = this.createFileEventsWatcher(config);
            const clientOptions = this.createClientOptions(config, watcher);

            const client = new LanguageClient(
                `generic-lsp-proxy-${config.languageId}`,
                `LSP Proxy: ${config.languageId}`,
                serverOptions,
                clientOptions
            );

            clientInfo = {
                client,
                config,
                status: 'starting',
                watcher
            };

            this.clients.set(id, clientInfo);

            client.onDidChangeState(event => {
                this.handleClientStateChange(id, event);
            });

            await client.start();

            // The tcp socket is created lazily by the ServerOptions factory during start();
            // capture it now so stopClient/disposeClient can destroy it.
            clientInfo.socket = socketHolder.socket;

            this.logger.info(`Started LSP client for ${id}`);

            if (document) {
                this.trackDocument(id, document.uri.toString());
            }

            this.emit('serversChanged');
        } catch (error) {
            this.logger.error(`Failed to start LSP client for ${id}`);
            this.logger.error(error instanceof Error ? error : new Error(String(error)));
            // Dispose the half-started client and drop the entry; do not leave an
            // 'error' zombie in the map for the next open to reuse (H4).
            if (clientInfo) {
                await this.disposeClient(clientInfo);
            }
            this.clients.delete(id);
            this.emit('serversChanged');
        }
    }

    /**
     * Best-effort teardown of a client and its tracked resources (socket, watcher).
     * Swallows and logs errors so a failure in one resource still releases the rest.
     */
    private async disposeClient(info: ClientInfo): Promise<void> {
        try {
            if (info.client.needsStop()) {
                await info.client.stop();
            }
        } catch (error) {
            this.logger.error(error instanceof Error ? error : new Error(String(error)));
        }

        try {
            info.socket?.destroy();
        } catch (error) {
            this.logger.error(error instanceof Error ? error : new Error(String(error)));
        }

        try {
            info.watcher?.dispose();
        } catch (error) {
            this.logger.error(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private createServerOptions(
        config: LSPServerConfig,
        socketHolder: { socket?: net.Socket }
    ): ServerOptions {
        const env = config.env ? { ...process.env, ...config.env } : process.env;

        if (config.transport === 'tcp') {
            // Defensive guard: validation guarantees a valid tcpPort for tcp, but the
            // manager must never silently spawn stdio for a misconfigured tcp config (H2).
            if (!config.tcpPort) {
                throw new Error(`tcp transport for ${this.idFor(config)} requires a tcpPort`);
            }
            const tcpPort = config.tcpPort;
            const tcpHost = config.tcpHost ?? '127.0.0.1';
            return () => {
                return new Promise<StreamInfo>((resolve, reject) => {
                    const socket = net.connect(tcpPort, tcpHost);
                    socketHolder.socket = socket;
                    socket.setTimeout(TCP_CONNECT_TIMEOUT_MS, () => {
                        socket.destroy();
                        reject(new Error('LSP tcp connect timeout'));
                    });
                    socket.on('connect', () => {
                        // Clear the connect timeout; an idle established connection is fine.
                        socket.setTimeout(0);
                        resolve({ writer: socket, reader: socket });
                    });
                    socket.on('error', err => {
                        socket.destroy();
                        reject(err);
                    });
                });
            };
        }

        const args = config.args || [];

        return {
            command: config.command,
            args: args,
            options: {
                env: env,
                // shell:true is required on Windows to resolve .cmd/.bat language-server
                // shims via PATHEXT. The metacharacter-injection risk this carries is
                // bounded by the Workspace Trust gate in extension.ts: createServerOptions
                // is only reached for trusted workspaces, where running config.command is
                // the extension's intended behavior.
                shell: process.platform === 'win32'
            },
            transport: TransportKind.stdio
        };
    }

    /**
     * Build a FileSystemWatcher scoped to the config's extensions, instead of the
     * full-tree '**\/*' watcher (LPM-5). A single extension still yields a valid
     * brace-set glob (e.g. '{ts}').
     */
    private createFileEventsWatcher(config: LSPServerConfig): vscode.FileSystemWatcher {
        const exts = config.fileExtensions.map(e => e.replace(/^\./, '')).filter(e => e.length > 0);
        const glob = exts.length > 0 ? `**/*.{${exts.join(',')}}` : '**/*';
        return vscode.workspace.createFileSystemWatcher(glob);
    }

    private createClientOptions(
        config: LSPServerConfig,
        watcher: vscode.FileSystemWatcher
    ): LanguageClientOptions {
        const documentSelector = [
            ...config.fileExtensions.map(ext => ({
                scheme: 'file',
                pattern: `**/*${ext.startsWith('.') ? ext : '.' + ext}`
            }))
        ];

        if (config.filePatterns) {
            documentSelector.push(...config.filePatterns.map(pattern => ({
                scheme: 'file',
                pattern
            })));
        }

        const clientOptions: LanguageClientOptions = {
            documentSelector,
            synchronize: {
                fileEvents: watcher
            },
            initializationOptions: config.initializationOptions,
            outputChannel: this.logger.getOutputChannel(),
            middleware: {
                provideCompletionItem: async (document, position, context, token, next) => {
                    this.logger.debug(`Completion requested for ${document.uri.toString()}`);
                    return next(document, position, context, token);
                },
                provideHover: async (document, position, token, next) => {
                    this.logger.debug(`Hover requested for ${document.uri.toString()}`);
                    return next(document, position, token);
                }
            }
        };

        if (config.settings) {
            clientOptions.initializationOptions = {
                ...clientOptions.initializationOptions,
                settings: config.settings
            };
        }

        return clientOptions;
    }

    private handleClientStateChange(id: string, event: StateChangeEvent): void {
        const clientInfo = this.clients.get(id);
        if (!clientInfo) {
            this.logger.warn(`No client info found for ${id} during state change`);
            return;
        }

        this.logger.debug(`Client ${id} state changed: ${event.oldState} -> ${event.newState}`);

        // onDidChangeState is the sole writer of status (S3).
        if (event.newState === State.Running) {
            clientInfo.status = 'running';
        } else if (event.newState === State.Starting) {
            clientInfo.status = 'starting';
        } else if (event.newState === State.Stopped) {
            clientInfo.status = 'stopped';
        }

        this.emit('serversChanged');
    }


    private trackDocument(id: string, documentUri: string): void {
        let documentSet = this.documentTracking.get(id);
        if (!documentSet) {
            documentSet = new Set();
            this.documentTracking.set(id, documentSet);
        }
        documentSet.add(documentUri);
        this.emit('serversChanged');
    }

    /** Remove a document uri from whichever id's tracking set holds it. */
    untrackDocument(documentUri: string): void {
        let changed = false;
        for (const documentSet of this.documentTracking.values()) {
            if (documentSet.delete(documentUri)) {
                changed = true;
            }
        }
        if (changed) {
            this.emit('serversChanged');
        }
    }


    async restartClient(id: string): Promise<void> {
        // Preserve the tracked document set across the restart: stopClient deletes the
        // tracking entry, so snapshot before stop and re-track after start (S3/LPM-9).
        const tracked = this.documentTracking.get(id);
        const preserved = tracked ? new Set(tracked) : undefined;

        await this.stopClient(id);

        const config = this.configManager.getConfigById(id);
        if (config) {
            await this.startClient(config);
            if (preserved) {
                for (const uri of preserved) {
                    this.trackDocument(id, uri);
                }
            }
        }
    }

    async stopClient(id: string): Promise<void> {
        const clientInfo = this.clients.get(id);
        if (!clientInfo) return;

        await this.disposeClient(clientInfo);

        this.logger.debug(`Removing client ${id} from tracking`);
        this.clients.delete(id);
        this.documentTracking.delete(id);
        this.emit('serversChanged');
    }

    async stopAllClients(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const id of this.clients.keys()) {
            promises.push(this.stopClient(id));
        }
        await Promise.all(promises);
    }

    getActiveServers(): Array<{
        id: string;
        languageId: string;
        command: string;
        status: string;
        documentCount: number;
    }> {
        const servers: Array<{
            id: string;
            languageId: string;
            command: string;
            status: string;
            documentCount: number;
        }> = [];

        for (const [id, clientInfo] of this.clients) {
            servers.push({
                id,
                languageId: clientInfo.config.languageId,
                command: clientInfo.config.command,
                status: clientInfo.status,
                documentCount: this.documentTracking.get(id)?.size ?? 0
            });
        }

        return servers;
    }
}
