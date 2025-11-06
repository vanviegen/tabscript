# CLAUDE.md

This file provides guidance to anyone working with code in this repository.

**IMPORTANT**: Always follow the instructions with regard to the user of git worktree in the `Common Development Patterns` section.

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

Run all tests (a build is required first):
```bash
npm test
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
- `tests/ui.tab` - Input with Aberdeen UI tags
- `tests/ui.ts` - Expected output with Aberdeen UI transpilation

## Common Development Patterns

When making any modifications to this project:
1. Come up with a feature branch name and check that the branch doesn't exist yet.
2. Create a new worktree in `.trees`: `git worktree add -B my-feature .trees/my-feature`
3. Do all your work in that worktree.
4. After every change, make a commit with a *short* descriptive message. The summary you output to the user about your work can be equally brief.
5. When done, propose to the user to merge the feature into main.
6. If the user accepts, combine your commits into one using `git reset --soft $(git merge-base HEAD main) && git commit -m "Your squashed commit message"`, providing a more thorough (but still not overly long!) commit message for all of the work (possibly using a HEREDOC).
7. Do a `git rebase main` and resolve and commit any conflicts.
8. Fast-forward merge into main (by moving into the main worktree and doing `git merge -ff my-feature`).
9. Remove the worktree and the branch.


When modifying the parser:
1. Add new syntax to `tests/test.tab` and expected output to `tests/test.ts` and `tests/test.js` (or `ui.tab` when working on the <tag> syntax, or `error.tab` for error recovery).
2. Update the appropriate `parse*()` function in tabscript.ts.
   - Use `read()` to try to consume tokens (string literals or regexes predefined at top of file). It returns `undefined` if no match. Returns a string for the match if read() has one argument. Returns an array of string matches if read() has multiple arguments.
   - Use `eat()` to try to consume tokens and emit them as output. Returns like `read()`.
   - Use `peek()` to check for tokens without consuming them.
   - Use `emit()` to add strings to the output. They'll be input->output mapped to the position of the first `read()` that hasn't be followed by an `emit` yet. Use the `outTargetPos/outTargetLine/outTargetCol` vars for more direct control over mapping.
   - Use `const saved=getFullState()` + parse*() + optional `restoreState(saved)` for speculatively calling a parse function and backtracking on failure.
   - Use `const saved=getOutState()` + parse*() + optional `restoreState(saved)` to call a parse function and (conditionally) discard its output.
   - Parse functions names *must* start with `parse`, as on error the stack trace is used to identify which parse function failed.
   - Parse functions must return something trueish on success. On failure they should return something falsey and the input and output state should be the same as before the call.
   - The `must(..)` wrapper checks if its argument is trueish (or if it's function it calls it first). If not, it throws a parse error with context. It returns its value.
3. Remember to handle both regular and type-stripping modes (using `eatType()` and `emitType()` and the `stripTypes` flag as needed).
5. Test with `npm test` to verify both TypeScript and JavaScript output.

When debugging:
- Use `--debug` flag to see token consumption
- Check `matchOptions` in error messages to see what parser expected
