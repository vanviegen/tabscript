# TabScript

TabScript is an indentation-based syntax for TypeScript, designed for building clean domain-specific languages (DSLs) with the full power of TypeScript's type system. Think CoffeeScript for the modern age: indentation replaces braces and common patterns get shorter syntax.

What makes TabScript special is its **plugin system**: you can extend the language with custom syntax tailored to your domain, while still leveraging TypeScript's complete type checking and IDE (VSCode only for now) support.

**[📚 Read the full documentation and interactive tutorial](https://tabscript.vanviegen.net/)**

## Quick Example

```tabscript
tabscript 1.0

# Define a constant initialized to a function
greet := |name: string|
	console.log(`Welcome, ${name}`)

interface User
	name: string
	age: number
	active: boolean

processUsers := |users: User[]|
	# Call filter using & syntax to avoid parentheses
	active := users.filter& |u| u.active and u.age >= 18

	for user: of active
		if user.role == "admin" or user.permissions.includes("write")
			greet(user.name)
```

Transpiles to TypeScript:

```typescript
const greet = (name: string) => {
	console.log(`Welcome, ${name}`);
};
interface User {
	name: string
	age: number
	active: boolean
}
const processUsers = (users: User[]) => {
	const active = users.filter((u) => u.active && u.age >= 18);

	for (const user of active) {
		if (user.role === "admin" || user.permissions.includes("write")) {
			greet(user.name);
		}
	}
};
```

## Installation

```bash
npm install tabscript
```

## Usage

```bash
# Transpile to TypeScript
tabscript input.tab --output output.ts

# Transpile to JavaScript
tabscript input.tab --js --output output.js

# With pretty formatting
tabscript input.tab --whitespace pretty --output output.ts
```

## Key Features

- **Indentation-based syntax** - No braces required
- **Shorthand operators** - `:=` for const, `::=` for let, `||` for function params, `&` for function calls
- **Readable operators** - `and`/`or` instead of `&&`/`||`, strict equality by default
- **All of TypeScript** - Complete type system support
- **Plugin system** - Extend the language with custom syntax for your DSL
- **VSCode extension** - Full IntelliSense and type checking
- **Browser support** - Runtime transpilation for `.tab` files

## Plugin System

TabScript's plugin system lets you extend the language with custom syntax. Plugins are specified in the file header and can be written in TabScript or JavaScript.

The transpiler is lexer-less and single-pass (no AST), making it best suited for superficial syntax transformations that map cleanly to TypeScript constructs.

### Using Plugins

Specify plugins in your file header with paths relative to the current file:

```tabscript
tabscript 1.0 plugin=./my-plugin.tab (option=value)

# Now use custom syntax defined by the plugin
```

### Example: Simple Logging Plugin

Here's a simple plugin that adds an `@log` decorator for automatic function call logging:

```tabscript
tabscript 1.0

import type {Parser, State, Register, Options, PluginOptions} from "tabscript"

export default function createLogPlugin|register: Register, pluginOptions: PluginOptions, globalOptions: Options|
	IDENTIFIER := /[a-zA-Z_$][0-9a-zA-Z_$]*/y

	parseLogDecl := |p: Parser, s: State|
		if !s.read& '@log'
			return false

		name := s.must& s.read& IDENTIFIER
		s.must& s.read& ':'
		s.emit& 'const ' + name + '=('
		s.must& p.parseFuncParams(s)
		s.emit& '=>{console.log(' + JSON.stringify(name) + ',...arguments);return('
		s.must& p.parseExpression(s)
		s.emit& ');})'
		return true

	register.before& 'parseStatement' parseLogDecl
```

Usage:
```tabscript
tabscript 1.0 plugin=log-plugin.tab

@log add := |a: number, b: number| a + b

result := add(1, 2)  # Logs: "add" 1 2
```

### Writing Plugins

Plugins are modules that export a default function receiving three arguments:

- **`register`** - Object for hooking into parser methods
- **`pluginOptions`** - Key-value options from the header `(key=value ...)`  
- **`globalOptions`** - Global transpiler options (debug, js, recover, etc.)

#### Register Methods

- **`register.before(methodName, func)`** - Run before a parser method. If your function returns truthy, the original method is skipped.
- **`register.after(methodName, func)`** - Run after a parser method, only if it returned falsy.
- **`register.replace(methodName, func)`** - Replace a method entirely. Receives the original method as the first argument.

#### State API

The `State` object provides these key methods for plugins:

| Method | Description |
|--------|-------------|
| `s.read(pattern...)` | Consume tokens without emitting. Returns `undefined` if no match. |
| `s.emit(str...)` | Add strings to output. Numbers set source positions. |
| `s.accept(pattern...)` | Like `read()` but also emits matched tokens. |
| `s.acceptType(pattern...)` | Like `accept()` but output suppressed when `js=true`. |
| `s.peek(pattern...)` | Like `read` but reverts position afterwards. |
| `s.snapshot()` | Returns snapshot with `revert()`, `revertOutput()`, `hasOutput()`. |
| `s.must(value)` | Throws ParseError if value is falsy. Returns value on success. |
| `s.parseGroup(opts, itemFunc)` | Parse delimited/indented groups. |
| `s.recoverErrors(func)` | Try/catch with error recovery support. |

#### Parser Methods

You can hook into any `parse*` method. Common ones include:

- `parseStatement` - Top-level statements
- `parseExpression` - Expressions  
- `parseType` - Type annotations
- `parseTypeDecl` - Type declarations (`type X = ...`)

**Parser method contract:** Return truthy on success, falsy on failure. Leave state unchanged on failure.

> ⚠️ **Experimental API**: The plugin interface is still evolving. Expect breaking changes in minor releases until the API stabilizes. Pin your TabScript version if stability is critical.

## Browser Usage

For in-browser transpilation:

```html
<script type="module">
  import { transpileAll } from 'tabscript/browser';
  await transpileAll(); // Transpiles all <script type="text/tabscript"> tags
</script>

<script type="text/tabscript">
  tabscript 1.0
  console.log& "Hello from TabScript!"
</script>
```

## VSCode Extension

The TabScript VSCode extension provides full IDE support:

- **Syntax highlighting** - Comprehensive highlighting for TabScript syntax
- **IntelliSense** - Code completion, hover information, and signature help
- **Real-time diagnostics** - Instant error checking and type validation
- **Go to definition** - Navigate to symbol definitions (F12)
- **Symbol renaming** - Rename symbols across your project (F2)
- **Multi-file support** - Works seamlessly with imports between `.tab` files

### Installation

Install from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=tabscript.tabscript) or search for "TabScript" in the VSCode extensions panel.

### How It Works

The extension transpiles TabScript to TypeScript in memory as you type, then delegates to TypeScript's language service for all IDE features. This means you get the full power of TypeScript's type system while writing TabScript code.

The extension includes a vendored copy of the TabScript transpiler, but will prefer using a locally installed version from your project's `node_modules` if available. This ensures plugin compatibility and consistent transpilation behavior between your build process and the IDE.

## Learn More

Visit **[tabscript.vanviegen.net](https://tabscript.vanviegen.net/)** for:
- Interactive tutorial with live examples
- Complete language reference
- API documentation
- Real-time transpiler playground

## License

MIT
