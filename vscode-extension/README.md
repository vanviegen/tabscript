# TabScript for Visual Studio Code

Language support for TabScript - modern TypeScript without the {(noise;)}.

## What is TabScript?

TabScript is a transpiler that converts cleaner, indentation-based syntax to TypeScript or JavaScript. While semantically exactly the same as TypeScript, TabScript aims to reduce visual clutter and allow for beautiful DSLs, especially with regard to declarative UI code.

Learn more at [tabscript.vanviegen.net](https://tabscript.vanviegen.net/)

## Extension Features

- **Syntax Highlighting**: Comprehensive syntax highlighting for TabScript files (`.tab`)
- **IntelliSense**: Full code completion, hover information, and signature help powered by TypeScript
- **Real-time Diagnostics**: Instant error checking and type validation
- **Go to Definition**: Navigate to symbol definitions across your project
- **Symbol Renaming**: Use F2 to rename symbols with full project awareness
- **Multi-file Support**: Works seamlessly with imports between TabScript files

## Requirements

The extension includes the TabScript transpiler, so no additional installation is required. Simply install this extension to get full language support.

## How It Works

The extension transpiles your TabScript code to TypeScript in memory as you type, then uses the TypeScript language service to provide IntelliSense, diagnostics, and other language features.

## Extension Settings

This extension contributes the following settings:

- `tabscript.trace.server`: Enable tracing of the language server communication (for debugging)

## Release Notes

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
