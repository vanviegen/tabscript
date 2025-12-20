/**
 * Webpack loader for TabScript files.
 * 
 * @module webpack-loader
 */

import { tabscript, type Options } from './tabscript.js';

export interface WebpackLoaderOptions extends Omit<Options, 'loadPlugin' | 'js'> {
    /** Output mode: 'js' (default) or 'ts'. Use 'ts' to preserve type information for subsequent type checking. */
    outputMode?: 'js' | 'ts';
}

/**
 * Webpack loader that transforms .tab files to JavaScript.
 * 
 * @example
 * ```js
 * // webpack.config.js
 * module.exports = {
 *   module: {
 *     rules: [
 *       {
 *         test: /\.tab$/,
 *         use: {
 *           loader: 'tabscript/webpack',
 *           options: {
 *             whitespace: 'pretty'
 *           }
 *         }
 *       }
 *     ]
 *   }
 * };
 * ```
 * 
 * @param source The TabScript source code
 * @returns The transpiled JavaScript code
 */
export default function tabscriptLoader(this: any, source: string): string {
    const options: WebpackLoaderOptions = this.getOptions ? this.getOptions() : {};
    const { outputMode = 'js', ...transpileOptions } = options;

    const result = tabscript(source, {
        js: outputMode === 'js',
        ...transpileOptions
    });

    if (result.errors.length > 0) {
        for (const error of result.errors) {
            const message = `TabScript error at ${error.line}:${error.column}: ${error.message}`;
            if (options.recover) {
                // Emit warning but continue
                this.emitWarning?.(new Error(message));
            } else {
                // Emit error and fail
                this.emitError?.(new Error(message));
            }
        }
    }

    return result.code;
}
