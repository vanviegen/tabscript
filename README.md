# TabScript

TabScript is an alternate syntax for TypeScript. Think CoffeeScript for the modern age: indentation replaces braces, `and`/`or` replace `&&`/`||`, and common patterns get shorter syntax. It's purely a syntactic layer - all the semantics are TypeScript.

**[📚 Read the full documentation and interactive tutorial](https://tabscript.vanviegen.net/)**

## Quick Example

```
# TabScript - Process and filter user data
processUsers := |users|
	active := users.filter |u| u.active and u.age >= 18

	for user: of active
		if user.role == "admin" or user.permissions.includes("write")
			console.log("Granting access:", user.name)

greet := |name| "Hello, " + name
```

Transpiles to clean TypeScript:

```typescript
const processUsers = (users) => {
	const active = users.filter((u) => u.active && u.age >= 18);

	for (const user of active) {
		if (user.role === "admin" || user.permissions.includes("write")) {
			console.log("Granting access:", user.name);
		}
	}
};

const greet = (name) => "Hello, " + name;
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
tabscript input.tab --strip-types --output output.js
```

## Key Features

- **Indentation-based syntax** - No braces required
- **Shorthand operators** - `:` for const, `::` for let, `||` for function params, `&` for function calls
- **Readable operators** - `and`/`or` instead of `&&`/`||`, strict equality by default
- **Full TypeScript compatibility** - Complete type system support
- **VSCode extension** - Full IntelliSense and type checking
- **Browser support** - Runtime transpilation for `.tab` files
- **UI tag syntax** - Optional JSX-like syntax for frameworks like Aberdeen.js

## Learn More

Visit **[tabscript.vanviegen.net](https://tabscript.vanviegen.net/)** for:
- Interactive tutorial with live examples
- Complete language reference
- API documentation
- Real-time transpiler playground

## License

MIT
