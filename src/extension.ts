import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LspProxyManager } from './lspProxyManager';
import { ConfigurationManager, LSPServerConfig } from './configurationManager';
import { Logger } from './logger';
import { languageTemplates } from './languageTemplates';

let lspManager: LspProxyManager;
let configManager: ConfigurationManager;
let logger: Logger;

export async function activate(context: vscode.ExtensionContext) {
    logger = new Logger('Generic LSP Proxy');
    logger.info('Activating Generic LSP Proxy extension');

    configManager = new ConfigurationManager(context, logger);
    lspManager = new LspProxyManager(configManager, logger);

    await configManager.loadConfiguration();

    context.subscriptions.push(
        vscode.commands.registerCommand('genericLspProxy.restart', handleRestartCommand),
        vscode.commands.registerCommand('genericLspProxy.showActiveServers', handleShowActiveServersCommand),
        vscode.commands.registerCommand('genericLspProxy.reloadConfig', handleReloadConfigCommand),
        vscode.commands.registerCommand('genericLspProxy.init', () => handleInitCommand(context)),
        vscode.commands.registerCommand('genericLspProxy.showDisabledServers', handleShowDisabledServersCommand),
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
    logger?.dispose();
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

async function handleShowDisabledServersCommand() {
    const disabledConfigs = configManager.getDisabledConfigs();
    
    if (disabledConfigs.length === 0) {
        vscode.window.showInformationMessage('No disabled LSP servers');
        return;
    }

    const items = disabledConfigs.map(config => ({
        label: config.languageId,
        description: config.command,
        detail: `Extensions: ${config.fileExtensions.join(', ')}`,
        config
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a disabled server to re-enable',
        canPickMany: false
    });

    if (selected) {
        configManager.enableConfig(selected.config.languageId);
        vscode.window.showInformationMessage(`Re-enabled LSP server for ${selected.config.languageId}`);
        
        // Try to start the server for any open documents
        vscode.workspace.textDocuments.forEach(doc => {
            const config = configManager.getConfigForDocument(doc);
            if (config && config.languageId === selected.config.languageId) {
                handleDocumentOpen(doc);
            }
        });
    }
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

async function handleInitCommand(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Please open a workspace folder before initializing LSP configuration.');
        return;
    }

    // Check if config already exists
    const configPath = vscode.workspace.getConfiguration('genericLspProxy').get<string>('configPath', '.vscode/lsp-proxy.json');
    const fullConfigPath = path.join(workspaceFolders[0].uri.fsPath, configPath);
    
    if (fs.existsSync(fullConfigPath)) {
        const action = await vscode.window.showWarningMessage(
            'LSP configuration already exists. Do you want to overwrite it?',
            'Yes',
            'No'
        );
        if (action !== 'Yes') {
            return;
        }
    }

    // Step 1: Choose configuration method
    const configMethod = await vscode.window.showQuickPick([
        {
            label: '$(symbol-misc) Custom Configuration',
            description: 'Create a custom LSP configuration',
            value: 'custom'
        },
        {
            label: '$(file-code) From Template',
            description: 'Use a predefined language template',
            value: 'template'
        }
    ], {
        placeHolder: 'How would you like to configure your LSP?',
        ignoreFocusOut: true
    });

    if (!configMethod) {
        return;
    }

    let configs: LSPServerConfig[] = [];

    if (configMethod.value === 'template') {
        // Show language templates
        const template = await vscode.window.showQuickPick(
            languageTemplates.map(t => ({
                label: t.name,
                description: t.description,
                detail: t.installCommand ? `Install: ${t.installCommand}` : undefined,
                template: t
            })),
            {
                placeHolder: 'Select a language template',
                ignoreFocusOut: true
            }
        );

        if (!template) {
            return;
        }

        configs.push(template.template.config);

        if (template.template.installCommand) {
            vscode.window.showInformationMessage(
                `To use ${template.template.name}, install the language server:`,
                'Copy Command'
            ).then(selection => {
                if (selection === 'Copy Command' && template.template.installCommand) {
                    vscode.env.clipboard.writeText(template.template.installCommand);
                    vscode.window.showInformationMessage('Install command copied to clipboard!');
                }
            });
        }
    } else {
        // Custom configuration
        const languageId = await vscode.window.showInputBox({
            prompt: 'Enter the language ID (e.g., python, rust, custom)',
            placeHolder: 'languageId',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Language ID is required';
                }
                return null;
            }
        });

        if (!languageId) {
            return;
        }

        const command = await vscode.window.showInputBox({
            prompt: 'Enter the LSP server command',
            placeHolder: 'your-lsp-server',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Command is required';
                }
                return null;
            }
        });

        if (!command) {
            return;
        }

        const fileExtensionsInput = await vscode.window.showInputBox({
            prompt: 'Enter file extensions (comma-separated)',
            placeHolder: '.py, .pyw',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'At least one file extension is required';
                }
                return null;
            }
        });

        if (!fileExtensionsInput) {
            return;
        }

        const fileExtensions = fileExtensionsInput.split(',').map(ext => ext.trim());

        const transportType = await vscode.window.showQuickPick([
            { label: 'stdio', description: 'Standard input/output (default)' },
            { label: 'tcp', description: 'TCP socket connection' },
            { label: 'websocket', description: 'WebSocket connection' }
        ], {
            placeHolder: 'Select transport type',
            ignoreFocusOut: true
        });

        const config: LSPServerConfig = {
            languageId,
            command,
            fileExtensions
        };

        if (transportType && transportType.label !== 'stdio') {
            config.transport = transportType.label as 'tcp' | 'websocket';
            
            if (transportType.label === 'tcp') {
                const tcpPort = await vscode.window.showInputBox({
                    prompt: 'Enter TCP port number',
                    placeHolder: '9999',
                    ignoreFocusOut: true,
                    validateInput: (value) => {
                        const port = parseInt(value);
                        if (isNaN(port) || port < 1 || port > 65535) {
                            return 'Please enter a valid port number (1-65535)';
                        }
                        return null;
                    }
                });

                if (!tcpPort) {
                    return;
                }

                config.tcpPort = parseInt(tcpPort);
            } else if (transportType.label === 'websocket') {
                const websocketUrl = await vscode.window.showInputBox({
                    prompt: 'Enter WebSocket URL',
                    placeHolder: 'ws://localhost:8080/lsp',
                    ignoreFocusOut: true,
                    validateInput: (value) => {
                        try {
                            new URL(value);
                            return null;
                        } catch {
                            return 'Please enter a valid WebSocket URL';
                        }
                    }
                });

                if (!websocketUrl) {
                    return;
                }

                config.websocketUrl = websocketUrl;
            }
        }

        // Ask for optional arguments
        const args = await vscode.window.showInputBox({
            prompt: 'Enter command arguments (optional, comma-separated)',
            placeHolder: '--stdio, --verbose',
            ignoreFocusOut: true
        });

        if (args && args.trim().length > 0) {
            config.args = args.split(',').map(arg => arg.trim());
        }

        configs.push(config);
    }

    // Ask if user wants to add more configurations
    const addMore = await vscode.window.showQuickPick([
        { label: 'No', description: 'Save current configuration' },
        { label: 'Yes', description: 'Add another language server' }
    ], {
        placeHolder: 'Do you want to add another language server configuration?',
        ignoreFocusOut: true
    });

    if (addMore && addMore.label === 'Yes') {
        // Recursively call init command to add more configs
        // Store the current configs and merge with new ones
        const existingConfigs = configs;
        await handleInitCommand(context);
        
        // Read the newly created config and merge
        if (fs.existsSync(fullConfigPath)) {
            try {
                const newConfigs = JSON.parse(fs.readFileSync(fullConfigPath, 'utf-8'));
                configs = [...existingConfigs, ...newConfigs];
            } catch (error) {
                logger.error(`Failed to read newly created config: ${error}`);
                configs = existingConfigs;
            }
        }
    }

    // Create .vscode directory if it doesn't exist
    const vscodePath = path.join(workspaceFolders[0].uri.fsPath, '.vscode');
    if (!fs.existsSync(vscodePath)) {
        fs.mkdirSync(vscodePath, { recursive: true });
    }

    // Write configuration file
    try {
        fs.writeFileSync(fullConfigPath, JSON.stringify(configs, null, 2));
        vscode.window.showInformationMessage(`LSP configuration created at ${configPath}`);
        
        // Reload configuration
        await configManager.loadConfiguration();
        vscode.workspace.textDocuments.forEach(handleDocumentOpen);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create configuration: ${error}`);
    }
}