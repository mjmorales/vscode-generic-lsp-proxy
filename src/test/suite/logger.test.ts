import assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { Logger } from '../../logger';

suite('Logger Test Suite', () => {
    let logger: Logger;
    let mockOutputChannel: sinon.SinonStubbedInstance<vscode.OutputChannel>;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        mockOutputChannel = {
            appendLine: sandbox.stub(),
            append: sandbox.stub(),
            clear: sandbox.stub(),
            show: sandbox.stub() as any,
            hide: sandbox.stub(),
            dispose: sandbox.stub(),
            replace: sandbox.stub(),
            name: 'TestLogger'
        };

        sandbox.stub(vscode.window, 'createOutputChannel').returns(mockOutputChannel as any);
        sandbox.stub(vscode.workspace, 'getConfiguration').returns({
            get: sandbox.stub().returns(false)
        } as any);

        logger = new Logger('TestLogger');
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should create output channel with given name', () => {
        assert((vscode.window.createOutputChannel as sinon.SinonStub).calledWith('TestLogger'));
    });

    test('should log info messages', () => {
        const message = 'Test info message';
        logger.info(message);

        assert(mockOutputChannel.appendLine.calledOnce);
        const loggedMessage = mockOutputChannel.appendLine.firstCall.args[0];
        assert(loggedMessage.includes('[INFO]'));
        assert(loggedMessage.includes(message));
    });

    test('should log warning messages', () => {
        const message = 'Test warning message';
        logger.warn(message);

        assert(mockOutputChannel.appendLine.calledOnce);
        const loggedMessage = mockOutputChannel.appendLine.firstCall.args[0];
        assert(loggedMessage.includes('[WARN]'));
        assert(loggedMessage.includes(message));
    });

    test('should log error messages', () => {
        const message = 'Test error message';
        logger.error(message);

        assert(mockOutputChannel.appendLine.calledOnce);
        const loggedMessage = mockOutputChannel.appendLine.firstCall.args[0];
        assert(loggedMessage.includes('[ERROR]'));
        assert(loggedMessage.includes(message));
    });

    test('should log error objects with stack trace', () => {
        const error = new Error('Test error');
        error.stack = 'Error: Test error\n    at test.js:10:15';
        
        logger.error(error);

        assert(mockOutputChannel.appendLine.calledOnce);
        const loggedMessage = mockOutputChannel.appendLine.firstCall.args[0];
        assert(loggedMessage.includes('[ERROR]'));
        assert(loggedMessage.includes('Test error'));
        assert(loggedMessage.includes('at test.js:10:15'));
    });

    test('should not log debug messages when debug is disabled', () => {
        const message = 'Test debug message';
        logger.debug(message);

        assert(mockOutputChannel.appendLine.notCalled);
    });

    test('should log debug messages when debug is enabled', () => {
        logger.setDebugEnabled(true);
        
        const message = 'Test debug message';
        logger.debug(message);

        assert(mockOutputChannel.appendLine.calledOnce);
        const loggedMessage = mockOutputChannel.appendLine.firstCall.args[0];
        assert(loggedMessage.includes('[DEBUG]'));
        assert(loggedMessage.includes(message));
    });

    test('should respect debug configuration from settings', () => {
        sandbox.restore();
        sandbox = sinon.createSandbox();
        
        mockOutputChannel = {
            appendLine: sandbox.stub(),
            show: sandbox.stub(),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createOutputChannel').returns(mockOutputChannel as any);
        sandbox.stub(vscode.workspace, 'getConfiguration').returns({
            get: sandbox.stub().withArgs('enableDebugLogging', false).returns(true)
        } as any);

        const debugLogger = new Logger('DebugLogger');
        debugLogger.debug('Debug message');

        assert(mockOutputChannel.appendLine.calledOnce);
    });

    test('should include timestamp in log messages', () => {
        const message = 'Test timestamp';
        sandbox.stub(Date.prototype, 'toISOString').returns('2024-01-01T00:00:00.000Z');
        
        logger.info(message);

        assert(mockOutputChannel.appendLine.calledOnce);
        const loggedMessage = mockOutputChannel.appendLine.firstCall.args[0];
        assert(loggedMessage.includes('[2024-01-01T00:00:00.000Z]'));
    });

    test('should show output channel', () => {
        logger.show();
        assert(mockOutputChannel.show.calledOnce);
    });

    test('should dispose output channel', () => {
        logger.dispose();
        assert(mockOutputChannel.dispose.calledOnce);
    });

    test('should format log messages consistently', () => {
        const testCases = [
            { method: 'info', level: 'INFO' },
            { method: 'warn', level: 'WARN' },
            { method: 'error', level: 'ERROR' }
        ];

        testCases.forEach(({ method }) => {
            mockOutputChannel.appendLine.resetHistory();
            (logger as any)[method]('Test message');
            
            const loggedMessage = mockOutputChannel.appendLine.firstCall.args[0];
            const pattern = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[\w+\] .+$/;
            assert(pattern.test(loggedMessage), `Log message should match pattern: ${loggedMessage}`);
        });
    });

    test('should handle null and undefined messages gracefully', () => {
        logger.info(null as any);
        logger.warn(undefined as any);

        assert.strictEqual(mockOutputChannel.appendLine.callCount, 2);
        const firstCall = mockOutputChannel.appendLine.firstCall.args[0];
        const secondCall = mockOutputChannel.appendLine.secondCall.args[0];
        
        assert(firstCall.includes('null'));
        assert(secondCall.includes('undefined'));
    });
});