# TabScript

TabScript is an alternate syntax for TypeScript. Think CoffeeScript for the modern age: indentation replaces braces, `and`/`or` replace `&&`/`||`, and common patterns get shorter syntax. It's purely a syntactic layer - all the semantics are TypeScript.

**[📚 Read the full documentation and interactive tutorial](https://tabscript.vanviegen.net/)**

## Quick Example

```tabscript
tabscript 1.0

# Define a constant initialized to a function that takes one parameter
greet := |name: string|
	console.log(`Welcome, ${name}`)

interface User
	name: string
	age: number
	active: boolean
	role: string
	permissions: string[]

processUsers := |users: User[]|
	# Call the filter method using & syntax, to avoid parentheses
	active := users.filter& |u| u.active and u.age >= 18

	# The colon here causes `user` to be declared as a constant in the loop
	for user: of active
		if user.role == "admin" or user.permissions.includes("write")
			greet(user.name)
```

Transpiles very much 1-on-1 to the following TypeScript:

```typescript
const greet=(name:string)=>{
	console.log(`Welcome, ${name}`);
};
interface User{
	name: string
	age: number
	active: boolean
	role: string
	permissions: string[]
}
const processUsers=(users:User[])=>{
	const active=users.filter((u)=>u.active&&u.age >= 18);

	for(const user of active){
		if(user.role ==="admin" || user.permissions.includes("write")){
			greet(user.name);
		}
	}
};
```

With optional UI tag syntax for reactive frameworks:

```tabscript
tabscript 1.0 ui=A

items := ["Apple", "Banana", "Cherry"]

:div.container
	:h1 color:blue |Shopping List
	:ul
		for item: of items
			:li :span |${item}
```

Note how `:tags` are statements, so they can be intermixed with control flow.

Transpiles to method chains:

```typescript
const items=["Apple","Banana","Cherry"];
A.e("div").c("container").f(function(){
	A.e("h1").s("color","blue").t(`Shopping List`);
	A.e("ul").f(function(){
		for(const item of items)
			A.e("li").e("span").t(`${item}`);
	});
});
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
- **All of TypeScript** - Complete type system support
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
