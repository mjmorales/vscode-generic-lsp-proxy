#!/usr/bin/env node

import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

// Set up module path resolution for vscode module
require('module').Module._extensions['.js'] = function(module: any, filename: string) {
    const content = require('fs').readFileSync(filename, 'utf8');
    if (filename.includes('vscode-languageclient')) {
        module.exports = {
            LanguageClient: class MockLanguageClient {
                start() { return Promise.resolve(); }
                stop() { return Promise.resolve(); }
                needsStop() { return true; }
                onDidChangeState() { return { dispose: () => {} }; }
            },
            LanguageClientOptions: {},
            ServerOptions: {},
            TransportKind: { stdio: 0, ipc: 1, pipe: 2 },
            StreamInfo: {}
        };
        return;
    }
    module._compile(content, filename);
};

// Mock VS Code API for unit tests
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
        showQuickPick: () => Promise.resolve()
    },
    workspace: {
        getConfiguration: () => ({
            get: (key: string, defaultValue?: any) => defaultValue,
            has: () => false,
            update: () => Promise.resolve()
        }),
        workspaceFolders: [],
        onDidOpenTextDocument: () => ({ dispose: () => {} }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
        onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
        createFileSystemWatcher: () => ({
            onDidCreate: () => ({ dispose: () => {} }),
            onDidChange: () => ({ dispose: () => {} }),
            onDidDelete: () => ({ dispose: () => {} }),
            dispose: () => {}
        })
    },
    ExtensionContext: class {},
    Uri: {
        file: (path: string) => ({ fsPath: path, toString: () => `file://${path}` }),
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

(global as any).vscode = mockVscode;
require.cache[require.resolve('vscode')] = { exports: mockVscode } as any;

async function runUnitTests() {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 5000
    });

    const testsRoot = path.resolve(__dirname, '..');
    
    try {
        const files = await glob('**/**.test.js', { 
            cwd: testsRoot,
            ignore: ['**/extension.test.js'] // Skip integration tests
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