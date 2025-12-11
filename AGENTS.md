## Project Overview

This project is a transpiler that converts TabScript to either TypeScript or JavaScript (depending on a flag). TabScript is an indentation-based language with a concise syntax. It is semantically identical to plain TypeScript, making it ideal for building clean domain-specific languages (DSLs) with the full power of TypeScript's type system.

TabScript supports transpiler plugins, enabling custom syntax extensions for specialized use cases. This project also contains a VSCode extension including a language server that delegates to TypeScript's language server. The transpiler runs from Node and in the browser (with a helper to automatically translate `<script type="text/tabscript">` tags).

## Build & Test Commands

Build the project:
```bash
npm run build
```
This compiles TypeScript to `dist/`, minifies to `dist-min/`, and makes `dist/cli.js` executable.

Run all tests (a build is required first):
```bash
npm test
```

Manual CLI usage:
```bash
./dist/cli.js <input.tab> [--output <file>] [--debug] [--recover] [--js] [--whitespace preserve|pretty]
```

Build documentation:
```bash
npm run build-docs
```
This builds the project, generates documentation using TypeDoc (configured in `typedoc.json`), and copies the transpiler to `dist-docs/assets/tabscript/` for use by the live code editor. The documentation includes:
- API documentation from JSDoc comments in source files
- Tutorial and other markdown files from `docs/` directory
- Live interactive code examples powered by `docs/custom.js` (injected via TypeDoc's `customJs` option)

Deploy documentation to production:
```bash
npm run deploy-docs
```

## VSCode Extension

The extension is in the `vscode-extension/` directory with its own `package.json`.

### Build & Test Extension

Build just the extension:
```bash
cd vscode-extension && npm run compile
```

Build both transpiler and extension:
```bash
npm run build-extension
```

Watch mode (auto-rebuild on changes):
```bash
npm run watch-extension
```

### Test Extension in VSCode

1. Open the project in VSCode
2. Press **F5** to launch a new VSCode window with the extension loaded
3. Open a `.tab` file to test syntax highlighting, completions, etc.

### Package for Publishing

```bash
cd vscode-extension && npx vsce package
```

### Extension Architecture

**`vscode-extension/src/extension.ts`** - Extension entry point. Starts the language server.

**`vscode-extension/src/server.ts`** - Language server implementation:
- Transpiles TabScript to TypeScript in memory
- Creates a TypeScript language service for IntelliSense
- Maps positions between TabScript and TypeScript for diagnostics
- Loads plugins using local tabscript if available, falling back to vendored copy

**`vscode-extension/tabscript/`** - Vendored copy of transpiler (copied during build). Used as fallback when project doesn't have tabscript in node_modules.

**`vscode-extension/syntaxes/tabscript.tmLanguage.json`** - TextMate grammar for syntax highlighting.

## Architecture

### Core Components

**`src/tabscript.ts`** - Main transpiler entry point. Exports the `transpile` function, type definitions, and re-exports plugin development types from `state.ts` and `parser.ts`.

**`src/parser.ts`** - Recursive descent parser with all `parse*()` methods. Contains the `Parser` class.

**`src/state.ts`** - Input/output state management. Contains the `State` class with token reading, output emission, and snapshot/revert functionality.

**`src/cli.ts`** - Command-line interface with argument parsing for `--output`, `--debug`, `--recover`, `--js`, and `--whitespace` flags. Includes plugin loading logic for `.tab` and `.js` plugins.

**`src/browser.ts`** - Browser runtime that auto-transpiles `<script type="text/tabscript">` tags, supports module loading via `transformImport()`, and maintains a transform cache.

### Plugin System

Plugins are loaded using the `import plugin "path"` syntax and receive the Parser instance directly. They extend the parser by augmenting/replacing `parse*` methods:

```ts
import plugin "my-plugin.tab"
```

The plugin module exports a default function that receives `(parser, options)`. To modify parser behavior, save a reference to the original method and replace it:

```ts
const MY_PATTERN = p.pattern(/myregex/, 'Human-friendly Name');
const origParseStatement = p.parseStatement.bind(p);
p.parseStatement = (s) => {
    if (s.read(MY_PATTERN)) {
        s.emit('/* custom output */');
        return true;
    }
    return origParseStatement(s);
};
```

You'll usually want to insert yourself before or after a parsing method with similar precedence. It's usually not needed and error-prone to wrap core methods such as `parseExpression`. 

Example plugins:
- **`tests/markup-plugin.tab`** - Complex UI syntax plugin (`:div.class attr=value`)
- **`tests/log-plugin.tab`** - Simple `@log` decorator for automatic function call logging

### Parser Architecture

The parser (in `src/parser.ts`) uses:
- **Recursive descent** - `parseMain()` → `parseStatement()` → `parseExpression()` → etc.
- **Backtracking** - `snapshot()` + `revert()` for speculative parsing
- **Indent/dedent tokens** - Generated on-demand by `readNewline()`, queued in `indentsPending`
- **Position synchronization** - Source positions tracked for sourcemap generation
- **Token matching** - Regexes in sticky mode (`WHITESPACE`, `IDENTIFIER`, `STRING`, `NUMBER`, `OPERATOR`, etc.)
- **Error recovery** - `recoverErrors()` wrapper for graceful partial transpilation

## Testing Strategy

Tests use diff-based comparison:
- `tests/test.tab` / `tests/test.ts` / `tests/test.js` - Core language syntax
- `tests/error.tab` / `tests/error.ts` - Error recovery mode
- `tests/markup.tab` / `tests/markup.ts` / `tests/markup-plugin.tab` - UI plugin syntax
- `tests/log.tab` / `tests/log.ts` / `tests/log-plugin.tab` - Logging plugin syntax

## Common Development Patterns

When modifying the parser:
1. Add new syntax to the appropriate test file and expected output.
2. Update the appropriate `parse*()` function in `src/parser.ts`.
3. Test with `npm test` to verify output matches expected files.

### State API (for plugins)

- **`s.read(pattern...)`** - Consume tokens without emitting. Returns `undefined` if no match.
- **`s.emit(str...)`** - Add strings to output. Numbers set source positions.
- **`s.accept(pattern...)`** - Like `read()` but also emits matched tokens.
- **`s.acceptType(pattern...)`** - Like `accept()` but output suppressed when `js=true`.
- **`s.peek(pattern...)`** - Like `read` but reverts afterwards.
- **`s.snapshot()`** - Returns object with `revert()`, `revertOutput()`, `hasOutput()` methods.
- **`s.must(value)`** - Throws parse error if `value` is falsy. Returns the value on success.
- **`s.parseGroup(opts, itemFunc)`** - Parse delimited/indented groups.
- **`s.recoverErrors(func)`** - Try/catch with error recovery support.

### Parser method contract
Return truthy on success, falsy on failure. Leave state unchanged on failure.

When debugging:
- Use `--debug` flag to see tokens being read and emitted
- Check `matchOptions` in error messages to see what parser expected
