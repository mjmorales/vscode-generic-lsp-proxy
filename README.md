# Generic LSP Proxy for VS Code

A flexible Language Server Protocol (LSP) proxy extension that dynamically forwards requests to any LSP server based on configuration files. This allows you to use multiple language servers without installing separate extensions for each language.

## Features

- 🔄 Dynamic LSP server loading based on file type
- 📝 Configuration-driven approach using JSON files
- 🚀 Support for stdio, TCP, and WebSocket transports
- 🔧 Auto-restart capability for crashed servers
- 📊 Status bar integration showing active servers
- 🎯 Per-workspace and global configuration support
- 🛠️ Built-in commands for server management

## Installation

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Open VS Code and run the extension in debug mode (F5)

## Configuration

The extension looks for configuration in the following locations (in order of priority):

1. `.vscode/lsp-proxy.json` in your workspace
2. `.lsp-proxy.json` in your workspace root
3. Global configuration in VS Code's storage

### Configuration File Format

Create a `.vscode/lsp-proxy.json` file in your workspace:

```json
[
  {
    "languageId": "typescript",
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "fileExtensions": [".ts", ".tsx"],
    "initializationOptions": {},
    "settings": {}
  }
]
```

### Configuration Options

Each LSP server configuration supports the following options:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `languageId` | string | ✓ | Unique identifier for the language |
| `command` | string | ✓ | Command to start the LSP server |
| `args` | string[] | | Arguments to pass to the command |
| `fileExtensions` | string[] | ✓ | File extensions to activate this server for |
| `filePatterns` | string[] | | Glob patterns for more complex file matching |
| `workspacePattern` | string | | Restrict this config to specific workspace folders |
| `initializationOptions` | object | | LSP initialization options |
| `settings` | object | | Language-specific settings |
| `env` | object | | Environment variables for the server process |
| `transport` | string | | Transport type: "stdio" (default), "tcp", or "websocket" |
| `tcpPort` | number | | Port for TCP transport |
| `websocketUrl` | string | | URL for WebSocket transport |

## Examples

### Basic Configuration

```json
[
  {
    "languageId": "python",
    "command": "pylsp",
    "fileExtensions": [".py"],
    "settings": {
      "pylsp": {
        "plugins": {
          "pycodestyle": {
            "enabled": true,
            "maxLineLength": 120
          }
        }
      }
    }
  }
]
```

### TCP Connection (e.g., Godot)

```json
[
  {
    "languageId": "gdscript",
    "command": "nc",
    "args": ["localhost", "6005"],
    "transport": "tcp",
    "tcpPort": 6005,
    "fileExtensions": [".gd", ".tres", ".tscn"]
  }
]
```

### Remote Server via SSH

```json
[
  {
    "languageId": "remote-python",
    "command": "ssh",
    "args": ["remote-server", "python", "-m", "pylsp"],
    "fileExtensions": [".py"]
  }
]
```

## Commands

The extension provides the following commands:

- **LSP Proxy: Restart LSP Server** - Restart the server for the current file
- **LSP Proxy: Show Active LSP Servers** - Display all running servers with management options
- **LSP Proxy: Reload LSP Configuration** - Reload configuration files and restart servers

## Extension Settings

Configure the extension behavior in VS Code settings:

- `genericLspProxy.configPath`: Path to the configuration file (default: `.vscode/lsp-proxy.json`)
- `genericLspProxy.enableDebugLogging`: Enable detailed logging for debugging
- `genericLspProxy.autoRestart`: Automatically restart crashed servers (default: true)
- `genericLspProxy.restartDelay`: Delay in milliseconds before restarting (default: 1000)

## Status Bar

The extension adds a status bar item showing the number of active LSP servers. Click on it to manage running servers.

## Troubleshooting

1. **Server not starting**: Check the Output panel (View → Output → Generic LSP Proxy) for error messages
2. **No completions**: Ensure the language server is installed and accessible in your PATH
3. **Wrong server activated**: Check file extensions and patterns in your configuration

## Supported Language Servers

The extension can work with any LSP-compliant server. Some popular examples:

- TypeScript: `typescript-language-server`
- Python: `pylsp`, `pyright`
- Rust: `rust-analyzer`
- Go: `gopls`
- C/C++: `clangd`
- Java: `jdtls`
- Lua: `lua-language-server`

## Development

To contribute or modify the extension:

1. Clone the repository
2. Run `npm install`
3. Make your changes
4. Run `npm run lint` to check code style
5. Run `npm run compile` to build
6. Test in VS Code using F5 (Run Extension)

## License

MIT