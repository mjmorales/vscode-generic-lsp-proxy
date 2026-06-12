import * as vscode from 'vscode';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// Severity ordering: DEBUG < INFO < WARN < ERROR.
const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

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
        const errorMessage = message instanceof Error
            ? (message.stack ? `${message.message}\n${message.stack}` : message.message)
            : message;
        this.log('ERROR', errorMessage);
    }

    debug(message: string): void {
        this.log('DEBUG', message);
    }

    private log(level: LogLevel, message: string): void {
        // DEBUG is gated behind the debug toggle; INFO/WARN/ERROR always emit.
        if (LOG_LEVEL_SEVERITY[level] < LOG_LEVEL_SEVERITY.INFO && !this.debugEnabled) {
            return;
        }
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

    // The channel is borrowed by LanguageClient; the Logger retains disposal ownership.
    getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
