# Generic LSP Proxy for VS Code

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/mjmorales.generic-lsp-proxy)](https://marketplace.visualstudio.com/items?itemName=mjmorales.generic-lsp-proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/mjmorales/vscode-generic-lsp-proxy/workflows/CI/badge.svg)](https://github.com/mjmorales/vscode-generic-lsp-proxy/actions)
[![Release](https://github.com/mjmorales/vscode-generic-lsp-proxy/workflows/Release/badge.svg)](https://github.com/mjmorales/vscode-generic-lsp-proxy/releases)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

A flexible Language Server Protocol (LSP) proxy extension for VS Code that dynamically forwards requests to any LSP server based on configuration files. No more installing separate extensions for each language!

## 🌟 Features

- 🔄 **Dynamic LSP Loading** - Automatically detect and load language servers based on file type
- 📝 **Configuration-Driven** - Simple JSON configuration for any LSP server
- 🚀 **Multiple Transport Support** - stdio, TCP, and WebSocket connections
- 📊 **Status Bar Integration** - Monitor active servers at a glance
- 🎯 **Per-Workspace Configuration** - Different settings for different projects
- 🛠️ **Built-in Commands** - Restart, reload, and manage servers easily
- 🛡️ **Manual Server Management** - Enable/disable servers as needed

## 📦 Installation

### From VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P`
3. Type `ext install generic-lsp-proxy`
4. Press Enter

### From Source

```bash
# Clone the repository
git clone https://github.com/mjmorales/vscode-generic-lsp-proxy.git
cd vscode-generic-lsp-proxy

# Install dependencies
npm install

# Build and package
npm run compile
npx vsce package

# Install the VSIX
code --install-extension generic-lsp-proxy-*.vsix
```

## 🚀 Quick Start

### 1. Initialize Configuration

#### Option A: Use the Init Command (Recommended)

1. Press `Ctrl+Shift+P` / `Cmd+Shift+P`
2. Run `LSP Proxy: Initialize LSP Configuration`
3. Choose `Custom Configuration`:
   - Enter language ID (e.g., `python`, `rust`, `custom`)
   - Enter LSP command (e.g., `pylsp`, `rust-analyzer`)
   - Enter file extensions (e.g., `.py, .pyw`)
   - Select transport type (stdio, tcp, or websocket)
   - Add optional arguments if needed
4. Your `.vscode/lsp-proxy.json` will be created automatically!

#### Option B: Create Manually

```json
[
  {
    "languageId": "python",
    "command": "pylsp",
    "fileExtensions": [".py"]
  }
]
```

### 2. Install Language Server

```bash
# Python
pip install python-lsp-server

# TypeScript
npm install -g typescript-language-server typescript

# Rust
rustup component add rust-analyzer
```

### 3. Open a File

Open any file matching your configured extensions. The LSP will start automatically!

## 📋 Configuration

### Configuration File Locations

The extension looks for configuration in the following order:

1. `.vscode/lsp-proxy.json` (workspace-specific)
2. `.lsp-proxy.json` (project root)
3. Global configuration in VS Code settings

### Configuration Schema

```typescript
interface LSPServerConfig {
  // Required fields
  languageId: string;          // Unique identifier for the language
  command: string;             // Command to start the LSP server
  fileExtensions: string[];    // File extensions to activate this server
  
  // Optional fields
  args?: string[];             // Command line arguments
  filePatterns?: string[];     // Glob patterns for file matching
  workspacePattern?: string;   // Restrict to specific workspace folders
  initializationOptions?: {};  // LSP initialization options
  settings?: {};               // Language-specific settings
  env?: {};                    // Environment variables
  transport?: 'stdio' | 'tcp' | 'websocket';  // Connection type
  tcpPort?: number;            // Port for TCP transport
  websocketUrl?: string;       // URL for WebSocket transport
}
```

### Example Configurations

<details>
<summary><strong>TypeScript/JavaScript</strong></summary>

```json
{
  "languageId": "typescript",
  "command": "typescript-language-server",
  "args": ["--stdio"],
  "fileExtensions": [".ts", ".tsx", ".js", ".jsx"],
  "initializationOptions": {
    "preferences": {
      "includeCompletionsForModuleExports": true,
      "includeInlayParameterNameHints": "all"
    }
  }
}
```
</details>

<details>
<summary><strong>Python</strong></summary>

```json
{
  "languageId": "python",
  "command": "pylsp",
  "fileExtensions": [".py", ".pyw"],
  "settings": {
    "pylsp": {
      "plugins": {
        "pycodestyle": {
          "enabled": true,
          "maxLineLength": 120
        },
        "pylint": {
          "enabled": true
        }
      }
    }
  }
}
```
</details>

<details>
<summary><strong>Rust</strong></summary>

```json
{
  "languageId": "rust",
  "command": "rust-analyzer",
  "fileExtensions": [".rs"],
  "initializationOptions": {
    "cargo": {
      "buildScripts": {
        "enable": true
      },
      "features": "all"
    },
    "procMacro": {
      "enable": true
    }
  }
}
```
</details>

<details>
<summary><strong>Go</strong></summary>

```json
{
  "languageId": "go",
  "command": "gopls",
  "fileExtensions": [".go"],
  "initializationOptions": {
    "usePlaceholders": true,
    "completeUnimported": true,
    "staticcheck": true
  }
}
```
</details>

<details>
<summary><strong>Remote Server (TCP)</strong></summary>

```json
{
  "languageId": "gdscript",
  "command": "nc",
  "args": ["localhost", "6005"],
  "transport": "tcp",
  "tcpPort": 6005,
  "fileExtensions": [".gd", ".tres", ".tscn"]
}
```
</details>

<details>
<summary><strong>Multiple servers on one file type (e.g. language server + linter)</strong></summary>

A single file can be driven by more than one language client. List one entry per
server that should run for the extension; every matching server is started and
VS Code merges their results (completions, hovers, diagnostics, definitions, …).

```json
[
  {
    "languageId": "python",
    "command": "pylsp",
    "fileExtensions": [".py"]
  },
  {
    "languageId": "python",
    "command": "ruff",
    "args": ["server"],
    "fileExtensions": [".py"]
  }
]
```

Entries are matched independently, so they may differ in `command`, `transport`,
`args`, or `settings`. Servers are tracked by a stable id (`languageId::command`),
which is why two entries sharing a `languageId` coexist as long as their commands
differ. Each server sees the whole file, so a server pointed at a host language
must tolerate it (e.g. `tailwindcss-language-server` on HTML is fine; a plain CSS
server on HTML is not).

> **Known limitation:** Call Hierarchy (`textDocument/prepareCallHierarchy`) does
> not merge across clients in VS Code — if one server returns an empty result
> before a second returns data, the late result is dropped. This is an upstream
> VS Code language-client behavior, not something the proxy can resolve.

</details>

## ⚙️ Extension Settings

Configure the extension behavior in VS Code settings (`Ctrl+,` / `Cmd+,`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `genericLspProxy.configPath` | string | `.vscode/lsp-proxy.json` | Path to configuration file |
| `genericLspProxy.enableDebugLogging` | boolean | `false` | Enable detailed logging |

## 📟 Commands

Access commands via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **LSP Proxy: Initialize LSP Configuration** - Create a new LSP configuration with guided setup
- **LSP Proxy: Restart LSP Server** - Restart the server for the current file
- **LSP Proxy: Show Active LSP Servers** - Display and manage running servers
- **LSP Proxy: Reload LSP Configuration** - Reload config and restart servers
- **LSP Proxy: Show Disabled Servers** - View and re-enable servers that failed to start

## 🔧 Development

This project uses [Task](https://taskfile.dev/) for development workflows.

### Prerequisites

```bash
# Install Task
brew install go-task/tap/go-task  # macOS
# or see https://taskfile.dev/installation/

# Install dependencies
task install
```

### Common Tasks

```bash
task          # Show all available tasks
task dev      # Start development mode
task test     # Run all tests
task lint     # Run linter
task build    # Build the extension
task package  # Create VSIX file
```

### Project Structure

```
vscode-generic-lsp-proxy/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── lspProxyManager.ts    # LSP client lifecycle management
│   ├── configurationManager.ts # Configuration loading and validation
│   ├── logger.ts             # Logging utilities
│   └── test/                 # Test suites
├── examples/                 # Example configurations
├── package.json             # Extension manifest
├── Taskfile.yml            # Task runner configuration
└── README.md               # This file
```

### Testing

```bash
# Run all tests
task test

# Run with coverage
task test:coverage

# Run specific test suite
npm test -- --grep "ConfigurationManager"
```

### Code Quality

```bash
# Run all checks
task check

# Auto-fix issues
task fix

# Format code
task format
```

## 🐛 Troubleshooting

### Server Not Starting

1. **Check Output Panel**: View → Output → "Generic LSP Proxy"
2. **Verify Installation**: `which <command>` should return the path
3. **Test Manually**: Run `<command> --version` in terminal
4. **Check Configuration**: Ensure JSON is valid and paths are correct

### No IntelliSense/Completions

1. **File Extension**: Verify file extension matches configuration
2. **Language Server Features**: Not all servers support all features
3. **Initialization**: Check `initializationOptions` in config
4. **Debug Logging**: Enable in settings to see LSP communication

### Performance Issues

1. **Reduce File Watchers**: Limit `filePatterns` scope
2. **Server Performance**: Some servers are resource-intensive
3. **Check Output**: Look for errors in the output panel

### Common Error Messages

| Error | Solution |
|-------|----------|
| "Command not found" | Install the language server or check PATH |
| "Connection refused" | For TCP, ensure server is running on specified port |
| "Invalid configuration" | Check JSON syntax and required fields |
| "Server stopped" | Check server logs and restart manually |

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run checks: `task ready`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines

- Write tests for new features
- Follow existing code style
- Update documentation
- Add example configurations
- Run `task check` before committing

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [vscode-languageclient](https://github.com/Microsoft/vscode-languageserver-node)
- Inspired by the need for a unified LSP experience
- Thanks to all contributors and users

## 🔗 Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mjmorales.generic-lsp-proxy)
- [GitHub Repository](https://github.com/mjmorales/vscode-generic-lsp-proxy)
- [Issue Tracker](https://github.com/mjmorales/vscode-generic-lsp-proxy/issues)
- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)

---

Made with ❤️ for the VS Code community
