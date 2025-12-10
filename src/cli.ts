#!/usr/bin/env -S node --enable-source-maps
import * as fs from 'fs';
import * as path from 'path';
import {tabscript, PluginModule} from "./tabscript.js";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Parse command line arguments
const args = process.argv.slice(2);
let inputFile, outputFile, debug = false, recover = false, js = false, whitespace: 'preserve' | 'pretty' = 'preserve';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output') {
    if (i + 1 >= args.length) {
      console.error('Error: --output requires a filename');
      process.exit(1);
    }
    outputFile = args[++i];
  } else if (args[i] === '--debug') {
    debug = true;
  } else if (args[i] === '--recover') {
    recover = true;
  } else if (args[i] === '--js') {
    js = true;
  } else if (args[i] === '--whitespace') {
    if (i + 1 >= args.length) {
      console.error('Error: --whitespace requires a value (preserve or pretty)');
      process.exit(1);
    }
    const value = args[++i];
    if (value !== 'preserve' && value !== 'pretty') {
      console.error(`Error: --whitespace must be 'preserve' or 'pretty', got '${value}'`);
      process.exit(1);
    }
    whitespace = value;
  } else if (!inputFile) {
    inputFile = args[i];
  } else {
    console.error(`Error: Unexpected argument '${args[i]}'`);
    process.exit(1);
  }
}

if (!inputFile) {
  console.error('Error: Input file is required');
  process.exit(1);
}

// Set default output file if not specified
outputFile ||= path.join(
  path.dirname(inputFile), 
  path.basename(inputFile, path.extname(inputFile)) + (js ? '.js' : '.ts')
);

// Plugin loader function
const basePath = path.dirname(path.resolve(inputFile));
function loadPlugin(pluginPath: string): PluginModule {
  // Resolve relative to the input file's directory
  let resolvedPath = path.resolve(basePath, pluginPath);
  
  // If it's a .tab file, we need to transpile it
  if (pluginPath.endsWith('.tab')) {
    const pluginSource = fs.readFileSync(resolvedPath, 'utf8');
    const pluginResult = tabscript(pluginSource, { js: true, whitespace: 'pretty', loadPlugin });
    if (pluginResult.errors.length > 0) {
      throw new Error(`Failed to transpile plugin ${pluginPath}: ${pluginResult.errors[0].message}`);
    }
    // Evaluate the transpiled code in memory
    // Convert ES module export to a return value for Function constructor
    const code = pluginResult.code.replace(/export\s+default\s+/, 'return ');
    return Function(code)();
  }
  
  // For .js files, require them directly  
  return require(resolvedPath);
}

try {
  const result = tabscript(fs.readFileSync(inputFile, 'utf8'), {debug, recover, js, whitespace, loadPlugin});
  
  // Display any errors that were recovered from
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`Error at ${error.line}:${error.column}: ${error.message}`);
    }
  }
  
  fs.writeFileSync(outputFile, result.code);
  
  // Exit with error code if there were any errors
  if (result.errors.length > 0) {
    process.exit(1);
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}