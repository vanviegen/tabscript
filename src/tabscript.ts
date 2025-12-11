/**
 * TabScript transpiler main entry point.
 * Parses options, instantiates State, and runs the parser.
 * 
 * @module tabscript
 */

import { State, ParseError } from './state.js';
import { Parser } from './parser.js';

export type { ParseError } from './state.js';

/**
 * Re-exports for plugin development.
 * 
 * > ⚠️ **Experimental API**: The plugin interface is still evolving. 
 * > Expect breaking changes in minor releases until the API stabilizes.
 */
export type { Parser, ParserMethod } from './parser.js';
export { State } from './state.js';

/**
 * Configuration options for the TabScript transpiler.
 */
export type Options = {
    /** When `true`, logs each consumed token. If a function, calls that function instead of console.debug. */
    debug?: boolean | ((...args: string[]) => void),
    /** When `true`, attempts to recover from errors and continue transpilation instead of throwing. */
    recover?: boolean,
    /** When `true`, outputs JavaScript instead of TypeScript by stripping type annotations. */
    js?: boolean,
    /** Function to transform import URIs during transpilation. */
    transformImport?: (uri: string) => string,
    /** Output formatting mode: `"preserve"` maintains input alignment, `"pretty"` adds readable indentation. */
    whitespace?: 'preserve' | 'pretty',
    /** Function to load a plugin module synchronously from a path. Required for plugin imports. */
    loadPlugin?: (path: string) => PluginModule,
};

/**
 * Plugin options passed from import statement.
 */
export type PluginOptions = Record<string, any>;

/**
 * A plugin module that can extend the parser.
 * The default export receives the parser instance, global options, and plugin-specific options.
 * The plugin function should augment/replace parse* methods on the parser.
 */
export interface PluginModule {
    default: (parser: Parser, globalOptions: Options, pluginOptions: PluginOptions) => void;
}

/**
 * Transpiles TabScript to TypeScript or JavaScript.
 * 
 * @param inData The input TabScript.
 * @param options An optional object containing the following optional properties:
 *   - `debug` When `true`, each consumed token is logged. If it's a function, that function will be called instead of `console.debug`.
 *   - `recover` When `true`, the function will attempt to continue transpilation when it encounters an error in the input (or unsupported syntax), instead of throwing. Errors are logged to `console.error`.
 *   - 'js' When `true`, we'll transpile to JavaScript instead of TypeScript. Note that TabScript will not perform any type checking, just strip out the type info.
 *   - `transformImport` An async function that gets an `import` URI, and returns the URI to be include included in the transpiled output.
 *   - `whitespace` When `"preserve"` (the default), output is made to closely align with input line/column positions. When `"pretty"`, output is formatted with human-friendly indentation and spacing.
 *   - `loadPlugin` Function to load plugin modules from a path.
 * @returns An object containing:
 *  - `code`: The transpiled TypeScript/JavaScript code.
 *  - `errors`: An array of errors encountered during transpilation (if any) of the form: `{ message: string, line: number, column: number, offset: number }`. If `recover` is not set, this array will contain at most one error.
 *  - `map`: An object mapping input offsets to output offsets, of the form: `{ in: number[], out: number[] }`, where each index corresponds to a mapping pair.
 * @throws ParserError, if there's a compilation error and `recover` is not set.
 */
export function tabscript(inData: string, options: Options = {}): {
    code: string,
    errors: ParseError[],
    map: {
        in: number[],
        out: number[],
    }
} {
    options.whitespace ||= 'preserve';

    // Create parser and state
    const parser = new Parser(options);
    const state = new State(inData, options);

    try {
        parser.parseMain(state);
    } catch (e) {
        if (e instanceof ParseError) {
            state.errors.push(e);
            if (!options.recover) {
                return state.getResult();
            }
        } else {
            throw e;
        }
    }

    return state.getResult();
}

/**
 * Alias for the {@link tabscript} function.
 * Transpiles TabScript code to TypeScript or JavaScript.
 */
export const transpile = tabscript;
