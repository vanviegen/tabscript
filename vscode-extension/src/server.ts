import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  Hover,
  SignatureHelp,
  Definition,
  Location,
  Range,
  Position,
  WorkspaceEdit,
  TextEdit,
  RenameParams
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

// Import vendored tabscript transpiler from extension
const vendoredTabscript = require('../tabscript/tabscript.js').tabscript;

// Create a require function for loading JS plugins
const requireFromCwd = createRequire(process.cwd() + '/');

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Try to find tabscript in node_modules starting from basePath and walking up
function findLocalTabscript(basePath: string): ((source: string, options?: any) => any) | null {
  let dir = basePath;
  while (true) {
    const tabscriptPath = path.join(dir, 'node_modules', 'tabscript', 'tabscript.js');
    if (fs.existsSync(tabscriptPath)) {
      try {
        return require(tabscriptPath).tabscript;
      } catch (e) {
        // If require fails, fall back to vendored version
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // Reached filesystem root
    dir = parent;
  }
  return null;
}

// Plugin loader factory - creates a loadPlugin function for a specific base path
function createPluginLoader(basePath: string, tabscriptFn?: (source: string, options?: any) => any): (pluginPath: string) => any {
  // Detect local tabscript on first call if not provided
  const transpiler = tabscriptFn ?? findLocalTabscript(basePath) ?? vendoredTabscript;
  
  const loadPlugin = (pluginPath: string): any => {
    // Resolve the plugin path following npm import rules
    let resolvedPath: string;
    if (pluginPath.startsWith('./') || pluginPath.startsWith('../')) {
      // Relative path - resolve relative to the base path
      resolvedPath = path.resolve(basePath, pluginPath);
    } else {
      // Non-relative path - use require.resolve to look up in node_modules
      try {
        resolvedPath = requireFromCwd.resolve(pluginPath, { paths: [basePath] });
      } catch (e) {
        throw new Error(`Failed to resolve plugin "${pluginPath}": ${e}`);
      }
    }
    
    // If it's a .tab file, we need to transpile it
    if (resolvedPath.endsWith('.tab')) {
      const pluginSource = fs.readFileSync(resolvedPath, 'utf8');
      const pluginBasePath = path.dirname(resolvedPath);
      // Pass the same transpiler to nested plugins for consistency
      const pluginResult = transpiler(pluginSource, { js: true, loadPlugin: createPluginLoader(pluginBasePath, transpiler) });
      if (pluginResult.errors.length > 0) {
        throw new Error(`Failed to transpile plugin ${pluginPath}: ${pluginResult.errors[0].message}`);
      }
      // Evaluate the transpiled code in memory
      // Convert ES module export to a return value for Function constructor
      const code = pluginResult.code.replace(/export default /, 'return ');
      return Function(code)();
    }
    
    // For .js files, require them directly  
    return requireFromCwd(resolvedPath);
  };
  return loadPlugin;
}

// Create a simple text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// Cache for transpiled TypeScript
interface TranspileCache {
  version: number;
  typescript: string;
  errors: Array<{ message: string; line: number; column: number; offset: number }>;
  map: { in: number[]; out: number[] };
}

const transpileCache = new Map<string, TranspileCache>();

// TypeScript language service
let tsLanguageService: ts.LanguageService | null = null;
const virtualFiles = new Map<string, string>();
const virtualFileVersions = new Map<string, number>();

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', '"', "'", '/', '@', '<']
      },
      hoverProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ['(', ',', '|', '!']
      },
      definitionProvider: true,
      renameProvider: true
    }
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }

  // Initialize TypeScript language service
  initializeTypeScriptService();
});

function initializeTypeScriptService() {
  // Helper to check if a .ts file has a corresponding .tab file
  const getTabFileForTs = (tsFileName: string): string | null => {
    if (!tsFileName.endsWith('.ts')) return null;
    const tabFileName = tsFileName.replace(/\.ts$/, '.tab');
    return fs.existsSync(tabFileName) ? tabFileName : null;
  };

  // Load tsconfig.json if present
  const currentDir = process.cwd();
  const tsconfigPath = ts.findConfigFile(currentDir, ts.sys.fileExists, 'tsconfig.json');
  
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    noEmit: true,
    allowJs: true,
    baseUrl: currentDir,
  };

  if (tsconfigPath) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (!configFile.error) {
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath)
      );
      compilerOptions = { ...parsedConfig.options, noEmit: true, baseUrl: parsedConfig.options.baseUrl || currentDir };
      connection.console.log(`Loaded tsconfig from: ${tsconfigPath}`);
    }
  }

  const servicesHost: ts.LanguageServiceHost = {
    getScriptFileNames: () => Array.from(virtualFiles.keys()),
    getScriptVersion: (fileName) => {
      const version = virtualFileVersions.get(fileName);
      return version !== undefined ? version.toString() : '0';
    },
    getScriptSnapshot: (fileName) => {
      const content = virtualFiles.get(fileName);
      if (content !== undefined) {
        return ts.ScriptSnapshot.fromString(content);
      }
      
      // Check if this is a virtual .ts file with a corresponding .tab file
      const tabFileName = getTabFileForTs(fileName);
      if (tabFileName) {
        transpileTabScriptFile(tabFileName);
        const transpiledContent = virtualFiles.get(fileName);
        if (transpiledContent !== undefined) {
          return ts.ScriptSnapshot.fromString(transpiledContent);
        }
      }
      
      // Try to read from filesystem
      if (fs.existsSync(fileName)) {
        return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'));
      }
      return undefined;
    },
    getCurrentDirectory: () => currentDir,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (fileName) => {
      return virtualFiles.has(fileName) || fs.existsSync(fileName) || getTabFileForTs(fileName) !== null;
    },
    readFile: (fileName) => {
      return virtualFiles.get(fileName) || (fs.existsSync(fileName) ? fs.readFileSync(fileName, 'utf8') : undefined);
    },
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories
  };

  tsLanguageService = ts.createLanguageService(servicesHost, ts.createDocumentRegistry());
}


// Core transpilation function - called by both document and file-based transpilation
function doTranspile(content: string, uri: string, version: number): TranspileCache {
  // Determine the base path for plugin loading from the URI
  let basePath = process.cwd();
  if (uri.startsWith('file://')) {
    basePath = path.dirname(fileURLToPath(uri));
  }
  
  // Use local tabscript from node_modules if available, otherwise use vendored version
  const transpiler = findLocalTabscript(basePath) ?? vendoredTabscript;
  
  const transpileResult = transpiler(content, {
    recover: true,
    whitespace: 'pretty',
    loadPlugin: createPluginLoader(basePath, transpiler)
  });

  const result: TranspileCache = {
    version,
    typescript: transpileResult.code || '',
    errors: transpileResult.errors || [],
    map: transpileResult.map || { in: [], out: [] }
  };

  transpileCache.set(uri, result);

  // Update virtual TypeScript file
  const virtualPath = getVirtualTypeScriptPath(uri);
  virtualFiles.set(virtualPath, result.typescript);
  
  const currentVersion = virtualFileVersions.get(virtualPath) || 0;
  virtualFileVersions.set(virtualPath, currentVersion + 1);
  
  connection.console.log(`Transpiled ${uri} -> ${virtualPath} (${result.typescript.length} chars, v${currentVersion + 1})`);
  
  return result;
}

// Transpile TabScript file by filesystem path (synchronous, for on-demand loading)
function transpileTabScriptFile(tabFilePath: string): void {
  const tabUri = 'file://' + tabFilePath;

  if (transpileCache.has(tabUri)) return;

  const content = fs.readFileSync(tabFilePath, 'utf8');
  doTranspile(content, tabUri, 0);
}

// Transpile TabScript document
function transpileTabScript(document: TextDocument): TranspileCache {
  const cached = transpileCache.get(document.uri);
  if (cached && cached.version === document.version) {
    return cached;
  }

  return doTranspile(document.getText(), document.uri, document.version);
}

// Get virtual TypeScript file path
function getVirtualTypeScriptPath(tabUri: string): string {
  // Convert URI to filesystem path for TypeScript language service
  let filePath = tabUri;
  if (filePath.startsWith('file://')) {
    filePath = decodeURIComponent(filePath.substring(7));
  }
  return filePath.replace(/\.tab$/, '.ts');
}

// Convert document offset to position
function offsetToPosition(document: TextDocument, offset: number): Position {
  const text = document.getText();
  let line = 0;
  let character = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      character = 0;
    } else {
      character++;
    }
  }
  return Position.create(line, character);
}

// Convert position to document offset
function positionToOffset(document: TextDocument, position: Position): number {
  const text = document.getText();
  let offset = 0;
  let currentLine = 0;
  let currentChar = 0;

  for (let i = 0; i < text.length; i++) {
    if (currentLine === position.line && currentChar === position.character) {
      return offset;
    }
    if (text[i] === '\n') {
      currentLine++;
      currentChar = 0;
    } else {
      currentChar++;
    }
    offset++;
  }

  return offset;
}

// Map offset using binary search on the source array
function mapOffset(offset: number, fromArray: number[], toArray: number[]): number {
  if (fromArray.length === 0) return offset;
  
  // Find the largest index where fromArray[i] <= offset
  let idx = 0;
  for (let i = 0; i < fromArray.length; i++) {
    if (fromArray[i] <= offset) idx = i;
    else break;
  }
  
  // Interpolate: add the delta to the mapped base
  return toArray[idx] + (offset - fromArray[idx]);
}

// Map TabScript offset to TypeScript offset
function mapTabScriptToTypeScript(tabOffset: number, map: { in: number[]; out: number[] }): number {
  return mapOffset(tabOffset, map.in, map.out);
}

// Map TypeScript offset to TabScript offset
function mapTypeScriptToTabScript(tsOffset: number, map: { in: number[]; out: number[] }): number {
  return mapOffset(tsOffset, map.out, map.in);
}

// Helper to prepare TypeScript offset for LSP handlers
function prepareTypeScriptQuery(
  textDocumentPosition: TextDocumentPositionParams
): { document: TextDocument; result: TranspileCache; virtualPath: string; tsOffset: number } | null {
  const document = documents.get(textDocumentPosition.textDocument.uri);
  if (!document || !tsLanguageService) {
    return null;
  }

  const result = transpileTabScript(document);
  const virtualPath = getVirtualTypeScriptPath(document.uri);
  const tabOffset = positionToOffset(document, textDocumentPosition.position);
  const tsOffset = mapTabScriptToTypeScript(tabOffset, result.map);

  return { document, result, virtualPath, tsOffset };
}

// Validate TabScript document
function validateTabScriptDocument(document: TextDocument): void {
  const result = transpileTabScript(document);
  const diagnostics: Diagnostic[] = [];

  // Add transpilation errors
  for (const error of result.errors) {
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: error.line! - 1, character: error.column! },
        end: { line: error.line! - 1, character: error.column! + 1 }
      },
      message: error.message,
      source: 'tabscript'
    };
    diagnostics.push(diagnostic);
  }

  // Get TypeScript diagnostics if transpilation succeeded
  if (result.typescript && tsLanguageService) {
    const virtualPath = getVirtualTypeScriptPath(document.uri);
    const tsDiagnostics = [
      ...tsLanguageService.getSyntacticDiagnostics(virtualPath),
      ...tsLanguageService.getSemanticDiagnostics(virtualPath)
    ];

    for (const tsDiag of tsDiagnostics) {
      if (tsDiag.start !== undefined && tsDiag.length !== undefined) {
        // Map TypeScript offsets back to TabScript offsets
        const tabStart = mapTypeScriptToTabScript(tsDiag.start, result.map);
        const tabEnd = mapTypeScriptToTabScript(tsDiag.start + tsDiag.length, result.map);
        
        // Convert TabScript offsets to positions
        const start = offsetToPosition(document, tabStart);
        const end = offsetToPosition(document, tabEnd);

        const diagnostic: Diagnostic = {
          severity: tsDiag.category === ts.DiagnosticCategory.Error
            ? DiagnosticSeverity.Error
            : tsDiag.category === ts.DiagnosticCategory.Warning
            ? DiagnosticSeverity.Warning
            : DiagnosticSeverity.Information,
          range: { start, end },
          message: ts.flattenDiagnosticMessageText(tsDiag.messageText, '\n'),
          source: 'typescript'
        };
        diagnostics.push(diagnostic);
      }
    }
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Document change handlers
documents.onDidOpen(e => {
  connection.console.log(`Document opened: ${e.document.uri}`);
  validateTabScriptDocument(e.document);
});

documents.onDidChangeContent(change => {
  connection.console.log(`Document changed: ${change.document.uri}`);
  validateTabScriptDocument(change.document);
});

documents.onDidClose(e => {
  connection.console.log(`Document closed: ${e.document.uri}`);
  transpileCache.delete(e.document.uri);
  const virtualPath = getVirtualTypeScriptPath(e.document.uri);
  virtualFiles.delete(virtualPath);
  virtualFileVersions.delete(virtualPath);
});

// Completion handler
connection.onCompletion(
  (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    const query = prepareTypeScriptQuery(textDocumentPosition);
    if (!query) return [];

    const completions = tsLanguageService!.getCompletionsAtPosition(
      query.virtualPath,
      query.tsOffset,
      undefined
    );

    if (!completions) return [];

    return completions.entries.map(entry => ({
      label: entry.name,
      kind: mapCompletionKind(entry.kind),
      detail: entry.kind,
      documentation: entry.kindModifiers
    }));
  }
);

function mapCompletionKind(kind: ts.ScriptElementKind): CompletionItemKind {
  // Map TypeScript kinds to LSP CompletionItemKind
  const kindMap: { [key: string]: CompletionItemKind } = {
    [ts.ScriptElementKind.primitiveType]: CompletionItemKind.TypeParameter,
    [ts.ScriptElementKind.keyword]: CompletionItemKind.Keyword,
    [ts.ScriptElementKind.memberVariableElement]: CompletionItemKind.Field,
    [ts.ScriptElementKind.variableElement]: CompletionItemKind.Variable,
    [ts.ScriptElementKind.functionElement]: CompletionItemKind.Function,
    [ts.ScriptElementKind.classElement]: CompletionItemKind.Class,
    [ts.ScriptElementKind.interfaceElement]: CompletionItemKind.Interface,
    [ts.ScriptElementKind.moduleElement]: CompletionItemKind.Module,
    [ts.ScriptElementKind.enumElement]: CompletionItemKind.Enum,
    [ts.ScriptElementKind.constElement]: CompletionItemKind.Constant
  };
  return kindMap[kind] || CompletionItemKind.Text;
}

// Hover handler
connection.onHover(
  (textDocumentPosition: TextDocumentPositionParams): Hover | null => {
    const query = prepareTypeScriptQuery(textDocumentPosition);
    if (!query) return null;

    // Debug logging
    const tabOffset = positionToOffset(query.document, textDocumentPosition.position);
    const tabContext = query.document.getText().substr(tabOffset, 20);
    const tsContext = query.result.typescript.substr(query.tsOffset, 20);
    connection.console.log(`Hover: ${query.document.uri} -> ${query.virtualPath}`);
    connection.console.log(`  Tab offset ${tabOffset}: ${JSON.stringify(tabContext)}`);
    connection.console.log(`  TS offset ${query.tsOffset}: ${JSON.stringify(tsContext)}`);

    const info = tsLanguageService!.getQuickInfoAtPosition(query.virtualPath, query.tsOffset);
    if (!info) return null;

    const documentation = ts.displayPartsToString(info.documentation);
    const details = ts.displayPartsToString(info.displayParts);

    return {
      contents: {
        kind: 'markdown',
        value: ['```typescript', details, '```', documentation].filter(Boolean).join('\n')
      }
    };
  }
);

// Signature help handler
connection.onSignatureHelp(
  (textDocumentPosition: TextDocumentPositionParams): SignatureHelp | null => {
    const query = prepareTypeScriptQuery(textDocumentPosition);
    if (!query) return null;

    const signatureHelp = tsLanguageService!.getSignatureHelpItems(
      query.virtualPath,
      query.tsOffset,
      undefined
    );

    if (!signatureHelp) return null;

    return {
      signatures: signatureHelp.items.map(item => ({
        label: ts.displayPartsToString(item.prefixDisplayParts) +
          item.parameters.map(p => ts.displayPartsToString(p.displayParts)).join(', ') +
          ts.displayPartsToString(item.suffixDisplayParts),
        documentation: ts.displayPartsToString(item.documentation),
        parameters: item.parameters.map(p => ({
          label: ts.displayPartsToString(p.displayParts),
          documentation: ts.displayPartsToString(p.documentation)
        }))
      })),
      activeSignature: signatureHelp.selectedItemIndex,
      activeParameter: signatureHelp.argumentIndex
    };
  }
);

// Definition handler
connection.onDefinition(
  (textDocumentPosition: TextDocumentPositionParams): Definition | null => {
    const query = prepareTypeScriptQuery(textDocumentPosition);
    if (!query) return null;

    const definitions = tsLanguageService!.getDefinitionAtPosition(query.virtualPath, query.tsOffset);
    if (!definitions || definitions.length === 0) return null;

    return definitions.map(def => {
      // Check if it's a virtual TypeScript file and get its map
      let targetUri = def.fileName;
      let targetMap: { in: number[]; out: number[] } | null = null;
      
      if (targetUri.endsWith('.ts') && virtualFiles.has(targetUri)) {
        // Convert filesystem path to URI
        const tabFileName = targetUri.replace(/\.ts$/, '.tab');
        targetUri = 'file://' + tabFileName;
        const targetCache = transpileCache.get(targetUri);
        if (targetCache) targetMap = targetCache.map;
      } else if (!targetUri.startsWith('file://')) {
        // Ensure other file paths are also converted to URIs
        targetUri = 'file://' + targetUri;
      }

      // Map TypeScript offsets to TabScript offsets if needed
      const startOffset = targetMap 
        ? mapTypeScriptToTabScript(def.textSpan.start, targetMap)
        : def.textSpan.start;
      const endOffset = targetMap
        ? mapTypeScriptToTabScript(def.textSpan.start + def.textSpan.length, targetMap)
        : def.textSpan.start + def.textSpan.length;

      // Convert offsets to positions
      const targetDoc = documents.get(targetUri);
      if (targetDoc) {
        const start = offsetToPosition(targetDoc, startOffset);
        const end = offsetToPosition(targetDoc, endOffset);
        return Location.create(targetUri, Range.create(start, end));
      }
      
      // If document is not open, try to read it from filesystem
      let filePath = targetUri;
      if (filePath.startsWith('file://')) {
        filePath = decodeURIComponent(filePath.substring(7));
      }
      
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const tempDoc = TextDocument.create(targetUri, 'tabscript', 0, content);
        const start = offsetToPosition(tempDoc, startOffset);
        const end = offsetToPosition(tempDoc, endOffset);
        return Location.create(targetUri, Range.create(start, end));
      }
      
      // Fallback if file doesn't exist - should rarely happen
      return Location.create(targetUri, Range.create(Position.create(0, 0), Position.create(0, 0)));
    });
  }
);

// Rename handler
connection.onRenameRequest(
  (params: RenameParams): WorkspaceEdit | null => {
    const query = prepareTypeScriptQuery(params);
    if (!query) return null;

    // First, check if rename is valid at this position
    const renameInfo = tsLanguageService!.getRenameInfo(query.virtualPath, query.tsOffset);
    if (!renameInfo.canRename) {
      connection.window.showErrorMessage(`Cannot rename: ${renameInfo.localizedErrorMessage}`);
      return null;
    }

    // Find all rename locations
    const renameLocations = tsLanguageService!.findRenameLocations(
      query.virtualPath,
      query.tsOffset,
      false, // findInStrings
      false, // findInComments
      undefined
    );

    if (!renameLocations || renameLocations.length === 0) {
      return null;
    }

    // Group edits by document URI
    const changes: { [uri: string]: TextEdit[] } = {};

    for (const location of renameLocations) {
      // Check if it's a virtual TypeScript file and get its map
      let targetUri = location.fileName;
      let targetMap: { in: number[]; out: number[] } | null = null;
      
      if (targetUri.endsWith('.ts') && virtualFiles.has(targetUri)) {
        // Convert filesystem path to URI
        const tabFileName = targetUri.replace(/\.ts$/, '.tab');
        targetUri = 'file://' + tabFileName;
        
        // Ensure the .tab file is transpiled so we have its map
        const tabFilePath = decodeURIComponent(targetUri.substring(7));
        if (fs.existsSync(tabFilePath)) {
          transpileTabScriptFile(tabFilePath);
        }
        
        const targetCache = transpileCache.get(targetUri);
        if (targetCache) targetMap = targetCache.map;
      } else if (!targetUri.startsWith('file://')) {
        // Ensure other file paths are also converted to URIs
        targetUri = 'file://' + targetUri;
      }

      // Map TypeScript offsets to TabScript offsets if needed
      const startOffset = targetMap 
        ? mapTypeScriptToTabScript(location.textSpan.start, targetMap)
        : location.textSpan.start;
      const endOffset = targetMap
        ? mapTypeScriptToTabScript(location.textSpan.start + location.textSpan.length, targetMap)
        : location.textSpan.start + location.textSpan.length;

      // Convert offsets to positions
      let start: Position;
      let end: Position;
      
      const targetDoc = documents.get(targetUri);
      if (targetDoc) {
        start = offsetToPosition(targetDoc, startOffset);
        end = offsetToPosition(targetDoc, endOffset);
      } else {
        // If document is not open, try to read it from filesystem
        let filePath = targetUri;
        if (filePath.startsWith('file://')) {
          filePath = decodeURIComponent(filePath.substring(7));
        }
        
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          const tempDoc = TextDocument.create(targetUri, 'tabscript', 0, content);
          start = offsetToPosition(tempDoc, startOffset);
          end = offsetToPosition(tempDoc, endOffset);
        } else {
          // Skip this location if we can't read the file
          connection.console.log(`Warning: Could not read file for rename: ${filePath}`);
          continue;
        }
      }

      // Create text edit
      const textEdit: TextEdit = {
        range: Range.create(start, end),
        newText: params.newName
      };

      // Add to changes grouped by URI
      if (!changes[targetUri]) {
        changes[targetUri] = [];
      }
      changes[targetUri].push(textEdit);
    }

    return { changes };
  }
);

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();
