/**
 * State module for TabScript transpiler.
 * Contains the State class that manages input/output during parsing.
 * 
 * @module state
 * 
 * > ⚠️ **Experimental API**: The plugin interface is still evolving. 
 * > Expect breaking changes in minor releases until the API stabilizes.
 * 
 * ## Public API for Plugins
 * 
 * ### Input Navigation
 * - `read(...patterns)` - Consume token(s) without emitting. Returns undefined if no match.
 * - `peek(...patterns)` - Look ahead without consuming.
 * - `accept(...patterns)` - Consume and emit token(s).
 * - `acceptType(...patterns)` - Consume and emit only if not stripping types (`js=false`).
 * 
 * ### Output
 * - `emit(text...)` - Emit output text. Numbers set source positions for source maps.
 * 
 * ### State Management
 * - `snapshot()` - Create revertible state snapshot.
 *   - `snapshot.revert()` - Revert both input and output state.
 *   - `snapshot.revertOutput()` - Revert only output, returns discarded tokens.
 *   - `snapshot.hasOutput()` - Check if any output has been emitted.
 * 
 * ### Control Flow
 * - `must(result)` - Assert result is truthy or throw ParseError.
 * - `recoverErrors(func)` - Try/catch with error recovery support.
 * - `parseGroup(opts, itemFunc)` - Parse delimited/indented groups.
 * 
 * ### Position Info
 * - `inLine` - Current input line number.
 * - `justAfterNewLine()` - True when at start of a new line.
 * - `lastNotSpace()` - Check if previous char is not a space.
 * - `hasMore()` - Check if more input remains.
 * 
 * ### Configuration
 * - `options` - Readonly parser options.
 * - `errors` - Array of parse errors.
 */

import type { Options } from './tabscript.js';

/**
 * Creates a token matcher regex with a descriptive name for error messages.
 * Automatically adds the sticky (/y) flag if not present.
 * 
 * This is the recommended way to create regex patterns for use with
 * `s.read()`, `s.accept()`, `s.peek()`, and related methods in plugins.
 * 
 * @param regexp - The regular expression pattern to match tokens
 * @param name - A descriptive name shown in error messages (e.g., "identifier", "number")
 * @returns A new RegExp with the sticky flag and custom toString()
 */
export function pattern(regexp: RegExp, name: string): RegExp {
    // Clone the regex with the sticky flag added
    const flags = regexp.flags.includes('y') ? regexp.flags : regexp.flags + 'y';
    const result = new RegExp(regexp.source, flags);
    result.toString = () => '<' + name + '>';
    return result;
}

// Atoms - these are used by read/peek/accept
const WHITESPACE = pattern(/[ \t\r]*(?:#.*)?/, "whitespace");
const ALPHA_NUM = /^[a-zA-Z0-9]+$/;
const START_WORD_CHAR = /^[a-zA-Z0-9_$]/;
const IS_WORD_CHAR = /^[a-zA-Z0-9_$]$/;

const FG_GRAY = '\x1b[90m';
const FG_RESET = '\x1b[39m';

/**
 * Error thrown when the TabScript parser encounters invalid syntax.
 * Contains position information (line, column, offset) for the error location.
 */
export class ParseError extends Error {
    /** Input code that was skipped in an attempt to recover from the error. */
    public recoverSkip: string | undefined;
    constructor(public offset: number, public line: number, public column: number, message: string) {
        super(message);
    }
    toString() {
        return `ParseError at ${this.line}:${this.column}: ${this.message}`;
    }
}

/**
 * Options for parsing delimited or indented groups.
 * Used by `s.parseGroup()` to handle blocks like `{...}`, `[...]`, or indented blocks.
 */
export interface ParseGroupOpts {
    /** Opening delimiter in input (e.g., '{', '[', '|') */
    open?: string;
    /** Closing delimiter in input (e.g., '}', ']', '|') */
    close?: string;
    /** Item separator in input (e.g., ',', ';') */
    next?: string;
    /** Opening delimiter in output (null to suppress) */
    jsOpen?: string | null;
    /** Closing delimiter in output (null to suppress) */
    jsClose?: string | null;
    /** Item separator in output (null to suppress) */
    jsNext?: string | null;
    /** Allow implicit block via indentation (no explicit open/close) */
    allowImplicit?: boolean;
    /** If false, don't emit separator after last item */
    endNext?: false;
}

/**
 * Snapshot of parser state that can be used to revert changes.
 */
export interface Snapshot {
    /** Revert both input and output state to the snapshot point */
    revert(): void;
    /** Revert only output state and returns the output tokens and mappings */
    revertOutput(): (string|number)[];
    /** Check if any output has been emitted since the snapshot */
    hasOutput(): boolean;
}


const CACHE_INTERVAL = 100;

export class State {
    // Input state
    private inPos = 0;
    private indentLevel = 0;
    private indentsPending = '';
    private inLastNewlinePos = -1;

    // Output state - array of tokens (strings) and input positions (numbers for source mapping)
    private outTokens: (string | number)[] = [];
    
    // Target position for source mapping (set by read, used by emit)
    private outTargetPos: number | undefined;
    
    // Cached line info, every `CACHE_INTERVAL`th pos gets stored here for faster line/col lookup
    private inPosLineCache: number[] = [1];
    private inPosColCache: number[] = [1];
    
    // Errors
    public errors: ParseError[] = [];

    // Match tracking for error messages
    private matchOptions: Set<RegExp | string | ParseError | (RegExp | string)[]> = new Set();

    constructor(
        private inData: string,
        public readonly options: Options,
        startPos: number = 0
    ) {
        options.whitespace ||= 'preserve';
        this.inPos = startPos;
        // Find last newline before startPos for inLastNewlinePos
        for (let i = startPos - 1; i >= 0; i--) {
            if (inData[i] === '\n') {
                this.inLastNewlinePos = i;
                break;
            }
        }
    }

    // ==================== PUBLIC API ====================

    /** Current input line number */
    get inLine(): number { return this.getLineCol(this.inPos).line; }

    /** Check if more input remains to be parsed */
    hasMore(): boolean {
        return this.inPos < this.inData.length;
    }

    /**
     * Clear the target position used for source mapping.
     * Called after header parsing to ensure next token gets correct position.
     */
    clearTargetPos(): void {
        this.outTargetPos = undefined;
    }

    /**
     * Read token(s) from input, consuming them. Returns undefined if not matched.
     * RegExp arguments must have the /y (sticky) flag.
     */
    read(what: RegExp | string): string | undefined;
    read(...whats: (RegExp | string)[]): string[] | undefined;
    read(...whats: (RegExp | string)[]): string[] | string | undefined {
        let orgInPos = this.inPos;
        let results: string[] | string | undefined;
        if (whats.length > 1) results = [];

        for (let what of whats) {
            let result: string | undefined;
            
            if (this.indentsPending) {
                // We have indents/dedents pending, cannot accept anything else.
            } else if (typeof what === 'string') {
                if (this.inData.substr(this.inPos, what.length) === what && (
                    !what.slice(-1).match(ALPHA_NUM) ||
                    !this.inData.substr(this.inPos + what.length, 1).match(ALPHA_NUM)
                )) result = what;
            } else if (what instanceof RegExp) {
                if (!what.sticky) {
                    throw new Error(`Please use pattern on your RegEx: ${what}`);
                }
                what.lastIndex = this.inPos;
                const match = what.exec(this.inData);
                if (match) result = match[0];
            } else {
                throw new Error(`Invalid argument to read(): ${String(what)}`);
            }
            
            if (result === undefined) {
                this.inPos = orgInPos;
                this.matchOptions.add(whats.length === 1 ? whats[0] : whats);
                return;
            }
            
            // Set outTargetPos only on first token match (not on empty match)
            if (this.outTargetPos == null && result.length > 0) this.outTargetPos = this.inPos;

            this.inPos += result.length;
            WHITESPACE.lastIndex = this.inPos;
            const match = WHITESPACE.exec(this.inData);
            if (match) this.inPos += match[0].length;

            if (results instanceof Array) results.push(result);
            else results = result;
        }

        if (this.options.debug) this.debugLog('read', toJson(results), 'as', this.joinTokens(whats, ' + '), `at ${this.getLineCol(orgInPos, true)}`);

        this.matchOptions.clear();

        return results;
    }

    /**
     * Peek at token(s) without consuming them.
     */
    peek(...whats: (RegExp | string)[]): any {
        const snap = this.snapshot();
        const result = this.read(...whats);
        snap.revert();
        return result;
    }

    /**
     * Read and emit token(s). Returns undefined if not matched.
     */
    accept(what: RegExp | string): string | undefined;
    accept(...whats: (RegExp | string)[]): string[] | undefined;
    accept(...whats: (RegExp | string)[]): string[] | string | undefined {
        const result = this.read(...whats);
        if (result === undefined) return;
        if (result instanceof Array) {
            for (const x of result) this.emit(x);
        } else {
            this.emit(result);
        }
        return result;
    }

    /**
     * Read and emit token only if not stripping types.
     * Can also wrap a function call to strip its output when stripping types.
     */
    acceptType<T, A extends any[]>(func: (...args: A) => T, ...args: A): T;
    acceptType(what: RegExp | string): string | undefined;
    acceptType(...whats: (RegExp | string)[]): string[] | undefined;
    acceptType(...whats: any[]): string[] | string | undefined {
        if (typeof whats[0] === 'function') {
            const savedTargetPos = this.options.js ? this.outTargetPos : undefined;
            const snap = this.options.js ? this.snapshot() : undefined;
            const result = whats[0](...whats.slice(1));
            if (snap) {
                snap.revertOutput();
                this.outTargetPos = savedTargetPos;
            }
            return result;
        }
        // Save target position so type tokens don't affect source mapping when stripped
        const savedTargetPos = this.outTargetPos;
        const result = this.read(...whats);
        if (result === undefined) return;
        if (!this.options.js) {
            if (result instanceof Array) {
                for (const x of result) this.emit(x);
            } else {
                this.emit(result);
            }
        } else {
            // Restore position when stripping types
            this.outTargetPos = savedTargetPos;
        }
        return result;
    }

    /**
     * Emit output text. Automatically handles source mapping based on last read position.
     * Numbers are treated as explicit position markers.
     * `false` means the next arg should not have an automatic position emitted.
     * `true` means the next arg *should* have an automatic position emitted, but it should not be used for source mapping, and
     * the next token will get the same automatic position again.
     */
    emit(...args: (string | boolean | number | undefined | null)[]) {
        let autoPos: boolean | undefined;
        if (this.options.debug) this.debugLog('emit', ...args.map(toJson), ...(this.outTargetPos != null && typeof args[0] !== 'number' ? [`at ${this.getLineCol(this.outTargetPos, true)}`] : []));

        for(const arg of args) {
            if (arg == null) continue;
            if (typeof arg === 'boolean') autoPos = arg;
            else if (typeof arg === 'number') {
                this.outTokens.push(arg);
                this.outTargetPos = undefined;
            }
            else {
                if (this.outTargetPos != null) {
                    if (autoPos === undefined) {
                        this.outTokens.push(this.outTargetPos);
                        this.outTargetPos = undefined;
                    } else if (autoPos === true) {
                        this.outTokens.push(-this.outTargetPos);
                    }
                }
                this.outTokens.push(arg);
                autoPos = undefined;
            }
        }
    }

    /**
     * Require a value to be truthy, throwing ParseError otherwise.
     */
    must<T extends string | true>(result: T | undefined | false | (() => T | undefined | false)): T {
        if (typeof result === 'function') result = result();
        if (result) return result;

        const { line, col } = this.getLineCol(this.inPos);
        const got = this.indentsPending ? (this.indentsPending[0] === 'i' ? "INDENT" : "DEDENT") : toJson(this.inData.substr(this.inPos, 24)) + " ...";
        let error = new ParseError(this.inPos, line, col, `Could not parse ${getParseStack()}\n  Input is:   ${got}\n  Expecting one of:   ${this.joinTokens(Array.from(this.matchOptions))}`);
        throw error;
    }

    /**
     * Create a snapshot of current state that can be reverted later.
     */
    snapshot(): Snapshot {
        const inState = {
            inPos: this.inPos,
            indentLevel: this.indentLevel,
            indentsPending: this.indentsPending,
            inLastNewlinePos: this.inLastNewlinePos,
            outTargetPos: this.outTargetPos,
        };
        const outLength = this.outTokens.length;
        
        return {
            revert: () => {
                if (this.options.debug && this.outTokens.length > outLength) {
                    const outLog = (this.outTokens.length > outLength)  ? ['output', ...this.outTokens.slice(outLength).map(toJson)] : [];
                    this.debugLog('snapshot revert to', this.getLineCol(inState.inPos, true), 'input', toJson(this.inData.slice(inState.inPos, this.inPos)), ...outLog);
                }
                this.inPos = inState.inPos;
                this.indentLevel = inState.indentLevel;
                this.indentsPending = inState.indentsPending;
                this.inLastNewlinePos = inState.inLastNewlinePos;
                this.outTargetPos = inState.outTargetPos;
                this.outTokens.length = outLength;
            },
            revertOutput: () => {
                this.outTargetPos = inState.outTargetPos;
                const discardOut = this.outTokens.splice(outLength);
                if (this.options.debug && discardOut.length > 0) {
                    this.debugLog('snapshot revert output', toJson(discardOut));
                }
                return discardOut;
            },
            hasOutput: () => {
                return this.outTokens.slice(outLength).some(t => typeof t === 'string');
            }
        };
    }

    /**
     * Parse a group with optional delimiters and separators.
     */
    parseGroup(opts: ParseGroupOpts, itemFunc: () => boolean): boolean {
        const jsOpen = opts.jsOpen !== undefined ? opts.jsOpen : opts.open;
        const jsClose = opts.jsClose !== undefined ? opts.jsClose : opts.close;
        const jsNext = opts.jsNext !== undefined ? opts.jsNext : opts.next;

        const literalOpen = opts.open ? this.read(opts.open) : undefined;
        if (literalOpen) this.emit(jsOpen);
        else if (!opts.allowImplicit) return false;

        const indentOpen = this.readIndent();
        if (!literalOpen) {
            if (!indentOpen) return false;
            this.emit(jsOpen);
        }

        let snap: Snapshot | undefined;
        while (true) {
            if (!itemFunc()) break;
            snap = undefined;
            if (opts.next && this.read(opts.next)) {
                this.emit(jsNext);
                if (indentOpen) this.must(this.readNewline());
            } else if (indentOpen && this.readNewline()) {
                if (opts.endNext === false) snap = this.snapshot();
                this.emit(jsNext);
            } else {
                break;
            }
        }
        if (snap) snap.revertOutput();

        if (indentOpen) this.must(this.readDedent());
        if (literalOpen && opts.close) {
            this.must(this.read(opts.close));
            this.outTargetPos = undefined;  // Don't use closing delimiter's position
        }
        if (jsClose) {
            this.emit(jsClose);
        }

        return true;
    }

    /**
     * Attempt to recover from errors during parsing.
     */
    recoverErrors(func: () => any): any {
        if (!this.options.recover) return func();
        let startPos = this.inPos;
        const startIndentLevel = this.indentLevel;
        const ANYTHING = /[\s\S]/y;
        const IDENTIFIER = /[a-zA-Z_$][0-9a-zA-Z_$]*/y;
        const STRING = /(['"])(?:(?=(\\?))\2.)*?\1/y;
        
        try {
            return func();
        } catch (e) {
            if (!(e instanceof ParseError)) throw e;
            this.errors.push(e);

            let level = this.indentLevel - startIndentLevel;
            while (this.inPos < this.inData.length) {
                if (this.readIndent()) level++;
                if (this.readNewline() && level <= 0 && this.inPos > startPos) {
                    e.recoverSkip = this.inData.substring(startPos, this.inPos);
                    this.outTargetPos = undefined;
                    // Emit semicolon if last token wasn't one
                    const lastToken = this.outTokens[this.outTokens.length - 1];
                    if (lastToken !== ';') this.emit(';');
                    return true;
                }
                if (this.readDedent()) level--;
                else this.must(this.read(IDENTIFIER) || this.read(STRING) || this.read(ANYTHING));
            }
        }
    }

    /**
     * Check if we're at the start of a new line (for breaking operator processing).
     */
    justAfterNewLine(): boolean {
        return this.inLastNewlinePos === this.inPos;
    }

    /**
     * Check if the character before current position is not a space.
     * Used to distinguish function calls foo(x) from spaced expressions foo (x).
     */
    lastNotSpace(): boolean {
        return this.inPos > 0 && this.inData[this.inPos - 1] !== ' ';
    }

    /**
     * Check if the last emitted output ends with the given string.
     * Useful for conditionally emitting closing tokens.
     */
    outputEndsWith(str: string): boolean {
        // Find the last string token
        for (let i = this.outTokens.length - 1; i >= 0; i--) {
            const token = this.outTokens[i];
            if (typeof token === 'string') {
                return token.endsWith(str);
            }
        }
        return false;
    }

    /**
     * Read a newline token (including handling indent changes).
     * This is public because the Main parser loop needs it.
     */
    readNewline(): boolean {
        if (this.inLastNewlinePos === this.inPos) {
            return true;
        }

        if (this.indentsPending) {
            this.matchOptions.add('NEWLINE');
            return false;
        }

        const orgInPos = this.inPos;

        let forceIndent = false;
        let newIndent: number | undefined;
        while (true) {
            if (this.inPos >= this.inData.length) {
                newIndent = 0;
                break;
            }

            if (this.inData[this.inPos] === '\n') {
                this.inPos++;

                if (forceIndent) {
                    if (newIndent !== undefined) {
                        for (; this.indentLevel < newIndent; this.indentLevel++) this.indentsPending += 'i';
                        for (; this.indentLevel > newIndent; this.indentLevel--) this.indentsPending += 'd';
                    }

                    this.indentLevel++;
                    this.indentsPending += 'i';
                    forceIndent = false;
                }

                newIndent = 0;
                for (let i = this.inPos; i < this.inData.length && this.inData[i] === '\t'; i++) newIndent++;
                if (this.inData[this.inPos + newIndent] === ' ') {
                    const { line } = this.getLineCol(this.inPos);
                    throw new ParseError(this.inPos + newIndent, line + 1, 1 + newIndent, "Space indentation is not allowed, use tabs only");
                }
            } else if (this.inData[this.inPos] === ';' && !forceIndent) {
                forceIndent = true;
                this.inPos++;
            } else if (newIndent === undefined) {
                this.inPos = orgInPos;
                this.matchOptions.add('NEWLINE');
                return false;
            } else {
                break;
            }

            WHITESPACE.lastIndex = this.inPos;
            const match = WHITESPACE.exec(this.inData);
            if (match) this.inPos += match[0].length;
        }

        for (; this.indentLevel < newIndent; this.indentLevel++) this.indentsPending += 'i';
        for (; this.indentLevel > newIndent; this.indentLevel--) this.indentsPending += 'd';

        if (this.options.debug) this.debugLog(`read ${JSON.stringify(this.inData.substring(orgInPos, this.inPos))} as NEWLINE indentsPending=${this.indentsPending} at ${this.getLineCol(orgInPos, true)}`);
        this.matchOptions.clear();
        this.inLastNewlinePos = this.inPos;

        return true;
    }


    // ==================== PRIVATE METHODS ====================

    /**
     * Read an indent token.
     */
    private readIndent(): boolean {
        let snap: Snapshot | undefined;
        if (!this.indentsPending) {
            snap = this.snapshot();
            if (!this.readNewline()) return false;
        }
        if (this.indentsPending && this.indentsPending[0] === 'i') {
            this.indentsPending = this.indentsPending.slice(1);
            if (this.options.debug) this.debugLog('read INDENT');
            this.matchOptions.clear();
            return true;
        }
        if (snap) snap.revert();
        this.matchOptions.add("INDENT");
        return false;
    }

    /**
     * Read a dedent token.
     */
    private readDedent(): boolean {
        let snap: Snapshot | undefined;
        if (!this.indentsPending) {
            snap = this.snapshot();
            if (!this.readNewline()) return false;
        }
        if (this.indentsPending && this.indentsPending[0] === 'd') {
            this.indentsPending = this.indentsPending.slice(1);
            if (this.options.debug) this.debugLog('read DEDENT');
            this.matchOptions.clear();
            return true;
        }
        if (snap) snap.revert();
        this.matchOptions.add("DEDENT");
        return false;
    }

    /**
     * Convert an input position to line and column numbers.
     */
    private getLineCol(targetPos: number): { line: number, col: number };
    private getLineCol(targetPos: number, asString: true): string;
    private getLineCol(targetPos: number, asString: boolean = false) {
        const slot = Math.min(Math.floor(targetPos / CACHE_INTERVAL), this.inPosLineCache.length - 1);
        let line = this.inPosLineCache[slot];
        let col = this.inPosColCache[slot];

        for(let pos = slot * CACHE_INTERVAL + 1; pos < targetPos; pos++) {
            if (this.inData[pos] === '\n') {
                line++;
                col = 1;
            } else {
                col++;
            }
            if ((pos % CACHE_INTERVAL) === 0) {
                this.inPosLineCache.push(line);
                this.inPosColCache.push(col);
            }
        }

        return asString ? `${line}:${col}` : { line, col };
    }

    /**
     * Format the output tokens into a final string with proper whitespace.
     */
    public getResult(): { code: string, errors: ParseError[], map: { in: number[], out: number[] } } {
        const inMap: number[] = [];
        const outMap: number[] = [];

        let output = '';
        let outLine = 1;
        let outCol = 1;
        let targetLine: number | undefined;
        let targetCol: number | undefined;
        let addMapInPos: number | undefined;

        for (const token of this.outTokens) {
            if (typeof token === 'number') {
                if (token >= 0) addMapInPos = token;
                const pos = this.getLineCol(Math.abs(token));
                targetLine = pos.line;
                targetCol = pos.col;
                continue;
            }

            const text = token;
            
            if (targetLine != null) {
                while (outLine < targetLine) {
                    output += '\n';
                    outLine++;
                    outCol = 1;
                }
            }

            const prevChar = output.length ? output[output.length - 1] : ' ';

            if (outCol === 1 && targetCol != null && targetCol > 1 && outLine === targetLine) {
                outCol += targetCol - 1;
                output += '\t'.repeat(targetCol - 1);
            } else {
                let spaceCount = prevChar.match(IS_WORD_CHAR) && text.match(START_WORD_CHAR) ? 1 : 0;

                if (this.options.whitespace === 'preserve') {
                    if (targetCol != null && outLine === targetLine) {
                        spaceCount = Math.max(spaceCount, targetCol - outCol);
                    }
                } else {
                    if (!spaceCount) {
                        const nextChar = text[0];
                        if ("[(.!".indexOf(prevChar) < 0 && "[](,;):.".indexOf(nextChar) < 0) spaceCount = 1;
                        else if (":=".indexOf(prevChar) >= 0 && "([".indexOf(nextChar) >= 0) spaceCount = 1;
                    }
                }

                if (spaceCount) {
                    outCol += spaceCount;
                    output += ' '.repeat(spaceCount);
                }
            }

            targetCol = targetLine = undefined;

            if (addMapInPos !== undefined) {
                inMap.push(addMapInPos);
                outMap.push(output.length);
                addMapInPos = undefined;                
            }

            output += text;
            const lastNewline = text.lastIndexOf('\n');
            if (lastNewline >= 0) {
                outLine += text.split('\n').length - 1;
                outCol = text.length - lastNewline;
            } else {
                outCol += text.length;
            }
        }

        output += '\n';

        return {code: output, errors: this.errors, map: {in: inMap, out: outMap}};
    }

    private debugLog(...args: any[]) {
        const debug = this.options.debug;
        (typeof debug === 'function' ? debug : console.debug)(...args, '  '+FG_GRAY+getParseStack()+FG_RESET);
    }

    private joinTokens(tokens: any[], joinStr: string = '   '): string {
        return tokens.map(e => typeof e === 'string' ? toJson(e) : e instanceof Array ? this.joinTokens(e, ' + ') : e.toString()).toSorted().join(joinStr);
    }
}

function toJson(v: any) {
    return JSON.stringify(v);
}

function getParseStack() {
    let m = Array(...((new Error().stack || '').matchAll(/\bat ([a-zA-Z_0-9]+\.)?parse([A-Z][a-zA-Z]+).*?(:\d+)/g) || [])).map(i => i[1]+i[2]);
    return m.join(' <- ')
}
