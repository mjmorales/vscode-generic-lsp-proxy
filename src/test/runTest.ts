import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Use a short user-data-dir under the OS temp dir. The default lives at
        // .vscode-test/user-data inside the (doubly-nested) GitHub runner workspace,
        // and on macOS the resulting IPC socket path exceeds the ~104-char unix
        // domain socket limit and fails with `listen EINVAL ... -main.sock`. A short
        // temp path keeps the socket well under the limit on every runner.
        const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsct-'));

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: ['--user-data-dir', userDataDir]
        });
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exit(1);
    }
}

main();
