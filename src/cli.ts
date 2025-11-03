#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import {tabscript} from "./tabscript.js";

// Parse command line arguments
const args = process.argv.slice(2);
let inputFile, outputFile, debug = false, recover = false, stripTypes = false;

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
  fs.writeFileSync(
    outputFile, 
    tabscript(fs.readFileSync(inputFile, 'utf8'), {debug, recover, stripTypes})
  );
} catch (e) {
  console.error(e);
  process.exit(1);
}