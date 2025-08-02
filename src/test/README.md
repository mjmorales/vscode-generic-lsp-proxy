# Generic LSP Proxy Tests

This directory contains the test suite for the Generic LSP Proxy extension.

## Test Structure

```
src/test/
├── suite/                    # Test suites
│   ├── configurationManager.test.ts
│   ├── lspProxyManager.test.ts
│   ├── logger.test.ts
│   └── extension.test.ts
├── fixtures/                 # Test data
│   └── test-config.json
├── mocks/                   # Mock implementations
│   └── vscode.ts
├── runTest.ts              # Test runner
└── README.md               # This file
```

## Running Tests

### From Command Line

```bash
# Run all tests
npm test

# Compile and run tests
npm run test:compile

# Run with pre-checks (lint + compile + test)
npm run pretest && npm test
```

### From VS Code

1. Open the Command Palette (Cmd/Ctrl+Shift+P)
2. Run "Tasks: Run Test Task"
3. Or press F5 and select "Extension Tests"

## Test Categories

### Unit Tests

- **configurationManager.test.ts**: Tests configuration loading, validation, and document matching
- **lspProxyManager.test.ts**: Tests LSP client lifecycle, server management, and error handling
- **logger.test.ts**: Tests logging functionality and output formatting

### Integration Tests

- **extension.test.ts**: Tests extension activation, command registration, and end-to-end workflows

## Writing New Tests

### Test Template

```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import { ComponentToTest } from '../../componentToTest';

suite('Component Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    
    setup(() => {
        sandbox = sinon.createSandbox();
        // Setup code
    });
    
    teardown(() => {
        sandbox.restore();
    });
    
    test('should do something', () => {
        // Test implementation
        assert.strictEqual(actual, expected);
    });
});
```

### Mocking VS Code API

Use the provided mock implementations in `mocks/vscode.ts`:

```typescript
import { MockTextDocument, MockWorkspaceFolder } from '../mocks/vscode';

const mockDoc = new MockTextDocument('/test/file.ts', 'typescript');
```

### Testing Async Operations

```typescript
test('should handle async operation', async () => {
    const result = await asyncFunction();
    assert.strictEqual(result, expected);
});
```

## Test Coverage

To generate coverage reports:

```bash
# Install coverage tool
npm install --save-dev nyc

# Run tests with coverage
npx nyc npm test
```

## Debugging Tests

1. Set breakpoints in test files
2. Run "Extension Tests" debug configuration
3. Tests will pause at breakpoints

## CI/CD

Tests run automatically on:
- Push to main/develop branches
- Pull requests
- Multiple OS (Ubuntu, Windows, macOS)
- Multiple Node versions (18.x, 20.x)

See `.github/workflows/ci.yml` for details.

## Common Issues

### Tests Timeout
- Increase timeout in `index.ts`: `timeout: 10000`
- Use `this.timeout(5000)` in specific tests

### Mock Not Working
- Ensure `sandbox.restore()` is called in teardown
- Check stub/spy call order

### VS Code API Not Available
- Tests must run in VS Code test environment
- Use provided mocks for unit tests