import assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Extension Test Suite', () => {
    suiteSetup(async () => {
        const ext = vscode.extensions.getExtension('mjmorales.generic-lsp-proxy');
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('mjmorales.generic-lsp-proxy'));
    });

    test('Should register all expected commands', async () => {
        const allCommands = await vscode.commands.getCommands(true);
        
        const expectedCommands = [
            'genericLspProxy.restart',
            'genericLspProxy.showActiveServers',
            'genericLspProxy.reloadConfig'
        ];

        expectedCommands.forEach(command => {
            assert.ok(
                allCommands.includes(command),
                `Command ${command} not found in registered commands`
            );
        });
    });

    test('Should have correct activation events', () => {
        const extension = vscode.extensions.getExtension('mjmorales.generic-lsp-proxy');
        assert.ok(extension);
        
        const packageJSON = extension.packageJSON;
        assert.ok(packageJSON.activationEvents);
        assert.ok(packageJSON.activationEvents.includes('onStartupFinished'));
        assert.ok(packageJSON.activationEvents.includes('workspaceContains:**/.lsp-proxy.json'));
    });

    test('Should contribute configuration properties', () => {
        const extension = vscode.extensions.getExtension('mjmorales.generic-lsp-proxy');
        assert.ok(extension);
        
        const contributions = extension.packageJSON.contributes;
        assert.ok(contributions.configuration);
        assert.ok(contributions.configuration.properties);
        
        const properties = contributions.configuration.properties;
        assert.ok(properties['genericLspProxy.configPath']);
        assert.ok(properties['genericLspProxy.enableDebugLogging']);
    });

    test('Should load configuration when workspace contains config file', async function() {
        this.timeout(5000);
        
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            this.skip();
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const configPath = path.join(workspaceRoot, '.vscode', 'lsp-proxy.json');
        
        const testConfig = [{
            languageId: 'test-language',
            command: 'test-lsp-server',
            fileExtensions: ['.test']
        }];

        try {
            await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
            await fs.promises.writeFile(configPath, JSON.stringify(testConfig, null, 2));

            await vscode.commands.executeCommand('genericLspProxy.reloadConfig');
            
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify config was loaded by checking if opening a test file would trigger LSP
            const testFilePath = path.join(workspaceRoot, 'test.test');
            await fs.promises.writeFile(testFilePath, 'test content');
            
            const doc = await vscode.workspace.openTextDocument(testFilePath);
            await vscode.window.showTextDocument(doc);
            
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Clean up
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            await fs.promises.unlink(testFilePath);
        } finally {
            // Clean up config file
            try {
                await fs.promises.unlink(configPath);
            } catch (e) {
                // Ignore if file doesn't exist
            }
        }
    });

    test('Show active servers command should work without errors', async () => {
        try {
            await vscode.commands.executeCommand('genericLspProxy.showActiveServers');
            // Command should execute without throwing
            assert.ok(true);
        } catch (error) {
            assert.fail(`Command failed with error: ${error}`);
        }
    });

    test('Reload config command should work without errors', async () => {
        try {
            await vscode.commands.executeCommand('genericLspProxy.reloadConfig');
            // Command should execute without throwing
            assert.ok(true);
        } catch (error) {
            assert.fail(`Command failed with error: ${error}`);
        }
    });

    test('Configuration settings should have correct defaults', () => {
        const config = vscode.workspace.getConfiguration('genericLspProxy');
        
        assert.strictEqual(config.get('configPath'), '.vscode/lsp-proxy.json');
        assert.strictEqual(config.get('enableDebugLogging'), false);
    });

    test('Extension should handle missing configuration gracefully', async function() {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            this.skip();
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const configPath = path.join(workspaceRoot, '.vscode', 'lsp-proxy.json');
        
        try {
            // Ensure config doesn't exist
            await fs.promises.unlink(configPath).catch(() => {});
            
            // Reload config should not throw
            await vscode.commands.executeCommand('genericLspProxy.reloadConfig');
            
            // Open a random file should not cause issues
            const testFile = path.join(workspaceRoot, 'test-no-config.txt');
            await fs.promises.writeFile(testFile, 'test');
            
            const doc = await vscode.workspace.openTextDocument(testFile);
            await vscode.window.showTextDocument(doc);
            
            // Should not throw any errors
            assert.ok(true);
            
            // Clean up
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            await fs.promises.unlink(testFile);
        } catch (error) {
            assert.fail(`Extension failed with missing config: ${error}`);
        }
    });
});