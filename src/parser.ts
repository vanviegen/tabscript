/**
 * Parser module for TabScript transpiler.
 * Contains the Parser class with all parsing methods.
 * 
 * @module parser
 */

import { State, ParseGroupOpts, ParseError, pattern } from './state.js';
import type { Options, PluginModule } from './tabscript.js';

/**
 * TabScript language version supported by this transpiler.
 * Code must have same major version and minor version <= this.
 */
const VERSION = { major: 1, minor: 0 };

/**
 * Signature for parser methods that can be extended by plugins.
 * Methods must return truthy on success, falsy on failure.
 * On failure, the state must be left unchanged.
 */
export type ParserMethod = (this: Parser, s: State, ...args: any[]) => boolean | string;





function descr(regexp: RegExp, name: string): RegExp {
    regexp.toString = () => '<' + name + '>';
    return regexp;
}

// Token patterns
const IDENTIFIER = descr(/[a-zA-Z_$][0-9a-zA-Z_$]*/y, "identifier");
const STRING = descr(/(['"])(?:(?=(\\?))\2.)*?\1/y, "string");
const NUMBER = descr(/[+-]?(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/y, "number");
const OPERATOR = descr(/instanceof\b|in\b|or\b|and\b|[!=]~|[+\-*\/!=<>]=|[+\-*\/=<>]|%[a-z_]+/y, "bin-op");
const WITHIN_BACKTICK_STRING = descr(/[\s\S]*?(\${|`)/y, "`string`");
const EXPRESSION_PREFIX = descr(/\+\+|--|!|\+|-|typeof\b|delete\b|await\b|new\b/y, "unary-op");
const REGEXP = descr(/\/(\\.|[^\/])+\/[gimsuyd]*/y, "regexp");
const INTEGER = descr(/\d+/y, "integer");
const PATH = descr(/[^\s()]+/y, "path");
        


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
 * TabScript parser implementing recursive descent parsing.
 * 
 * All `parse*` methods follow a contract:
 * - Return truthy on success, falsy on failure
 * - On failure, leave the state unchanged
 * 
 * Plugins can modify `parse*` methods directly on the Parser instance.
 */
export class Parser {
    constructor(public options: Options) {
    }

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
    pattern(regexp: RegExp, name: string): RegExp {
        return pattern(regexp, name);
    }

    /**
     * Parse function parameters.
     * @example `|a, b: number, c = 3|` or `(a, b: number, c = 3)`
     */
    parseFuncParams(s: State, isConstructor = false, parenthesis = false): boolean | string {
        let propArgs = "";
        const opts: ParseGroupOpts = {
            open: parenthesis ? '(' : '|',
            close: parenthesis ? ')' : '|',
            next: ',',
            jsOpen: '(',
            jsClose: ')'
        };
        const isGroup = s.parseGroup(opts, () => {
            if (s.accept('...')) s.must(s.accept(IDENTIFIER));
            else if (isConstructor && (s.acceptType('public') || s.acceptType('private') || s.acceptType('protected')) && this.options.js) {
                const name = s.must(s.accept(IDENTIFIER));
                propArgs += `this.${name}=${name};`;
            }
            else if (!s.accept(IDENTIFIER)) return false;
            s.acceptType('?');
            if (s.acceptType(':')) s.must(this.parseType(s));
            if (s.accept('=')) s.must(this.parseExpression(s));
            return true;
        });
        if (!isGroup) return false;
        return isConstructor && propArgs ? propArgs : true;
    }

    /**
     * Parse a function definition.
     * @example `|x| x * 2` or `async |x| await fetch(x)` or `function foo|x| x * 2`
     */
    parseFunction(s: State, declaration = false): boolean {
        let snap = this.options.js ? s.snapshot() : undefined;

        const isAsync = s.accept('async');
        const isClassic = s.accept('function');
        if (isClassic) {
            s.accept('*');
            s.accept(IDENTIFIER);
        } else if (declaration) {
            if (isAsync) return false;
            return false;
        }
        const hasTemplate = !!this.parseTemplateDef(s);

        if (isClassic) {
            this.parseFuncParams(s, false, false) || this.parseFuncParams(s, false, true) || s.emit('()');
        } else if (isAsync || hasTemplate) {
            s.must(this.parseFuncParams(s, false, false));
        } else if (!this.parseFuncParams(s, false, false)) {
            return false;
        }

        this.parseFuncType(s);

        if (!isClassic) {
            snap = this.options.js ? s.snapshot() : undefined;
            s.emit('=>');
        }

        if (this.parseBlock(s)) return true;

        if (isClassic ? this.parseClassicFuncExprBody(s) : this.parseArrowFuncExprBody(s)) return true;

        // No body - overload signature. This is type info, so should be stripped.
        s.must(declaration);
        s.emit(';');
        if (snap) snap.revertOutput();
        return true;
    }

    /**
     * Parse a variable declaration.
     * @example `x := 5` (const) or `x ::= 5` (let) or `x: number := 5` (with type)
     */
    parseVarDecl(s: State, allowInit = true): boolean {
        const match = s.read(IDENTIFIER, ':');
        if (!match) return false;
        s.emit(true, s.read(':') ? 'let' : 'const', match[0]);

        const snap = s.snapshot();
        if (!this.options.js) s.emit(':');
        if (!this.parseType(s)) snap.revertOutput();

        if (allowInit && s.accept('=')) {
            s.must(this.parseExpression(s));
        }
        return true;
    }

    /**
     * Parse an expression.
     * @example `x + 1` or `foo(bar)` or `obj.method.. arg1 arg2`
     */
    parseExpression(s: State, withinTag = false): boolean {
        let required = false;
        while (true) {
            if (!s.accept(EXPRESSION_PREFIX)) {
                if (!s.read('%bit_not')) break;
                s.emit('~');
            }
            required = true;
        }

        if (this.parseClass(s) || this.parseFunction(s, false) || s.accept(IDENTIFIER) || this.parseLiteralArray(s) || this.parseLiteralObject(s) || s.accept(STRING) || this.parseBacktickString(s) || s.accept(NUMBER) || this.parseParenthesised(s) || s.accept(REGEXP)) {}
        else if (required) s.must(false);
        else return false;

        let tmp: string | undefined;
        while (!s.justAfterNewLine()) {
            const lastNotSpace = s.lastNotSpace();
            // Function call '(' may not be preceded by whitespace (to distinguish from `myFunc.. a (3+4)` syntax)
            if (lastNotSpace && s.parseGroup({ open: '(', close: ')', next: ',' }, () => {
                if (s.accept('...')) return !!s.must(this.parseExpression(s));
                else return !!this.parseExpression(s);
            })) {}
            else if (s.read('..')) {
                if (!s.parseGroup({ jsOpen: '(', jsClose: ')', jsNext: ',', allowImplicit: true, endNext: false }, () => !!this.parseExpression(s))) {
                    // func.. arg1 arg2  (no indent, space-separated args)
                    s.emit('(');
                    let snap: ReturnType<typeof s.snapshot> | undefined;
                    while (this.parseExpression(s)) {
                        while (s.accept(',')) s.must(this.parseExpression(s));
                        snap = s.snapshot();
                        s.emit(',');
                    }
                    if (snap) snap.revertOutput();
                    s.emit(')');
                }
            }
            else if (s.peek('`')) s.must(this.parseBacktickString(s));
            else if (s.peek('[')) s.must(this.parseIndex(s));
            else if (s.accept('++') || s.accept('--')) {}
            else if (s.acceptType('as')) s.must(this.parseType(s));
            else if (s.accept('?.')) s.must(s.accept(IDENTIFIER) || this.parseIndex(s));
            else if (s.accept('.')) s.must(s.accept(IDENTIFIER));
            else if (lastNotSpace && this.parseTemplateArg(s)) {}
            else if (withinTag && s.peek('>')) return true;
            else if (tmp = s.read(OPERATOR)) {
                s.must(tmp[0] !== '%' || (tmp in REPLACE_OPERATORS));
                s.emit(REPLACE_OPERATORS[tmp] || tmp);
                s.accept('=');
                s.must(this.parseExpression(s, withinTag));
                return true;
            }
            else if (s.acceptType('!')) {}
            else break;
        }

        if (s.read('?')) {
            const snap = s.snapshot();
            s.emit('?');
            if (this.parseExpression(s)) {
                // a ? b : c - ternary
                s.must(s.accept(':'));
                s.must(this.parseExpression(s));
            } else {
                // a? - nullish check
                snap.revertOutput();
                s.emit('!=null');
            }
        }
        return true;
    }

    /**
     * Parse a type annotation.
     * @example `number` or `string[]` or `{x: number, y: string}` or `Foo<Bar>`
     */
    parseType(s: State, allowFunction = true): boolean {
        if (s.peek('in') || s.peek('of')) return false;
        if (s.acceptType('typeof')) {
            s.must(s.acceptType(() => this.parseExpression(s)));
            return true;
        }

        let required = false;
        if (s.acceptType('keyof')) required = true;

        if (s.acceptType(IDENTIFIER)) {
            s.acceptType(() => s.parseGroup({ open: '<', close: '>', next: ',' }, () => !!this.parseType(s)));
        }
        else if (s.acceptType(() => s.parseGroup({ open: '{', close: '}', next: ',', allowImplicit: true }, () => !!this.parseTypeObjectEntry(s)))) {}
        else if (s.acceptType(() => s.parseGroup({ open: '[', close: ']', next: ',' }, () => !!this.parseType(s)))) {}
        else if (allowFunction && s.acceptType(() => this.parseFuncParams(s, false, false))) {
            if (s.read(':')) {
                if (!this.options.js) s.emit('=>');
                s.must(this.parseType(s));
            }
            return true;
        }
        else if (s.acceptType('(')) {
            s.must(this.parseType(s));
            s.must(s.acceptType(')'));
        }
        else if (!s.acceptType(NUMBER) && !s.acceptType(STRING)) {
            if (required) s.must(false);
            return false;
        }

        while (s.acceptType('[')) {
            this.parseType(s);
            s.must(s.acceptType(']'));
        }

        while (true) {
            if (s.acceptType(() => !!s.read('or'))) { if (!this.options.js) s.emit('|'); }
            else if (s.acceptType(() => !!s.read('and'))) { if (!this.options.js) s.emit('&'); }
            else if (s.acceptType('is')) {}
            else break;
            s.must(this.parseType(s, false));
        }

        if (s.accept('extends')) {
            s.must(this.parseType(s));
            s.must(s.acceptType('?'));
            s.must(this.parseType(s));
            s.must(s.acceptType(':'));
            s.must(this.parseType(s));
        }
        return true;
    }

    /**
     * Parse a class method or property.
     * @example `myMethod|x| x * 2` or `static count := 0` or `get name|| this._name`
     */
    parseMethod(s: State, typeOnly = false, isDerived = false): boolean {
        const initSnap = s.snapshot();

        typeOnly = typeOnly || !!s.acceptType('abstract');
        s.acceptType('public') || s.acceptType('private') || s.acceptType('protected');
        typeOnly = typeOnly || !!s.acceptType('abstract');

        const snap = this.options.js && typeOnly ? s.snapshot() : undefined;

        (s.peek('get', IDENTIFIER) && s.accept('get')) || (s.peek('set', IDENTIFIER) && s.accept('set'));
        if (s.accept('static')) {
            if (this.parseBlock(s)) return true;
        }
        s.accept('async');
        s.accept('*');

        const name = s.accept(IDENTIFIER);
        if (!name) {
            if (s.accept('[')) {
                s.must(this.parseExpression(s));
                s.must(s.accept(']'));
            } else {
                if (initSnap.hasOutput()) s.must(false);
                return false;
            }
        }

        if (!s.peek('<') && !s.peek('|')) {
            if (s.acceptType(':')) s.must(this.parseType(s));
            if (s.accept('=')) s.must(this.parseExpression(s));
            // Don't revert snap - this is an attribute, not a method signature
            return true;
        }

        this.parseTemplateDef(s);
        const isConstructor = (name === 'constructor');
        const propArgs = s.must(this.parseFuncParams(s, isConstructor, false));

        this.parseFuncType(s);

        if (typeOnly) {
            // Revert to discard the abstract method signature
            if (snap) snap.revertOutput();
            return true;
        }

        if (typeof propArgs !== 'string') {
            if (this.parseBlock(s)) return true;
        } else {
            const opts: ParseGroupOpts = { jsOpen: '{', jsClose: '}', next: ';', jsNext: null, allowImplicit: true };
            let done = false;
            if (s.parseGroup(opts, () => {
                if (!done && (!isDerived || (s.peek('super', '(') && s.must(this.parseStatement(s))))) {
                    s.emit(propArgs);
                    done = true;
                }
                return !!s.recoverErrors(() => this.parseStatement(s));
            })) return true;
        }

        const bodySnap = s.snapshot();
        s.emit('{');
        if (s.peek('super', '(')) {
            if (typeof propArgs === 'string') s.emit(propArgs);
        } else {
            s.emit('return');
        }
        if (this.parseExpression(s)) {
            s.emit('}');
            return true;
        }
        bodySnap.revert();

        if (!this.options.js) s.emit(';');
        // Don't apply typeOutCapture - overload signature
        return true;
    }

    /**
     * Parse a class or interface definition.
     * @example `class Foo extends Bar` or `interface IFoo` or `abstract class Base`
     */
    parseClass(s: State): boolean {
        let isInterface = false;
        // For interfaces in js mode, save output state to discard the whole interface
        const snap = this.options.js && s.peek('interface') ? s.snapshot() : undefined;
        
        if (s.acceptType('abstract')) {
            s.must(s.accept("class"));
        } else {
            if (s.acceptType('interface')) {
                isInterface = true;
            } else if (!s.accept("class")) {
                return false;
            }
        }
        s.accept(IDENTIFIER);
        this.parseTemplateDef(s);
        const isDerived = !!s.accept('extends');
        if (isDerived) s.must(this.parseExpression(s));
        while (s.acceptType('implements')) s.must(this.parseType(s));

        s.must(s.parseGroup({ jsOpen: '{', jsClose: '}', next: ';', jsNext: null, allowImplicit: true }, () => {
            return !!s.recoverErrors(() => this.parseMethod(s, isInterface, isDerived));
        }));
        // Discard interface output in js mode
        if (snap) snap.revertOutput();
        return true;
    }

    // The actual Parsers object with standard signatures

    /**
     * Parse the main entry point - processes header and all statements.
     */
    parseMain(s: State): boolean {
        if (this.options.js) s.emit('"use strict";');

        // Parse header and load plugins first
        this.parseHeader(s);

        while (s.hasMore()) {
            s.recoverErrors(() => {
                s.must(this.parseStatement(s)) && s.must(s.readNewline());
            });
        }
        return true;
    }

    /**
     * Parse the TabScript header line.
     * Header format: tabscript X.Y
     */
    parseHeader(s: State): boolean {
        // Parse: tabscript X.Y
        s.must(s.read('tabscript'));
        const major = parseInt(s.must(s.read(INTEGER)));
        s.must(s.read('.'));
        const minor = parseInt(s.must(s.read(INTEGER)));

        if (major !== VERSION.major || minor > VERSION.minor) {
            throw new ParseError(0, 1, 1,
                `Script version ${major}.${minor} outside supported range (${VERSION.major}.0 - ${VERSION.major}.${VERSION.minor})`);
        }

        // Consume newline at end of header
        s.must(s.readNewline());

        // Clear target position so next statement gets correct line mapping
        s.clearTargetPos();

        return true;
    }

    /**
     * Parse a single statement.
     * @example `x := 5` or `if condition` or `for item: of items` or `return value`
     */
    parseStatement(s: State): boolean | string {
        const snap = s.snapshot();
        
        if (this.parseReturn(s) || this.parseThrow(s) || this.parseTypeDecl(s) || this.parseExport(s) || this.parseImport(s) || this.parseDoWhile(s)) {}
        else if (this.parseIfWhile(s) || this.parseFor(s) || this.parseTry(s) || this.parseFunction(s, true) || this.parseClass(s) || this.parseSwitch(s) || this.parseEnum(s) || this.parseDeclare(s)) {
            return true;
        }
        else if (this.parseVarDecl(s) || this.parseExpressionSeq(s)) {}
        else {
            return false;
        }
        
        if (snap.hasOutput()) s.emit(';'); // Could be false when only type info was emitted
        return true;
    }

    parseExport(s: State): boolean {
        if (!s.peek('export')) return false;

        if (s.peek('export', 'type')) {
            s.must(s.acceptType('export'));
            s.must(this.parseTypeDecl(s));
            return true;
        }
        if (s.peek('export', 'interface')) {
            s.must(s.acceptType('export'));
            s.must(this.parseClass(s));
            return true;
        }
        if (!s.accept('export')) return false;

        if (s.accept('default')) {
            s.must(this.parseExpression(s) || this.parseClass(s));
        } else {
            s.must(this.parseVarDecl(s) || this.parseClass(s) || this.parseLiteralObject(s) || this.parseFunction(s, true));
        }
        return true;
    }

    parseTypeDecl(s: State): boolean {
        if (!s.acceptType('type')) return false;
        s.must(s.acceptType(IDENTIFIER));
        this.parseTemplateDef(s);
        if (s.acceptType('=')) s.must(this.parseType(s));
        return true;
    }

    parseEnum(s: State): boolean {
        if (!s.read('enum')) return false;
        let identifier = s.must(s.read(IDENTIFIER));

        const opts: ParseGroupOpts = {
            open: '{',
            close: '}',
            next: ',',
            jsOpen: this.options.js ? `var ${identifier} = (function (${identifier}) {` : `enum ${identifier} {`,
            jsClose: this.options.js ? `return ${identifier};})(${identifier} || {});` : '}',
            jsNext: this.options.js ? null : ',',
            allowImplicit: true,
        };
        let nextNum = 0;
        return s.must(s.parseGroup(opts, () => {
            const name = s.read(IDENTIFIER);
            if (!name) return false;
            if (s.read('=')) {
                nextNum = parseInt(s.must(s.read(NUMBER)));
            }
            if (this.options.js) s.emit(`${identifier}[(${identifier}["${name}"] = ${nextNum++})] = "${name}";`);
            else s.emit(`${name} = ${nextNum++}`);
            return true;
        }));
    }

    parseReturn(s: State): boolean {
        if (!s.accept('return') && !s.accept('yield')) return false;
        this.parseExpression(s);
        return true;
    }

    parseIfWhile(s: State): boolean {
        const name = s.accept('if') || s.accept('while');
        if (!name) return false;
        s.emit('(');
        s.must(this.parseExpression(s));
        s.emit(')');
        s.must(this.parseBlock(s) || this.parseStatement(s));
        if (name === 'if' && s.accept('else')) s.must(this.parseBlock(s) || this.parseStatement(s));
        return true;
    }

    parseThrow(s: State): boolean {
        if (!s.accept('throw')) return false;
        s.must(this.parseExpression(s));
        return true;
    }

    parseDoWhile(s: State): boolean {
        if (!s.accept('do')) return false;
        s.must(this.parseStatement(s));
        s.must(s.accept('while'));
        s.must(this.parseExpression(s));
        return true;
    }

    parseFor(s: State): boolean {
        if (!s.accept('for')) return false;
        s.emit('(');

        const snap = s.snapshot();
        const isForOf = (this.parseVarDecl(s, false) || s.accept(IDENTIFIER)) && (s.accept('of') || s.accept('in'));

        if (isForOf) {
            s.must(this.parseExpression(s));
        } else {
            snap.revert();
            (this.parseVarDecl(s) || this.parseExpression(s)) ? s.read(';') : s.must(s.read(';'));
            for (let i = 0; i < 2; i++) {
                s.emit(';');
                this.parseExpression(s) ? s.read(';') : s.must(s.read(';'));
            }
        }

        s.emit(')');
        s.must(this.parseStatement(s) || this.parseBlock(s));
        return true;
    }

    parseSwitch(s: State): boolean {
        if (!s.accept('switch')) return false;
        s.emit('(');
        s.must(this.parseExpression(s));
        s.emit(')');
        s.must(s.parseGroup({ jsOpen: '{', jsClose: '}', allowImplicit: true }, () => {
            if (s.read('*')) {
                s.emit('default: {');
            } else {
                const snap = s.snapshot();
                s.emit('case');
                if (!this.parseExpression(s)) {
                    snap.revertOutput();
                    return false;
                }
                s.emit(': {');
            }
            s.read(':');

            if (!s.parseGroup({ next: ';', jsNext: null, allowImplicit: true }, () => !!s.recoverErrors(() => this.parseStatement(s)))) {
                s.must(this.parseStatement(s));
            }
            s.emit('break;}');
            return true;
        }));
        return true;
    }

    parseImport(s: State): boolean {
        const snap = s.snapshot();
        if (!s.accept('import')) return false;
        
        // Check for plugin import: import plugin "path" {options}
        if (s.read('plugin')) {
            snap.revertOutput(); // Don't emit anything for plugin imports
            const pathStr = s.must(s.read(STRING));
            const pluginPath = pathStr.slice(1, -1); // Remove quotes
            
            // Parse optional plugin options - parse, capture output, then eval as JS object
            let pluginOptions = {};
            if (this.parseLiteralObject(s)) {
                const tokens = snap.revertOutput();
                pluginOptions = Function('return ' + tokens.filter(t => typeof t === 'string').join(' '))();
            }
            
            if (!this.options.loadPlugin) {
                throw new Error('Plugin import found, but loadPlugin not in options');
            }
            
            const pluginModule = this.options.loadPlugin(pluginPath);
            // Handle both ES module default exports and CommonJS module.exports
            const pluginFn = (pluginModule.default || pluginModule) as PluginModule['default'];
            pluginFn(this, this.options, pluginOptions);
            
            // Clear target position so next statement gets correct line mapping
            s.clearTargetPos();
            return true;
        }
        
        // Check for type-only import - strip entire statement in JS mode
        const isTypeImport = !!s.acceptType('type');
        
        if (s.accept('*')) {
            s.must(s.accept('as'));
            s.must(s.accept(IDENTIFIER));
        } else if (s.parseGroup({ open: '{', close: '}', next: ',', allowImplicit: true }, () => {
            if (!s.accept(IDENTIFIER)) return false;
            if (s.accept('as')) s.must(s.accept(IDENTIFIER));
            return true;
        })) {
        } else {
            s.must(s.accept(IDENTIFIER));
        }
        s.must(s.accept('from'));

        // For type-only imports, strip the entire statement in JS mode
        if (isTypeImport && this.options.js) {
            snap.revertOutput();
            s.must(s.read(STRING)); // Still consume the string but don't emit
            return true;
        }

        if (this.options.transformImport) {
            const url = s.must(s.read(STRING)).slice(1, -1);
            s.emit('"' + this.options.transformImport(url) + '"');
        } else {
            s.must(s.accept(STRING));
        }
        return true;
    }

    parseTry(s: State): boolean {
        if (!s.accept('try')) return false;
        if (!this.parseBlock(s)) {
            s.emit('{')
            s.must(this.parseStatement(s));
            s.emit('}');
        }
        let handled = false;
        if (s.accept('catch')) {
            if (s.accept(IDENTIFIER)) {
                if (s.acceptType(':')) s.must(this.parseType(s));
            }
            if (!this.parseBlock(s)) {
                s.emit('{')
                s.must(this.parseStatement(s));
                s.emit('}');
            }
            handled = true;
        }
        if (s.accept('finally')) {
            if (!this.parseBlock(s)) {
                s.emit('{')
                s.must(this.parseStatement(s));
                s.emit('}');
            }
            handled = true;
        }
        if (!handled) {
            s.emit('catch{}');
        }
        return true;
    }

    parseDeclare(s: State): boolean {
        if (!s.acceptType('declare')) return false;
        s.acceptType('enum');
        s.must(s.acceptType(IDENTIFIER));

        const snap = s.snapshot();
        s.must(!!this.parseBlock(s));
        snap.revertOutput();  // Discard declare block output
        return true;
    }

    parseBlock(s: State): boolean {
        return s.parseGroup({ jsOpen: '{', jsClose: '}', next: ';', jsNext: null, allowImplicit: true }, () => !!s.recoverErrors(() => this.parseStatement(s)));
    }

    parseTemplateDef(s: State): boolean {
        if (s.acceptType('<')) {
            while (true) {
                s.must(s.acceptType(IDENTIFIER));
                if (s.acceptType('extends')) s.must(this.parseType(s));
                if (!s.acceptType(',')) break;
            }
            s.must(s.acceptType('>'));
            return true;
        }
        return false;
    }

    parseClassicFuncExprBody(s: State): boolean {
        const snap = s.snapshot();
        s.emit('{return');
        if (!this.parseExpression(s)) {
            snap.revert();
            return false;
        }
        s.emit('}');
        return true;
    }

    parseArrowFuncExprBody(s: State): boolean {
        const snap = s.snapshot();
        s.emit('(');
        if (this.parseLiteralObject(s)) {
            s.emit(')');
            return true;
        }
        snap.revert();
        return !!this.parseExpression(s);
    }

    parseFuncType(s: State): boolean {
        if (!s.acceptType(':')) return false;
        s.acceptType('asserts');
        s.must(this.parseType(s));
        return true;
    }

    parseParenthesised(s: State): boolean {
        if (!s.accept('(')) return false;
        s.must(this.parseExpressionSeq(s));
        s.must(s.accept(')'));
        return true;
    }

    parseExpressionSeq(s: State): boolean {
        if (!this.parseExpression(s)) return false;
        while (s.accept(',')) s.must(this.parseExpression(s));
        return true;
    }

    parseBacktickString(s: State): boolean {
        if (!s.accept('`')) return false;
        while (true) {
            let m = s.must(s.accept(WITHIN_BACKTICK_STRING));
            if (m.slice(-1) === '`') break;
            s.must(this.parseExpression(s));
            s.must(s.accept('}'));
        }
        return true;
    }

    parseLiteralArray(s: State): boolean {
        return s.parseGroup({ open: '[', close: ']', next: ',' }, () => {
            if (s.accept('...')) return !!s.must(this.parseExpression(s));
            else return !!this.parseExpression(s);
        });
    }

    parseLiteralObject(s: State): boolean {
        return s.parseGroup({ open: '{', close: '}', next: ',' }, () => {
            if (s.accept('...')) {
                s.must(this.parseExpression(s));
                return true;
            }
            s.accept('*');
            if (s.accept('[')) {
                s.must(this.parseExpression(s));
                s.must(s.accept(']'));
            } else {
                if (!s.accept(IDENTIFIER) && !s.accept(NUMBER) && !s.accept(STRING) && !this.parseBacktickString(s)) return false;
            }
            if ((this.parseTemplateDef(s) && s.must(this.parseFuncParams(s))) || this.parseFuncParams(s)) {
                if (s.acceptType(':')) this.parseType(s);
                s.must(this.parseBlock(s));
            } else {
                if (s.accept(':')) s.must(this.parseExpression(s));
            }
            return true;
        });
    }

    parseTemplateArg(s: State): boolean {
        const snap = s.snapshot();
        if (!s.acceptType('<')) return false;
        if (!this.parseType(s)) { snap.revert(); return false; }
        while (s.acceptType(',')) if (!this.parseType(s)) { snap.revert(); return false; }
        if (!s.acceptType('>')) { snap.revert(); return false; }
        if (s.peek('.') || s.peek('(') || s.readNewline()) return true;
        snap.revert();
        return false;
    }

    parseIndex(s: State): boolean {
        if (!s.accept('[')) return false;
        s.must(this.parseExpressionSeq(s));
        s.must(s.accept(']'));
        return true;
    }

    parseTypeObjectEntry(s: State): boolean {
        if (s.acceptType('[')) {
            s.must(s.acceptType(IDENTIFIER));
            s.must(s.acceptType(':'));
            s.must(this.parseType(s));
            s.must(s.acceptType(']'));
        }
        else if (!s.acceptType(IDENTIFIER) && !s.acceptType(NUMBER) && !s.acceptType(STRING)) return false;
        s.must(s.acceptType(':'));
        s.must(this.parseType(s));
        return true;
    }
}
