# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TabScript is a transpiler that converts TabScript syntax to TypeScript or JavaScript. It provides a cleaner, more readable syntax by using indentation instead of braces and introducing shorthand operators while maintaining full TypeScript compatibility.

Key features:
- Indentation-based syntax (tabs only, no braces required)
- Shorthand operators: `::` (const), `:` (let), `||` (function params), `&` (function calls)
- Logical operators: `or` (||), `and` (&&), strict equality by default (`==` → `===`)
- Binary operators with `%` prefix: `%bit_or`, `%bit_and`, `%bit_xor`, `%bit_not`, `%shift_left`, etc.
- Type stripping mode to transpile directly to JavaScript
- Browser support for runtime transpilation
- Error recovery mode for partial transpilation

## Build & Test Commands

Build the project:
```bash
npm run build
```
This compiles TypeScript to `dist/`, minifies to `dist-min/`, and makes `dist/cli.js` executable.

Run all tests:
```bash
npm test
```

Run individual tests:
```bash
# Test TypeScript output
npm run test1

# Test JavaScript output (type stripping)
npm run test2

# Test error recovery mode
npm run test3
```

Manual CLI usage:
```bash
./dist/cli.js <input.tab> [--output <file>] [--debug] [--recover] [--strip-types] [--whitespace preserve|pretty]
```

## Architecture

### Core Components

**`src/tabscript.ts`** (1269 lines) - The main transpiler engine
- Implements a recursive descent parser
- Single-pass transpilation with position tracking
- Maintains input→output offset mapping for sourcemaps
- Key architecture:
  - `parseMain()` - Entry point, handles file-level parsing
  - `parseStatement()` - Parses statements (if/while/for/class/function/etc)
  - `parseExpression()` - Parses expressions with operator precedence
  - `parseType()` - Parses TypeScript type annotations
  - `parseGroup()` - Generic parser for bracketed/indented constructs
  - `read()/eat()` - Token consumption (eat also emits to output)
  - `eatType()` - Like eat/read but suppressed in stripTypes mode
  - `emit()` - Outputs to result, handles whitespace/newline syncing
- State management: `getInState()/getOutState()/restoreState()` for backtracking
- Indentation handling: `readIndent()/readDedent()/readNewline()` with pending queue
- Error recovery: `recoverErrors()` wrapper for graceful failure

**`src/cli.ts`** (72 lines) - Command-line interface
- Argument parsing for --output, --debug, --recover, --strip-types, --whitespace
- File I/O wrapper around tabscript() function
- Defaults output to same filename with .ts extension

**`src/browser.ts`** (74 lines) - Browser runtime loader
- Auto-transpiles `<script type="text/tabscript">` tags on DOMContentLoaded
- Supports both inline scripts and `src` attribute
- Implements `transformImport()` for module loading with object URLs
- Maintains transform cache to avoid re-transpiling

### Parsing Strategy

The parser uses:
1. **Backtracking with state save/restore** - Try parsing paths, restore on failure
2. **Indent/dedent tokens** - Generated on-demand by readNewline(), queued in `indentsPending`
3. **Position synchronization** - `outTargetPos/Line/Col` track where output should align with input
4. **Whitespace preservation** - Default mode maintains input line/column positions in output
5. **Type annotation handling** - eatType() suppresses output when stripTypes=true

### Token Matching

Regexes in sticky mode (flag `y`):
- `WHITESPACE`, `IDENTIFIER`, `STRING`, `NUMBER`, `OPERATOR`, `BACKTICK_STRING`, `EXPRESSION_PREFIX`, `REGEXP`
- The `descr()` wrapper adds toString() for better error messages
- `matchOptions` Set tracks failed matches for error reporting

### TabScript Syntax Patterns

Variable declarations:
- One colon = const, two colons = let
- `x : number = 3` → `const x: number = 3`
- `x :: number = 3` → `let x: number = 3`
- `x := 3` → `const x = 3` (type inferred)
- `x ::= 3` → `let x = 3` (type inferred)

Functions:
- `|a, b| a + b` → `(a, b) => a + b`
- `function name|a| a + 1` → `function name(a) { return a + 1 }`
- `async |x| await x` → `async (x) => await x`

Function calls:
- `func& arg1 arg2` → `func(arg1, arg2)` (indented args or space-separated)
- `func& <newline><indent>arg1<newline>arg2<dedent>` → `func(arg1, arg2)`

Operators:
- `or` → `||`, `and` → `&&`
- `==` → `===`, `!=` → `!==` (strict by default)
- `=~` → `==`, `!~` → `!=` (explicit loose equality)
- `%bit_or` → `|`, `%bit_and` → `&`, etc.

Aberdeen UI Tags (when `--ui <library>` flag is set):
- `<div>` → `A.e('div');` (create element)
- `<div.my-class>` → `A.e('div').c('my-class');` (add class)
- `<input type=text>` → `A.e('input').a('type','text');` (set attribute)
- `<input value~${x}>` → `A.e('input').p('value',x);` (set property)
- `<div color:red>` → `A.e('div').s('color','red');` (set style)
- `<div margin-top:10px>` → `A.e('div').s('marginTop','10px');` (kebab-case → camelCase)
- `<button>Submit` → `A.e('button').t('Submit');` (text content)
- `<span>${x}` → `A.e('span').t(x);` (interpolated text)
- `<div>` + indent → `A.e('div').f(function(){...});` (reactive block)
- `<>Text ${x}` → `A.t('Text '+x);` (text without element)
- `<>` + indent → `A.f(function(){...});` (reactive block without element)
- `<.some-class>` → `A.c('some-class');` (class only, no element)
- `<.class fontSize:32>` → `A.c('class').s('fontSize','32');` (properties without element)

## Testing Strategy

Tests use diff-based comparison:
- `tests/test.tab` - Input TabScript file with comprehensive syntax examples
- `tests/test.ts` - Expected TypeScript output
- `tests/test.js` - Expected JavaScript output (--strip-types)
- `tests/error.tab` - Input with intentional errors
- `tests/error.ts` - Expected recovery output (--recover mode)

The build must complete successfully before tests run (via `prepack` hook).

## Common Development Patterns

When modifying the parser:
1. Add new syntax to `tests/test.tab` and expected output to `tests/test.ts`
2. Update the appropriate `parse*()` function in tabscript.ts
3. Use `must()` for mandatory tokens, plain `eat()`/`read()` for optional
4. Remember to handle both regular and type-stripping modes
5. Test with `npm test` to verify both TypeScript and JavaScript output

When adding new operators:
- Add regex pattern to token definitions (lines 17-31)
- Add entry to `REPLACE_OPERATORS` if it needs translation (lines 33-47)
- Update `parseExpression()` or relevant parser function

When debugging:
- Use `--debug` flag to see token consumption
- Check `matchOptions` in error messages to see what parser expected
- Use state save/restore pattern for lookahead without consuming tokens
