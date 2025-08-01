import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private debugEnabled: boolean;

    constructor(name: string) {
        this.outputChannel = vscode.window.createOutputChannel(name);
        this.debugEnabled = vscode.workspace.getConfiguration('genericLspProxy').get<boolean>('enableDebugLogging', false);
    }

    info(message: string): void {
        this.log('INFO', message);
    }

    warn(message: string): void {
        this.log('WARN', message);
    }

    error(message: string | Error): void {
        const errorMessage = message instanceof Error ? `${message.message}\n${message.stack}` : message;
        this.log('ERROR', errorMessage);
    }

    debug(message: string): void {
        if (this.debugEnabled) {
            this.log('DEBUG', message);
        }
    }

    private log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        this.outputChannel.appendLine(logMessage);
    }

    setDebugEnabled(enabled: boolean): void {
        this.debugEnabled = enabled;
    }

    show(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}