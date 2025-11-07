# TabScript for Visual Studio Code

Full language support for TabScript - a modern language that compiles to TypeScript.

## Features

- **Syntax Highlighting**: Comprehensive syntax highlighting for TabScript files (`.tab`)
- **IntelliSense**: Full code completion, hover information, and signature help powered by TypeScript
- **Real-time Diagnostics**: Instant error checking and type validation
- **Go to Definition**: Navigate to symbol definitions across your project
- **Multi-file Support**: Works seamlessly with imports between TabScript files

## Requirements

The extension includes the TabScript transpiler, so no additional installation is required. Simply install this extension to get full language support.

## How It Works

The extension transpiles your TabScript code to TypeScript in memory as you type, then uses the TypeScript language service to provide IntelliSense, diagnostics, and other language features. This means you get:

- Type checking from TypeScript
- Auto-completion for variables, functions, and types
- Hover information showing type signatures
- Parameter hints while writing function calls
- Real-time error detection

## TabScript Syntax Overview

TabScript is similar to TypeScript but with cleaner syntax:

- Function parameters use `||` instead of `()`: `function myFunc|x: number| { }`
- Arrow functions: `|x| => x + 1` instead of `(x) => x + 1`
- Type inference with `:=` and `::=`: `x := 5` (const) or `x ::= 5` (let)
- Union types with `or`: `x: string or number`
- Intersection types with `and`: `x: A and B`
- Function calls without parens: `console.log& "hello"` instead of `console.log("hello")`
- Bitwise operators: `~bit_and`, `~bit_or`, `~bit_xor`, `~shift_left`, etc.

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
