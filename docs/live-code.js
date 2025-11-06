// This script augments TabScript examples in the documentation
// to allow editing and seeing the transpiled output in real-time.

let styleE = document.createElement('style');
styleE.innerText = `
.transpiler-container {
    margin: 1em 0;
}
.transpiler-options {
    display: flex;
    gap: 1em;
    padding: 0.5em;
    background-color: var(--color-background-secondary);
    border: 1px solid #9096a2;
    border-bottom: none;
}
.transpiler-options label {
    display: flex;
    align-items: center;
    gap: 0.5em;
    cursor: pointer;
    font-size: 0.9em;
}
.transpiler-options input[type="checkbox"] {
    cursor: pointer;
}
.transpiler-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border: 1px solid #9096a2;
}
.transpiler-pane {
    display: flex;
    flex-direction: column;
    min-height: 200px;
}
.transpiler-pane:first-child {
    border-right: 1px solid #9096a2;
}
.transpiler-header {
    padding: 0.5em 1em;
    background-color: var(--color-background-secondary);
    font-weight: bold;
    border-bottom: 1px solid #9096a2;
}
.transpiler-content {
    flex: 1;
    position: relative;
    overflow: hidden;
}
.transpiler-content pre {
    margin: 0;
    border: none;
    border-radius: 0;
    height: 100%;
    overflow: auto;
}
.transpiler-errors {
    padding: 0.5em 1em;
    background-color: #2a1a1a;
    border-top: 1px solid #9096a2;
    max-height: 150px;
    overflow-y: auto;
}
.transpiler-error {
    color: #ff6b6b;
    font-family: monospace;
    font-size: 0.9em;
    padding: 0.25em 0;
}
.transpiler-error-location {
    color: #ffa500;
    font-weight: bold;
}
.transpiler-edit-button {
    position: absolute;
    top: 0.5em;
    right: 0.5em;
    padding: 0.5em 1em;
    background-color: var(--color-link);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    z-index: 10;
}
.transpiler-edit-button:hover {
    opacity: 0.8;
}
`;
document.head.appendChild(styleE);

let transpilerModule = null;

// Load the TabScript transpiler
async function loadTranspiler() {
    if (transpilerModule) return transpilerModule;

    const base = document.body.parentElement.getAttribute('data-base') || '/';
    const absBase = new URL(base, window.location.href).href;

    try {
        transpilerModule = await import(absBase + 'assets/tabscript/tabscript.js');
        return transpilerModule;
    } catch (error) {
        console.error('Failed to load TabScript transpiler:', error);
        return null;
    }
}

// Transpile TabScript code
async function transpileCode(code, options = {}) {
    const transpiler = await loadTranspiler();
    if (!transpiler) {
        return {
            output: '// Failed to load transpiler',
            errors: ['Failed to load TabScript transpiler module']
        };
    }

    try {
        const result = transpiler.transpile(code, {
            stripTypes: options.stripTypes || false,
            recover: true,
            whitespace: 'pretty',
            ui: options.ui || null
        });

        return {
            output: result.output,
            errors: result.errors || []
        };
    } catch (error) {
        return {
            output: '// Transpilation failed',
            errors: [error.message || String(error)]
        };
    }
}

// Create a transpiler widget
function createTranspilerWidget(codeE, initialCode) {
    const container = document.createElement('div');
    container.className = 'transpiler-container';

    // Options bar
    const optionsE = document.createElement('div');
    optionsE.className = 'transpiler-options';

    const stripTypesCheckbox = document.createElement('input');
    stripTypesCheckbox.type = 'checkbox';
    stripTypesCheckbox.id = 'strip-types-' + Math.random();

    const stripTypesLabel = document.createElement('label');
    stripTypesLabel.htmlFor = stripTypesCheckbox.id;
    stripTypesLabel.appendChild(stripTypesCheckbox);
    stripTypesLabel.appendChild(document.createTextNode(' Output JavaScript (strip types)'));

    optionsE.appendChild(stripTypesLabel);

    // Split view container
    const splitE = document.createElement('div');
    splitE.className = 'transpiler-split';

    // Input pane
    const inputPaneE = document.createElement('div');
    inputPaneE.className = 'transpiler-pane';

    const inputHeaderE = document.createElement('div');
    inputHeaderE.className = 'transpiler-header';
    inputHeaderE.textContent = 'TabScript Input';

    const inputContentE = document.createElement('div');
    inputContentE.className = 'transpiler-content';

    const inputPreE = document.createElement('pre');
    const inputCodeE = document.createElement('code');
    inputCodeE.className = 'language-tabscript';
    inputCodeE.textContent = initialCode;
    inputPreE.appendChild(inputCodeE);
    inputContentE.appendChild(inputPreE);

    const editButtonE = document.createElement('button');
    editButtonE.className = 'transpiler-edit-button';
    editButtonE.textContent = 'Edit';
    inputContentE.appendChild(editButtonE);

    inputPaneE.appendChild(inputHeaderE);
    inputPaneE.appendChild(inputContentE);

    // Output pane
    const outputPaneE = document.createElement('div');
    outputPaneE.className = 'transpiler-pane';

    const outputHeaderE = document.createElement('div');
    outputHeaderE.className = 'transpiler-header';
    outputHeaderE.textContent = 'TypeScript Output';

    const outputContentE = document.createElement('div');
    outputContentE.className = 'transpiler-content';

    const outputPreE = document.createElement('pre');
    const outputCodeE = document.createElement('code');
    outputCodeE.className = 'language-typescript';
    outputPreE.appendChild(outputCodeE);
    outputContentE.appendChild(outputPreE);

    outputPaneE.appendChild(outputHeaderE);
    outputPaneE.appendChild(outputContentE);

    // Errors display
    const errorsE = document.createElement('div');
    errorsE.className = 'transpiler-errors';
    errorsE.style.display = 'none';

    splitE.appendChild(inputPaneE);
    splitE.appendChild(outputPaneE);

    container.appendChild(optionsE);
    container.appendChild(splitE);
    container.appendChild(errorsE);

    let currentCode = initialCode;
    let editor = null;
    let updateTimeout = null;

    // Update transpiled output
    async function updateOutput() {
        const options = {
            stripTypes: stripTypesCheckbox.checked
        };

        outputHeaderE.textContent = options.stripTypes ? 'JavaScript Output' : 'TypeScript Output';
        outputCodeE.className = options.stripTypes ? 'language-javascript' : 'language-typescript';

        const result = await transpileCode(currentCode, options);
        outputCodeE.textContent = result.output;

        // Display errors
        if (result.errors && result.errors.length > 0) {
            errorsE.innerHTML = '';
            errorsE.style.display = 'block';

            for (const error of result.errors) {
                const errorE = document.createElement('div');
                errorE.className = 'transpiler-error';

                // Try to parse error with line:column format
                const match = error.match(/^(.+?):(\d+):(\d+):\s*(.+)$/);
                if (match) {
                    const [, file, line, col, message] = match;
                    const locationE = document.createElement('span');
                    locationE.className = 'transpiler-error-location';
                    locationE.textContent = `Line ${line}, Column ${col}: `;
                    errorE.appendChild(locationE);
                    errorE.appendChild(document.createTextNode(message));
                } else {
                    errorE.textContent = error;
                }

                errorsE.appendChild(errorE);
            }
        } else {
            errorsE.style.display = 'none';
        }

        // Re-highlight if Prism is available
        if (window.Prism) {
            Prism.highlightElement(outputCodeE);
        }
    }

    // Initial transpilation
    updateOutput();

    // Handle strip types checkbox
    stripTypesCheckbox.addEventListener('change', updateOutput);

    // Handle edit button
    editButtonE.addEventListener('click', async () => {
        if (editor) return; // Already editing

        inputPreE.innerHTML = '';
        editButtonE.style.display = 'none';

        editor = await loadEditor(inputPreE, 'tabscript', currentCode, (newCode) => {
            currentCode = newCode;
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(updateOutput, 300);
        });
    });

    return container;
}

// Load Monaco editor
async function loadEditor(containerE, language, code, onChange) {
    if (!window.monaco) {
        await new Promise(resolve => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js';
            script.onload = resolve;
            document.head.appendChild(script);
        });

        await new Promise(resolve => {
            require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs' }});
            require(['vs/editor/editor.main'], resolve);
        });
    }

    // Create editor
    const editor = monaco.editor.create(containerE, {
        value: code,
        language: language === 'tabscript' ? 'typescript' : language, // Use TypeScript highlighting for TabScript
        theme: 'vs-dark',
        minimap: {
            enabled: false
        },
        scrollBeyondLastLine: false,
        scrollbar: {
            vertical: 'auto',
            verticalScrollbarSize: 8,
            alwaysConsumeMouseWheel: false,
        },
        lineNumbers: "on",
        fontSize: 13,
    });

    // Auto-resize editor
    const resizeObserver = new ResizeObserver(() => {
        editor.layout();
    });
    resizeObserver.observe(containerE);

    editor.onDidContentSizeChange(() => {
        const height = Math.max(200, Math.min(600, editor.getContentHeight()));
        containerE.style.height = height + 'px';
        editor.layout();
    });

    // Add change handler
    if (onChange) {
        editor.onDidChangeModelContent(() => {
            onChange(editor.getValue());
        });
    }

    return editor;
}

// Process all TabScript code blocks
addEventListener('DOMContentLoaded', () => {
    for (let codeE of document.querySelectorAll('code.tabscript, code.tab, code.language-tabscript, code.language-tab')) {
        const preE = codeE.parentElement;
        if (preE.tagName !== 'PRE') continue;

        // Skip if already processed
        if (preE.dataset.transpilerProcessed) continue;
        preE.dataset.transpilerProcessed = 'true';

        // Extract code - TypeDoc doesn't add syntax highlighting spans, just text
        let code = codeE.textContent || '';

        // Create and insert widget
        const widget = createTranspilerWidget(codeE, code);
        preE.parentNode.insertBefore(widget, preE);
        preE.style.display = 'none'; // Hide original code block
    }
});
