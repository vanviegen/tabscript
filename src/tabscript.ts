
/**
 * TabScript language version supported by this transpiler.
 * Code must have same major version and minor version <= this.
 */
const VERSION = {major: 1, minor: 0};

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

function descr(regexp: RegExp, name: string): RegExp {
    regexp.toString = () => '<'+name+'>';
    return regexp;
}

const
// Atoms
    WHITESPACE = descr(/[ \t\r]*(?:#.*)?/y, "whitespace"),
    IDENTIFIER = descr(/[a-zA-Z_$][0-9a-zA-Z_$]*/y, "identifier"),
    STRING = descr(/(['"])(?:(?=(\\?))\2.)*?\1/y, "string"),
    REST_OF_LINE_OR_INTERPOLATE = descr(/.*?(?<=\s*#|\s*$|$\{)/ym, "rest-of-line"),
    NUMBER = descr(/[+-]?(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/y, "number"),
    INTEGER = descr(/\d+/y, "integer"),
    OPERATOR = descr(/instanceof\b|in\b|or\b|and\b|[!=]~|[+\-*\/!=<>]=|[+\-*\/=<>]|%[a-z_]+/y, "bin-op"),
    WITHIN_BACKTICK_STRING = descr(/[\s\S]*?(\${|`)/y, "`string`"),
    EXPRESSION_PREFIX = descr(/\+\+|--|!|\+|-|typeof\b|delete\b|await\b|new\b/y, "unary-op"),
    REGEXP = descr(/\/(\\.|[^\/])+\/[gimsuyd]*/y, "regexp"),
    TAG_LITERAL = descr(/([0-9a-zA-Z_$\-]+)/y, "tag-literal"),
    TAG_OPERATOR = descr(/[=~!:]/y, "tag-operator"),
// Other regexes
    ANYTHING = /[\s\S]/y,
    ALPHA_NUM = /^[a-zA-Z0-9]+$/,
    START_WORD_CHAR = /^[a-zA-Z0-9_$]/,
    IS_WORD_CHAR = /^[a-zA-Z0-9_$]$/,
    CHECK_IDENTIFIER = /^[a-zA-Z_$][0-9a-zA-Z_$]*$/ // Same as IDENTIFIER but without the /y flag
    ;

const REPLACE_TAG_OPERATORS : Record<string, string> = {
    '=': 'a',
    '~': 'p',
    ':': 's',
};

const REPLACE_OPERATORS: Record<string, string> = {
    "or": "||",
    "and": "&&",
    "==": "===",
    "!=": "!==",
    "=~": "==",
    "!~": "!=",
    "%mod": '%',
    "%bit_or": '|',
    "%bit_and": '&',
    "%bit_xor": '^',
    "%shift_left": '<<',
    "%shift_right": '>>',
    "%unsigned_shift_right": '>>>',
};

/**
 * Configuration options for the TabScript transpiler.
 */
export type Options = {
    /** When `true`, logs each consumed token. If a function, calls that function instead of console.debug. */
    debug?: boolean | ((...args: string[]) => void),
    /** When `true`, attempts to recover from errors and continue transpilation instead of throwing. */
    recover?: boolean,
    /** When `true`, outputs JavaScript instead of TypeScript by stripping type annotations. */
    stripTypes?: boolean,
    /** Function to transform import URIs during transpilation. */
    transformImport?: (uri: string) => string,
    /** Output formatting mode: `"preserve"` maintains input alignment, `"pretty"` adds readable indentation. */
    whitespace?: 'preserve' | 'pretty',
};


/**
 * Transpiles TabScript to TypeScript or JavaScript.
 * 
 * @param inData The input TabScript.
 * @param options An optional object containing the following optional properties:
 *   - `debug` When `true`, each consumed token is logged. If it's a function, that function will be called instead of `console.debug`.
 *   - `recover` When `true`, the function will attempt to continue transpilation when it encounters an error in the input (or unsupported syntax), instead of throwing. Errors are logged to `console.error`.
 *   - 'stripTypes' When `true`, we'll transpile to JavaScript instead of TypeScript. Note that TabScript will not perform any type checking, just strip out the type info.
 *   - `transformImport` An async function that gets an `import` URI, and returns the URI to be include included in the transpiled output.
 *   - `whitespace` When `"preserve"` (the default), output is made to closely align with input line/column positions. When `"pretty"`, output is formatted with human-friendly indentation and spacing.
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
    const {debug,recover,transformImport,stripTypes,whitespace} = options;
    let ui: string | undefined;
    
    let inPos = 0; // Current char in `inData`
    let inLine = 1; // Line number for `pos`
    let inCol = 1; // Column for `pos`
    let indentLevel = 0;
    let indentsPending = ''; // String of 'i'ndent/'d'edent tokens that are pending read()
    let inLastNewlinePos = -1;

    let outData = ''; // The output we've created so far
    let outLine = 1;
    let outCol = 1;
    let outTargetPos: number | undefined; // The position of our last read input token start, and where output should be synced to
    let outTargetLine: number | undefined; // These are set by read() and used+reset by emit()
    let outTargetCol: number | undefined; 

    let inOutMap = {in: [] as number[], out: [] as number[]};
    let errors: ParseError[] = [];

    let matchOptions: Set<RegExp | string | ParseError | (RegExp | string)[]> = new Set(); // The set of tokens we've tried and failed to match at this `pos`

    parseMain();
    return {
        code: outData + "\n",
        errors,
        map: inOutMap
    }


    ///// Recursive decent parser functions /////

    function parseHeader() {
        // All .tab files must start with a header: tabscript X.Y [feature=value ...]
        must(read('tabscript'));

        // Parse version: major.minor
        const majorNum = parseInt(must(read(INTEGER)));
        must(read('.'));
        const minorNum = parseInt(must(read(INTEGER)));

        if (majorNum !== VERSION.major || minorNum > VERSION.minor) {
            throw new ParseError(inPos, inLine, inCol, `Script version ${majorNum}.${minorNum} outside supported range (${VERSION.major}.0 - ${VERSION.major}.${VERSION.minor})`);
        }

        // Parse feature flags: name=value
        if (read('ui')) {
            must(read('='));
            ui = must(read(IDENTIFIER));
        }
        must(readNewline());
        outTargetPos = outTargetCol = outTargetLine = undefined;

        return true;
    }

    function parseMain() {
        if (stripTypes) emit('"use strict";');
        
        read(''); // Consume leading comments
        readNewline(); // Optionally start with some newlines/comments

        recoverErrors(parseHeader); // like: tabscript 1.0 ui=A

        while(inPos < inData.length) recoverErrors(() => {
            must(parseStatement) && must(readNewline());
        });
    }

    function parseStatement() {
        // if (a==3) throw new Error();
        const orgOutLen = outData.length;
        if (parseReturn() || parseThrow() || parseTypeDecl() || parseExport() || parseImport() || parseDoWhile()) {
        } else if (parseIfWhile() || parseFor() || parseTry() || parseFunction(true) || parseClass() || parseSwitch() || parseEnum() || parseDeclare()) {
            return true; // Statement parsed, but no need for semicolon
        } else if (parseTag() || parseAttribute() || parseVarDecl() || parseExpressionSeq()) {
        } else {
            return false; // This is not a statement
        }
        // The check here is because when in stripTypes mode, some statements (such as type definitions) may not emit any output and therefore do not need a semicolon
        if (outData.length > orgOutLen) emit(';');
        else {
            outTargetPos = outTargetLine = outTargetCol = undefined;
        }
        return true;
    }

    function parseExport() {
        // export class X {];
        if (!peek('export')) return false;

        if (peek('export', 'type')) {
            must(eatType('export'));
            must(parseTypeDecl());
            return true;
        }
        if (peek('export', 'interface')) {
            must(eatType('export'));
            must(parseClass());
            return true;
        }
        if (!eat('export')) return false;

        if (eat('default')) {
            must(parseExpression() || parseClass());
        } else {
            must(parseVarDecl() || parseClass() || parseLiteralObject() || parseFunction(true));
        }
        return true;
    }

    function parseTypeDecl() {
        // type X = number | string;
        if (!eatType('type')) return false;
        must(eatType(IDENTIFIER)); // var name
        parseTemplateDef();
        if (eatType('=')) must(parseType);
        return true;
    }

    function parseEnum() {
        // enum Directions { Up, Down }
        if (!read('enum')) return false;
        let identifier = must(read(IDENTIFIER));

        const opts = {
            open: '{',
            close: '}',
            next: ',',
            jsOpen: stripTypes ? `var ${identifier} = (function (${identifier}) {` : `enum ${identifier} {`,
            jsClose: stripTypes ? `return ${identifier};})(${identifier} || {});` : '}',
            jsNext: stripTypes ? null : ',',
            allowImplicit: true,
        };
        let nextNum = 0;
        return must(parseGroup(opts, () => {
            const name = read(IDENTIFIER);
            if (!name) return false;
            if (read('=')) {
                nextNum = parseInt(must(read(NUMBER)));
            }
            if (stripTypes) emit(`${identifier}[(${identifier}["${name}"] = ${nextNum++})] = "${name}";`);
            else emit(`${name} = ${nextNum++}`);
            return true;
        }));
    }
    
    function parseReturn() {
        // return 123;
        // yield 234;
        if (!eat('return') && !eat('yield')) return false;
        parseExpression();
        return true;
    }

    function parseIfWhile() {
        // if (go) launch(); else abort();
        const name = eat('if') || eat('while');
        if (!name) return false;
        emit('(', false);
        must(parseExpression);
        emit(')', false);
        must(parseBlock() || parseStatement());
        if (name==='if' && eat('else')) must(parseBlock() || parseStatement());
        return true;
    }

    function parseThrow() {
        // throw Error();
        if(!eat('throw')) return false;
        must(parseExpression);
        return true;
    }

    function parseDoWhile() {
        // do { this() } while (that);
        if (!eat('do')) return false;
        must(parseStatement);
        must(eat('while'));
        must(parseExpression);
        return true;
    }

    function parseFor() {
        // for x:number of arr log(x)
        // x : number
        // for x of arr log(x)
        // for key: in obj log(key)
        // for x:=0; x<10; x++ log(x)
        
        if (!eat('for')) return false;
        emit('(', false);

        const saved = getFullState();

        if ((parseVarDecl(false) || eat(IDENTIFIER)) && (eat('of') || eat('in'))) {
            // for x in/of y
            must(parseExpression);
        } else {
            // for a; b; c
            restoreState(saved);
            (parseVarDecl() || parseExpression()) ? read(';') : must(read(';')); // semi is non-optional when there's no expression
            for(let i=0; i<2; i++) {
                emit(';', false);
                parseExpression() ? read(';') : must(read(';'));
            }
        }

        emit(')', false);
        must(parseStatement() || parseBlock());
        return true;
    }

    function parseSwitch() {
        if (!eat('switch')) return false;
        emit('(', false);
        must(parseExpression);
        emit(')', false);
        must(parseGroup({jsOpen: '{', jsClose: '}', allowImplicit: true}, () => {
            if (read('*')) emit('default: {', true);
            else {
                const saved = getOutState();
                outTargetCol = inCol;
                outTargetLine = inLine;
                outTargetPos = inPos;
                emit('case');
                if (!parseExpression()) {
                    restoreState(saved);
                    return false;
                }
                emit(': {', false);
            }
            read(':'); // optional

            if (!parseGroup({next: ';', jsNext: null, allowImplicit: true}, () => recoverErrors(parseStatement))) {
                must(parseStatement());
            }
            emit('break;}', false);
            return true;
        }));
    }

    function parseImport() {
        // import * as x from 'file';
        // import {a,b as c} from 'file';
        // import xyz from 'file';
        if (!eat('import')) return false;
        if (eat('*')) {
            must(eat('as'));
            must(eat(IDENTIFIER));
        }
        else if (parseGroup({open: '{', close: '}', next: ',', allowImplicit: true}, () => {
            if (!eat(IDENTIFIER)) return false;
            if (eat('as')) must(eat(IDENTIFIER));
            return true;
        })) {
        }
        else {
            must(eat(IDENTIFIER));
        }
        must(eat('from'));

        if (transformImport) {
            const url = must(read(STRING)).slice(1, -1); // strip of quotes
            emit('"'+transformImport(url)+'"');
        } else {
            must(eat(STRING));
        }
        return true;
    }

    function parseTry() {
        // try { something(); } catch(e: any) { log(e); } finally { log('done'); }
        if (!eat('try')) return;
        must(parseBlock() || parseStatement());
        if (eat('catch')) {
            if (eat(IDENTIFIER)) {
                if (eatType(':')) must(parseType);
            }
            must(parseBlock() || parseStatement());
        }
        if (eat('finally')) must(parseBlock() || parseStatement());
        return true;
    }

    function getOutState() {
        return {
            outData,
            outLine,
            outCol,
            // both in and out
            outTargetPos,
            outTargetLine,
            outTargetCol
        };
    }

    function getInState() {
        return {
            inPos,
            inLine,
            inCol,
            indentLevel,
            indentsPending,
            inLastNewlinePos,
            // both in and out
            outTargetPos,
            outTargetLine, 
            outTargetCol
        };
    }

    function getFullState() {
        return Object.assign(getInState(), getOutState());
    }

    function restoreState(state: any) {
        if (!state) return;
        if ('outData' in state) {
            outData = state.outData;
            outLine = state.outLine;
            outCol = state.outCol;
        }
        if ('outTargetPos' in state) {
            outTargetPos = state.outTargetPos;
            outTargetLine = state.outTargetLine;
            outTargetCol = state.outTargetCol;
        }
        if ('inPos' in state) {
            inPos = state.inPos;
            inLine = state.inLine;
            inCol = state.inCol;
            indentLevel = state.indentLevel;
            indentsPending = state.indentsPending;
            inLastNewlinePos = state.inLastNewlinePos;
        }
    }

    function parseDeclare() {
        // declare global { interface String { x(): void; }}
        if (!eatType('declare')) return false;
        eatType('enum');
        must(eatType(IDENTIFIER));

        const saved = getOutState(); // We'll just discard all output generated by the block
        must(parseBlock);
        restoreState(saved);

        return true;
    }

    function parseBlock() {
        // <indent> x=3 <newline> log(x) <newline> <dedent>
        return parseGroup({jsOpen: '{', jsClose: '}', next: ';', jsNext: null, allowImplicit: true}, () => recoverErrors(parseStatement));
    }

    function parseTemplateDef() {
        // <A, B extends number|string>
        if (eatType('<')) {
            while(true) {
                must(eatType(IDENTIFIER));
                if (eatType('extends')) must(parseType);
                if (!eatType(',')) break;
            }
            must(eatType('>'));
            return true;
        }
        return false;
    }

    function parseFuncParams(isConstructor=false, parenthesis=false) {
        let propArgs = "";
        // (public a, b?: string, c=3, ...d: any[])
        const opts = {
            open: parenthesis ? '(' : '|',
            close: parenthesis ? ')' : '|',
            next: ',',
            jsOpen: '(',
            jsClose: ')'
        };
        const isGroup = parseGroup(opts, () => {
            // ... cannot be combined with access modifiers
            if (eat('...')) must(eat(IDENTIFIER));
            else if (isConstructor && (eatType('public') || eatType('private') || eatType('protected')) && stripTypes) {
                const name = must(eat(IDENTIFIER));
                propArgs += `this.${name}=${name};`
            }
            else if (!eat(IDENTIFIER)) return false;
            eatType('?');
            if (eatType(':')) must(parseType);
            if (eat('=')) must(parseExpression);
            return true;
        });
        if (!isGroup) return false;
        return isConstructor && propArgs ? propArgs : true;
    }

    function parseFunction(declaration=false) {
        // |a,b| a+b
        // async |a,b| await a + await b
        // function |a,b| a+b
        // function test|a,b| a+b
        // <A,B>|a: A, b: B| as A|B a || b
        // async |a,b| <indent> await log(a) <newline> await log(b) <newline> <dedent>
        // || 3

        let savedOut = stripTypes && getOutState();
        
        const isAsync = eat('async');
        const isClassic = eat('function')
        if (isClassic) {
            eat('*'); // generator indicator (optional)
            eat(IDENTIFIER); // function name (optional)
        } else if (declaration) {
            must(!isAsync);
            return false;
        }
        const hasTemplate = parseTemplateDef();

        if (isClassic) parseFuncParams() || parseFuncParams(false, true) || emit('()', false); // Optional, and allow with braces
        else if (isAsync || hasTemplate) must(parseFuncParams());
        else if (!parseFuncParams()) return false; // Nothing has been parsed

        parseFuncType();

        if (!isClassic) {
            savedOut ||= getOutState();
            emit('=>');
        }

        // Function body as a block?
        if (parseBlock()) return true;

        // Function body as an expression?
        if (isClassic ? parseClassicFuncExprBody() : parseArrowFuncExprBody()) return true;

        // No body. So it's an overload signature. This is all type info, so should be stripped.
        must(declaration);
        emit(';');
        restoreState(savedOut);
        return true;
    }

    function parseClassicFuncExprBody() {
        // For classic functions, we need to wrap the body in a block
        const savedOut = getOutState();
        emit('{return', false);
        if (!parseExpression()) {
            restoreState(savedOut);
            return false;
        }
        emit('}', false);
        return true;
    }

    function parseArrowFuncExprBody() {
        // We can output these as-is, except that object literals need to be wrapped in parentheses
        const savedOut = getOutState();
        emit('(', false);
        if (parseLiteralObject()) {
            emit(')', false);
            return true;
        }
        restoreState(savedOut);
        return parseExpression();
    }

    function parseFuncType() {
        if (!eatType(':')) return false;
        eatType('asserts');
        must(parseType);
        return true;
    }

    function parseParenthesised() {
        // (3+4, test(), ()=>123)
        if (!eat('(')) return false;
        must(parseExpressionSeq);
        must(eat(')'));
        return true;
    }

    function parseExpressionSeq() {
        // 3+4, test(), ()=>123
        if (!parseExpression()) return false;
        while (eat(',')) must(parseExpression);
        return true;
    }

    function parseVarDecl(allowInit=true) {
        // test : number = 3
        // {x,y} ::= obj
        // something::
        const match = read(IDENTIFIER, ':');
        if (!match) return false;
        emit(read(':') ? 'let': 'const', false);
        emit(match[0]);

        const saved = getOutState();
        emitType(':');
        if (!parseType()) restoreState(saved);

        if (allowInit && eat('=')) {
            must(parseExpression);
        }
        return true;
    }

    function parseExpression() {
        // (3+4+test()) / c!.cnt++ as any
        let required = false;
        while(true) {
            if (!eat(EXPRESSION_PREFIX)) {
                if (!read('%bit_not')) break;
                emit('~');
            }
            required = true;
        }
        
        // IDENTIFIER also covers things like `break` and `continue`
        // parseTag() must come before parseFunction() to avoid confusion with template parameters
        if (parseClass() || parseTag() || parseFunction() || eat(IDENTIFIER) || parseLiteralArray() || parseLiteralObject() || eat(STRING) || parseBacktickString() || eat(NUMBER) || parseParenthesised() || eat(REGEXP)) {}
        else if (required) must(false);
        else return false;

        let tmp;
        while(true) {
            const lastNotSpace = inData[inPos-1]!==' ';
            // Function call '(' may not be preceded by a whitespace (to distinguish from `myFunc& a (3+4)` syntax)
            if (lastNotSpace && parseGroup({open: '(', close: ')', next: ','}, () => { // myFunc(a, b, ...rest)
                if (eat('...')) return must(parseExpression);
                else return parseExpression();
            })) {}
            else if (read('&')) {
                // func& <indent> arg1 <newline> arg2 <newline> <dedent>
                if (!parseGroup({jsOpen: '(', jsClose: ')', jsNext: ',', allowImplicit: true, endNext: false}, parseExpression)) {
                    // func.. arg1 arg2
                    emit('(');
                    let saved;
                    while(true) {
                        if (!parseExpression()) break;
                        while (eat(',')) must(parseExpression);
                        saved = getOutState();
                        emit(','); // allow commas too
                    }
                    restoreState(saved);
                    emit(')');
                }
            }
            else if (peek('`')) must(parseBacktickString); // template function call
            else if (peek('[')) must(parseIndex);
            else if (eat('++') || eat('--')) {}
            else if (eatType('as')) must(parseType());
            else if (eat('?.')) must(eat(IDENTIFIER) || parseIndex());
            else if (!peek('..') && eat('.')) must(eat(IDENTIFIER));
            else if (lastNotSpace && parseTemplateArg()) {}
            else if (tmp = read(OPERATOR)) {
                must(tmp[0]!=='%' || (tmp in REPLACE_OPERATORS));
                emit(REPLACE_OPERATORS[tmp] || tmp);
                eat('='); // Optional replacement operator (doesn't always make sense, but that's TypeScript's problem :-))
                must(parseExpression);
                return true;
            }
            else if (eatType('!')) {}
            else break;
        }

        if (read('?')) {
            const saved = getOutState();
            emit('?');
            if (parseExpression()) {
                // a ? b : c
                must(eat(':'));
                must(parseExpression);
            } else {
                // isSet := a? 
                restoreState(saved);
                emit('!=null');
            }
        }
        return true;
    }

    function parseBacktickString() {
        // `The answer: ${3+4}.. ${`test`}`
        if (!eat('`')) return false;
        while(true) {
            let m = must(eat(WITHIN_BACKTICK_STRING));
            if (m.slice(-1) === '`') break;
            // interpolate
            must(parseExpression);
            must(eat('}'));
        }
        return true;
    }

    function parseLiteralArray() {
        // [3, 'test', func() as string, ...more]
        return parseGroup({open: '[', close: ']', next: ','}, () => {
            if (eat('...')) return must(parseExpression);
            else return parseExpression(); // Can be empty: [1 ,,, 2] is valid
        });
    }
        
    function parseLiteralObject() {
        // {...original, x: 1, y, [myVar as number]: 24, myFunc<T>(t: T) { return t+1 }}
        return parseGroup({open: '{', close: '}', next: ','}, () => {
            if (eat('...')) {
                must(parseExpression);
                return true;
            }
            eat('*'); // generator support
            if (eat('[')) {
                must(parseExpression);
                must(eat(']'));
            }
            else {
                if (!eat(IDENTIFIER) && !eat(NUMBER) && !eat(STRING) && !parseBacktickString()) return false;
            }
            if ((parseTemplateDef() && must(parseFuncParams())) || parseFuncParams()) {
                // it's a function shortcut
                if (eatType(':')) parseType();
                must(parseBlock());
            } else {
                if (eat(':')) must(parseExpression);
                // else it's a {shortcut}
            }
            return true;
        });
    }

    function parseTemplateArg() {
        // <T,A>
        // What's hard here is making the distinction between a template argument and < comparison.
        // (3+4)<test or sdf>(x); // template type
        // (3+4)<test or sdf>x; // comparison

        const saved = getFullState();
        if (!eatType('<')) return false;

        do { // single-run loop to allow easy breaking out
            if (!parseType()) break;
            while(eatType(',')) if (!parseType()) break;
            if (!eatType('>')) break;
            // Look ahead to see if we have a template argument or a comparison
            if (peek('.') || peek('(') || readNewline()) return true;
            // Based on the next token, this doesn't look like a template argument.
            // Comparisons perhaps then?
        } while(false);

        restoreState(saved);
        return false;
    }

    function parseIndex() {
        // [12, a]
        if (!(eat('['))) return false;
        must(parseExpressionSeq);
        must(eat(']'));
        return true;
    }

    function parseType(allowFunction=true) {
        // number | (string & StringExtras)
        // X extends MyClass ? keyof X : 'default'
        if (peek('in') || peek('of')) return false; // to avoid confusion with for..in/of
        if (eatType('typeof')) {
            must(eatType(parseExpression));
            return true;
        }

        let required = false;
        if (eatType('keyof')) required = true;

        if (eatType(IDENTIFIER)) { // includes: true,false,undefined,null
            eatType(parseGroup, {open: '<', close: '>', next: ','}, parseType); // template args
        }
        else if (eatType(parseGroup, {open: '{', close: '}', next: ',', allowImplicit: true}, parseTypeObjectEntry)) {} // object
        else if (eatType(parseGroup, {open: '[', close: ']', next: ','}, parseType)) {} // array
        else if (allowFunction && eatType(parseFuncParams)) {
            if (read(':')) {
                emitType('=>');
                must(parseType);
            }
            return true;
        }
        else if (eatType('(')) { // subtype surrounded by parentheses
            must(parseType);
            must(eatType(')'));
        }
        else if (!eatType(NUMBER) && !eatType(STRING)) {
            if (required) must(false);
            return false;
        }
        while (eatType('[')) {
            parseType(); // If present: indexing a type, otherwise indicating an array
            must(eatType(']'));
        }
        while (true) {
            if (read('or')) emitType('|');
            else if (read('and')) emitType('&');
            else if (eatType('is')) {}
            else break;
            must(parseType(false)); // Don't allow function types in unions/intersections
        }
        if (eat('extends')) {
            // conditional type
            must(parseType);
            must(eatType('?'));
            must(parseType);
            must(eatType(':'));
            must(parseType);
        }
        return true;
    }

    function parseTypeObjectEntry() {
        if (eatType('[')) {
            must(eatType(IDENTIFIER));
            must(eatType(':'));
            must(parseType);
            must(eatType(']'))
        }
        else if (!eatType(IDENTIFIER) && !eatType(NUMBER) && !eatType(STRING)) return false;
        must(eatType(':'));
        must(parseType);
        return true;
    }

    function parseClass() {
        // abstract class X { public val: number = 3; get lala() { return 3; } }
        // interface Y {}
        let saved;
        let isInterface = false;
        if (eatType('abstract')){
            must(eat("class"));
        } else {
            if (eatType('interface')) {
                saved = stripTypes && getOutState();
                isInterface = true;
            } else if (!eat("class")) {
                return false;
            }
        }
        eat(IDENTIFIER);
        parseTemplateDef();
        const isDerived = !!eat('extends');
        if (isDerived) must(parseExpression());
        while (eatType('implements')) must(parseType);

        must(parseGroup({jsOpen: '{', jsClose: '}', next: ';', jsNext: null, allowImplicit: true}, () => {
            return recoverErrors(() => parseMethod(isInterface, isDerived));
        }));
        restoreState(saved);
        return true;
    }

    function readTagValue() {
        if (read('${')) {
            const saved = getOutState();
            must(parseExpression());
            must(read('}'));
            const expr = outData.slice(saved.outData.length);
            restoreState(saved);
            return expr;
        }

        const lit = read(TAG_LITERAL);
        if (lit) return JSON.stringify(lit);

        if (peek('`')) {
            const saved = getOutState();
            must(parseBacktickString);
            const expr = outData.slice(saved.outData.length);
            restoreState(saved);
            return expr;
        }

        return read(STRING);
    }

    function parseTag(isChained = false) {
        // Only parse tags when ui option is enabled
        if (!ui) return false;

        // At statement start, < can only be a tag
        if (!read('<')) return false;

        if (!isChained) emit(ui);

        // Parse optional element name (can be IDENTIFIER or ${expr})

        while(true) {
            if (read('.')) { // class
                emit(`.c(${readTagValue()})`);
            } else {
                const name = readTagValue();
                if (!name) break;

                const op = read(TAG_OPERATOR);
                if (op) {
                    parseAttributeValue(name, op, false);
                } else { // Create an element
                    emit(`.e(${name})`);
                }
            }
        }

        must(read('>'));

        // Optional chaining of tags
        if (parseTag(true)) return true;

        // Optional text content
        const str = read(STRING);
        if (str) {
            emit(`.t(${str})`);
            return true;
        }

        if (peek('`')) {
            emit('.t(');
            must(parseBacktickString);
            emit(')');
            return true;
        }

        if (parseGroup({jsOpen: '.f(function(){', jsClose: '})', next: ';', jsNext: null, allowImplicit: true}, () => recoverErrors(parseStatement))) {
            return true;
        }

        const saved = getOutState();
        emit('.t(`');
        let content = false;
        while(true) {
            const rest = read(REST_OF_LINE_OR_INTERPOLATE);
            if (!rest) break;
            emit(rest.replace(/\\|`/g, '\\$&')); // escape backtick and backslash in output
            content = true;
            if (rest.slice(-1) !== '${') break; // End of line
            // Interpolation
            must(parseExpression());
            must(read('}'));
        }
        if (content) emit('`)');
        else restoreState(saved);

        return true;
    }

    function parseAttribute() {
        if (!read(':')) return false;
        const name = JSON.stringify(must(read(IDENTIFIER)));
        const op = must(read(TAG_OPERATOR));
        parseAttributeValue(name, op, true);
    }

    function parseAttributeValue(nameJs: string, op: string, useExpression: boolean) {
        const tr = REPLACE_TAG_OPERATORS[op];
        if (tr) { // The '=' or '~' or ':' operator
            emit(`.${tr}(${nameJs},`);
        } else { // The '!' operator, for special attributes
            if (!nameJs.match(CHECK_IDENTIFIER)) throw new ParseError(inPos, inLine, inCol, `Invalid special attribute identifier: '${nameJs}'`);
            emit(`.${nameJs}(`);
        }
        if (useExpression) must(parseExpression());
        else emit(must(readTagValue()));
        emit(')');
    }

    function parseMethod(typeOnly: boolean, isDerived: boolean) {
        // static public val: number = 3;
        // abstract myMethod(a: number);
        // constructor(public x) {}
        // get lala() { return 3; }
        // static { log('init'); }

        const initPos = inPos;

        typeOnly ||= !!eatType('abstract');
        eatType('public') || eatType('private') || eatType('protected');
        typeOnly ||= !!eatType('abstract');

        const typeOutState = stripTypes && typeOnly && getOutState();

        (peek('get', IDENTIFIER) && eat('get')) || (peek('set', IDENTIFIER) && eat('set'));
        if (eat('static')) {
            if (parseBlock()) return true;
        }
        eat('async');

        eat('*'); // generator support

        const name = eat(IDENTIFIER);
        if (!name) {
            if (eat('[')) {
                must(parseExpression);
                must(eat(']'));
            } else {
                if (initPos !== inPos) {
                    // We've already consumed some modifiers.. identifier was a must.
                    must(false);
                }
                return false;
            }
        }

        if (!peek('<') && !peek('|')) {
            // It's an attribute
            if (eatType(':')) must(parseType);
            if (eat('=')) must(parseExpression);
            restoreState(typeOutState);
            return true;
        }

        parseTemplateDef();
        const isConstructor = (name === 'constructor');
        const propArgs = must(parseFuncParams(isConstructor));

        parseFuncType();
        
        if (typeOnly) {
            restoreState(typeOutState);
            return true;
        }
        
        // Function body as a block?
        if (typeof propArgs !== 'string') {
            // Just try to parse it as a regular block
            if (parseBlock()) return true;
        } else {
            // We need to insert property initializers in the constructor body right after super() or
            // at the start if this isn't a derived class.
            const opts = {jsOpen: '{', jsClose: '}', next: ';', jsNext: null, allowImplicit: true};
            let done = false;
            if (parseGroup(opts, () => {
                if (!done && (!isDerived || (peek('super', '(') && must(parseStatement())))) {
                    emit(propArgs);
                    done = true;
                }
                return recoverErrors(parseStatement);
            })) return true;
        }

        // Function body as an expression?
        const bodyOutState = getOutState();
        emit('{');
        if (peek('super', '(')) {
            // Emit property initializers first. Also, super() doesn't like a 'return' prefix.
            if (typeof propArgs==='string') emit(propArgs);
        } else {
            emit('return');
        }
        if (parseExpression()) {
            emit('}');
            return true;
        }
        restoreState(bodyOutState); // Failed to parse expression, revert output (not just when type stripping)

        // No body. So it's an overload signature. This is all type info, so should be stripped.
        emitType(';');
        restoreState(typeOutState);
        return true;
    }

    ///// Helper functions /////

    function must<T extends string | true>(result: T | undefined | false | (() => T | undefined | false)): T {
        if (typeof result === 'function') result = result();
        if (result) return result;
        let stack = new Error().stack || '';
        let m = /\bat parse([A-Z][a-zA-Z]*)/.exec(stack) || ['', 'top-level'];

        const got = indentsPending ? (indentsPending[0]==='i' ? "INDENT" : "DEDENT") : toJson(inData.substr(inPos,24));
        let error = new ParseError(inPos, inLine, inCol, `Could not parse ${m[1]} as input is ${got} but we expected one of:   ${joinTokens(Array.from(matchOptions))}`);
        throw error;
    }

    function recoverErrors(func: () => any) {
        if (!recover) return func();
        let startPos = inPos;
        const startIndentLevel = indentLevel;
        try {
            return func();
        } catch(e) {
            if (!(e instanceof ParseError)) throw e;
            errors.push(e);

            let level = indentLevel - startIndentLevel;
            while(inPos < inData.length) {
                if (readIndent()) level++;
                if (readNewline() && level <= 0 && inPos > startPos) {
                    e.recoverSkip = inData.substring(startPos, inPos);
                    outTargetPos = outTargetCol = outTargetLine = undefined;
                    if (outData[outData.length-1] !== ';') emit(';');
                    return true; // Fake success
                }
                if (readDedent()) level--;
                else must(read(IDENTIFIER) || read(STRING) || read(ANYTHING));
            }
        }
    }

    interface ParseGroupOpts {
        open?: string;
        close?: string;
        next?: string;
        jsOpen?: string | null;
        jsClose?: string | null;
        jsNext?: string | null;
        allowImplicit?: boolean;
        endNext?: false;
            // true: allow <indent><dedent>
            // false: allow <open>(<indent><dedent>)?<close>
    }

    function parseGroup(opts: ParseGroupOpts, itemFunc: () => boolean) {
        const jsOpen = opts.jsOpen !== undefined ? opts.jsOpen : opts.open;
        const jsClose = opts.jsClose !== undefined ? opts.jsClose : opts.close;
        const jsNext = opts.jsNext !== undefined ? opts.jsNext : opts.next;

        const literalOpen = opts.open && read(opts.open);
        if (literalOpen) emit(jsOpen);
        else if (!opts.allowImplicit) return false;

        const indentOpen = readIndent();
        if (!literalOpen) {
            if (!indentOpen) return false;
            // We still need to insert jsOpen
            emit(jsOpen);
        }

        let saved;
        while(true) {
            if (!itemFunc()) break;
            saved = undefined;
            if (opts.next && read(opts.next)) {
                emit(jsNext);
                if (indentOpen) must(readNewline());
            } else if (indentOpen && readNewline()) {
                // Insert separator
                if (opts.endNext===false) saved = getOutState();
                emit(jsNext);
            } else {
                break; // last separator is optional
            }
        }
        restoreState(saved);

        if (indentOpen) must(readDedent());
        if (literalOpen && opts.close) must(read(opts.close));
        if (jsClose) {
            if (inLine > outLine+1) {
                // If there happens to be an empty line after this group,
                // opportunistically put the closing character there for
                // better looking output.
                outTargetLine = outLine+1;
                outTargetCol = inCol;
            }
            emit(jsClose);
        }

        return true;
    }

    function readNewline() {
        if (inLastNewlinePos === inPos) {
            // if (debug) debugLog('eat repeated NEWLINE');
            return true;
        }

        if (indentsPending) {
            matchOptions.add('NEWLINE');
            return false;
        }

        const orgInPos = inPos;
        
        // We're looping to filter out empty lines or lines with just comments
        let forceIndent = false;
        let newIndent;
        while(true) {
            if (inPos >= inData.length) { // end-of-file counts as newline
                newIndent = 0;
                break;
            }

            if (inData[inPos] === '\n') { // Newline
                inPos++;

                if (forceIndent) {
                    if (newIndent !== undefined) {
                        // Flush indent/dedent for the ; itself
                        for(;indentLevel < newIndent; indentLevel++) indentsPending += 'i';
                        for(;indentLevel > newIndent; indentLevel--) indentsPending += 'd';
                    }

                    indentLevel++;
                    indentsPending += 'i';
                    forceIndent = false;
                }

                newIndent = 0;
                for(let i=inPos; i<inData.length && inData[i] === '\t'; i++) newIndent++;
                if (inData[inPos + newIndent] === ' ') {
                    throw new ParseError(inPos + newIndent, inLine+1, 1 + newIndent, "Space indentation is not allowed, use tabs only");
                }
            } else if (inData[inPos] === ';' && !forceIndent) { // Semicolon before end-of-line forces indent to follow
                forceIndent = true;
                inPos++;
            } else if (newIndent === undefined) { // No newline found
                inPos = orgInPos;
                matchOptions.add('NEWLINE');
                return false;
            } else { // This is not a newline but we found one earlier
                break;
            }
            
            // Strip any whitespace and comments after newline
            WHITESPACE.lastIndex = inPos;
            const match = WHITESPACE.exec(inData);
            if (match) inPos += match[0].length;
        }

        for(;indentLevel < newIndent; indentLevel++) indentsPending += 'i';
        for(;indentLevel > newIndent; indentLevel--) indentsPending += 'd';

        if (debug) debugLog(`eat ${JSON.stringify(inData.substring(orgInPos, inPos))} as NEWLINE indentsPending=${indentsPending}`);
        progressInLineAndCol(orgInPos);
        inLastNewlinePos = inPos;

        return true;
    }

    function readIndent() {
        let saved;
        if (!indentsPending) {
            saved = getInState();
            if (!readNewline()) return false;
        }
        if (indentsPending && indentsPending[0] === 'i') {
            indentsPending = indentsPending.slice(1);
            if (debug) debugLog('eat INDENT');
            matchOptions.clear();
            return true;
        }
        restoreState(saved);
        matchOptions.add("INDENT");
        return false;
    }

    function readDedent() {
        let saved;
        if (!indentsPending) {
            saved = getInState();
            if (!readNewline()) return false;
        }
        if (indentsPending && indentsPending[0] === 'd') {
            indentsPending = indentsPending.slice(1);
            if (debug) debugLog('eat DEDENT');
            matchOptions.clear();
            return true;
        }
        restoreState(saved);
        matchOptions.add("DEDENT");
        return false;
    }

    function emitType(text: string | undefined) {
        if (!stripTypes) emit(text);
    }

    function emit(text: string | undefined | null, toMap=true) {
        if (!text) return;
        
        // Insert newlines to reach target line

        if (outTargetLine != null) {
            while (outLine < outTargetLine) {
                outData += '\n';
                outLine++;
                outCol = 1;
            }
        }

        const prevChar = outData.length ? outData[outData.length - 1] : ' ';

        if (outCol === 1 && outTargetCol != null && outTargetCol > 1 && outLine === outTargetLine) {
            outCol += outTargetCol - 1;
            outData += '\t'.repeat(outTargetCol - 1)
        } else {
            let spaceCount = prevChar.match(IS_WORD_CHAR) && text.match(START_WORD_CHAR) ? 1 : 0;

            if (whitespace === 'preserve') {
                if (outTargetCol != null && outLine === outTargetLine) spaceCount = Math.max(spaceCount, outTargetCol-outCol);
            } else {
                if (!spaceCount) {
                    const nextChar = text[0];
                    if ("[(.!".indexOf(prevChar) < 0 && "[](,;):.".indexOf(nextChar) < 0) spaceCount = 1;
                    else if (":=".indexOf(prevChar)>=0 && "([".indexOf(nextChar) >= 0) spaceCount = 1;
                }

            }

            if (spaceCount) {
                outCol += spaceCount;
                outData += ' '.repeat(spaceCount);
            }
        }
        // Clear targets - these will be set again by the next read()
        outTargetCol = outTargetLine = undefined;
        
        if (inOutMap && outTargetPos != null && toMap) {
            inOutMap.in.push(outTargetPos);
            inOutMap.out.push(outData.length);
            outTargetPos = undefined;
        }

        outData += text;
        outCol += text.length;

        return true;
    }

    /**
     * Calls func(), but doesn't modify output. If func() returns something truthy,
     * we return the output that would have been generated. Otherwise, we return undefined.
     */
    function eatType<T, A extends any[]>(func: (...args: A) => T, ...args: A): T;
    function eatType(what: (RegExp | string)): string | undefined;
    function eatType(...whats: (RegExp | string)[]): string[] | undefined;
    function eatType(...whats: any[]): string[] | string | undefined {
        if (typeof whats[0] === 'function') {
            const saved = stripTypes && getOutState();
            const result = whats[0](...whats.slice(1));
            restoreState(saved);
            return result;
        }
        const savedOutTargetLine = outTargetLine;
        if (stripTypes) outTargetLine == 0; // Prevent setting target line when this is being ignored.
        const result = stripTypes ? read(...whats) : eat(...whats);
        outTargetLine = savedOutTargetLine;
        return result;
    }

    function read(what: (RegExp | string)): string | undefined;
    function read(...whats: (RegExp | string)[]): string[] | undefined;
    function read(...whats: (RegExp | string)[]): string[] | string | undefined {
        let orgInPos = inPos;
        let results;
        if (whats.length > 1) results = [];

        for(let what of whats) {
            let result;
            if (indentsPending) {
                // We have indents/dedents pending, cannot eat anything else.
            } else if (typeof what === 'string') {
                // If the what matches exactly *and* (`what` ends with a non-alpha-num
                // char *or* the char that comes after `what` is non-alpha-num).
                if (inData.substr(inPos, what.length) === what && (
                    !what.slice(-1).match(ALPHA_NUM) ||
                    !inData.substr(inPos+what.length,1).match(ALPHA_NUM)
                )) result = what;
            } else if (what instanceof RegExp) {
                what.lastIndex = inPos;
                const match = what.exec(inData);
                if (match) result = match[0];
            } else {
                throw new Error(`Invalid argument to eat(): ${String(what)}`);
            }
            if (result === undefined) {
                inPos = orgInPos;
                matchOptions.add(whats.length===1 ? whats[0] : whats);
                return;
            }
            inPos += result.length;
            WHITESPACE.lastIndex = inPos;
            const match = WHITESPACE.exec(inData);
            if (match) inPos += match[0].length;

            if (results instanceof Array) results.push(result);
            else results = result;
        }

        if (debug) debugLog('read', toJson(results), 'as', typeof whats === 'string' ? whats : joinTokens(whats, ' + '));

        if (outTargetLine == null) {
            outTargetPos = orgInPos;
            outTargetLine = inLine;
            outTargetCol = inCol;
        }
        progressInLineAndCol(orgInPos);

        return results;
    }

    function progressInLineAndCol(orgInPos: number) {
        matchOptions.clear();
        
        const text = inData.substring(orgInPos, inPos);
        const lastNewline = text.lastIndexOf('\n');
        if (lastNewline >= 0) {
            inLine += text.split('\n').length - 1;
            inCol = text.length - lastNewline;
        } else {
            inCol += text.length;
        }
    }

    function peek(...whats: (RegExp | string)[]): any {
        const saved = getInState();
        const result = read(...whats);
        restoreState(saved);
        return result;
    }

    function eat(what: (RegExp | string)): string | undefined;
    function eat(...whats: (RegExp | string)[]): string[] | undefined;
    function eat(...whats: (RegExp | string)[]): string[] | string | undefined {
        const result = read(...whats);
        if (result === undefined) return;
        if (result instanceof Array) {
            for(const x of result) emit(x);
        } else {
            emit(result);
        }
        return result;
    }

    function getParseStack() {
        let m = Array(...((new Error().stack || '').matchAll(/\bat parse([A-Z][a-zA-Z]+).*?(:\d+)/g) || [])).map(i => i[1]+i[2]);
        return m.join(' <- ')
    }

    function debugLog(...args: string[]) {
        (typeof debug==='function' ? debug : console.debug)(inLine+':'+inCol, ...args, "parsing", getParseStack())
    }    
}

function toJson(v: any) {
    return JSON.stringify(v)
}

function joinTokens(tokens: {map: (callback: (value: any) => string) => string[]}, joinStr: string = '   '): string {
    return tokens.map(e => typeof e==='string' ? toJson(e) : e instanceof Array ? joinTokens(e, ' + '): e.toString() ).toSorted().join(joinStr);
}

/**
 * Alias for the {@link tabscript} function.
 * Transpiles TabScript code to TypeScript or JavaScript.
 */
export const transpile = tabscript;
