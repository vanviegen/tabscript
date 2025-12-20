/**
 * Rollup plugin for TabScript files.
 * 
 * @module rollup-plugin
 */

import { tabscript, type Options } from './tabscript.js';

export interface RollupPluginOptions extends Omit<Options, 'loadPlugin' | 'js'> {
    /** Include pattern for files to transform. Defaults to /\.tab$/ */
    include?: RegExp | ((id: string) => boolean);
    /** Output mode: 'js' (default) or 'ts'. Use 'ts' to preserve type information for subsequent type checking. */
    outputMode?: 'js' | 'ts';
}

/**
 * Rollup plugin that transforms .tab files to JavaScript.
 * 
 * @example
 * ```js
 * // rollup.config.js
 * import { tabscriptPlugin } from 'tabscript/rollup';
 * 
 * export default {
 *   input: 'src/index.tab',
 *   plugins: [tabscriptPlugin()],
 *   output: {
 *     file: 'dist/bundle.js',
 *     format: 'esm'
 *   }
 * };
 * ```
 * 
 * @param options Configuration options for the TabScript transpiler
 * @returns Rollup plugin instance
 */
export function tabscriptPlugin(options: RollupPluginOptions = {}): any {
    const { include = /\.tab$/, outputMode = 'js', ...transpileOptions } = options;
    const matcher = typeof include === 'function' ? include : (id: string) => include.test(id);

    return {
        name: 'rollup-plugin-tabscript',
        
        transform(code: string, id: string) {
            if (!matcher(id)) return null;

            const result = tabscript(code, {
                js: outputMode === 'js',
                ...transpileOptions
            });

            if (result.errors.length > 0) {
                for (const error of result.errors) {
                    const message = `TabScript error at ${error.line}:${error.column}: ${error.message}`;
                    if (transpileOptions.recover) {
                        this.warn(message);
                    } else {
                        this.error(message);
                    }
                }
            }

            return {
                code: result.code,
                map: null // TODO: Convert result.map to source map format
            };
        }
    };
}
