// This script augments TabScript examples in the documentation
// to allow editing and seeing the transpiled output in real-time.

let styleE = document.createElement('style');
styleE.innerText = `
.transpiler-container {
    margin: 1em 0;
}
.transpiler-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border: 1px solid #9096a2;
}
.transpiler-split.edit-mode,
.transpiler-split.stacked {
    grid-template-columns: 1fr;
}
.transpiler-pane {
    display: flex;
    flex-direction: column;
    min-height: 200px;
}
.transpiler-pane:first-child {
    border-right: 1px solid #9096a2;
}
.transpiler-split.edit-mode .transpiler-pane:first-child,
.transpiler-split.stacked .transpiler-pane:first-child {
    border-right: none;
    border-bottom: 1px solid #9096a2;
}
@media (max-width: 1599px) {
    .transpiler-split {
        grid-template-columns: 1fr;
    }
    .transpiler-pane:first-child {
        border-right: none;
        border-bottom: 1px solid #9096a2;
    }
}
.transpiler-header {
    padding: 0.5em 1em;
    background-color: var(--color-background-secondary);
    font-weight: bold;
    border-bottom: 1px solid #9096a2;
    position: relative;
}
.transpiler-tabs {
    display: flex;
    list-style: none;
    padding: 0;
    margin: 0;
    background-color: var(--color-background-secondary);
    border-bottom: 1px solid #9096a2;
}
.transpiler-tab {
    padding: 0.5em 1em;
    cursor: pointer;
    color: var(--color-text);
    transition: background-color 0.2s;
    font-weight: bold;
    font-size: 0.9em;
}
.transpiler-tab.active {
    background-color: var(--color-background);
    border-bottom: 3px solid var(--color-focus-outline);
}
.transpiler-tab:hover:not(.active) {
    background-color: var(--color-background-active);
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
.transpiler-button {
    display: inline-block;
    float: right;
    margin-left: 0.5em;
    color: #4c97f2;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background-color: transparent;
    font-size: 0.85em;
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
        const result = transpiler.tabscript(code, {
            stripTypes: options.stripTypes || false,
            recover: true,
            whitespace: 'pretty',
            ui: options.ui || null
        });

        return {
            output: result.code,
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

    // Split view container
    const splitE = document.createElement('div');
    splitE.className = 'transpiler-split';

    // Input pane
    const inputPaneE = document.createElement('div');
    inputPaneE.className = 'transpiler-pane';

    const inputHeaderE = document.createElement('div');
    inputHeaderE.className = 'transpiler-header';
    inputHeaderE.textContent = 'TabScript input';

    // Edit button in input header
    const editButtonE = document.createElement('button');
    editButtonE.className = 'transpiler-button';
    editButtonE.textContent = 'Edit';
    inputHeaderE.appendChild(editButtonE);

    // Copy button in input header
    const copyButtonE = document.createElement('button');
    copyButtonE.className = 'transpiler-button';
    copyButtonE.textContent = 'Copy';
    inputHeaderE.appendChild(copyButtonE);

    const inputContentE = document.createElement('div');
    inputContentE.className = 'transpiler-content';

    const inputPreE = document.createElement('pre');
    const inputCodeE = document.createElement('code');
    inputCodeE.className = 'language-tabscript';
    inputCodeE.textContent = initialCode;
    inputPreE.appendChild(inputCodeE);
    inputContentE.appendChild(inputPreE);

    inputPaneE.appendChild(inputHeaderE);
    inputPaneE.appendChild(inputContentE);

    // Output pane
    const outputPaneE = document.createElement('div');
    outputPaneE.className = 'transpiler-pane';

    // Output tabs
    const outputTabsE = document.createElement('ul');
    outputTabsE.className = 'transpiler-tabs';

    const tsTabE = document.createElement('li');
    tsTabE.className = 'transpiler-tab active';
    tsTabE.textContent = 'TypeScript';

    const jsTabE = document.createElement('li');
    jsTabE.className = 'transpiler-tab';
    jsTabE.textContent = 'JavaScript';

    outputTabsE.appendChild(tsTabE);
    outputTabsE.appendChild(jsTabE);

    const outputContentE = document.createElement('div');
    outputContentE.className = 'transpiler-content';

    const outputPreE = document.createElement('pre');
    const outputCodeE = document.createElement('code');
    outputCodeE.className = 'language-typescript';
    outputPreE.appendChild(outputCodeE);
    outputContentE.appendChild(outputPreE);

    outputPaneE.appendChild(outputTabsE);
    outputPaneE.appendChild(outputContentE);

    // Errors display
    const errorsE = document.createElement('div');
    errorsE.className = 'transpiler-errors';
    errorsE.style.display = 'none';

    splitE.appendChild(inputPaneE);
    splitE.appendChild(outputPaneE);

    container.appendChild(splitE);
    container.appendChild(errorsE);

    let currentCode = initialCode;
    let editor = null;
    let updateTimeout = null;
    let stripTypes = false;

    // Update transpiled output
    async function updateOutput() {
        const options = {
            stripTypes: stripTypes
        };

        // Update tab active state
        if (stripTypes) {
            tsTabE.classList.remove('active');
            jsTabE.classList.add('active');
        } else {
            jsTabE.classList.remove('active');
            tsTabE.classList.add('active');
        }

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

                // Handle ParseError objects or string errors
                if (error && typeof error === 'object' && 'line' in error && 'column' in error) {
                    // ParseError object
                    const locationE = document.createElement('span');
                    locationE.className = 'transpiler-error-location';
                    locationE.textContent = `Line ${error.line}, Column ${error.column}: `;
                    errorE.appendChild(locationE);
                    errorE.appendChild(document.createTextNode(error.message || String(error)));
                } else {
                    // String error - try to parse line:column format
                    const errorStr = String(error);
                    const match = errorStr.match(/^(.+?):(\d+):(\d+):\s*(.+)$/);
                    if (match) {
                        const [, file, line, col, message] = match;
                        const locationE = document.createElement('span');
                        locationE.className = 'transpiler-error-location';
                        locationE.textContent = `Line ${line}, Column ${col}: `;
                        errorE.appendChild(locationE);
                        errorE.appendChild(document.createTextNode(message));
                    } else {
                        errorE.textContent = errorStr;
                    }
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

    // Handle tab clicks
    tsTabE.addEventListener('click', () => {
        if (stripTypes) {
            stripTypes = false;
            updateOutput();
        }
    });

    jsTabE.addEventListener('click', () => {
        if (!stripTypes) {
            stripTypes = true;
            updateOutput();
        }
    });

    // Handle copy button
    copyButtonE.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(currentCode);
            const originalText = copyButtonE.textContent;
            copyButtonE.textContent = '✓';
            setTimeout(() => {
                copyButtonE.textContent = originalText;
            }, 1000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    });

    // Handle edit button
    editButtonE.addEventListener('click', async () => {
        if (editor) return; // Already editing

        inputPreE.innerHTML = '';
        editButtonE.style.display = 'none';
        copyButtonE.style.display = 'none';

        // Switch to stacked layout in edit mode
        splitE.classList.add('edit-mode');

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
    let isResizing = false;
    const resizeObserver = new ResizeObserver(() => {
        if (!isResizing) {
            editor.layout();
        }
    });
    resizeObserver.observe(containerE);

    editor.onDidContentSizeChange(() => {
        if (isResizing) return;

        const height = Math.max(200, Math.min(600, editor.getContentHeight()));
        const currentHeight = containerE.style.height;
        const newHeight = height + 'px';

        if (currentHeight !== newHeight) {
            isResizing = true;
            containerE.style.height = newHeight;
            editor.layout();
            // Use setTimeout to prevent immediate recursive calls
            setTimeout(() => {
                isResizing = false;
            }, 10);
        }
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
