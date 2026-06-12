import { LSPServerConfig } from './configurationManager';

export interface LanguageTemplate {
    name: string;
    description: string;
    /**
     * How to obtain the language server. `command` is set only when a single
     * runnable shell command exists (so the UI can offer "Copy Command"); `note`
     * carries human prose/alternatives that are not directly executable.
     */
    install?: { command?: string; note?: string };
    config: LSPServerConfig;
}

export const languageTemplates: LanguageTemplate[] = [
    {
        name: 'TypeScript/JavaScript',
        description: 'TypeScript and JavaScript language server',
        install: { command: 'npm install -g typescript-language-server typescript' },
        config: {
            languageId: 'typescript',
            command: 'typescript-language-server',
            args: ['--stdio'],
            fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'],
            initializationOptions: {
                preferences: {
                    includeCompletionsForModuleExports: true,
                    includeInlayParameterNameHints: 'all',
                    includeInlayParameterNameHintsWhenArgumentMatchesName: false,
                    includeInlayFunctionParameterTypeHints: true,
                    includeInlayVariableTypeHints: true,
                    includeInlayPropertyDeclarationTypeHints: true,
                    includeInlayFunctionLikeReturnTypeHints: true,
                    includeInlayEnumMemberValueHints: true
                }
            }
        }
    },
    {
        name: 'Python (pylsp)',
        description: 'Python Language Server (pylsp) with all plugins',
        install: { command: 'pip install "python-lsp-server[all]" python-lsp-black python-lsp-mypy python-lsp-isort python-lsp-ruff' },
        config: {
            languageId: 'python',
            command: 'pylsp',
            fileExtensions: ['.py', '.pyw'],
            settings: {
                pylsp: {
                    plugins: {
                        pycodestyle: {
                            enabled: true,
                            maxLineLength: 120,
                            ignore: ['E203', 'W503']
                        },
                        pyflakes: { enabled: true },
                        pylint: { 
                            enabled: false,
                            args: ['--disable=C0111']
                        },
                        yapf: { enabled: false },
                        autopep8: { enabled: false },
                        black: { 
                            enabled: true,
                            line_length: 120
                        },
                        mypy: {
                            enabled: true,
                            live_mode: false,
                            dmypy: true
                        },
                        isort: { enabled: true },
                        rope_completion: { enabled: true },
                        ruff: { 
                            enabled: true,
                            lineLength: 120
                        }
                    }
                }
            }
        }
    },
    {
        name: 'Python (Pyright)',
        description: 'Microsoft Pyright - fast Python static type checker',
        install: { command: 'npm install -g pyright' },
        config: {
            languageId: 'python',
            command: 'pyright-langserver',
            args: ['--stdio'],
            fileExtensions: ['.py', '.pyw'],
            settings: {
                python: {
                    analysis: {
                        autoImportCompletions: true,
                        autoSearchPaths: true,
                        diagnosticMode: 'workspace',
                        typeCheckingMode: 'basic',
                        useLibraryCodeForTypes: true,
                        reportMissingImports: true,
                        reportMissingTypeStubs: false,
                        reportGeneralTypeIssues: 'warning',
                        reportOptionalMemberAccess: 'warning',
                        reportOptionalCall: 'warning',
                        reportOptionalIterable: 'warning',
                        reportOptionalContextManager: 'warning',
                        reportOptionalOperand: 'warning',
                        reportTypedDictNotRequiredAccess: 'warning',
                        reportPrivateImportUsage: 'warning'
                    }
                }
            }
        }
    },
    {
        name: 'Rust',
        description: 'Rust Analyzer - official Rust language server',
        install: { command: 'rustup component add rust-analyzer' },
        config: {
            languageId: 'rust',
            command: 'rust-analyzer',
            fileExtensions: ['.rs'],
            initializationOptions: {
                cargo: {
                    buildScripts: {
                        enable: true
                    },
                    features: 'all',
                    runBuildScripts: true,
                    noDefaultFeatures: false
                },
                procMacro: {
                    enable: true,
                    attributes: {
                        enable: true
                    }
                },
                checkOnSave: {
                    enable: true,
                    command: 'clippy',
                    allTargets: true,
                    features: 'all',
                    extraArgs: ['--', '-W', 'clippy::all']
                },
                inlayHints: {
                    enable: true,
                    chainingHints: true,
                    closingBraceHints: {
                        enable: true,
                        minLines: 20
                    },
                    closureReturnTypeHints: {
                        enable: 'with_block'
                    },
                    lifetimeElisionHints: {
                        enable: 'skip_trivial',
                        useParameterNames: true
                    },
                    parameterHints: true,
                    typeHints: true,
                    maxLength: 25
                },
                diagnostics: {
                    enable: true,
                    experimental: {
                        enable: true
                    },
                    remapPrefix: {}
                },
                completion: {
                    autoself: {
                        enable: true
                    },
                    autoimport: {
                        enable: true
                    },
                    postfix: {
                        enable: true
                    }
                }
            }
        }
    },
    {
        name: 'Go',
        description: 'gopls - official Go language server',
        install: { command: 'go install golang.org/x/tools/gopls@latest' },
        config: {
            languageId: 'go',
            command: 'gopls',
            fileExtensions: ['.go'],
            initializationOptions: {
                usePlaceholders: true,
                completeUnimported: true,
                staticcheck: true,
                gofumpt: true,
                analyses: {
                    unusedparams: true,
                    shadow: true,
                    fieldalignment: true,
                    nilness: true,
                    useany: true,
                    unusedwrite: true
                },
                codelenses: {
                    gc_details: true,
                    generate: true,
                    regenerate_cgo: true,
                    tidy: true,
                    upgrade_dependency: true,
                    vendor: true
                },
                hoverKind: 'FullDocumentation',
                linkTarget: 'pkg.go.dev',
                env: {
                    GOFLAGS: '-mod=readonly'
                },
                semanticTokens: true,
                hints: {
                    assignVariableTypes: true,
                    compositeLiteralFields: true,
                    compositeLiteralTypes: true,
                    constantValues: true,
                    functionTypeParameters: true,
                    parameterNames: true,
                    rangeVariableTypes: true
                }
            }
        }
    },
    {
        name: 'C/C++ (clangd)',
        description: 'Clangd - LLVM-based C/C++ language server',
        install: { command: 'brew install llvm', note: 'On Debian/Ubuntu: apt install clangd' },
        config: {
            languageId: 'cpp',
            command: 'clangd',
            args: [
                '--background-index',
                '--header-insertion=iwyu',
                '--completion-style=detailed',
                '--function-arg-placeholders',
                '--fallback-style=llvm',
                '--clang-tidy',
                '--suggest-missing-includes',
                '--cross-file-rename',
                '--pch-storage=memory'
            ],
            fileExtensions: ['.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hxx', '.h++', '.c', '.cu', '.m', '.mm'],
            initializationOptions: {
                clangdFileStatus: true,
                fallbackFlags: [
                    '-std=c++17',
                    '-Wall',
                    '-Wextra',
                    '-Wpedantic'
                ]
            }
        }
    },
    {
        name: 'Java',
        description: 'Eclipse JDT Language Server',
        install: { note: 'Download jdtls from https://download.eclipse.org/jdtls/snapshots/latest.tar.gz' },
        config: {
            languageId: 'java',
            command: 'jdtls',
            fileExtensions: ['.java'],
            initializationOptions: {
                bundles: [],
                settings: {
                    java: {
                        home: null,
                        jdt: {
                            ls: {
                                vmargs: '-XX:+UseParallelGC -XX:GCTimeRatio=4 -XX:AdaptiveSizePolicyWeight=90 -Dsun.zip.disableMemoryMapping=true -Xmx1G -Xms100m'
                            }
                        },
                        errors: {
                            incompleteClasspath: {
                                severity: 'warning'
                            }
                        },
                        configuration: {
                            checkProjectSettingsExclusions: true,
                            updateBuildConfiguration: 'automatic'
                        },
                        trace: {
                            server: 'off'
                        },
                        import: {
                            gradle: {
                                enabled: true
                            },
                            maven: {
                                enabled: true
                            },
                            exclusions: [
                                '**/node_modules/**',
                                '**/.metadata/**',
                                '**/archetype-resources/**',
                                '**/META-INF/maven/**'
                            ]
                        },
                        maven: {
                            downloadSources: true
                        },
                        referencesCodeLens: {
                            enabled: true
                        },
                        signatureHelp: {
                            enabled: true
                        },
                        implementationsCodeLens: {
                            enabled: true
                        },
                        format: {
                            enabled: true
                        }
                    }
                }
            }
        }
    },
    {
        name: 'Lua',
        description: 'Lua Language Server - feature-rich Lua LSP',
        install: { command: 'brew install lua-language-server', note: 'Or download a prebuilt binary from the GitHub releases page' },
        config: {
            languageId: 'lua',
            command: 'lua-language-server',
            fileExtensions: ['.lua'],
            initializationOptions: {
                runtime: {
                    version: 'Lua 5.4',
                    path: [
                        '?.lua',
                        '?/init.lua',
                        '?/?.lua'
                    ]
                },
                diagnostics: {
                    enable: true,
                    globals: ['vim', 'use', 'require'],
                    severity: {
                        redefinedLocal: 'Warning',
                        trailingSpace: 'Warning'
                    }
                },
                workspace: {
                    library: [],
                    checkThirdParty: false,
                    maxPreload: 5000,
                    preloadFileSize: 500
                },
                completion: {
                    enable: true,
                    callSnippet: 'Replace',
                    keywordSnippet: 'Replace',
                    displayContext: 5,
                    workspaceWord: true,
                    showWord: 'Enable'
                },
                signatureHelp: {
                    enable: true
                },
                hover: {
                    enable: true,
                    viewString: true,
                    viewStringMax: 1000,
                    viewNumber: true,
                    fieldInfer: 3000,
                    previewFields: 100,
                    enumsLimit: 100
                },
                hint: {
                    enable: true,
                    setType: false,
                    paramType: true,
                    paramName: 'All',
                    semicolon: 'SameLine',
                    arrayIndex: 'Enable'
                },
                telemetry: {
                    enable: false
                },
                format: {
                    enable: true,
                    defaultConfig: {
                        indent_style: 'space',
                        indent_size: '4',
                        quote_style: 'single'
                    }
                }
            }
        }
    },
    {
        name: 'Ruby (Solargraph)',
        description: 'Solargraph - comprehensive Ruby language server',
        install: { command: 'gem install solargraph' },
        config: {
            languageId: 'ruby',
            command: 'solargraph',
            args: ['stdio'],
            fileExtensions: ['.rb', '.erb', '.rake', '.gemspec'],
            filePatterns: ['**/Gemfile', '**/Rakefile'],
            initializationOptions: {
                formatting: true,
                hover: true,
                documentSymbol: true,
                completion: true,
                definitions: true,
                rename: true,
                references: true,
                folding: true
            },
            settings: {
                solargraph: {
                    diagnostics: true,
                    autoformat: false,
                    formatting: true,
                    hover: true,
                    completion: true,
                    useBundler: true,
                    bundlerPath: 'bundle',
                    checkGemVersion: true,
                    definitions: true,
                    rename: true,
                    references: true,
                    symbols: true,
                    folding: true,
                    transport: 'stdio',
                    logLevel: 'warn',
                    completionItemKind: {
                        Method: 2,
                        Function: 3,
                        Constructor: 4,
                        Field: 5,
                        Variable: 6,
                        Class: 7,
                        Interface: 8,
                        Module: 9,
                        Property: 10,
                        Unit: 11,
                        Value: 12,
                        Enum: 13,
                        Keyword: 14,
                        Snippet: 15,
                        Color: 16,
                        File: 17,
                        Reference: 18,
                        Folder: 19,
                        EnumMember: 20,
                        Constant: 21,
                        Struct: 22,
                        Event: 23,
                        Operator: 24,
                        TypeParameter: 25
                    }
                }
            }
        }
    },
    {
        name: 'PHP (Intelephense)',
        description: 'Intelephense - high performance PHP language server',
        install: { command: 'npm install -g intelephense' },
        config: {
            languageId: 'php',
            command: 'intelephense',
            args: ['--stdio'],
            fileExtensions: ['.php', '.phtml', '.php3', '.php4', '.php5', '.php7', '.phps'],
            initializationOptions: {
                storagePath: '/tmp/intelephense',
                clearCache: false
            },
            settings: {
                intelephense: {
                    files: {
                        maxSize: 1000000,
                        associations: ['*.php', '*.phtml'],
                        exclude: [
                            '**/.git/**',
                            '**/.svn/**',
                            '**/.hg/**',
                            '**/CVS/**',
                            '**/.DS_Store/**',
                            '**/node_modules/**',
                            '**/bower_components/**',
                            '**/vendor/**/{Tests,tests}/**',
                            '**/.history/**',
                            '**/vendor/**/vendor/**'
                        ]
                    },
                    stubs: [
                        'bcmath',
                        'bz2',
                        'Core',
                        'curl',
                        'date',
                        'dom',
                        'fileinfo',
                        'filter',
                        'gd',
                        'gettext',
                        'hash',
                        'iconv',
                        'imap',
                        'intl',
                        'json',
                        'libxml',
                        'mbstring',
                        'mcrypt',
                        'mysql',
                        'mysqli',
                        'password',
                        'pcntl',
                        'pcre',
                        'PDO',
                        'pdo_mysql',
                        'Phar',
                        'readline',
                        'regex',
                        'session',
                        'SimpleXML',
                        'sockets',
                        'sodium',
                        'standard',
                        'superglobals',
                        'tokenizer',
                        'xml',
                        'xdebug',
                        'xmlreader',
                        'xmlwriter',
                        'yaml',
                        'zip',
                        'zlib'
                    ],
                    environment: {
                        includePaths: []
                    },
                    runtime: '',
                    maxMemory: 0,
                    licenceKey: '',
                    telemetry: {
                        enabled: false
                    },
                    format: {
                        enable: false
                    }
                }
            }
        }
    }
];

/**
 * Reference-only skeleton documenting every field a custom config may set.
 *
 * This is intentionally NOT part of the selectable languageTemplates array: it is
 * never offered in the template picker, never loaded, and never written to a
 * user's config. Its placeholder values (a dummy command, globs, env-var
 * interpolation, etc.) would otherwise be serialized verbatim into a real,
 * loadable config and the proxy would try to spawn the placeholder command. The
 * interactive "Custom Configuration" wizard handles real custom setups instead.
 *
 * The websocket transport is unsupported (LSPServerConfig.transport is
 * stdio or tcp only), so no websocket field appears here.
 */
export const CUSTOM_TEMPLATE_DOC: LanguageTemplate = {
    name: 'Custom/Other',
    description: 'Configure a custom language server with all available options',
    install: { note: 'Install your custom language server, then point `command` at its executable.' },
    config: {
        // Required fields
        languageId: 'custom',
        command: 'your-lsp-command',
        fileExtensions: ['.ext', '.myext'],

        // Optional command arguments
        args: ['--stdio', '--verbose'],

        // File matching patterns (in addition to extensions)
        filePatterns: ['**/*.config', '**/special-file-name'],

        // Workspace pattern to restrict this server to specific folders
        workspacePattern: '**/*',

        // Transport configuration. Supported: 'stdio' | 'tcp' (websocket is unsupported).
        transport: 'stdio',
        tcpPort: 9999, // Required if transport is 'tcp'

        // LSP initialization options
        initializationOptions: {
            // Server-specific initialization parameters
            cacheDirectory: '/tmp/lsp-cache',
            formatOnSave: true,
            lintOnSave: true,
            maxNumberOfProblems: 100,
            trace: {
                server: 'verbose'
            },
            // Custom options specific to your server
            customOption1: 'value1',
            customOption2: {
                nested: true,
                value: 42
            }
        },

        // Language-specific settings
        settings: {
            // These are sent via workspace/didChangeConfiguration
            myLanguage: {
                enable: true,
                validate: {
                    enable: true,
                    lint: true,
                    syntaxCheck: true
                },
                format: {
                    enable: true,
                    tabSize: 4,
                    insertSpaces: true,
                    trimTrailingWhitespace: true,
                    insertFinalNewline: true
                },
                suggest: {
                    enable: true,
                    autoTriggerCompletions: true,
                    includeSnippets: true,
                    maxItems: 50
                },
                diagnostics: {
                    enable: true,
                    showWarnings: true,
                    showErrors: true,
                    showHints: true,
                    debounceTime: 500
                },
                advanced: {
                    maxFileSize: 1048576, // 1MB
                    excludePatterns: ['**/node_modules/**', '**/dist/**'],
                    includePatterns: ['**/*.ext'],
                    workspaceSymbolSearchLimit: 1000,
                    documentSymbolSearchLimit: 500
                }
            }
        },

        // Environment variables for the server process
        env: {
            MY_LANGUAGE_HOME: '/usr/local/my-language',
            MY_LANGUAGE_SDK: '/usr/local/my-language/sdk',
            PATH: '${env:PATH}:/usr/local/my-language/bin',
            DEBUG: 'true',
            LOG_LEVEL: 'debug',
            CUSTOM_ENV_VAR: 'custom-value'
        }
    }
};

/**
 * Dev-time drift guard for `languageTemplates`. Returns a list of human-readable
 * problems (empty when the registry is well-formed). Intended to be called at
 * activation under debug, or from a unit test.
 *
 * Note: two templates may legally share a `languageId` (e.g. pylsp and pyright
 * are both `python`) as long as their `command` differs, so the identity check
 * is on the `(languageId, command)` pair, not `languageId` alone.
 */
export function validateTemplates(): string[] {
    const problems: string[] = [];
    const seenNames = new Set<string>();
    const seenPairs = new Set<string>();

    for (const template of languageTemplates) {
        if (seenNames.has(template.name)) {
            problems.push(`Duplicate template name: '${template.name}'`);
        }
        seenNames.add(template.name);

        const { languageId, command, fileExtensions } = template.config;
        const pair = `${languageId} ${command}`;
        if (seenPairs.has(pair)) {
            problems.push(`Duplicate (languageId, command) pair: '${languageId}' + '${command}'`);
        }
        seenPairs.add(pair);

        for (const ext of fileExtensions) {
            if (!ext.startsWith('.')) {
                problems.push(`Template '${template.name}': fileExtensions entry '${ext}' does not start with '.'`);
            }
            if (ext.includes('/') || ext.includes('\\')) {
                problems.push(`Template '${template.name}': fileExtensions entry '${ext}' contains a path separator`);
            }
        }
    }

    return problems;
}