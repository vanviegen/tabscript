#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import {tabscript} from "./tabscript.js";

// Parse command line arguments
const args = process.argv.slice(2);
let inputFile, outputFile, debug = false, recover = false, stripTypes = false, ui: string | undefined, whitespace: 'preserve' | 'pretty' = 'preserve';

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
  } else if (args[i] === '--strip-types') {
    stripTypes = true;
  } else if (args[i] === '--ui') {
    if (i + 1 >= args.length) {
      console.error('Error: --ui requires a library name');
      process.exit(1);
    }
    ui = args[++i];
    console.warn('Warning: --ui flag is deprecated. Use header syntax instead: tabscript 1.0 ui=' + ui);
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
  path.basename(inputFile, path.extname(inputFile)) + '.ts'
);

try {
  const result = tabscript(fs.readFileSync(inputFile, 'utf8'), {debug, recover, stripTypes, whitespace, ui});
  
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