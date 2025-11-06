# CLAUDE.md

This file provides guidance to anyone working with code in this repository.

**IMPORTANT**: Always follow the instructions with regard to the user of git worktree in the `Common Development Patterns` section.

## Project Overview

TabScript is a transpiler that converts TabScript syntax to TypeScript or JavaScript. It provides a cleaner, more readable syntax by using indentation instead of braces and introducing shorthand operators while maintaining full TypeScript compatibility.

Key features:
- Indentation-based syntax (tabs only, no braces required)
- Shorthand operators: `:` (const), `::` (let), `||` (function params), `&` (function calls)
- Logical operators: `or` (||), `and` (&&), strict equality by default (`==` → `===`)
- Binary operators with `%` prefix: `%bit_or`, `%bit_and`, `%bit_xor`, `%bit_not`, `%shift_left`, `%mod`, etc.
- Optional UI tag syntax for frameworks like Aberdeen.js (with `--ui` flag)
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
./dist/cli.js <input.tab> [--output <file>] [--debug] [--recover] [--strip-types] [--whitespace preserve|pretty] [--ui <library>]
```

## Architecture

### Core Components

**`src/tabscript.ts`** - Main transpiler engine implementing a recursive descent parser with single-pass transpilation and position tracking for sourcemap generation.

**`src/cli.ts`** - Command-line interface with argument parsing for `--output`, `--debug`, `--recover`, `--strip-types`, `--whitespace`, and `--ui` flags.

**`src/browser.ts`** - Browser runtime that auto-transpiles `<script type="text/tabscript">` tags, supports module loading via `transformImport()`, and maintains a transform cache.

### Parser Architecture

The parser (in `src/tabscript.ts`) uses:
- **Recursive descent** - `parseMain()` → `parseStatement()` → `parseExpression()` → etc.
- **Backtracking** - `getFullState()/getOutState()` + `restoreState()` for speculative parsing
- **Indent/dedent tokens** - Generated on-demand by `readNewline()`, queued in `indentsPending`
- **Position synchronization** - `outTargetPos/Line/Col` track input→output alignment for sourcemaps
- **Token matching** - Regexes in sticky mode (`WHITESPACE`, `IDENTIFIER`, `STRING`, `NUMBER`, `OPERATOR`, etc.)
- **Error recovery** - `recoverErrors()` wrapper for graceful partial transpilation

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
1. Add new syntax to `tests/test.tab` and expected output to `tests/test.ts` and `tests/test.js` (or `tests/ui.tab`/`tests/ui.ts` for UI tag syntax, or `tests/error.tab`/`tests/error.ts` for error recovery).
2. Update the appropriate `parse*()` function in `src/tabscript.ts`:
   - **`read(pattern...)`** - Try to consume tokens without emitting. Returns `undefined` if no match, a string for single pattern, or array for multiple patterns.
   - **`eat(pattern...)`** - Like `read()` but also emits matched tokens to output.
   - **`eatType(pattern...)`** - Like `eat()` but suppressed when `stripTypes=true`.
   - **`peek(pattern...)`** - Check for tokens without consuming.
   - **`emit(str)`** - Add string to output with input→output position mapping.
   - **`emitType(str)`** - Like `emit()` but suppressed when `stripTypes=true`.
   - **Backtracking**: Use `const saved=getFullState()` then `restoreState(saved)` to try parse paths and rewind on failure.
   - **Output discard**: Use `const saved=getOutState()` then `restoreState(saved)` to conditionally discard output.
   - **Parse function contract**: Names must start with `parse`. Return truthy on success, falsy on failure. Leave state unchanged on failure.
   - **`must(value)`** - Throws parse error if `value` is falsy (calls if function). Returns the value on success.
3. Test with `npm test` to verify output matches expected TypeScript and JavaScript files.

When debugging:
- Use `--debug` flag to see token consumption
- Check `matchOptions` in error messages to see what parser expected
