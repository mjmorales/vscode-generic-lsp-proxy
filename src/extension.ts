import * as vscode from 'vscode';
import { LspProxyManager } from './lspProxyManager';
import { ConfigurationManager } from './configurationManager';
import { Logger } from './logger';

let lspManager: LspProxyManager;
let configManager: ConfigurationManager;
let logger: Logger;

export async function activate(context: vscode.ExtensionContext) {
    logger = new Logger('GenericLspProxy');
    logger.info('Activating Generic LSP Proxy extension');

    configManager = new ConfigurationManager(context, logger);
    lspManager = new LspProxyManager(configManager, logger);

    await configManager.loadConfiguration();

    context.subscriptions.push(
        vscode.commands.registerCommand('genericLspProxy.restart', handleRestartCommand),
        vscode.commands.registerCommand('genericLspProxy.showActiveServers', handleShowActiveServersCommand),
        vscode.commands.registerCommand('genericLspProxy.reloadConfig', handleReloadConfigCommand),
        vscode.workspace.onDidOpenTextDocument(handleDocumentOpen),
        vscode.workspace.onDidChangeConfiguration(handleConfigurationChange),
        vscode.workspace.onDidChangeWorkspaceFolders(handleWorkspaceFoldersChange)
    );

    vscode.workspace.textDocuments.forEach(handleDocumentOpen);

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'genericLspProxy.showActiveServers';
    updateStatusBar(statusBarItem);
    context.subscriptions.push(statusBarItem);

    lspManager.on('serversChanged', () => updateStatusBar(statusBarItem));
}

export async function deactivate() {
    logger?.info('Deactivating Generic LSP Proxy extension');
    await lspManager?.stopAllClients();
}

async function handleDocumentOpen(document: vscode.TextDocument) {
    if (document.uri.scheme !== 'file') {
        return;
    }

    const config = configManager.getConfigForDocument(document);
    if (config) {
        await lspManager.ensureClientForConfig(config, document);
    }
}

async function handleRestartCommand() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showInformationMessage('No active editor');
        return;
    }

    const config = configManager.getConfigForDocument(activeEditor.document);
    if (!config) {
        vscode.window.showInformationMessage('No LSP configuration found for current file');
        return;
    }

    await lspManager.restartClient(config.languageId);
    vscode.window.showInformationMessage(`Restarted LSP server for ${config.languageId}`);
}

async function handleShowActiveServersCommand() {
    const servers = lspManager.getActiveServers();
    if (servers.length === 0) {
        vscode.window.showInformationMessage('No active LSP servers');
        return;
    }

    const items = servers.map(server => ({
        label: server.languageId,
        description: server.command,
        detail: `Status: ${server.status} | Documents: ${server.documentCount}`
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Active LSP Servers',
        canPickMany: false
    });

    if (selected) {
        const action = await vscode.window.showQuickPick(['Restart', 'Stop', 'Cancel'], {
            placeHolder: `Action for ${selected.label}`
        });

        if (action === 'Restart') {
            await lspManager.restartClient(selected.label);
        } else if (action === 'Stop') {
            await lspManager.stopClient(selected.label);
        }
    }
}

async function handleReloadConfigCommand() {
    await configManager.loadConfiguration();
    vscode.window.showInformationMessage('LSP configuration reloaded');
    
    await lspManager.stopAllClients();
    vscode.workspace.textDocuments.forEach(handleDocumentOpen);
}

async function handleConfigurationChange(e: vscode.ConfigurationChangeEvent) {
    if (e.affectsConfiguration('genericLspProxy')) {
        await handleReloadConfigCommand();
    }
}

async function handleWorkspaceFoldersChange() {
    await configManager.loadConfiguration();
}

function updateStatusBar(statusBarItem: vscode.StatusBarItem) {
    const activeCount = lspManager.getActiveServers().length;
    statusBarItem.text = `$(server) LSP: ${activeCount}`;
    statusBarItem.tooltip = `${activeCount} active LSP server${activeCount !== 1 ? 's' : ''}. Click to manage.`;
    
    if (activeCount > 0) {
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}