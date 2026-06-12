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
            getConfigById: sandbox.stub(),
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
            documentCount: 1
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
            status: 'running'
        });

        const mockDocument = {
            uri: { toString: () => '/test/file.py' },
            languageId: 'python'
        } as any;

        await lspManager.ensureClientForConfig(config, mockDocument);

        // Document count is derived from documentTracking, not stored on ClientInfo (S3/LPM-9).
        assert.strictEqual((lspManager as any).documentTracking.get('python').size, 1);
        assert.strictEqual(lspManager.getActiveServers()[0].documentCount, 1);
    });

    test('should restart client', async () => {
        const config: LSPServerConfig = {
            languageId: 'rust',
            command: 'rust-analyzer',
            fileExtensions: ['.rs']
        };

        // restartClient resolves the config by stable id via getConfigById (S4).
        mockConfigManager.getConfigById.withArgs('rust').returns(config);

        (lspManager as any).clients.set('rust', {
            client: mockLanguageClient,
            config,
            status: 'running'
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
            documentCount: 2
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
                documentCount: 1
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
                status: 'running'
            });
            // documentCount is derived from documentTracking at read time (S3/LPM-9).
            const uris = new Set(
                Array.from({ length: index + 1 }, (_, i) => `/file-${config.languageId}-${i}.ext`)
            );
            (lspManager as any).documentTracking.set(config.languageId, uris);
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
            documentCount: 0
        };

        (lspManager as any).clients.set('java', clientInfo);
        
        (lspManager as any).handleClientStateChange('java', { oldState: 1, newState: 2 });
        
        assert.strictEqual(clientInfo.status, 'running');
    });

    test('should handle client state changes to stopped', () => {
        const config: LSPServerConfig = {
            languageId: 'rust',
            command: 'rust-analyzer',
            fileExtensions: ['.rs']
        };

        const clientInfo = {
            client: mockLanguageClient,
            config,
            status: 'running' as const
        };

        (lspManager as any).clients.set('rust', clientInfo);

        // State enum (vscode-languageclient): Stopped=1, Running=2, Starting=3.
        (lspManager as any).handleClientStateChange('rust', { oldState: 2, newState: 1 });

        assert.strictEqual(clientInfo.status, 'stopped');
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
            status: 'running'
        });

        (lspManager as any).handleClientStateChange('lua', { oldState: 1, newState: 2 });
    });

    test('should not double-start when concurrent opens race (H4)', async () => {
        const config: LSPServerConfig = {
            languageId: 'typescript',
            command: 'typescript-language-server',
            fileExtensions: ['.ts']
        };
        const mockDocument = {
            uri: { toString: () => '/test/file.ts' },
            languageId: 'typescript'
        } as any;

        // A slow start, so the second concurrent call observes the in-flight promise.
        const startClientStub = sandbox
            .stub(lspManager as any, 'startClient')
            .callsFake(() => new Promise<void>(resolve => setTimeout(resolve, 20)));

        await Promise.all([
            lspManager.ensureClientForConfig(config, mockDocument),
            lspManager.ensureClientForConfig(config, mockDocument)
        ]);

        assert.strictEqual(startClientStub.callCount, 1);
    });

    test('should untrack a closed document and decrement the derived count', () => {
        const config: LSPServerConfig = {
            languageId: 'python',
            command: 'pylsp',
            fileExtensions: ['.py']
        };

        (lspManager as any).clients.set('python', {
            client: mockLanguageClient,
            config,
            status: 'running'
        });
        (lspManager as any).documentTracking.set('python', new Set(['/a.py', '/b.py']));

        lspManager.untrackDocument('/a.py');

        assert.strictEqual((lspManager as any).documentTracking.get('python').size, 1);
        assert.strictEqual(lspManager.getActiveServers()[0].documentCount, 1);
    });

    test('should throw for a tcp config missing tcpPort instead of silently spawning stdio (H2)', () => {
        const config: LSPServerConfig = {
            languageId: 'gdscript',
            command: 'nc',
            fileExtensions: ['.gd'],
            transport: 'tcp'
        };

        assert.throws(() => (lspManager as any).createServerOptions(config, {}));
    });
});