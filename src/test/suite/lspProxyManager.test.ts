import assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { LspProxyManager } from '../../lspProxyManager';
import { ConfigurationManager, LSPServerConfig } from '../../configurationManager';
import { LanguageClient } from 'vscode-languageclient/node';

suite('LspProxyManager Test Suite', () => {
    let lspManager: LspProxyManager;
    let mockConfigManager: sinon.SinonStubbedInstance<ConfigurationManager>;
    let mockLogger: any;
    let sandbox: sinon.SinonSandbox;
    let mockLanguageClient: sinon.SinonStubbedInstance<LanguageClient>;

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

        mockConfigManager = {
            loadConfiguration: sandbox.stub().resolves(),
            getConfigForDocument: sandbox.stub(),
            getConfigByLanguageId: sandbox.stub(),
            getAllConfigs: sandbox.stub().returns([])
        } as any;

        mockLanguageClient = {
            start: sandbox.stub().resolves(),
            stop: sandbox.stub().resolves(),
            needsStop: sandbox.stub().returns(true),
            onDidChangeState: sandbox.stub()
        } as any;

        sandbox.stub(vscode.workspace, 'getConfiguration').returns({
            get: sandbox.stub().returns(true)
        } as any);

        lspManager = new LspProxyManager(mockConfigManager as any, mockLogger as any);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should ensure client for new configuration', async () => {
        const config: LSPServerConfig = {
            languageId: 'typescript',
            command: 'typescript-language-server',
            fileExtensions: ['.ts']
        };

        const mockDocument = {
            uri: { toString: () => '/test/file.ts' },
            languageId: 'typescript'
        } as any;

        const startClientStub = sandbox.stub(lspManager as any, 'startClient').resolves();

        await lspManager.ensureClientForConfig(config, mockDocument);
        
        assert(startClientStub.calledOnceWith(config, mockDocument));
    });

    test('should not start duplicate clients', async () => {
        const config: LSPServerConfig = {
            languageId: 'typescript',
            command: 'typescript-language-server',
            fileExtensions: ['.ts']
        };

        const mockDocument = {
            uri: { toString: () => '/test/file.ts' },
            languageId: 'typescript'
        } as any;

        (lspManager as any).clients.set('typescript', {
            client: mockLanguageClient,
            config,
            status: 'running',
            documentCount: 1,
            restartCount: 0
        });

        const startClientStub = sandbox.stub(lspManager as any, 'startClient');

        await lspManager.ensureClientForConfig(config, mockDocument);
        
        assert(startClientStub.notCalled);
    });

    test('should track documents for language', async () => {
        const config: LSPServerConfig = {
            languageId: 'python',
            command: 'pylsp',
            fileExtensions: ['.py']
        };

        (lspManager as any).clients.set('python', {
            client: mockLanguageClient,
            config,
            status: 'running',
            documentCount: 0,
            restartCount: 0
        });

        const mockDocument = {
            uri: { toString: () => '/test/file.py' },
            languageId: 'python'
        } as any;

        await lspManager.ensureClientForConfig(config, mockDocument);
        
        const clientInfo = (lspManager as any).clients.get('python');
        assert.strictEqual(clientInfo.documentCount, 1);
    });

    test('should restart client', async () => {
        const config: LSPServerConfig = {
            languageId: 'rust',
            command: 'rust-analyzer',
            fileExtensions: ['.rs']
        };

        mockConfigManager.getConfigByLanguageId.withArgs('rust').returns(config);

        (lspManager as any).clients.set('rust', {
            client: mockLanguageClient,
            config,
            status: 'running',
            documentCount: 1,
            restartCount: 0
        });

        const stopClientStub = sandbox.stub(lspManager, 'stopClient').resolves();
        const startClientStub = sandbox.stub(lspManager as any, 'startClient').resolves();

        await lspManager.restartClient('rust');
        
        assert(stopClientStub.calledOnceWith('rust'));
        assert(startClientStub.calledOnceWith(config));
    });

    test('should stop client and clean up resources', async () => {
        const config: LSPServerConfig = {
            languageId: 'go',
            command: 'gopls',
            fileExtensions: ['.go']
        };

        (lspManager as any).clients.set('go', {
            client: mockLanguageClient,
            config,
            status: 'running',
            documentCount: 2,
            restartCount: 0
        });

        (lspManager as any).documentTracking.set('go', new Set(['/file1.go', '/file2.go']));

        await lspManager.stopClient('go');
        
        assert(mockLanguageClient.stop.calledOnce);
        assert.strictEqual((lspManager as any).clients.has('go'), false);
        assert.strictEqual((lspManager as any).documentTracking.has('go'), false);
    });

    test('should stop all clients', async () => {
        const configs = [
            { languageId: 'typescript', command: 'ts', fileExtensions: ['.ts'] },
            { languageId: 'python', command: 'py', fileExtensions: ['.py'] }
        ];

        configs.forEach(config => {
            (lspManager as any).clients.set(config.languageId, {
                client: mockLanguageClient,
                config,
                status: 'running',
                documentCount: 1,
                restartCount: 0
            });
        });

        const stopClientStub = sandbox.stub(lspManager, 'stopClient').resolves();

        await lspManager.stopAllClients();
        
        assert.strictEqual(stopClientStub.callCount, 2);
        assert(stopClientStub.calledWith('typescript'));
        assert(stopClientStub.calledWith('python'));
    });

    test('should get active servers information', () => {
        const configs = [
            { languageId: 'typescript', command: 'typescript-language-server' },
            { languageId: 'python', command: 'pylsp' }
        ];

        configs.forEach((config, index) => {
            (lspManager as any).clients.set(config.languageId, {
                client: mockLanguageClient,
                config: { ...config, fileExtensions: ['.ext'] },
                status: 'running',
                documentCount: index + 1,
                restartCount: 0
            });
        });

        const activeServers = lspManager.getActiveServers();
        
        assert.strictEqual(activeServers.length, 2);
        assert.strictEqual(activeServers[0].languageId, 'typescript');
        assert.strictEqual(activeServers[0].documentCount, 1);
        assert.strictEqual(activeServers[1].languageId, 'python');
        assert.strictEqual(activeServers[1].documentCount, 2);
    });

    test('should handle client state changes', () => {
        const config: LSPServerConfig = {
            languageId: 'java',
            command: 'jdtls',
            fileExtensions: ['.java']
        };

        const clientInfo = {
            client: mockLanguageClient,
            config,
            status: 'starting' as const,
            documentCount: 0,
            restartCount: 1
        };

        (lspManager as any).clients.set('java', clientInfo);

        const cancelRestartStub = sandbox.stub(lspManager as any, 'cancelRestart');
        
        (lspManager as any).handleClientStateChange('java', { oldState: 1, newState: 2 });
        
        assert.strictEqual(clientInfo.status, 'running');
        assert.strictEqual(clientInfo.restartCount, 0);
        assert(cancelRestartStub.calledWith('java'));
    });

    test('should schedule restart on client failure', () => {
        const config: LSPServerConfig = {
            languageId: 'rust',
            command: 'rust-analyzer',
            fileExtensions: ['.rs']
        };

        const clientInfo = {
            client: mockLanguageClient,
            config,
            status: 'running' as const,
            documentCount: 1,
            restartCount: 0
        };

        (lspManager as any).clients.set('rust', clientInfo);

        const scheduleRestartStub = sandbox.stub(lspManager as any, 'scheduleRestart');
        
        (lspManager as any).handleClientStateChange('rust', { oldState: 2, newState: 3 });
        
        assert.strictEqual(clientInfo.status, 'stopped');
        assert(scheduleRestartStub.calledWith('rust'));
    });

    test('should limit restart attempts', () => {
        const config: LSPServerConfig = {
            languageId: 'cpp',
            command: 'clangd',
            fileExtensions: ['.cpp']
        };

        const clientInfo = {
            client: mockLanguageClient,
            config,
            status: 'error' as const,
            documentCount: 0,
            restartCount: 3
        };

        (lspManager as any).clients.set('cpp', clientInfo);

        const setTimeoutStub = sandbox.stub(global, 'setTimeout');
        
        (lspManager as any).scheduleRestart('cpp');
        
        assert(setTimeoutStub.notCalled);
        assert(mockLogger.error.calledWith('Max restart attempts reached for cpp'));
    });

    test('should create server options for stdio transport', () => {
        const config: LSPServerConfig = {
            languageId: 'python',
            command: 'pylsp',
            fileExtensions: ['.py'],
            args: ['--verbose']
        };

        const serverOptions = (lspManager as any).createServerOptions(config);
        
        assert.strictEqual(serverOptions.command, 'pylsp');
        assert.deepStrictEqual(serverOptions.args, ['--verbose']);
    });

    test('should create server options for tcp transport', () => {
        const config: LSPServerConfig = {
            languageId: 'gdscript',
            command: 'nc',
            fileExtensions: ['.gd'],
            transport: 'tcp',
            tcpPort: 6005
        };

        const serverOptions = (lspManager as any).createServerOptions(config);
        
        assert.strictEqual(typeof serverOptions, 'function');
    });

    test('should emit serversChanged event', (done) => {
        lspManager.on('serversChanged', () => {
            done();
        });

        const config: LSPServerConfig = {
            languageId: 'lua',
            command: 'lua-language-server',
            fileExtensions: ['.lua']
        };

        (lspManager as any).clients.set('lua', {
            client: mockLanguageClient,
            config,
            status: 'running',
            documentCount: 0,
            restartCount: 0
        });

        (lspManager as any).handleClientStateChange('lua', { oldState: 1, newState: 2 });
    });
});