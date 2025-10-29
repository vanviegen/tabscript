export class ParseError extends Error {}

function descr(regexp: RegExp, name: string): RegExp {
    regexp.toString = () => '<'+name+'>';
    return regexp;
}

const
// Atoms
    WHITESPACE = descr(/(?:[ \t]|\/\/.*|\/\*[\s\S]*?\*\/)+/y, "whitespace"),
    IDENTIFIER = descr(/[a-zA-Z_$][0-9a-zA-Z_$]*/y, "identifier"),
    STRING = descr(/(['"])(?:(?=(\\?))\2.)*?\1/y, "string"),
    NUMBER = descr(/[+-]?(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/y, "number"),
    OPERATOR = descr(/instanceof\b|in\b|[!=]==|>>=?|<<=?|[+\-*\/%^!=<>]=|[+\-*\/%=<>]/y, "bin-op"),
    BACKTICK_STRING = descr(/[\s\S]*?(\${|`)/y, "`string`"),
    EXPRESSION_PREFIX = descr(/\+\+|--|!|~|\+|-|typeof\b|delete\b|await\b/y, "unary-op"),
    REGEXP = descr(/\/(\\.|[^\/])+\/[gimsuyd]*/y, "regexp"),    
// Other regexes
    ANYTHING = /[\s\S]/y,
    ALL_NOT_WHITESPACE = /\S/g,
    ALPHA_NUM = /^[a-zA-Z0-9]+$/;
    

export type Options = {
    debug?: boolean | ((...args: string[]) => void),
    recover?: boolean,
    stripTypes?: boolean,
    transformImport?: (uri: string) => string,
};

/**
 * Transpiles TabScript to TypeScript or JavaScript.
 * 
 * @param code The input TabScript.
 * @param options An optional object containing the following optional properties:
 *   - `debug` When `true`, each consumed token is logged to stdout. If it's a function, the same is logged to the function.
 *   - `recover` When `true`, the function will attempt to continue transpilation when it encounters an error in the input (or unsupported syntax), instead of throwing. Errors are logged to `console.error`.
 *   - 'stripTypes' When `true`, we'll transpile to JavaScript instead of TypeScript. Note that TabScript will not perform any type checking, just strip out the type info.
 *   - `transformImport` An async function that gets an `import` URI, and returns the URI to be include included in the transpiled output.
 * @returns The output JavaScript, if all went well.
 * @throws ParserError, if something went wrong.
 */
export function tabscript(code: string, {debug,recover,transformImport,stripTypes}: Options = {}): string {
    let pos = 0; // Current char in `code`
    let line = 1; // Line number for `pos`
    let col = 1; // Column for `pos`
    let out = ''; // The output we've created so far
    let skipping = 0; // When > 0, we're writing whitespace instead of actual output
    let peeking = 0; // When > 0, we're within `skip()` sneekily reading ahead (reverting all state when we're done)
    let attempting = 0; // When > 0, we within `attempt()`, meaning on error we have a fallback point for another parsing strategy
    let matchOptions: Set<RegExp | string | ParseError | (RegExp | string)[]> = new Set(); // The set of tokens we've tried and failed to match at this `pos`
    let statementOutStart = 0; // The length of `out` before we started working on a new statement (used by `wipestatement()`)
    let indentLevel = 0; // Changed by eatNewline
    let expectedIndent = 0; // Changed by eatIndent()/eatDedent()
    let lastNewlinePos = 0;
    let lastNewlineEndPos = 0;

    parseMain();
    return out;


    ///// Recursive decent parser functions /////

    function parseMain() {
        while(pos < code.length) must(recoverErrors(parseStatement, true));
    }

    function parseStatement() {
        // if (a==3) throw new Error();
        statementOutStart = out.length;

        if (parseTypeDecl() || parseExport() || parseEnum() || parseClass() ||
            parseReturn() || parseIfWhile() || parseThrow() || parseDoWhile() || parseFor() || parseImport() ||
            parseTry() || parseDeclare() || parseSwitch() || parseExpressionStatement() || eat(';')) return true;
        return false;
    }

    function parseExpressionStatement() {
        if (!parseExpressionSeq(null)) return false;
        must(eatNewline());
        return true;
    }

    function parseExport() {
        // export class X {];
        if (!eat('export')) return false;

        if (eat('default')) {
            must(parseExpression() || parseClass());
        } else {            
            must(parseExpression(true) || parseTypeDecl() || parseClass() || parseExpression() || parseLiteralObject());
        }
        must(eatNewline());
        return true;
    }

    function parseTypeDecl() {
        // type X = number | string;
        if (!skip('type')) return false;
        wipeStatement(); // remove 'export' if it was there
        must(skip(IDENTIFIER)); // var name
        skip(parseTemplateDef);
        if (skip('=')) must(skip(parseType));
        must(eatNewline());
        return true;
    }

    function parseEnum() {
        // enum Directions { Up, Down }
        if (!eat('enum')) return false;
        let identifier = must(eat(IDENTIFIER));

        const opts = {
            open: '{',
            close: '}',
            next: ',',
            jsOpen: `var ${identifier} = (function (${identifier}) {`,
            jsClose: `return ${identifier};})(${identifier} || {});`,
            allowImplicit: true,
        };
        let nextNum = 0;
        return must(parseGroup(opts, () => {
            const oldOutLen = out.length;
            let option = eat(IDENTIFIER);
            if (!option) return false;
            if (eat('=')) {
                nextNum = parseInt(must(eat(NUMBER)));
            }
            replaceOutput(oldOutLen, `${identifier}[(${identifier}["${option}"] = ${nextNum++})] = "${option}";`);
            return true;
        }));
    }
    
    function parseReturn() {
        // return 123;
        // yield 234;
        if (!eat('return') && !eat('yield')) return false;
        parseExpression();
        must(eatNewline());
        return true;
    }

    function parseIfWhile() {
        // if (go) launch(); else abort();
        const name = eat('if') || eat('while');
        if (!name) return false;
        must(parseExpression);
        must(parseBlock() || parseStatement());
        if (name==='if' && eat('else')) must(parseStatement);
        return true;
    }

    function parseThrow() {
        // throw Error();
        if(!eat('throw')) return false;
        must(parseExpression);
        must(eatNewline());
        return true;
    }

    function parseDoWhile() {
        // do { this() } while (that);
        if (!eat('do')) return false;
        must(parseStatement);
        must(eat('while'));
        must(eat('('));
        must(parseExpression);
        must(eat(')'));
        must(eatNewline());
        return true;
    }

    function parseFor() {
        // for(x:=0; x<10; x++) log(x);
        // for(x: of xs) {}
        // for x: of xs {}
        if (!eat('for')) return false;
        let brace = eat('(');
        const startPos = pos;
        if (peek(IDENTIFIER, ':')) {
            must(eat(IDENTIFIER));
            must(skip(':'));
            const keyword = skip(':') ? 'let ' : 'const ';
            out = out.substring(0, startPos) + keyword + out.substring(startPos);
            skip(parseType); // optional
            if (eat('=')) must(parseExpression);
        } else {
            parseExpressionSeq(); // may also be empty
        }
        if (eat('of') || eat('in')) {
            must(parseExpressionSeq());
        } else if (brace) {
            must(eat(';'))
            parseExpressionSeq(); // may also be empty
            must(eat(';'))
            parseExpressionSeq(); // may also be empty
        } else {
            must(false);
        }
        if (brace) must(eat(')'));
        must(parseStatement);
        return true;
    }

    function parseSwitch() {
        if (!eat('switch')) return false;
        must(parseExpression);
        let inCase = false;
        must(parseGroup({open: '{', close: '}', allowImplicit: true}, () => {
            if ((eat('case') && must(parseExpression)) || eat('default')) {
                must(eat(':'));
                inCase = true;
                return true;
            } else {
                return inCase && recoverErrors(parseStatement);
            }
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
        let stringStart = out.length;
        must(eat(STRING));
        if (transformImport) {
            let url = out.substring(stringStart+1, out.length-1);
            url = transformImport(url);
            replaceOutput(stringStart, '"'+url+'"');
        }
        must(eatNewline());
        return true;
    }

    function parseTry() {
        // try { something(); } catch(e: any) { log(e); } finally { log('done'); }
        if (!eat('try')) return;
        must(parseBlock);
        if (eat('catch')) {
            if (eat(IDENTIFIER)) {
                if (skip(':')) must(skip(parseType));
            }
            must(parseBlock);
        }
        if (eat('finally')) must(parseBlock);
        return true;
    }

    function parseDeclare() {
        // declare global { interface String { x(): void; }}
        if (!skip('declare')) return false;
        skip('enum');
        must(skip(IDENTIFIER));
        must(skip(parseBlock));
        return true;
    }

    function parseBlock() {
        // <indent> x=3 <newline> log(x) <newline> <dedent>
        return parseGroup({open: '{', close: '}', next: ';', allowImplicit: true}, () => recoverErrors(parseStatement, true));
    }

    function parseTemplateDef() {
        // <A, B extends number|string>
        if (skip('<')) {
            while(true) {
                must(skip(IDENTIFIER));
                if (skip('extends')) must(skip(parseType));
                if (!skip(',')) break;
            }
            must(skip('>'));
            return true;
        }
        return false;
    }

    function parseFuncParams(isConstructor=false) {
        let fields = "";
        // (public a, b?: string, c=3, ...d: any[])
        const opts = {
            open: '|',
            close: '|',
            next: ',',
            jsOpen: '(',
            jsClose: ')'
        };
        const isGroup = parseGroup(opts, () => {
            // ... cannot be combined with access modifiers
            if (eat('...')) must(eat(IDENTIFIER));
            else if (isConstructor && (skip('public') || skip('private') || skip('protected'))) {
                const name = must(eat(IDENTIFIER));
                fields += `this.${name}=${name};`
            }
            else if (!eat(IDENTIFIER)) return false;
            skip('?');
            if (skip(':')) must(skip(parseType));
            if (eat('=')) must(parseExpression);
            return true;
        });
        if (!isGroup) return false;
        return isConstructor && fields ? fields : true;
    }

    function parseFunction() {
        // |a,b| a+b
        // async |a,b| await a + await b
        // function |a,b| a+b
        // function test|a,b| a+b
        // <A,B>|a: A, b: B| as A|B a || b
        // async |a,b| <indent> await log(a) <newline> await log(b) <newline> <dedent>
        // => 3
        const mode = attempt(() => {
            eat('async');
            const mode = eat('function') ? 'function' : 'arrow';
            if (mode === 'function') eat(IDENTIFIER); // function name (optional)
            parseTemplateDef();
            if (!parseFuncParams()) must(false);
            return mode;
        });
        if (!mode) return false;

        if (stripTypes) skip('as') && must(skip(parseType));
        else eatReplace('as', ': ' ) && must(parseType());

        if (mode === 'arrow') replaceOutput(pos, '=>');

        // Is it a function implementation?

        if (parseBlock()) return true;
        const bodyPos = pos;
        if (parseExpression()) {
            if (mode === 'function') {
                replaceOutput(bodyPos, '{return ');
                out += '}';
            }
            return true;
        }

        // Nope. Let's hope it's an overload signature. This is all type info, so should be stripped.
        must(eatNewline());
        wipeStatement();
        return true;
    }

    function parseSequence() {
        // (3+4, test(), ()=>123)
        if (!eat('(')) return false;
        must(parseExpressionSeq);
        must(eat(')'));
        return true;
    }

    function parseExpressionSeq(isLeftHand: boolean|null=false) {
        // 3+4, test(), ()=>123
        if (!parseExpression(isLeftHand)) return false;
        while (eat(',')) must(parseExpression);
        return true;
    }

    function parseExpression(isLeftHand: boolean|null = false) {
        // (3+4+test()) / c!.cnt++ as any
        let required = false;
        if (isLeftHand !== true) {
            while(true) {
                if (!eat(EXPRESSION_PREFIX)) {
                    const oldPos = pos;
                    if (!eat('^', 'negate')) break;
                    replaceOutput(oldPos, '~');
                }
                required = true;
            }

            if (eat('new')) required = true;
        }
        
        // IDENTIFIER also covers things like `break` and `continue`
        const startPos = pos;
        if (isLeftHand !== true && (parseClass() || parseFunction())) {
            // We've successfully parsed a base expression
        } else if (eat(IDENTIFIER) || parseLiteralArray() || parseLiteralObject()) {
            // We've successfully parsed a base expression, but it might be a variable declaration
            if (isLeftHand !== false && !required && eat(':')) {
                // test : number = 3
                // {x,y} ::= obj
                // something::
                const keyword = eatReplace(':', '') ? 'let ' : 'const ';
                out = out.substring(0, startPos) + keyword + out.substring(startPos);
                skip(parseType); // optional
                if (eat('=')) {
                    must(parseExpression);
                }
                return true;
            }
        } else if (isLeftHand !== true && (eat(STRING) || parseBacktickString() || eat(NUMBER) || parseSequence() || eat(REGEXP))) {
            // We've successfully parsed a base expression
        } else {
            if (required) must(false);
            return false;
        }

        while(true) {
            let oldPos = pos;
            if (parseGroup({open: '(', close: ')', next: ','}, () => { // myFunc(a, b, ...rest)
                if (eat('...')) return must(parseExpression);
                else return parseExpression();
            })) {}
            else if (eat('..')) {
                // func.. <indent> arg1 <newline> arg2 <newline> <dedent>
                if (!parseGroup({jsOpen: '(', jsClose: ')', jsNext: ','}, parseExpression)) {
                    // func.. arg1 arg2
                    out += '(';
                    while(parseExpression()) {
                        out += ',';
                    }
                    out += ')';
                    // TODO: reduce whitespace (elsewhere) to match columns
                }
            }
            else if (peek('`')) parseBacktickString(); // template function call
            else if (peek('[')) parseIndex();
            else if (eat('++') || eat('--')) {}
            else if (skip('as')) must(skip(parseType));
            else if (eat('?.')) must(eat(IDENTIFIER) || parseIndex());
            else if (eat('.')) must(eat(IDENTIFIER));
            else if (peek('<') && parseTemplateArg()) {}
            else if (eat('or')) {
                replaceOutput(oldPos, '||');
                must(parseExpression());
            }
            else if (eat('and')) {
                replaceOutput(oldPos, '&&');
                must(parseExpression());
            }
            else if (eat('^')) {
                let target = eat('or') ? '|' : eat('and') ? '&' : eat('xor') ? '^' : eat('left') ? '<<' : eat('right') ? '>>' : null;
                if (!target) throw new ParseError("Invalid bitwise operator");
                replaceOutput(oldPos, target);
                must(parseExpression);
                return true;
            }
            else if (eat(OPERATOR)) {
                must(parseExpression);
                return true;
            }
            else if (skip('!')) {}
            else break;
        }

        if (eat('?')) {
            must(parseExpression);
            must(eat(':'));
            must(parseExpression);
        }
        return true;
    }

    function parseBacktickString() {
        // `The answer: ${3+4}.. ${`test`}`
        if (!eat('`')) return false;
        while(true) {
            let m = must(eat(BACKTICK_STRING));
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
            if (eat('...')) must(parseExpression);
            else {
                eat('*'); // generator support
                if (eat('[')) {
                    must(parseExpression);
                    must(eat(']'));
                }
                else {
                    if (!eat(IDENTIFIER) && !eat(NUMBER) && !eat(STRING) && !parseBacktickString) return false;
                }
                if ((parseTemplateDef() && must(parseFuncParams())) || parseFuncParams()) {
                    // it's a function shortcut
                    if (skip(':')) {
                        skip(parseType);
                    }
                    must(parseBlock());
                } else {
                    if (eat(':')) must(parseExpression);
                    // else it's a {shortcut}
                }
            }
            return true;
        });
    }

    function parseTemplateArg() {
        // <T,A>
        // What's hard here is making the distinction between a template argument and < comparison.
        // (3+4)<test | sdf>(x); // template type
        // (3+4)<test | sdf>x; // comparison
        return attempt(() => {
            if (!skip('<')) return false;
            must(skip(parseType));
            while(skip(',')) must(skip(parseType));
            must(skip('>'));
            // Look ahead to see if we have a template argument or a comparison
            if (peek('.') || peek('(') || attempt(eatNewline)) return true;
            // Based on the next token, this doesn't look like a template argument.
            // Comparisons perhaps then?
            return false;
        });
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
        let required = false;
        if (eat('typeof')) return must(parseExpression);
        if (eat('keyof')) required = true;
        if (eat(IDENTIFIER)) { // includes: true,false,undefined,null
            parseGroup({open: '<', close: '>', next: ','}, parseType); // template args
        }
        else if (parseGroup({open: '{', close: '}', next: ',', allowImplicit: true}, parseTypeObjectEntry)) {} // object
        else if (parseGroup({open: '[', close: ']', next: ','}, parseType)) {} // array
        else if (allowFunction && attempt(parseFuncParams)) {
            must(eat(':'));
            must(parseType);
            return true;
        }
        else if (eat('(')) { // subtype surrounded by parentheses
            must(parseType);
            must(eat(')'));
        }
        else if (!eat(NUMBER) && !eat(STRING)) {
            if (required) must(false);
            return false;
        }
        while (eat('[')) {
            parseType(); // If present: indexing a type, otherwise indicating an array
            must(eat(']'));
        }
        while (true) {
            if (eatReplace('or', '|') || eatReplace('and', '&')) {
                must(parseType(false));
            } else {
                break;
            }
        }
        if (eat('extends')) {
            // conditional type
            must(parseType);
            must(eat('?'));
            must(parseType);
            must(eat(':'));
            must(parseType);
        }
        return true;
    }

    function parseTypeObjectEntry() {
        if (eat('[')) {
            must(eat(IDENTIFIER));
            must(eat(':'));
            must(parseType);
            must(eat(']'))
        }
        else if (!eat(IDENTIFIER) && !eat(NUMBER) && !eat(STRING)) return false;
        must(eat(':'));
        must(parseType);
        return true;
    }

    function parseClass() {
        // abstract class X { public val: number = 3; get lala() { return 3; } }
        // interface Y {}
        let isInterface = false;
        if (skip('abstract')){
            must(eat("class"));
        } else {
            if (skip('interface')) {
                isInterface = true;
                wipeStatement(); // remove any 'export'
                skipping++;
            } else if (!eat("class")) {
                return false;
            }
        }
        eat(IDENTIFIER);
        parseTemplateDef();
        if (eat('extends')) must(parseExpression());
        while (skip('implements')) must(skip(parseType));

        must(parseGroup({open: '{', close: '}', next: ';', allowImplicit: true}, () => {
            return recoverErrors(() => parseMethod(isInterface), true);
        }));
        if (isInterface) skipping--;
        return true;
    }

    function parseMethod(isAbstract: boolean = false) {
        // static public val: number = 3;
        // abstract myMethod(a: number);
        // constructor(public x) {}
        // get lala() { return 3; }
        // static { log('init'); }
        statementOutStart = out.length;
        isAbstract ||= !!skip('abstract');
        skip('public') || skip('private') || skip('protected');
        isAbstract ||= !!skip('abstract');
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
                if (out.length !== statementOutStart) {
                    // We've already consumed some modifiers.. identifier was a must.
                    must(false);
                }
                return false;
            }
        }

        if (!peek('<') && !peek('(')) {
            // It's an attribute
            if (skip(':')) must(skip(parseType));
            if (eat('=')) must(parseExpression);
            must(eatNewline());
            return true;
        }

        // It's a method
        skip(parseTemplateDef);
        let initFields = must(parseFuncParams(name==='constructor'));
        if (skip(':')) must(skip(parseType));

        if (isAbstract || !eat('{')) {
            // An overload signature / abstract method
            must(eatNewline());
            wipeStatement();
            return true;
        }

        if (typeof initFields !== 'string') {
            while(!eat('}')) must(recoverErrors(parseStatement));
            return true;
        }
        
        // Add the `this.arg = arg;` statements at the start of the constructor body
        if (attempt(() => {
            // Add the initFields at the start of the body
            replaceOutput(out.length, initFields);
            while(!eat('}')) {
                if (peek('super', '(')) return false; // Fail the attempt!
                must(recoverErrors(parseStatement));
            }
            return true;
        })) return true;

        // If the above encountered super(), add initFields after super() call.
        while(!eat('}')) {
            let isSuper = peek('super', '(');
            must(recoverErrors(parseStatement));
            if (isSuper) replaceOutput(out.length, initFields);
        }
        return true;
    }

    ///// Helper functions /////

    function replaceOutput(outPos: number, text: string) {
        let replacedText = out.substring(outPos)
        let replacedLines = replacedText.split("\n");
        let replacedLineCount = replacedLines.length - 1;

        let textLineCount = text.split("\n").length - 1;
        if (textLineCount > replacedLineCount) throw new Error("Invalid replaceOutput");

        out = out.substring(0, outPos) + text;

        // Preserve the appropriate amount of newlines:
        out += "\n".repeat(replacedLineCount - textLineCount);

        // Preserve any indent on the last line we replaced:
        let lastReplacedLine = replacedLines[replacedLines.length-1];
        if (lastReplacedLine.trim() === '') out += lastReplacedLine;

        if (debug) debugLog('replace output', toJson(replacedText), "by", toJson(out.substr(outPos)));
    }

    function must<T extends string | true>(result: T | undefined | false | (() => T | undefined | false)): T {
        if (typeof result === 'function') result = result();
        if (result) return result;
        let stack = new Error().stack || '';
        let m = /\bat parse([A-Z][a-zA-Z]*)/.exec(stack) || ['', 'top-level'];

        let expect: any = [];
        let attempts: string[] = [];
        for (let m of matchOptions) {
            if (m instanceof ParseError) attempts.push(m.message);
            else if (m instanceof Array) expect.push(joinTokens(m, ' + '));
            else expect.push(m);
        }

        const got = expectedIndent < indentLevel ? "INDENT" : expectedIndent > indentLevel ? "DEDENT" : toJson(code.substr(pos,24));
        let error = new ParseError(`Could not parse ${m[1]} at ${line}:${col}, got ${got}, expected one of:   ${joinTokens(expect, '   ')}`);
        if (attempts.length) (error as any).attempts = attempts;
        throw error;
    }

    function recoverErrors(func: () => any, required=false) {
        if (attempting || !recover) return func();
        let startPos = pos;
        let startIndentLevel = indentLevel;
        try {
            const res = func();
            if (required && startPos === pos) must(false);
            return res;
        } catch(e) {
            if (!(e instanceof ParseError)) throw e;
            console.error(e);
            console.error('Attempting to recover...')

            while(pos < code.length) {
                if (eatNewline() && indentLevel <= startIndentLevel) break;
                must(eat(IDENTIFIER) || eat(STRING) || eat(ANYTHING));
            }

            // We fake success if at least *something* was read.
            return (pos > startPos);
        }
    }

    function attempt<T>(func: () => T): T | false {
        let saved = {pos, line, col, out, matchOptions, currentIndent: indentLevel, expectedIndent, lastNewlinePos};
        matchOptions = new Set();
        attempting++;
        try {
            let result = func();
            if (result) return result;
            if (pos === saved.pos && out===saved.out) return false; // no need to revert
            must(false);
        } catch (e) {
            if (!(e instanceof ParseError)) throw e;
            saved.matchOptions.add(e);
        }
        finally {
            attempting--;
        }
        pos = saved.pos;
        line = saved.line;
        col = saved.col;
        out = saved.out;
        matchOptions = saved.matchOptions;
        indentLevel = saved.currentIndent;
        expectedIndent = saved.expectedIndent;
        lastNewlinePos = saved.lastNewlinePos;
        if (debug) debugLog('reverted attempt');
        return false;
    }

    function wipeStatement() {
        const orgText = out.substr(statementOutStart);
        const newText = orgText.replace(ALL_NOT_WHITESPACE, ' ');
        if (orgText !== newText) {
            if (debug) debugLog('wipe output', toJson(orgText));
            out = out.substr(0, statementOutStart) + newText;
        }
    }

    function skip(func: () => string | boolean | undefined): any;
    function skip(...whats: (RegExp | string)[]): any;
    function skip(...whats: any[]) {
        skipping++;
        const result = whats.length===1 && typeof whats[0] === 'function' ? whats[0]() : eat(...whats);
        skipping--;
        return result;
    }

    function peek(...whats: (RegExp | string)[]): any {
        peeking++;
        const result = eat(...whats);
        peeking--;
        return result;
    }

    interface ParseGroupOpts {
        open?: string;
        close?: string;
        next?: string;
        jsOpen?: string;
        jsClose?: string;
        jsNext?: string;
        allowImplicit?: boolean;
            // true: allow <indent><dedent>
            // false: allow <open>(<indent><dedent>)?<close>
    }

    function parseGroup(opts: ParseGroupOpts, itemFunc: () => boolean) {
        const jsOpen = opts.jsOpen != null ? opts.jsOpen : opts.open;
        const jsClose = opts.jsClose != null ? opts.jsClose : opts.close;
        const jsNext = opts.jsNext != null ? opts.jsNext : opts.next;

        const literalOpen = opts.open && eatReplace(opts.open, jsOpen);
        if (!literalOpen && !opts.allowImplicit) return false;

        const indentOpen = eatNewline(true);
        if (!literalOpen) {
            if (!indentOpen) return false;
            // We still need to insert jsOpen
            if (jsOpen) insertAfterLastNewline(jsOpen);
        }

        while(true) {
            if (!itemFunc()) break;
            if (opts.next && eatReplace(opts.next, jsNext)) {
                if (indentOpen) must(eatNewline());
            } else if (indentOpen && eatNewline()) {
                // Insert separator
                if (jsNext) insertAfterLastNewline(jsNext);
            } else {
                break; // last separator is optional
            }
        }

        if (indentOpen) must(eatDedent());
        if (literalOpen && opts.close) must(eatReplace(opts.close, jsClose));
        else if (jsClose) insertAfterLastNewline(jsClose);

        return true;
    }

    function insertAfterLastNewline(text: string) {
        out = out.substring(0, lastNewlinePos) + text + out.substring(lastNewlinePos);
        lastNewlinePos += text.length;
    }

    function eatNewline(withIndent: boolean = false) {
        console.log('eatNewline', {withIndent, indentLevel, expectedIndent, repeat: lastNewlineEndPos==pos});
        if (lastNewlineEndPos === pos) return true;
        if (expectedIndent !== indentLevel) {
            matchOptions.add('NEWLINE');
            return false;
        }
        // We're looping to filter out empty lines or lines with just comments
        let result;
        const orgPos = pos;
        while(true) {
            const savedPos = pos;
            if (pos < code.length && code[pos] === '\r') pos++;
            if (pos >= code.length) { // end-of-file counts as newline
                result = {pos: savedPos, level: 0};
                break;
            }
            if (code[pos] !== '\n') {
                pos = savedPos;
                break;
            }
            pos++;
            
            // Strip any whitespace and comments after newline
            WHITESPACE.lastIndex = pos;
            let whitespace = (WHITESPACE.exec(code) || [""])[0];
            pos += whitespace.length;
            
            // Count tabs after newline
            let level = 0;
            for(level=0; level<whitespace.length && whitespace[level] === '\t'; level++) {}
            result = {pos: savedPos, level};
        }

        if (!result) {
            matchOptions.add('NEWLINE');
            return false;
        }
        if (withIndent) {
            if (result.level <= indentLevel) {
                pos = orgPos;
                matchOptions.add('INDENT');
                return false;
            }
            expectedIndent++;
        }


        indentLevel = result.level;
        lastNewlinePos = result.pos;
        lastNewlineEndPos = pos;

        eat('.'); // The dot is ignored. It can be used for dedenting and subsequent indenting

        const text = code.substring(orgPos, pos);
        out += text;
        progressLineAndCol(text);


        return true;
    }

    function eatDedent() {
        console.log('eatDedent', {indentLevel, expectedIndent});
        if (expectedIndent > indentLevel) {
            expectedIndent--;
            matchOptions.clear();
            return true;
        }
        matchOptions.add("DEDENT");
        return false;
    }

    function eatReplace(what: RegExp | string | (() => boolean), by: string | undefined | null) {
        const savedPos = pos;
        const result = (typeof what === 'function') ? what() : eat(what);
        if (result && by != null && what !== by) replaceOutput(savedPos, by);
        return result;
    }

    function eat(...whats: (RegExp | string)[]): string | undefined {
        let savedPos = pos;
        let result;
        for(let what of whats) {
            result = undefined;
            if (indentLevel != expectedIndent) {
                // We have indents/dedents pending, cannot eat anything else.
            } else if (typeof what === 'string') {
                // If the what matches exactly *and* (`what` ends with a non-alpha-num
                // char *or* the char that comes after `what` is non-alpha-num).
                if (code.substr(pos, what.length) === what && (
                    !what.slice(-1).match(ALPHA_NUM) ||
                    !code.substr(pos+what.length,1).match(ALPHA_NUM)
                )) result = what;
            } else if (what instanceof RegExp) {
                what.lastIndex = pos;
                const match = what.exec(code);
                if (match) result = match[0];
            } else {
                throw new Error(`Invalid argument to eat(): ${String(what)}`);
            }
            if (result === undefined) {
                pos = savedPos;
                matchOptions.add(whats.length===1 ? whats[0] : whats);
                return;
            }
            pos += result.length;
            WHITESPACE.lastIndex = pos;
            let whitespace = (WHITESPACE.exec(code) || [""])[0];
            pos += whitespace.length;
        }

        if (peeking) {
            pos = savedPos;
            return result;
        }

        const matched = code.substring(savedPos, pos);
        matchOptions.clear();

        if (debug) debugLog(skipping ? 'skip' : 'eat', toJson(matched), 'as', joinTokens(whats, ' + '));

        progressLineAndCol(matched);
        if (skipping) out += matched.replace(ALL_NOT_WHITESPACE, ' ');
        else out += matched;

        return result;
    }

    function progressLineAndCol(text: string) {
        const lastNewline = text.lastIndexOf('\n');
        if (lastNewline >= 0) {
            line += text.split('\n').length - 1;
            col = text.length - lastNewline;
        } else {
            col += text.length;
        }
    }

    function getParseStack() {
        let m = Array(...((new Error().stack || '').matchAll(/\bat parse([A-Z][a-zA-Z]+).*?(:\d+)/g) || [])).map(i => i[1]+i[2]);
        return m.join(' <- ')
    }

    function debugLog(...args: string[]) {
        (typeof debug==='function' ? debug : console.debug)(line+':'+col, ...args, "parsing", getParseStack())
    }    
}

function toJson(v: any) {
    return JSON.stringify(v)
}

function joinTokens(tokens: any[], joinStr: string) {
    return tokens.map(e => typeof e==='string' ? toJson(e) : e.toString() ).toSorted().join(joinStr);
}