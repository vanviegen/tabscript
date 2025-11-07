# Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Test the Extension

Press **F5** in VS Code to launch the Extension Development Host.

### Step 2: Create a Test Project

In the Extension Development Host terminal:

```bash
mkdir ~/tabscript-test
cd ~/tabscript-test
npm init -y
npm install tabscript
```

### Step 3: Write TabScript Code

Create a file `hello.tab`:

```tabscript
// TabScript - cleaner syntax for TypeScript!

// Type inference with :=
greeting := "Hello, TabScript!"

// Functions use || instead of ()
function greet|name: string| : string
    return `${greeting} ${name}`

// Arrow functions
double := |x: number| x * 2

// Union types with 'or'
value : string or number = 42

// Function calls without parens
console.log& greet& "World"
console.log& double& 21

// Classes and interfaces work too
interface Person
    name: string
    age: number

class Developer
    name: string
    constructor|name: string|
        this.name = name
    
    greet||
        console.log& `Hi, I'm ${this.name}`

dev := new Developer("Frank")
dev.greet()
```

Save the file and watch:
- ✅ Syntax highlighting
- ✅ IntelliSense (completions, hover, signatures)
- ✅ Real-time error checking
- ✅ Go to definition (Ctrl+Click)

## 📝 What Next?

### Explore the Examples
Check out `examples/in.tab` to see comprehensive TabScript syntax.

### Read the Docs
- `README.md` - User documentation
- `SETUP.md` - Detailed setup guide
- `DEVELOPMENT.md` - Architecture details
- `IMPLEMENTATION_SUMMARY.md` - Complete feature list

### Customize
- Modify `syntaxes/tabscript.tmLanguage.json` for highlighting
- Extend `src/server.ts` for new language features
- Update `package.json` for extension metadata

### Debug
- Set breakpoints in `src/extension.ts` or `src/server.ts`
- View logs: **View → Output → TabScript Language Server**
- Check diagnostics in **Problems** panel

## 🎯 Key Shortcuts

- **F5**: Launch Extension Development Host
- **Ctrl+R**: Reload Extension Development Host
- **Ctrl+Space**: Trigger completions
- **Ctrl+Click**: Go to definition
- **Ctrl+Shift+Space**: Signature help

## 💡 Tips

1. **Without tabscript installed**: Only syntax highlighting works
2. **Install tabscript in project**: Get full IntelliSense
3. **Multiple errors**: Extension uses `recover: true` to show all errors
4. **Performance**: Results are cached, transpilation is debounced

## 🐛 Troubleshooting

**No IntelliSense?**
- Check if `tabscript` is installed: `npm list tabscript`
- Look for warnings in Output panel

**Errors in wrong place?**
- Position mapping is line-level (column may be approximate)
- TabScript preserves most positions well

**Extension not loading?**
- Check file extension is `.tab`
- Reload window: Ctrl+Shift+P → "Developer: Reload Window"

## 🎉 You're Ready!

Start coding in TabScript and enjoy clean syntax with full TypeScript power!

---

**Questions?** Check SETUP.md or DEVELOPMENT.md for more details.
