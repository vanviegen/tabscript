---
title: TabScript Tutorial
---

# TabScript Tutorial

TabScript is an alternate syntax for TypeScript that replaces braces with indentation and introduces shorthand operators while maintaining full TypeScript compatibility. The compiler outputs clean TypeScript or JavaScript.

## Getting Started

Let's start with a complete example that showcases TabScript's clean syntax:

```tabscript
tabscript 1.0

interface Task
	title: string
	status: "done" or "pending"
	priority: number

# Arrow function with := (const)
filterTasks := |tasks: Task[], status: "done" or "pending"|
	tasks.filter.. |t| t.status == status and t.priority > 0

# Single expression functions
getHighPriority := |tasks: Task[]|
	tasks.filter.. |t| t.priority >= 8

# Named function
function printTaskStats|tasks: Task[]|
	completed := filterTasks.. tasks "done"
	pending := filterTasks.. tasks "pending"

	# for-of with : declares a const
	for task: of getHighPriority(pending)
		console.log("HIGH PRIORITY:", task.title)

	if completed.length > 0
		console.log(`Completed ${completed.length} tasks!`)
```

A few things to note:
- **Header** declaring the TabScript version.
- **Tab** indentation (no spaces, hence the name) defines code blocks.
- **Declarations** use `:=` for `const` and `::=` for `let`.
- **Functions** are defined by wrapping '||' around the parameters.
- **Equality** operators are strict by default (`==` means `===`).

## Variables

Variable declarations use colons: a single `:` for `const` and a double `::` for `let`.

```tabscript
tabscript 1.0

# One colon means const
x : number = 3
z := 42

# Two colons means let
y :: string = "hello"
w ::= 42

# Declaration without initial value
arr : number[]

# Union types (use 'or' instead of |)
value : string or undefined
```

## Functions

Functions use `||` to wrap parameters instead of `()`. For arrow functions, you can omit braces when returning an expression.

Note that we're leaving out the required `tabscript 1.0` header in the following examples for brevity.

```tabscript
# Arrow functions
add := |a, b| a + b
double := |x: number| x * 2

# Async arrow function
fetch := async |url| await loadData(url)

# Named function with single expression
function greet|name| `Hi ${name}`

# Named function with block body
function calculate|a: number, b: number|
	result := a + b
	return result

# Generic function
identity := <T>|x: T| x
```

## Function Calls

Use `..` to call functions with space-separated arguments or one argument per line for cleaner syntax.

```tabscript
# Regular call (traditional syntax still works)
result := func(a, b)

# Call with .. and space-separated args
result := func.. a b

# Call with .. and indented args
result := func..
	a
	b

# Passing in an anonymous function as argument
processData.. options |item|
	item.value *= 2
```

## Control Flow

All control structures use indentation instead of braces.

```tabscript
# If statement (single line)
if x > 0 console.log("positive")

# If statement (block body)
if x > 0
	console.log("positive")
	x++

# If-else
if x > 0
	console.log("positive")
else
	console.log("not positive")

# While loop
while i < 10
	i++

# For-of loop with type-inferred constant
for item: of array
	console.log(item)

# For-in loop
for key: in obj
	console.log(key, obj[key])

# C-style for loop with let
for i ::= 0; i < 10; i++
	console.log(i)

# Switch (values don't need 'case' keyword)
switch day
	1
		console.log("Monday")
	2
		console.log("Tuesday")
	*
		console.log("Other day")

# Try-catch
try
	riskyOperation()
catch error
	console.log(error)

# Or without the catch, and on a single line
try riskyOperation()

```

## Operators

### Logical Operators

TabScript uses `and` and `or` for logical operators instead of `&&` and `||`.

```tabscript
if x > 0 and y > 0
	console.log("both positive")

if x == 0 or y == 0
	console.log("at least one zero")
```

### Equality

TabScript uses `==` and `!=` for strict equality (like TypeScript's `===` and `!==`). For loose equality, use `=~` and `!~`.

```tabscript
# Strict equality by default
if x == y
	console.log("equal")

if x != y
	console.log("not equal")

# Explicit loose equality
if x =~ y
	console.log("loosely equal")
```

### Null/Undefined Check

Test if an expression is neither `null` nor `undefined` by suffixing it with `?`.

```tabscript
if getValue()?
	console.log("has value")
```

### Binary Operators

Binary operators and modulo use verbose names with a `%` prefix. They should be relatively uncommon, so this makes their use more explicit and frees up symbols for other, more frequently used, constructs.

```tabscript
# Bitwise operations
result := x %bit_or y
result := x %bit_and y
result := x %bit_xor y
result := %bit_not x

# Bit shifts
result := x %shift_left 2
result := x %shift_right 2
result := x %unsigned_shift_right 2

# Modulo
console.log(5 %mod 3, "equals 2")
```

## Classes

Classes use indentation-based syntax. Methods need `||` even when they have no parameters.

```tabscript
# Basic class with properties
class Person
	name: string
	age: number

# Constructor with parameter properties
class Person
	constructor|
		public name: string
		private age: number
	| ;

# Methods (|| means no parameters)
class Person
	greet||
		return "Hello"

	setAge|age: number|
		this.age = age

# Getters and setters
class Person
	get name||
		return this._name

	set name|value|
		this._name = value

# Inheritance
class Dog extends Animal implements Pet
	makeSound||
		console.log("Woof!")

# Generic class
class Box<T>
	value: T
	constructor|value: T|
		this.value = value
```

## Types and Interfaces

TypeScript's type system is fully supported with TabScript syntax.

```tabscript
# Interface with properties
interface User
	name: string
	email: string
	age: number

# Interface with methods
interface Service
	start||: void
	stop||: void
	getData|id: string|: Data

# Type aliases
type ID = string or number
type Point = {x: number, y: number}

# Generic type with union
type Result<T> = {success: true, data: T} or {success: false, error: string}

# Function types use pipes
type Handler = |event: Event|: void
type Mapper<T, U> = |input: T|: U
```

## Enums

Enums work the same as in TypeScript, with indentation instead of braces.

```tabscript
# Basic enum
enum Color
	Red
	Green
	Blue

# Enum with explicit values
enum Status
	Active = 1
	Inactive = 0

# Traditional brace syntax also works
enum Direction { Up, Down, Left, Right }
```

## Plugins

TabScript's plugin system lets you extend the language with custom syntax tailored to your domain. Plugins hook into the parser to recognize new syntax patterns and emit custom output while maintaining full IDE support.

The transpiler is **lexer-less and single-pass** — it reads input and emits output simultaneously without building an AST. This makes it fast and simple but best suited for transformations that map cleanly to underlying TypeScript constructs.

### Using Plugins

Import plugins using the `import plugin` statement:

```tabscript
# @file: my-plugin.tab
export default function||;
```

```tabscript
tabscript 1.0
import plugin "./my-plugin.tab"
```

You can pass options to plugins using an object literal:

```tabscript
# @file: options-demo.tab
export default function|parser, options, pluginOptions|
	console.log(pluginOptions)
```

```tabscript
tabscript 1.0
import plugin "./options-demo.tab" {function: "UI", debug: true}
```

Plugins can be loaded at any point in the file and take effect immediately. They can be written in TabScript (`.tab`) or JavaScript (`.js`).

### How Plugins Work

Plugins receive the Parser instance and can directly modify its `parse*` methods. The parser uses methods like `parseStatement`, `parseExpression`, and `parseType` to process different parts of the syntax. Plugins can replace or wrap these methods to add new syntax.

### Writing a Simple Plugin

Here's a plugin that adds an `@log` decorator for automatic function call logging:

```tabscript
# @file: log-plugin.tab
tabscript 1.0

import type {Parser, State, Options} from "tabscript"

export default function|p: Parser, options: Options|
	IDENTIFIER := p.pattern.. /[a-zA-Z_$][0-9a-zA-Z_$]*/ "identifier"

	# Keep reference to original parseStatement
	origParseStatement := p.parseStatement.bind(p)

	# Replace parseStatement to handle @log before other statements
	p.parseStatement = |s: State|
		if !s.read.. '@log'
			return origParseStatement(s)

		# Parse: @log name := |args| body
		name := s.must.. s.read.. IDENTIFIER
		s.must.. s.read.. ':'
		isLet := !!s.read.. ':'
		s.emit.. (isLet ? 'let ' : 'const ') + name

		s.must.. s.read.. '='

		# Wrap function with logging
		s.emit.. '=('
		s.must.. p.parseFuncParams(s)
		s.emit.. '=>{console.log(' + JSON.stringify(name) + ',...arguments);return('
		s.must.. p.parseExpression(s)
		s.emit.. ');})'

		return true
```

Usage:

```tabscript
tabscript 1.0
import plugin "./log-plugin.tab"

@log add := |a: number, b: number| a + b

result := add(1, 2)  # Logs: "add" 1 2
```

### Plugin API

Plugins export a default function that receives three arguments:

- **`parser`** - The Parser instance with all `parse*` methods
- **`options`** - Global transpiler options (includes `js` flag)
- **`pluginOptions`** - Options passed in the object literal after the plugin path

#### Modifying Parser Methods

To add custom syntax, save a reference to the original method and replace it with your own:

```tabscript
# Save original method
origParseStatement := p.parseStatement.bind(p)

# Replace with custom implementation
p.parseStatement = |s: State|
	if s.read.. '@custom'
		# Handle custom syntax
		return true
	# Fall back to original
	return origParseStatement(s)
```

Common patterns:
- **Run before original**: Check for your syntax first, fall back to original if not matched
- **Run after original**: Call original first, try your syntax if it returns false
- **Wrap original**: Add behavior before/after calling the original

#### Token Matchers

Use `p.pattern(regex, name)` to create regex patterns for token matching. It automatically adds the sticky (`/y`) flag and provides descriptive error messages:

```tabscript
IDENTIFIER := p.pattern.. /[a-zA-Z_$][0-9a-zA-Z_$]*/ "identifier"
NUMBER := p.pattern.. /[0-9]+/ "number"
TAG := p.pattern.. /[a-z][a-z0-9-]*/ "tag-name"
```

When a token fails to match, error messages will show the descriptive name (e.g., "expected <identifier>") instead of the raw regex pattern.

#### State API

The `State` object (`s`) provides methods for reading input and emitting output:

**Reading Input:**
- `s.read(pattern...)` - Consume tokens, returns undefined if no match
- `s.peek(pattern...)` - Look ahead without consuming
- `s.accept(pattern...)` - Read and emit tokens
- `s.must(value)` - Throw error if value is falsy

**Emitting Output:**
- `s.emit(text...)` - Add text to output

**State Management:**
- `s.snapshot()` - Create checkpoint that can be reverted
- `snapshot.revert()` - Revert input and output to checkpoint
- `snapshot.revertOutput()` - Revert only output
- `s.parseGroup(opts, func)` - Parse delimited groups

**Position Info:**
- `s.inLine` - Current input line number
- `s.hasMore()` - Check if more input remains

### Example: Markup DSL Plugin

A more complex plugin can add entirely new syntax. Here's a simplified markup plugin that transforms `:div.class "text"` into function calls:

```tabscript
# @file: markup.tab
tabscript 1.0

import type {Parser, State, Options} from "tabscript"

export default function|p: Parser, options: Options|
	funcName := "UI"
	TAG := p.pattern.. /[a-zA-Z][a-zA-Z0-9-]*/ "tag-name"
	
	# Save original parseStatement
	origParseStatement := p.parseStatement.bind(p)
	
	p.parseStatement = |s: State|
		if !s.read.. ':'
			return origParseStatement(s)
		
		s.emit.. funcName + '(`'
		
		# Parse tag name
		s.accept.. TAG
		
		# Parse classes (.class)
		while s.read.. '.'
			s.emit.. '.'
			s.must.. s.accept.. TAG
		
		s.emit.. '`'
		
		# Parse text content
		snap := s.snapshot()
		s.emit.. ','
		if !p.parseExpression(s)
			snap.revertOutput()
		
		s.emit.. ');'
		return true
```

Usage:

```tabscript
tabscript 1.0
import plugin "./markup.tab"

:div.container.highlight "Hello world"
# Transpiles to: UI(`div.container.highlight`, "Hello world");
```

### Plugin Tips

1. **Return false on no match** - Your plugin should return `false` if it doesn't recognize the syntax, allowing other plugins or the default parser to try.

2. **Use snapshots for backtracking** - If you start parsing and realize the syntax doesn't match, use `snapshot().revert()` to undo changes.

3. **Check `options.js`** - If you emit type annotations, check `options.js` and skip them when outputting JavaScript.

4. **Test thoroughly** - Create `.tab` and `.ts` test files to verify your plugin output matches expectations.

5. **Bind original methods** - When saving a reference to an original method, use `.bind(p)` to preserve the correct `this` context.

## Try It Yourself

All the code examples on this page are interactive! Click the "Edit" button on any example to modify the code and see the transpiled output update in real-time. Use the checkbox to toggle between TypeScript and JavaScript output.

## CLI Options

```sh
tabscript <input.tab> [options]

Options:
  --output <file>       Output file
  --js         Transpile to JavaScript
  --whitespace <mode>   preserve (default) or pretty
  --debug               Show debug output
  --recover             Attempt to recover from errors
```

## Learn More

- Check out comprehensive examples in [tests/test.tab](https://github.com/vanviegen/tabscript/blob/main/tests/test.tab)
- See plugin examples in [tests/log-plugin.tab](https://github.com/vanviegen/tabscript/blob/main/tests/log-plugin.tab) and [tests/markup-plugin.tab](https://github.com/vanviegen/tabscript/blob/main/tests/markup-plugin.tab)
- Visit the [GitHub repository](https://github.com/vanviegen/tabscript) for source code
