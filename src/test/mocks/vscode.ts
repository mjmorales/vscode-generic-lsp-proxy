import { EventEmitter } from 'events';

export class MockOutputChannel {
    name: string;
    content: string[] = [];

    constructor(name: string) {
        this.name = name;
    }

    appendLine(line: string): void {
        this.content.push(line);
    }

    append(text: string): void {
        if (this.content.length === 0) {
            this.content.push(text);
        } else {
            this.content[this.content.length - 1] += text;
        }
    }

    clear(): void {
        this.content = [];
    }

    show(): void {}
    hide(): void {}
    dispose(): void {}
    replace(): void {}
}

export class MockWorkspaceConfiguration {
    private values: Map<string, any> = new Map();

    constructor(defaults?: Record<string, any>) {
        if (defaults) {
            Object.entries(defaults).forEach(([key, value]) => {
                this.values.set(key, value);
            });
        }
    }

    get<T>(section: string, defaultValue?: T): T {
        if (this.values.has(section)) {
            return this.values.get(section) as T;
        }
        if (defaultValue === undefined) {
            throw new Error(`Configuration value for '${section}' not found and no default provided`);
        }
        return defaultValue;
    }

    has(section: string): boolean {
        return this.values.has(section);
    }

    update(section: string, value: any): Thenable<void> {
        this.values.set(section, value);
        return Promise.resolve();
    }
}

export class MockTextDocument {
    uri: { toString: () => string; fsPath: string };
    fileName: string;
    languageId: string;
    version: number = 1;
    isDirty: boolean = false;
    isClosed: boolean = false;
    content: string;

    constructor(uri: string, languageId: string, content: string = '') {
        this.uri = { 
            toString: () => uri,
            fsPath: uri.replace('file://', '')
        };
        this.fileName = this.uri.fsPath;
        this.languageId = languageId;
        this.content = content;
    }

    getText(): string {
        return this.content;
    }

    positionAt(offset: number): any {
        return { line: 0, character: offset };
    }

    offsetAt(position: any): number {
        return position.character;
    }
}

export class MockWorkspaceFolder {
    uri: { fsPath: string };
    name: string;
    index: number;

    constructor(path: string, name: string, index: number = 0) {
        this.uri = { fsPath: path };
        this.name = name;
        this.index = index;
    }
}

export class MockExtensionContext {
    subscriptions: any[] = [];
    globalStorageUri: { fsPath: string };
    workspaceState = new Map();
    globalState = new Map();
    extensionPath: string;
    storagePath?: string;
    globalStoragePath: string;
    logPath: string;

    constructor() {
        this.globalStorageUri = { fsPath: '/mock/global/storage' };
        this.extensionPath = '/mock/extension';
        this.globalStoragePath = '/mock/global/storage';
        this.logPath = '/mock/logs';
    }

    asAbsolutePath(relativePath: string): string {
        return `${this.extensionPath}/${relativePath}`;
    }
}

export function createMockLanguageClient(languageId: string, status: 'starting' | 'running' | 'stopped' = 'stopped') {
    const eventEmitter = new EventEmitter();
    
    return {
        start: async () => {
            eventEmitter.emit('didChangeState', { oldState: 1, newState: 2 });
            return;
        },
        stop: async () => {
            eventEmitter.emit('didChangeState', { oldState: 2, newState: 3 });
            return;
        },
        needsStop: () => status === 'running',
        onDidChangeState: (handler: (e: any) => void) => {
            eventEmitter.on('didChangeState', handler);
            return { dispose: () => eventEmitter.removeListener('didChangeState', handler) };
        },
        outputChannel: new MockOutputChannel(`${languageId} Language Server`),
        state: status === 'running' ? 2 : status === 'starting' ? 1 : 3
    };
}