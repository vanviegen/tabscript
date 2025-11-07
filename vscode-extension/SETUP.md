# TabScript VSCode Extension - Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `vscode-languageclient` - Client for the language server
- `vscode-languageserver` - Language server protocol implementation  
- `vscode-languageserver-textdocument` - Text document utilities
- `typescript` - TypeScript compiler and language service
- Development dependencies for building

### 2. Build the Extension

```bash
npm run compile
```

Or for development with auto-rebuild:

```bash
npm run watch
```

### 3. Test the Extension

1. Open this project in VS Code
2. Press **F5** to launch Extension Development Host
3. In the new window, create a test project:
   ```bash
   mkdir ~/test-tabscript
   cd ~/test-tabscript
   npm init -y
   npm install tabscript
   ```
4. Create a file `test.tab` and start coding!

### 4. Try the Example

Open the `examples/in.tab` file in the Extension Development Host to see syntax highlighting in action.

## Extension Features

### ✅ Syntax Highlighting
Works immediately for all `.tab` files. Highlights:
- Keywords (function, class, if, for, etc.)
- TabScript operators (`:=`, `::=`, `||`, `&`, `or`, `and`)
- Bitwise operators (`~bit_and`, `~bit_or`, etc.)
- Strings and template literals
- Comments
- Type annotations

### ✅ IntelliSense
Requires `tabscript` installed in your project:
- **Auto-completion**: Get suggestions for variables, functions, types
- **Hover information**: See type signatures and documentation
- **Signature help**: Parameter hints while typing function calls
- **Error detection**: Real-time TypeScript error checking

### ✅ Code Navigation
- **Go to Definition**: Ctrl+Click (Cmd+Click on Mac) on symbols
- Works across files with imports

## How It Works

1. **You type** TabScript code in a `.tab` file
2. **Extension transpiles** to TypeScript in memory (on every change, debounced)
3. **TypeScript analyzes** the transpiled code
4. **Extension provides** IntelliSense based on TypeScript's analysis
5. **Diagnostics are shown** in your TabScript file

The transpilation preserves line/column positions, so errors appear in the right place!

## TabScript Module Requirements

The extension expects `node_modules/tabscript/dist/tabscript.js` to export:

```typescript
export function tabscript(
  inData: string,
  options?: {
    debug?: boolean | ((msg: string) => void);
    recover?: boolean;
    stripTypes?: boolean;
    transformImport?: (uri: string) => Promise<string>;
    onError?: (error: { message: string; line?: number; column?: number }) => void;
  }
): string;
```

### Important: The `onError` callback

For the extension to show all errors (not just the first one), the `tabscript()` function should support the `onError` callback:

```typescript
// When you encounter an error during transpilation:
if (options.onError) {
  options.onError({
    message: "Unexpected token",
    line: 5,      // 1-based line number
    column: 10    // 0-based column number
  });
}

// With recover: true, continue transpiling
if (options.recover) {
  // Try to continue...
} else {
  throw new ParserError(...);
}
```

This allows the extension to show multiple errors at once, improving the developer experience.

## Project Structure

```
tabscript-vscode/
├── src/
│   ├── extension.ts          # Extension entry point
│   └── server.ts              # Language server implementation
├── syntaxes/
│   └── tabscript.tmLanguage.json  # Syntax highlighting rules
├── examples/
│   ├── in.tab                 # TabScript example
│   └── out.ts                 # Equivalent TypeScript
├── language-configuration.json # Brackets, comments, etc.
├── package.json               # Extension manifest
├── tsconfig.json              # TypeScript config
└── README.md                  # User documentation
```

## Publishing to Marketplace

### Before Publishing

1. **Create an icon**: Convert `icon.svg` to `icon.png` (128x128):
   ```bash
   # Using ImageMagick
   convert -background none -resize 128x128 icon.svg icon.png
   
   # Or use any online SVG to PNG converter
   ```

2. **Update package.json**:
   - Set correct `publisher` name (must match your VS Marketplace publisher)
   - Update `repository` URL
   - Add `icon: "icon.png"`

3. **Test thoroughly** in Extension Development Host

### Publishing Steps

1. Install vsce:
   ```bash
   npm install -g @vscode/vsce
   ```

2. Create a Personal Access Token:
   - Go to https://dev.azure.com
   - Create a token with **Marketplace > Manage** permissions

3. Create a publisher (first time only):
   ```bash
   vsce create-publisher <your-publisher-name>
   ```

4. Login:
   ```bash
   vsce login <your-publisher-name>
   ```

5. Package and publish:
   ```bash
   vsce publish
   ```

## Troubleshooting

### "tabscript module not found"
- Make sure `tabscript` is installed in your project: `npm install tabscript`
- The extension looks for `node_modules/tabscript/dist/tabscript.js` in your workspace

### Syntax highlighting works but no IntelliSense
- Check if `tabscript` is installed in your project
- Look for warning message in VS Code
- Check the Output panel: View > Output > TabScript Language Server

### Errors in wrong location
- This is expected in v0.1.0 - position mapping is line-level only
- The TabScript transpiler preserves most positions, but column accuracy may vary

### Extension not activating
- Check that file has `.tab` extension
- Try reloading window: Cmd/Ctrl + Shift + P > "Developer: Reload Window"

## Development Tips

### Debugging the Extension
1. Set breakpoints in `src/extension.ts` or `src/server.ts`
2. Press F5 to start debugging
3. Breakpoints will hit in the Extension Development Host

### Viewing Language Server Logs
1. In Extension Development Host, go to: View > Output
2. Select "TabScript Language Server" from dropdown
3. See transpilation and diagnostic messages

### Hot Reload
When running `npm run watch`, the extension will automatically recompile when you save files. Just reload the Extension Development Host window.

## Next Steps

- Add code snippets for common TabScript patterns
- Implement code actions and quick fixes
- Add semantic highlighting
- Improve source mapping for better diagnostics
- Add rename symbol support
- Implement find all references

## Contributing

Contributions welcome! See DEVELOPMENT.md for architecture details.

## License

MIT - See LICENSE file
