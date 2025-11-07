# Change Log

All notable changes to the "tabscript" extension will be documented in this file.

## [0.1.0] - 2025-11-03

### Added
- Initial release
- Syntax highlighting for TabScript files (.tab)
- IntelliSense (completions, hover, signature help) powered by TypeScript
- Real-time diagnostics and error checking
- Go to Definition support
- Multi-file support with import resolution
- Automatic detection of tabscript module in node_modules
- Warning message when tabscript is not installed

### Features
- Transpiles TabScript to TypeScript in memory for language features
- Caches transpilation results for performance
- Debounced validation on file changes
- Full integration with TypeScript language service
