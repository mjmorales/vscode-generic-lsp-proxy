## [2.1.1](https://github.com/mjmorales/vscode-generic-lsp-proxy/compare/v2.1.0...v2.1.1) (2026-06-28)


### Bug Fixes

* **config:** trust user/profile-scoped configPath, allow absolute paths ([#18](https://github.com/mjmorales/vscode-generic-lsp-proxy/issues/18)) ([#26](https://github.com/mjmorales/vscode-generic-lsp-proxy/issues/26)) ([4e51690](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/4e516900a2ce2b22a47ec6c9a0abfd5e3f8d2746))
* **deps:** pin @types/vscode to the engines.vscode floor (1.91) ([6442b26](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/6442b265ab5acd403b53d80525095c3996ad1387))

# [2.1.0](https://github.com/mjmorales/vscode-generic-lsp-proxy/compare/v2.0.0...v2.1.0) (2026-06-14)


### Features

* run multiple language servers per file type ([69e79a9](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/69e79a9edb408e81845fd9e64e961f74487b8246)), closes [#2](https://github.com/mjmorales/vscode-generic-lsp-proxy/issues/2)

# [2.0.0](https://github.com/mjmorales/vscode-generic-lsp-proxy/compare/v1.0.3...v2.0.0) (2026-06-13)


### Bug Fixes

* gate server spawning on Workspace Trust and harden config/lifecycle ([717ed95](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/717ed951078d4983a7a928ae7d6cc8a38b07424e))
* **test:** avoid macOS test-electron EINVAL with a short user-data-dir ([848ea91](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/848ea91cb082ff3bf78762d2eb16b8176d7f1f32))


### BREAKING CHANGES

* the configuration schema changed. The unimplemented `websocket`
transport and `websocketUrl` field are removed; `transport` is now `stdio | tcp` and a
`tcp` transport requires an integer `tcpPort` (1..65535) — configs declaring `websocket`
or a portless `tcp` are now rejected at validation instead of silently spawning stdio.
The `Custom/Other` template (which wrote placeholder values verbatim) is removed; use the
interactive Custom Configuration wizard. Disabled-state is now keyed by a stable config id
(`languageId::command`) rather than `languageId`, so prior workspaceState disabled entries
do not carry over. The `ws`/`@types/ws` dependencies are dropped.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

## [1.0.3](https://github.com/mjmorales/vscode-generic-lsp-proxy/compare/v1.0.2...v1.0.3) (2025-08-06)


### Bug Fixes

* don't set default args on empty ([19c034e](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/19c034e81b9033c906f3d79b0278d1b51e8f2468))

## [1.0.2](https://github.com/mjmorales/vscode-generic-lsp-proxy/compare/v1.0.1...v1.0.2) (2025-08-02)


### Bug Fixes

* package node_modules in release ([b17433a](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/b17433ac2b780f3ecdbe5bde144bb1f0d3a5e3fc))

## [1.0.1](https://github.com/mjmorales/vscode-generic-lsp-proxy/compare/v1.0.0...v1.0.1) (2025-08-02)


### Bug Fixes

* update activation events and release configuration ([5156734](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/51567347438040d01d5f98d14fa2669c6badf4a5))

# 1.0.0 (2025-08-02)


### Bug Fixes

* remove all autorestart references ([026d0b0](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/026d0b0878cbf4adf4b11fd693a6bea045dc0553))
* update extension identifier in tests ([3084104](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/30841042209f01f6ce82c2e5d789d29bea8e0d21))
* update GitHub token in release workflow ([38d43a8](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/38d43a8c13151700c4335bd6f780bec49a2dc4c9))
* use xvfb-run for headless VS Code testing in CI ([f9c696f](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/f9c696f51d1f1a61ab2bd4dd84233c738d0dcd3e))
* use xvfb-run for running tests in release job ([3b2aad4](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/3b2aad457405638050fd01b9f73f7b2cc2afb555))


### Features

* add pr task to Taskfile for automated pull request creation ([2cd8f0c](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/2cd8f0c52971d8d9507b13eb81d191aff39bebc9))
* add semantic-release automation and GitHub release workflow ([d2d93c6](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/d2d93c683e4e9b419cd7fb0cf45367933ba490a9))
* added proxy manager ([dfa8534](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/dfa8534d840a78722f533958a0bed27b0caeecc0))
* create lsp proxy extension ([3058ac2](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/3058ac2622387ff00c5a7c6c3cb20f07b405912e))
* enhance package.json with repository info and semantic-release scripts ([e36d683](https://github.com/mjmorales/vscode-generic-lsp-proxy/commit/e36d6832b90b6c1eeb0a8e9325dbb96b0aa04171))

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.
