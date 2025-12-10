# TabScript for Visual Studio Code

Language support for TabScript - modern TypeScript without the {(noise;)}.

## What is TabScript?

TabScript is an indentation-based syntax for TypeScript, designed for building clean domain-specific languages (DSLs) with the full power of TypeScript's type system. It supports a powerful plugin system for custom syntax extensions.

Learn more at [tabscript.vanviegen.net](https://tabscript.vanviegen.net/)

## Extension Features

- **Syntax Highlighting**: Comprehensive syntax highlighting for TabScript files (`.tab`)
- **IntelliSense**: Full code completion, hover information, and signature help powered by TypeScript
- **Real-time Diagnostics**: Instant error checking and type validation
- **Go to Definition**: Navigate to symbol definitions across your project
- **Symbol Renaming**: Use F2 to rename symbols with full project awareness
- **Multi-file Support**: Works seamlessly with imports between TabScript files
- **Plugin Support**: Automatically loads plugins specified in file headers

## Requirements

The extension includes a vendored copy of the TabScript transpiler, so no additional installation is required. However, if your project has TabScript installed locally via npm, the extension will prefer that version for consistent behavior between your IDE and build process.

## How It Works

The extension transpiles your TabScript code to TypeScript in memory as you type, then delegates to TypeScript's language service for all IDE features. This means you get the full power of TypeScript's type system while writing TabScript code.

For projects using TabScript plugins, the extension will automatically transpile and load plugin files (`.tab` or `.js`) as specified in your file headers.

## Extension Settings

This extension contributes the following settings:

- `tabscript.trace.server`: Enable tracing of the language server communication (for debugging)

## Release Notes

### 0.2.0

- Plugin support for custom syntax extensions
- Improved error recovery and diagnostics
- Uses local TabScript from node_modules when available

### 0.1.0

Initial release:
- Syntax highlighting
- IntelliSense powered by TypeScript
- Real-time diagnostics
- Go to definition support
- Multi-file support

## Contributing

Found a bug or have a feature request? Please open an issue on our [GitHub repository](https://github.com/vanviegen/tabscript).

## License

MIT
