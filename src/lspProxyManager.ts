import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    StreamInfo
} from 'vscode-languageclient/node';
import * as net from 'net';
import { ConfigurationManager, LSPServerConfig } from './configurationManager';
import { Logger } from './logger';
import { EventEmitter } from 'events';

interface ClientInfo {
    client: LanguageClient;
    config: LSPServerConfig;
    status: 'starting' | 'running' | 'stopped' | 'error';
    documentCount: number;
    restartCount: number;
    lastError?: string;
}

export class LspProxyManager extends EventEmitter {
    private clients: Map<string, ClientInfo> = new Map();
    private documentTracking: Map<string, Set<string>> = new Map();
    private restartTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(
        private configManager: ConfigurationManager,
        private logger: Logger
    ) {
        super();
    }

    async ensureClientForConfig(config: LSPServerConfig, document: vscode.TextDocument): Promise<void> {
        const existingClient = this.clients.get(config.languageId);
        
        if (existingClient && existingClient.status === 'running') {
            this.trackDocument(config.languageId, document.uri.toString());
            return;
        }

        if (existingClient && existingClient.status === 'starting') {
            this.trackDocument(config.languageId, document.uri.toString());
            return;
        }

        await this.startClient(config, document);
    }

    private async startClient(config: LSPServerConfig, document?: vscode.TextDocument): Promise<void> {
        try {
            this.logger.info(`Starting LSP client for ${config.languageId}`);
            
            const serverOptions = this.createServerOptions(config);
            const clientOptions = this.createClientOptions(config);
            
            const client = new LanguageClient(
                `generic-lsp-proxy-${config.languageId}`,
                `LSP Proxy: ${config.languageId}`,
                serverOptions,
                clientOptions
            );

            const clientInfo: ClientInfo = {
                client,
                config,
                status: 'starting',
                documentCount: 0,
                restartCount: 0
            };

            this.clients.set(config.languageId, clientInfo);

            client.onDidChangeState(event => {
                this.handleClientStateChange(config.languageId, event);
            });

            await client.start();
            
            clientInfo.status = 'running';
            this.logger.info(`Started LSP client for ${config.languageId}`);

            if (document) {
                this.trackDocument(config.languageId, document.uri.toString());
            }

            this.emit('serversChanged');
        } catch (error) {
            this.logger.error(`Failed to start LSP client for ${config.languageId}: ${error}`);
            const clientInfo = this.clients.get(config.languageId);
            if (clientInfo) {
                clientInfo.status = 'error';
                clientInfo.lastError = error instanceof Error ? error.message : String(error);
                this.scheduleRestart(config.languageId);
            }
        }
    }

    private createServerOptions(config: LSPServerConfig): ServerOptions {
        const env = config.env ? { ...process.env, ...config.env } : process.env;

        if (config.transport === 'tcp' && config.tcpPort) {
            return () => {
                return new Promise<StreamInfo>((resolve, reject) => {
                    const socket = net.connect(config.tcpPort!);
                    socket.on('connect', () => {
                        resolve({ writer: socket, reader: socket });
                    });
                    socket.on('error', reject);
                });
            };
        }

        const args = config.args || [];
        
        return {
            command: config.command,
            args: args,
            options: {
                env: env,
                shell: process.platform === 'win32'
            },
            transport: TransportKind.stdio
        };
    }

    private createClientOptions(config: LSPServerConfig): LanguageClientOptions {
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
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*')
            },
            initializationOptions: config.initializationOptions,
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

    private handleClientStateChange(languageId: string, event: any): void {
        const clientInfo = this.clients.get(languageId);
        if (!clientInfo) return;

        this.logger.debug(`Client ${languageId} state changed: ${event.oldState} -> ${event.newState}`);

        if (event.newState === 2) {
            clientInfo.status = 'running';
            clientInfo.restartCount = 0;
            this.cancelRestart(languageId);
        } else if (event.newState === 1) {
            clientInfo.status = 'starting';
        } else if (event.newState === 3) {
            clientInfo.status = 'stopped';
            this.scheduleRestart(languageId);
        }

        this.emit('serversChanged');
    }

    private trackDocument(languageId: string, documentUri: string): void {
        if (!this.documentTracking.has(languageId)) {
            this.documentTracking.set(languageId, new Set());
        }
        this.documentTracking.get(languageId)!.add(documentUri);
        
        const clientInfo = this.clients.get(languageId);
        if (clientInfo) {
            clientInfo.documentCount = this.documentTracking.get(languageId)!.size;
        }
    }

    private scheduleRestart(languageId: string): void {
        const autoRestart = vscode.workspace.getConfiguration('genericLspProxy').get<boolean>('autoRestart', true);
        if (!autoRestart) return;

        const clientInfo = this.clients.get(languageId);
        if (!clientInfo || clientInfo.restartCount >= 3) {
            this.logger.error(`Max restart attempts reached for ${languageId}`);
            return;
        }

        const delay = vscode.workspace.getConfiguration('genericLspProxy').get<number>('restartDelay', 1000);
        
        this.cancelRestart(languageId);
        
        const timer = setTimeout(async () => {
            const info = this.clients.get(languageId);
            if (info) {
                info.restartCount++;
                await this.startClient(info.config);
            }
        }, delay);

        this.restartTimers.set(languageId, timer);
        this.logger.info(`Scheduled restart for ${languageId} in ${delay}ms`);
    }

    private cancelRestart(languageId: string): void {
        const timer = this.restartTimers.get(languageId);
        if (timer) {
            clearTimeout(timer);
            this.restartTimers.delete(languageId);
        }
    }

    async restartClient(languageId: string): Promise<void> {
        await this.stopClient(languageId);
        const config = this.configManager.getConfigByLanguageId(languageId);
        if (config) {
            await this.startClient(config);
        }
    }

    async stopClient(languageId: string): Promise<void> {
        const clientInfo = this.clients.get(languageId);
        if (!clientInfo) return;

        this.cancelRestart(languageId);
        
        try {
            if (clientInfo.client.needsStop()) {
                await clientInfo.client.stop();
            }
        } catch (error) {
            this.logger.error(`Error stopping client ${languageId}: ${error}`);
        }

        this.clients.delete(languageId);
        this.documentTracking.delete(languageId);
        this.emit('serversChanged');
    }

    async stopAllClients(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const languageId of this.clients.keys()) {
            promises.push(this.stopClient(languageId));
        }
        await Promise.all(promises);
    }

    getActiveServers(): Array<{
        languageId: string;
        command: string;
        status: string;
        documentCount: number;
    }> {
        const servers: Array<{
            languageId: string;
            command: string;
            status: string;
            documentCount: number;
        }> = [];

        for (const [languageId, clientInfo] of this.clients) {
            servers.push({
                languageId,
                command: clientInfo.config.command,
                status: clientInfo.status,
                documentCount: clientInfo.documentCount
            });
        }

        return servers;
    }
}