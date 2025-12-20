/**
 * Vite plugin for TabScript files.
 * 
 * @module vite-plugin
 */

import { tabscript, type Options } from './tabscript.js';

export interface VitePluginOptions extends Omit<Options, 'loadPlugin' | 'js'> {
    /** Include pattern for files to transform. Defaults to /\.tab$/ */
    include?: RegExp | ((id: string) => boolean);
    /** Output mode: 'ts' (default, preserves types) or 'js'. Vite handles TypeScript natively. */
    outputMode?: 'js' | 'ts';
}

/**
 * Vite plugin that transforms .tab files to JavaScript.
 * 
 * @example
 * ```js
 * // vite.config.js
 * import { tabscriptPlugin } from 'tabscript/vite';
 * 
 * export default {
 *   plugins: [tabscriptPlugin()]
 * };
 * ```
 * 
 * @param options Configuration options for the TabScript transpiler
 * @returns Vite plugin instance
 */
export function tabscriptPlugin(options: VitePluginOptions = {}): any {
    const { include = /\.tab$/, outputMode = 'ts', ...transpileOptions } = options;
    const matcher = typeof include === 'function' ? include : (id: string) => include.test(id);

    return {
        name: 'vite-plugin-tabscript',
        
        transform(code: string, id: string) {
            if (!matcher(id)) return null;

            const result = tabscript(code, {
                js: outputMode === 'js',
                ...transpileOptions
            });

            if (result.errors.length > 0) {
                // Log errors but still return the code if recover mode was used
                for (const error of result.errors) {
                    console.error(`TabScript error in ${id} at ${error.line}:${error.column}: ${error.message}`);
                }
            }

            return {
                code: result.code,
                map: null // TODO: Convert result.map to source map format
            };
        }
    };
}
