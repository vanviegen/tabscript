---
title: TabScript Tutorial
---

# TabScript Tutorial

TabScript is an alternate syntax for TypeScript that replaces braces with indentation and introduces shorthand operators while maintaining full TypeScript compatibility. The compiler outputs clean TypeScript or JavaScript.

## Getting Started

Let's start with a complete example that showcases TabScript's clean syntax:

```tabscript
tabscript 1.0 # Declare TabScript version

interface Task
	title: string
	status: "done" or "pending"
	priority: number

# := for const declaration, || for function definition parameters
filterTasks := |tasks: Task[], status: "done" or "pending"|
	# Call the filter method using & syntax, so avoid parentheses
	# Use 'and'/'or' instead of &&/||
	tasks.filter& |t| t.status == status and t.priority > 0

# Single expression functions are super clean
getHighPriority := |tasks: Task[]| tasks.filter& |t| t.priority >= 8

# Functions with indented blocks - no braces needed!
function printTaskStats|tasks: Task[]|
	completed := filterTasks& tasks "done"
	pending := filterTasks& tasks "pending"

	# The colon here causes `task` to be declared as a constant in the loop
	for task: of getHighPriority(pending)
		console.log("HIGH PRIORITY:", task.title)

	# String interpolation and readable conditionals
	if completed.length > 0
		console.log(`Completed ${completed.length} tasks!`)
```

Notice how TabScript removes visual clutter:
- **No braces** - indentation defines blocks
- **`:` and `::`** - declare const and let variables
- **`||` syntax** - cleaner function parameters
- **`&` operator** - space-separated function arguments
- **`and`/`or`** - more readable than `&&`/`||`
- **`==` is strict** - safe by default (transpiles to `===`)

## Variables

Variable declarations use colons: a single `:` for `const` and a double `::` for `let`.

```tabscript
tabscript 1.0

# One colon = const
x : number = 3
z := 42

# Two colons = let
y :: string = "hello"
w ::= 42

# Declaration without initial value
arr : number[]

# Union types (use 'or' instead of |)
value : string or undefined
```

## Functions

Functions use `||` to wrap parameters instead of `()`. For arrow functions, you can omit braces when returning an expression.

```tabscript
# Arrow functions
add := |a, b| a + b
double := |x: number| x * 2

# Async arrow function
fetch := async |url| await loadData(url)

# Named function with single expression
function greet|name| return "Hi " + name

# Named function with block body
function calculate|a: number, b: number|
	result := a + b
	return result

# Generic function
identity := <T>|x: T| x
```

## Function Calls

Use `&` to call functions with space-separated arguments or one argument per line for cleaner syntax.

```tabscript
# Regular call (traditional syntax still works)
result := func(a, b)

# Call with & and space-separated args
result := func& a b

# Call with & and indented args
result := func&
	a
	b

# Passing in an anonymous function as argument
processData options |item|
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

Binary operators and modulo use verbose names with a `%` prefix.

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

## UI Tags (Optional)

When using the `ui` feature flag in the header (`tabscript 1.0 ui=A`), you can use JSX-like syntax. This is designed primarily for Aberdeen.js.

```tabscript
tabscript 1.0 ui=A

# Create element
<div>

# Element with CSS class
<div.container>

# Multiple classes
<div.row.active>

# Attributes
<input type=text>

# Property binding
<input value~${x}>

# Inline styles
<div color:red>

# Text content
<button>Submit

# Text with interpolation
<span>Count: ${count}

# Chained inline tags
<div><span><b>Bold text

# Reactive block
<div.item>
	<h1>Title
	console.log("reactive code")

# Empty tag for text/reactive without element
<>Hello world

<>
	updateState()
```

## Try It Yourself

All the code examples on this page are interactive! Click the "Edit" button on any example to modify the code and see the transpiled output update in real-time. Use the checkbox to toggle between TypeScript and JavaScript output.

## CLI Options

```sh
tabscript <input.tab> [options]

Options:
  --output <file>       Output file
  --strip-types         Transpile to JavaScript
  --whitespace <mode>   preserve (default) or pretty
  --debug               Show debug output
  --recover             Attempt to recover from errors
```

## Learn More

- Check out comprehensive examples in [tests/test.tab](https://github.com/vanviegen/tabscript/blob/main/tests/test.tab)
- See UI tag examples in [tests/ui.tab](https://github.com/vanviegen/tabscript/blob/main/tests/ui.tab)
- Visit the [GitHub repository](https://github.com/vanviegen/tabscript) for source code
