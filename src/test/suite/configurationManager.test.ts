import assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager, LSPServerConfig } from '../../configurationManager';

suite('ConfigurationManager Test Suite', () => {
    let configManager: ConfigurationManager;
    let mockContext: vscode.ExtensionContext;
    let mockLogger: any;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        mockLogger = {
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub(),
            debug: sandbox.stub(),
            setDebugEnabled: sandbox.stub(),
            show: sandbox.stub(),
            dispose: sandbox.stub()
        };

        mockContext = {
            globalStorageUri: { fsPath: '/mock/global/storage' } as vscode.Uri,
            subscriptions: []
        } as any;

        configManager = new ConfigurationManager(mockContext, mockLogger as any);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should validate valid configuration', () => {
        const validConfig: LSPServerConfig = {
            languageId: 'typescript',
            command: 'typescript-language-server',
            args: ['--stdio'],
            fileExtensions: ['.ts', '.tsx']
        };

        const result = (configManager as any).validateConfig(validConfig);
        assert.strictEqual(result, true);
    });

    test('should reject configuration without languageId', () => {
        const invalidConfig = {
            command: 'typescript-language-server',
            fileExtensions: ['.ts']
        };

        const result = (configManager as any).validateConfig(invalidConfig);
        assert.strictEqual(result, false);
        assert(mockLogger.error.calledWith('Invalid config: missing or invalid languageId'));
    });

    test('should reject configuration without command', () => {
        const invalidConfig = {
            languageId: 'typescript',
            fileExtensions: ['.ts']
        };

        const result = (configManager as any).validateConfig(invalidConfig);
        assert.strictEqual(result, false);
        assert(mockLogger.error.calledWith('Invalid config for typescript: missing or invalid command'));
    });

    test('should reject configuration without fileExtensions', () => {
        const invalidConfig = {
            languageId: 'typescript',
            command: 'typescript-language-server'
        };

        const result = (configManager as any).validateConfig(invalidConfig);
        assert.strictEqual(result, false);
        assert(mockLogger.error.calledWith('Invalid config for typescript: missing or invalid fileExtensions'));
    });

    test('should reject configuration with invalid transport', () => {
        const invalidConfig = {
            languageId: 'typescript',
            command: 'typescript-language-server',
            fileExtensions: ['.ts'],
            transport: 'invalid' as any
        };

        const result = (configManager as any).validateConfig(invalidConfig);
        assert.strictEqual(result, false);
        assert(mockLogger.error.calledWith('Invalid config for typescript: invalid transport invalid'));
    });

    test('should load configuration from file', async () => {
        const testConfig: LSPServerConfig[] = [{
            languageId: 'python',
            command: 'pylsp',
            fileExtensions: ['.py']
        }];

        // Create a temporary file for testing
        const tempFile = path.join(__dirname, 'test-config.json');
        await fs.promises.writeFile(tempFile, JSON.stringify(testConfig));

        try {
            await (configManager as any).loadConfigFile(tempFile);
            
            const configs = (configManager as any).configs;
            assert.strictEqual(configs.length, 1);
            assert.strictEqual(configs[0].languageId, 'python');
        } finally {
            // Clean up
            await fs.promises.unlink(tempFile).catch(() => {});
        }
    });

    test('should handle invalid JSON in configuration file', async () => {
        // Create a temporary file with invalid JSON
        const tempFile = path.join(__dirname, 'test-invalid.json');
        await fs.promises.writeFile(tempFile, '{ invalid json');

        try {
            await (configManager as any).loadConfigFile(tempFile);
            
            assert(mockLogger.error.calledOnce);
        } finally {
            // Clean up
            await fs.promises.unlink(tempFile).catch(() => {});
        }
    });

    test('should get config for document by file extension', () => {
        const config: LSPServerConfig = {
            languageId: 'typescript',
            command: 'typescript-language-server',
            fileExtensions: ['.ts', '.tsx']
        };

        (configManager as any).configs = [config];
        (configManager as any).buildMaps();

        const mockDocument = {
            fileName: '/test/file.ts',
            languageId: 'typescript'
        } as vscode.TextDocument;

        const result = configManager.getConfigForDocument(mockDocument);
        assert.strictEqual(result?.languageId, 'typescript');
    });

    test('should get config for document by language ID', () => {
        const config: LSPServerConfig = {
            languageId: 'rust',
            command: 'rust-analyzer',
            fileExtensions: ['.rs']
        };

        (configManager as any).configs = [config];
        (configManager as any).buildMaps();

        const mockDocument = {
            fileName: '/test/file.unknown',
            languageId: 'rust'
        } as vscode.TextDocument;

        const result = configManager.getConfigForDocument(mockDocument);
        assert.strictEqual(result?.languageId, 'rust');
    });

    test('should respect workspace pattern restrictions', () => {
        const config: LSPServerConfig = {
            languageId: 'java',
            command: 'jdtls',
            fileExtensions: ['.java'],
            workspacePattern: '/workspace/java-project'
        };

        (configManager as any).configs = [config];
        (configManager as any).buildMaps();

        const documentInWorkspace = {
            fileName: '/workspace/java-project/src/Main.java',
            languageId: 'java'
        } as vscode.TextDocument;

        const documentOutsideWorkspace = {
            fileName: '/other-workspace/src/Main.java',
            languageId: 'java'
        } as vscode.TextDocument;

        assert.strictEqual(configManager.getConfigForDocument(documentInWorkspace)?.languageId, 'java');
        assert.strictEqual(configManager.getConfigForDocument(documentOutsideWorkspace), undefined);
    });

    test('should normalize file extensions', () => {
        const config: LSPServerConfig = {
            languageId: 'python',
            command: 'pylsp',
            fileExtensions: ['py', '.pyw']  // Mix of with and without dots
        };

        (configManager as any).configs = [config];
        (configManager as any).buildMaps();

        const extensionMap = (configManager as any).fileExtensionMap;
        assert(extensionMap.has('.py'));
        assert(extensionMap.has('.pyw'));
    });

    test('should get all configurations', () => {
        const configs: LSPServerConfig[] = [
            {
                languageId: 'typescript',
                command: 'typescript-language-server',
                fileExtensions: ['.ts']
            },
            {
                languageId: 'python',
                command: 'pylsp',
                fileExtensions: ['.py']
            }
        ];

        (configManager as any).configs = configs;
        
        const allConfigs = configManager.getAllConfigs();
        assert.strictEqual(allConfigs.length, 2);
        assert.deepStrictEqual(allConfigs, configs);
    });
});