import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LspProxyManager } from './lspProxyManager';
import { ConfigurationManager, LSPServerConfig, resolveWithinFolder } from './configurationManager';
import { Logger } from './logger';
import { languageTemplates, validateTemplates } from './languageTemplates';

let lspManager: LspProxyManager;
let configManager: ConfigurationManager;
let logger: Logger;

// Current config-file watcher set. Held at module scope (not just context.subscriptions)
// so it can be disposed and rebuilt when configPath or the workspace folders change.
let configFileWatchers: vscode.Disposable[] = [];

// Debounce window for the config-file watcher, so a burst of FS events (e.g. an
// editor writing a temp file then renaming it over the target) triggers one reload.
const CONFIG_WATCH_DEBOUNCE_MS = 300;

export async function activate(context: vscode.ExtensionContext) {
    logger = new Logger('Generic LSP Proxy');
    logger.info('Activating Generic LSP Proxy extension');

    configManager = new ConfigurationManager(context, logger);
    lspManager = new LspProxyManager(configManager, logger);

    // Commands and the status bar are always registered, even in an untrusted
    // workspace. Only the process-spawning paths below are gated on trust (C1/EXT-1).
    context.subscriptions.push(
        vscode.commands.registerCommand('genericLspProxy.restart', handleRestartCommand),
        vscode.commands.registerCommand('genericLspProxy.showActiveServers', handleShowActiveServersCommand),
        vscode.commands.registerCommand('genericLspProxy.reloadConfig', handleReloadConfigCommand),
        vscode.commands.registerCommand('genericLspProxy.init', () => handleInitCommand()),
        vscode.commands.registerCommand('genericLspProxy.showDisabledServers', handleShowDisabledServersCommand),
        vscode.commands.registerCommand('genericLspProxy.disable', handleDisableServerCommand),
        vscode.workspace.onDidOpenTextDocument(handleDocumentOpen),
        vscode.workspace.onDidCloseTextDocument(doc => lspManager.untrackDocument(doc.uri.toString())),
        vscode.workspace.onDidChangeConfiguration(handleConfigurationChange),
        vscode.workspace.onDidChangeWorkspaceFolders(handleWorkspaceFoldersChange)
    );

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'genericLspProxy.showActiveServers';
    updateStatusBar(statusBarItem);
    context.subscriptions.push(statusBarItem);

    // EXT-6: capture the listener so it can be removed; deactivate() also calls
    // removeAllListeners() to clear it under repeated activate/deactivate (tests).
    const onServersChanged = () => updateStatusBar(statusBarItem);
    lspManager.on('serversChanged', onServersChanged);
    context.subscriptions.push({ dispose: () => lspManager.off('serversChanged', onServersChanged) });

    // EXT-4: react to edits of the workspace JSON config files, not just VS Code
    // settings changes. Watchers do not spawn anything themselves; the reload they
    // trigger is trust-gated via handleDocumentOpen.
    refreshConfigFileWatchers();
    context.subscriptions.push({ dispose: disposeConfigFileWatchers });

    // C1/EXT-1: spawning servers is gated on Workspace Trust. Load + sweep now if
    // trusted; otherwise defer until trust is granted.
    if (vscode.workspace.isTrusted) {
        await loadAndSweep();
    } else {
        context.subscriptions.push(
            vscode.workspace.onDidGrantWorkspaceTrust(() => { void loadAndSweep(); })
        );
    }

    // EXT-14: dev-facing drift guard for the template registry, surfaced only under debug.
    if (vscode.workspace.getConfiguration('genericLspProxy').get<boolean>('enableDebugLogging', false)) {
        for (const problem of validateTemplates()) {
            logger.warn(`Template drift: ${problem}`);
        }
    }
}

export async function deactivate() {
    logger?.info('Deactivating Generic LSP Proxy extension');
    await lspManager?.stopAllClients();
    lspManager?.removeAllListeners();
    logger?.dispose();
}

/**
 * Load configuration and start servers for already-open documents. The single
 * trust-gated entry point: only called once the workspace is trusted.
 */
async function loadAndSweep() {
    await configManager.loadConfiguration();
    await Promise.all(vscode.workspace.textDocuments.map(handleDocumentOpen));
}

async function handleDocumentOpen(document: vscode.TextDocument) {
    // C1/EXT-1: never spawn a workspace-declared command in an untrusted workspace.
    if (!vscode.workspace.isTrusted) {
        return;
    }

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

    await lspManager.restartClient(config.id!);
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
        detail: `Status: ${server.status} | Documents: ${server.documentCount}`,
        id: server.id
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
            await lspManager.restartClient(selected.id);
        } else if (action === 'Stop') {
            await lspManager.stopClient(selected.id);
        }
    }
}

async function handleReloadConfigCommand() {
    await configManager.loadConfiguration();
    vscode.window.showInformationMessage('LSP configuration reloaded');

    // Stop everything before the re-open sweep so stale clients are gone before new
    // ones start (EXT-5: both stages awaited, no race between stop and re-open).
    await lspManager.stopAllClients();
    await Promise.all(vscode.workspace.textDocuments.map(handleDocumentOpen));
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
        await configManager.enableConfig(selected.config.id!);
        vscode.window.showInformationMessage(`Re-enabled LSP server for ${selected.config.languageId}`);

        // Try to start the server for any open documents matching the re-enabled config.
        await Promise.all(
            vscode.workspace.textDocuments.map(doc => {
                const config = configManager.getConfigForDocument(doc);
                if (config && config.id === selected.config.id) {
                    return handleDocumentOpen(doc);
                }
                return Promise.resolve();
            })
        );
    }
}

// EXT-7/D2: symmetric counterpart to the re-enable flow above; disables a running
// config and stops its client. Identity is the stable config id.
async function handleDisableServerCommand() {
    const servers = lspManager.getActiveServers();
    if (servers.length === 0) {
        vscode.window.showInformationMessage('No active LSP servers to disable');
        return;
    }

    const items = servers.map(server => ({
        label: server.languageId,
        description: server.command,
        detail: `Status: ${server.status} | Documents: ${server.documentCount}`,
        id: server.id
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a server to disable',
        canPickMany: false
    });

    if (selected) {
        await configManager.markConfigAsDisabled(selected.id);
        await lspManager.stopClient(selected.id);
        vscode.window.showInformationMessage(`Disabled LSP server for ${selected.label}`);
    }
}

async function handleConfigurationChange(e: vscode.ConfigurationChangeEvent) {
    // EXT-3/LOG-1: the debug toggle only re-points the logger; it must not restart
    // servers. Only a configPath change warrants a reload. Other genericLspProxy.*
    // settings are no-ops here.
    if (e.affectsConfiguration('genericLspProxy.enableDebugLogging')) {
        logger.setDebugEnabled(
            vscode.workspace.getConfiguration('genericLspProxy').get<boolean>('enableDebugLogging', false)
        );
        return;
    }

    if (e.affectsConfiguration('genericLspProxy.configPath')) {
        // Re-point the watchers at the new path before reloading, so subsequent edits
        // of the newly-configured file are observed (not just the old path).
        refreshConfigFileWatchers();
        await handleReloadConfigCommand();
    }
}

async function handleWorkspaceFoldersChange() {
    // EXT-4: the watcher set is per-folder, so rebuild it for the new folder set, then
    // re-sweep documents so servers start for folders added at runtime.
    refreshConfigFileWatchers();
    await handleReloadConfigCommand();
}

function disposeConfigFileWatchers() {
    for (const d of configFileWatchers) {
        d.dispose();
    }
    configFileWatchers = [];
}

/**
 * EXT-4: watch the JSON config files (the configured path + the `.lsp-proxy.json`
 * fallback) per workspace folder and trigger a debounced reload on any
 * change/create/delete. Re-runnable: disposes the previous watcher set first, so it
 * re-points when `configPath` or the workspace folders change mid-session. Watcher
 * creation is trust-independent; the reload it drives is trust-gated via handleDocumentOpen.
 */
function refreshConfigFileWatchers() {
    disposeConfigFileWatchers();

    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
        return;
    }

    const configPath = vscode.workspace
        .getConfiguration('genericLspProxy')
        .get<string>('configPath', '.vscode/lsp-proxy.json');

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const onConfigFileEvent = () => {
        if (debounce) {
            clearTimeout(debounce);
        }
        debounce = setTimeout(() => { void handleReloadConfigCommand(); }, CONFIG_WATCH_DEBOUNCE_MS);
    };

    for (const folder of folders) {
        for (const relative of [configPath, '.lsp-proxy.json']) {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(folder, relative)
            );
            watcher.onDidChange(onConfigFileEvent);
            watcher.onDidCreate(onConfigFileEvent);
            watcher.onDidDelete(onConfigFileEvent);
            configFileWatchers.push(watcher);
        }
    }
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

async function handleInitCommand() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Please open a workspace folder before initializing LSP configuration.');
        return;
    }

    const folder = workspaceFolders[0];
    const configPath = vscode.workspace.getConfiguration('genericLspProxy').get<string>('configPath', '.vscode/lsp-proxy.json');

    // CFG-5/EXT-10: the configPath is workspace-controlled; resolve + assert containment
    // before touching disk so a `..`/absolute value cannot escape the workspace folder.
    const fullConfigPath = resolveWithinFolder(folder.uri.fsPath, configPath);
    if (fullConfigPath === undefined) {
        vscode.window.showErrorMessage(`Invalid configPath "${configPath}": must stay within the workspace folder.`);
        return;
    }

    // EXT-2/H5/EXT-8: accumulate every config in memory, then do a single existence
    // check + single write at the end. No recursion, no read-merge-rewrite roundtrip.
    const configs: LSPServerConfig[] = [];
    do {
        const config = await promptOneConfig();
        if (!config) {
            return; // user cancelled the wizard; abort the whole init.
        }
        configs.push(config);
    } while (await askAddAnother());

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

    try {
        await writeConfigFile(folder, fullConfigPath, configs);
        vscode.window.showInformationMessage(`LSP configuration created at ${configPath}`);

        // Reload + sweep (trust-gated via handleDocumentOpen).
        await configManager.loadConfiguration();
        await Promise.all(vscode.workspace.textDocuments.map(handleDocumentOpen));
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create configuration: ${error}`);
    }
}

/** Choose custom vs template, then run the matching prompt wizard. */
async function promptOneConfig(): Promise<LSPServerConfig | undefined> {
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
        return undefined;
    }

    return configMethod.value === 'template'
        ? promptTemplateConfig()
        : promptCustomConfig();
}

async function promptTemplateConfig(): Promise<LSPServerConfig | undefined> {
    const picked = await vscode.window.showQuickPick(
        languageTemplates.map(t => ({
            label: t.name,
            description: t.description,
            // install.command is a runnable shell command; install.note is human prose.
            detail: t.install?.command
                ? `Install: ${t.install.command}`
                : (t.install?.note ? `Install: ${t.install.note}` : undefined),
            template: t
        })),
        {
            placeHolder: 'Select a language template',
            ignoreFocusOut: true
        }
    );

    if (!picked) {
        return undefined;
    }

    const install = picked.template.install;
    if (install?.command) {
        // A runnable command exists: offer to copy it.
        const command = install.command;
        vscode.window.showInformationMessage(
            `To use ${picked.template.name}, install the language server:`,
            'Copy Command'
        ).then(selection => {
            if (selection === 'Copy Command') {
                vscode.env.clipboard.writeText(command);
                vscode.window.showInformationMessage('Install command copied to clipboard!');
            }
        });
    } else if (install?.note) {
        // Only prose is available: show it, with no copy button.
        vscode.window.showInformationMessage(`To use ${picked.template.name}: ${install.note}`);
    }

    return picked.template.config;
}

async function promptCustomConfig(): Promise<LSPServerConfig | undefined> {
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
        return undefined;
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
        return undefined;
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
        return undefined;
    }

    const fileExtensions = fileExtensionsInput.split(',').map(ext => ext.trim());

    const transportType = await vscode.window.showQuickPick([
        { label: 'stdio', description: 'Standard input/output (default)' },
        { label: 'tcp', description: 'TCP socket connection' }
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
        config.transport = transportType.label as 'tcp';

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
            return undefined;
        }

        config.tcpPort = parseInt(tcpPort);
    }

    // Ask for optional arguments.
    const args = await vscode.window.showInputBox({
        prompt: 'Enter command arguments (optional, comma-separated)',
        placeHolder: '',
        ignoreFocusOut: true
    });

    if (args && args.trim().length > 0) {
        config.args = args.split(',').map(arg => arg.trim());
    }

    return config;
}

/** Prompt whether to add another language-server config to the same file. */
async function askAddAnother(): Promise<boolean> {
    const addMore = await vscode.window.showQuickPick([
        { label: 'No', description: 'Save current configuration' },
        { label: 'Yes', description: 'Add another language server' }
    ], {
        placeHolder: 'Do you want to add another language server configuration?',
        ignoreFocusOut: true
    });

    return addMore?.label === 'Yes';
}

/**
 * Write the accumulated configs to `fullConfigPath` (already containment-checked),
 * creating the parent directory if needed.
 */
async function writeConfigFile(
    _folder: vscode.WorkspaceFolder,
    fullConfigPath: string,
    configs: LSPServerConfig[]
): Promise<void> {
    const dir = path.dirname(fullConfigPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(fullConfigPath, JSON.stringify(configs, null, 2));
}
