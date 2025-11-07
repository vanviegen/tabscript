# Development Guide

## Building the Extension

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile TypeScript:
   ```bash
   npm run compile
   ```

3. Watch for changes (development):
   ```bash
   npm run watch
   ```

## Testing the Extension

1. Open this folder in VS Code
2. Press F5 to launch the Extension Development Host
3. Create or open a `.tab` file
4. Test the features:
   - Syntax highlighting should work immediately
   - IntelliSense requires `tabscript` installed in the test project

## Testing with TabScript

Create a test workspace with:

```bash
mkdir test-workspace
cd test-workspace
npm init -y
npm install tabscript
```

Create a `test.tab` file and start coding!

## Architecture

### Extension (`src/extension.ts`)
- Activates when a `.tab` file is opened
- Starts the language server

### Language Server (`src/server.ts`)
- Transpiles TabScript to TypeScript on every change
- Creates virtual TypeScript documents
- Uses TypeScript's language service for IntelliSense
- Maps diagnostics back to TabScript source
- Caches transpilation results for performance

### Key Components:
- **Transpilation Cache**: Stores transpiled TypeScript for each document version
- **Virtual Files**: In-memory TypeScript files for the TS language service
- **Position Mapping**: Since TabScript preserves positions, we can map directly

## Publishing

1. Install vsce:
   ```bash
   npm install -g @vscode/vsce
   ```

2. Package the extension:
   ```bash
   vsce package
   ```

3. Publish to marketplace:
   ```bash
   vsce publish
   ```

## TabScript Module Integration

The extension expects the `tabscript` module to export:

```typescript
export function tabscript(
  inData: string,
  options?: {
    recover?: boolean;
    onError?: (error: { message: string; line?: number; column?: number }) => void;
    // ... other options
  }
): string;
```

### Required Changes to tabscript Module

The extension assumes you'll add an `onError` callback option:

```typescript
// In your tabscript transpiler
function tabscript(inData, options = {}) {
  const { recover, onError } = options;
  
  // When an error occurs:
  if (onError) {
    onError({
      message: "Error message",
      line: 5,      // 1-based line number
      column: 10    // 0-based column number
    });
  }
  
  if (recover) {
    // Continue transpiling despite errors
  } else {
    throw new ParserError(...);
  }
}
```

## Performance Considerations

- Transpilation is debounced to avoid excessive work
- Results are cached per document version
- TypeScript language service reuses compilations
- Virtual files minimize disk I/O

## Future Enhancements

- [ ] Better source mapping for column-level precision
- [ ] Code actions and quick fixes
- [ ] Refactoring support
- [ ] Find all references
- [ ] Rename symbol
- [ ] Semantic highlighting
- [ ] Workspace-wide type checking
- [ ] Import path completion
- [ ] Snippet support
