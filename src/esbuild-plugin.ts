/**
 * esbuild plugin for TabScript files.
 * 
 * @module esbuild-plugin
 */

import { tabscript, type Options } from './tabscript.js';
import * as fs from 'fs';
import * as path from 'path';

export interface EsbuildPluginOptions extends Omit<Options, 'loadPlugin' | 'js'> {
    /** Output mode: 'ts' (default, preserves types) or 'js'. esbuild handles TypeScript natively. */
    outputMode?: 'js' | 'ts';
}

/**
 * esbuild plugin that transforms .tab files to JavaScript.
 * 
 * @example
 * ```js
 * // build.js
 * import { tabscriptPlugin } from 'tabscript/esbuild';
 * import * as esbuild from 'esbuild';
 * 
 * await esbuild.build({
 *   entryPoints: ['src/index.tab'],
 *   bundle: true,
 *   plugins: [tabscriptPlugin()]
 * });
 * ```
 * 
 * @param options Configuration options for the TabScript transpiler
 * @returns esbuild plugin instance
 */
export function tabscriptPlugin(options: EsbuildPluginOptions = {}): any {
    const { outputMode = 'ts', ...transpileOptions } = options;
    
    return {
        name: 'tabscript',
        
        setup(build: any) {
            build.onLoad({ filter: /\.tab$/ }, async (args: any) => {
                const source = await fs.promises.readFile(args.path, 'utf8');
                const basePath = path.dirname(args.path);

                const result = tabscript(source, {
                    js: outputMode === 'js',
                    ...transpileOptions
                });

                if (result.errors.length > 0) {
                    const errors = result.errors.map(error => ({
                        text: error.message,
                        location: {
                            file: args.path,
                            line: error.line,
                            column: error.column
                        }
                    }));

                    if (transpileOptions.recover) {
                        // Return warnings but continue
                        return {
                            contents: result.code,
                            loader: outputMode === 'js' ? 'js' : 'ts',
                            warnings: errors
                        };
                    } else {
                        // Return errors and fail
                        return { errors };
                    }
                }

                return {
                    contents: result.code,
                    loader: outputMode === 'js' ? 'js' : 'ts'
                };
            });
        }
    };
}
