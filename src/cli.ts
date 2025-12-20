#!/usr/bin/env -S node --enable-source-maps
import * as fs from 'fs';
import * as path from 'path';
import {tabscript, PluginModule} from "./tabscript.js";
import { createRequire } from 'module';
import * as ts from 'typescript';

const require = createRequire(import.meta.url);

const HELP = `TabScript Transpiler

Usage: tabscript [options] <input.tab> [more files...]

Options:
  --output <file>       Output file (single input only, otherwise use --output-dir)
  --output-dir <dir>    Output directory for multiple files
  --js                  Transpile to JavaScript instead of TypeScript
  --check               Type check without generating output (CI/git hooks)
  --debug               Log each consumed token
  --recover             Continue on errors instead of throwing
  --whitespace <mode>   'preserve' (default) or 'pretty'
  --help                Show this help

Examples:
  tabscript input.tab                    # Transpile to input.ts
  tabscript input.tab --js               # Transpile to input.js
  tabscript src/**/*.tab --check         # Type check multiple files
  tabscript src/**/*.tab --output-dir dist  # Transpile all to dist/`;

// Parse arguments
const args = process.argv.slice(2);
let inputFiles: string[] = [], outputFile: string | undefined, outputDir: string | undefined;
let debug = false, recover = false, js = false, whitespace: 'preserve' | 'pretty' = 'preserve', check = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log(HELP);
    process.exit(0);
  } else if (arg === '--output') {
    if (++i >= args.length) { console.error('Error: --output requires a filename'); process.exit(1); }
    outputFile = args[i];
  } else if (arg === '--output-dir') {
    if (++i >= args.length) { console.error('Error: --output-dir requires a directory'); process.exit(1); }
    outputDir = args[i];
  } else if (arg === '--debug') {
    debug = true;
  } else if (arg === '--recover') {
    recover = true;
  } else if (arg === '--js') {
    js = true;
  } else if (arg === '--check') {
    check = true;
  } else if (arg === '--whitespace') {
    if (++i >= args.length) { console.error('Error: --whitespace requires preserve or pretty'); process.exit(1); }
    const val = args[i];
    if (val !== 'preserve' && val !== 'pretty') {
      console.error(`Error: --whitespace must be preserve or pretty, got '${val}'`);
      process.exit(1);
    }
    whitespace = val;
  } else if (!arg.startsWith('--')) {
    inputFiles.push(arg);
  } else {
    console.error(`Error: Unknown option '${arg}'`);
    process.exit(1);
  }
}

if (inputFiles.length === 0) {
  console.error('Error: Input file required\n');
  console.log(HELP);
  process.exit(1);
}

if (outputFile && inputFiles.length > 1) {
  console.error('Error: --output only works with single input file. Use --output-dir for multiple files.');
  process.exit(1);
}

if (outputFile && outputDir) {
  console.error('Error: Cannot use both --output and --output-dir');
  process.exit(1);
}

// Plugin loader factory
function createPluginLoader(basePath: string): (pluginPath: string) => PluginModule {
  return function loadPlugin(pluginPath: string): PluginModule {
    let resolvedPath: string;
    if (pluginPath.startsWith('./') || pluginPath.startsWith('../')) {
      resolvedPath = path.resolve(basePath, pluginPath);
    } else {
      resolvedPath = require.resolve(pluginPath, { paths: [basePath] });
    }
    
    if (resolvedPath.endsWith('.tab')) {
      const pluginSource = fs.readFileSync(resolvedPath, 'utf8');
      const pluginResult = tabscript(pluginSource, { js: true, whitespace: 'pretty', loadPlugin });
      if (pluginResult.errors.length > 0) {
        throw new Error(`Failed to transpile plugin ${pluginPath}: ${pluginResult.errors[0].message}`);
      }
      return Function(pluginResult.code.replace(/export\s+default\s+/, 'return '))();
    }
    
    return require(resolvedPath);
  };
}

// Process a single file
function processFile(file: string): boolean {
  const basePath = path.dirname(path.resolve(file));
  const loadPlugin = createPluginLoader(basePath);
  
  try {
    const result = tabscript(fs.readFileSync(file, 'utf8'), {debug, recover, js: check ? false : js, whitespace, loadPlugin});
    
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.error(`${file}:${error.line}:${error.column}: ${error.message}`);
      }
    }
    
    if (check) {
      // Type check
      const virtualFileName = file.replace(/\.tab$/, '.ts');
      const compilerOptions: ts.CompilerOptions = {
        noEmit: true, strict: true, target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true
      };
      
      const host = ts.createCompilerHost(compilerOptions);
      const originalGetSourceFile = host.getSourceFile;
      host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        if (fileName === path.resolve(virtualFileName)) {
          return ts.createSourceFile(fileName, result.code, languageVersion, true);
        }
        return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
      };
      
      const program = ts.createProgram([path.resolve(virtualFileName)], compilerOptions, host);
      const diagnostics = ts.getPreEmitDiagnostics(program);
      
      if (diagnostics.length > 0) {
        for (const diagnostic of diagnostics) {
          if (diagnostic.file) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
            console.error(`${file}:${line + 1}:${character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
          } else {
            console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
          }
        }
        return false;
      }
      
      console.log(`✓ ${file}`);
      return true;
    } else {
      // Transpile
      const output = outputFile || path.join(
        outputDir || path.dirname(file),
        path.basename(file, path.extname(file)) + (js ? '.js' : '.ts')
      );
      
      if (outputDir) fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(output, result.code);
      return result.errors.length === 0;
    }
  } catch (e) {
    console.error(e);
    return false;
  }
}

// Process all files
let hasErrors = false;
for (const file of inputFiles) {
  if (!processFile(file)) hasErrors = true;
}

process.exit(hasErrors ? 1 : 0);