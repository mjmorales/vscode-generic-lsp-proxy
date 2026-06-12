#!/usr/bin/env node

import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';
import Module from 'module';

// The `vscode` module has no runtime implementation outside the Electron extension
// host (only `@types/vscode` exists at build time), and `vscode-languageclient/node`
// transitively requires `vscode`. We intercept Module._load so any `require('vscode')`
// or `require('vscode-languageclient/node')` from the source under test resolves to a
// lightweight stub instead of throwing / pulling in the real client.

const mockVscode = {
    window: {
        createOutputChannel: (name: string) => ({
            appendLine: () => {},
            append: () => {},
            clear: () => {},
            show: () => {},
            hide: () => {},
            dispose: () => {},
            replace: () => {},
            name
        }),
        showInformationMessage: () => Promise.resolve(),
        showErrorMessage: () => Promise.resolve(),
        showWarningMessage: () => Promise.resolve(),
        createStatusBarItem: () => ({
            show: () => {},
            hide: () => {},
            dispose: () => {},
            text: '',
            tooltip: '',
            command: ''
        }),
        showQuickPick: () => Promise.resolve(),
        showInputBox: () => Promise.resolve()
    },
    workspace: {
        getConfiguration: () => ({
            get: (_key: string, defaultValue?: unknown) => defaultValue,
            has: () => false,
            update: () => Promise.resolve()
        }),
        workspaceFolders: [] as unknown[],
        getWorkspaceFolder: () => undefined,
        isTrusted: true,
        onDidOpenTextDocument: () => ({ dispose: () => {} }),
        onDidCloseTextDocument: () => ({ dispose: () => {} }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
        onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
        onDidGrantWorkspaceTrust: () => ({ dispose: () => {} }),
        createFileSystemWatcher: () => ({
            onDidCreate: () => ({ dispose: () => {} }),
            onDidChange: () => ({ dispose: () => {} }),
            onDidDelete: () => ({ dispose: () => {} }),
            dispose: () => {}
        })
    },
    ExtensionContext: class {},
    Uri: {
        file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
        parse: (uri: string) => ({ fsPath: uri.replace('file://', '') })
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    RelativePattern: class {},
    languages: {
        match: () => 0
    },
    commands: {
        registerCommand: () => ({ dispose: () => {} }),
        executeCommand: () => Promise.resolve(),
        getCommands: () => Promise.resolve([])
    },
    TextDocument: class {},
    WorkspaceFolder: class {}
};

// Mirrors the runtime members the source imports from 'vscode-languageclient/node'.
// `State` MUST match the real enum (Stopped=1, Running=2, Starting=3) so the manager's
// onDidChangeState mapping is exercised correctly.
const mockLanguageClient = {
    LanguageClient: class MockLanguageClient {
        start() {
            return Promise.resolve();
        }
        stop() {
            return Promise.resolve();
        }
        needsStop() {
            return true;
        }
        onDidChangeState() {
            return { dispose: () => {} };
        }
    },
    TransportKind: { stdio: 0, ipc: 1, pipe: 2, socket: 3 },
    State: { Stopped: 1, Running: 2, Starting: 3 }
};

interface MockableModule {
    _load(request: string, parent: unknown, isMain: boolean): unknown;
}

const loader = Module as unknown as MockableModule;
const originalLoad = loader._load;
loader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === 'vscode') {
        return mockVscode;
    }
    if (request === 'vscode-languageclient' || request === 'vscode-languageclient/node') {
        return mockLanguageClient;
    }
    return originalLoad.call(this, request, parent, isMain);
};

async function runUnitTests(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 5000
    });

    const testsRoot = path.resolve(__dirname, '..');

    try {
        const files = await glob('**/**.test.js', {
            cwd: testsRoot,
            ignore: ['**/extension.test.js'] // integration test; runs in the Electron host
        });

        files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

        mocha.run(failures => {
            if (failures > 0) {
                console.error(`${failures} tests failed.`);
                process.exit(1);
            } else {
                console.log('All tests passed!');
                process.exit(0);
            }
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

runUnitTests();
