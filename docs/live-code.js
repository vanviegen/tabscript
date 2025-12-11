// This script augments TabScript examples in the documentation
// to allow editing and seeing the transpiled output in real-time.
// Only runs on the Tutorial page.

// Check if we're on the Tutorial page
function isTutorialPage() {
    return window.location.pathname.includes('Tutorial') ||
           document.title.includes('Tutorial');
}

// Exit early if not on Tutorial page
if (!isTutorialPage()) {
    // Don't run any of the live-code functionality
} else {
    // Add styles
    const styleE = document.createElement('style');
    styleE.innerText = `
/* Override TypeDoc layout for Tutorial page - move TOC below content */
@media (min-width: 1200px) {
    .container-main {
        grid-template-columns: minmax(0, 1fr) minmax(0, 4fr) !important;
        grid-template-areas: 
            "sidebar content"
            "sidebar toc" !important;
    }
    .page-menu {
        padding-left: 0 !important;
        padding-top: 1rem;
        border-top: 1px solid var(--color-accent);
    }
    /* Make TOC horizontal on the wider layout */
    .page-menu .tsd-accordion-details > ul {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1.5rem;
    }
    .page-menu .tsd-accordion-details > ul > li > ul {
        display: none;
    }
}

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
    overflow: hidden;
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
.transpiler-content pre.shiki {
    padding: 1em;
    background-color: var(--color-background) !important;
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
.transpiler-editor-container {
    height: 100%;
    min-height: 200px;
}
`;
    document.head.appendChild(styleE);

    let transpilerModule = null;
    let shikiHighlighterPromise = null;
    let tabscriptGrammar = null;

    // Get base URL for assets
    function getBaseUrl() {
        const base = document.body.parentElement.getAttribute('data-base') || '/';
        return new URL(base, window.location.href).href;
    }

    // Load the TabScript transpiler
    async function loadTranspiler() {
        if (transpilerModule) return transpilerModule;

        const absBase = getBaseUrl();

        try {
            transpilerModule = await import(absBase + 'assets/tabscript/tabscript.js');
            return transpilerModule;
        } catch (error) {
            console.error('Failed to load TabScript transpiler:', error);
            return null;
        }
    }

    // Load the TabScript TextMate grammar
    async function loadTabScriptGrammar() {
        if (tabscriptGrammar) return tabscriptGrammar;

        const absBase = getBaseUrl();

        try {
            const response = await fetch(absBase + 'assets/tabscript/tabscript.tmLanguage.json');
            tabscriptGrammar = await response.json();
            return tabscriptGrammar;
        } catch (error) {
            console.error('Failed to load TabScript grammar:', error);
            return null;
        }
    }

    // Load Shiki highlighter with TabScript grammar (singleton with promise caching)
    function loadShikiHighlighter() {
        if (shikiHighlighterPromise) return shikiHighlighterPromise;

        shikiHighlighterPromise = (async () => {
            // Load Shiki from CDN
            const { createHighlighter } = await import('https://esm.sh/shiki@3');
            
            // Load the TabScript grammar
            const grammar = await loadTabScriptGrammar();
            if (!grammar) {
                console.error('Could not load TabScript grammar');
                return null;
            }

            // Create the TabScript language definition
            // Pass the entire grammar object which includes patterns and repository
            const tabscriptLang = {
                ...grammar,
                name: 'tabscript',
                aliases: ['tab']
            };

            console.log('Loading TabScript language:', tabscriptLang);

            // Create highlighter with TabScript and built-in languages
            const highlighter = await createHighlighter({
                themes: ['github-dark', 'github-light'],
                langs: [
                    'typescript',
                    'javascript',
                    tabscriptLang
                ]
            });

            console.log('Highlighter created, languages:', highlighter.getLoadedLanguages());

            return highlighter;
        })();

        return shikiHighlighterPromise;
    }

    // Highlight code using Shiki
    async function highlightCode(code, lang) {
        const highlighter = await loadShikiHighlighter();
        if (!highlighter) {
            // Fallback to plain text
            const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre><code>${escaped}</code></pre>`;
        }

        // Determine theme based on current page theme
        const isDark = document.documentElement.dataset.theme === 'dark' ||
            (document.documentElement.dataset.theme === 'os' &&
             window.matchMedia('(prefers-color-scheme: dark)').matches);

        const theme = isDark ? 'github-dark' : 'github-light';
        
        // Map language aliases
        const langMap = {
            'tab': 'tabscript',
            'ts': 'typescript',
            'js': 'javascript'
        };
        const mappedLang = langMap[lang] || lang;

        try {
            return highlighter.codeToHtml(code, {
                lang: mappedLang,
                theme: theme
            });
        } catch (error) {
            console.error('Highlighting error:', error);
            const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre><code>${escaped}</code></pre>`;
        }
    }

    // Check if code has a TabScript header
    function hasHeader(code) {
        const trimmed = code.trim();
        return trimmed.startsWith('tabscript ');
    }

    // Prepend header if missing
    function ensureHeader(code) {
        if (hasHeader(code)) {
            return code;
        }
        return 'tabscript 1.0\n\n' + code;
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

        // Ensure header exists
        const codeWithHeader = ensureHeader(code);

        try {
            const result = transpiler.tabscript(codeWithHeader, {
                js: options.js || false,
                recover: true,
                whitespace: 'pretty'
            });
            let output = result.code;
            if (code !== codeWithHeader) {
                output = output.slice(2); // Strip the two empty lines
            }

            return {
                output,
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

        // Will be populated with highlighted code
        const inputCodeWrapperE = document.createElement('div');
        inputCodeWrapperE.className = 'input-code-wrapper';
        inputContentE.appendChild(inputCodeWrapperE);

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

        // Will be populated with highlighted code
        const outputCodeWrapperE = document.createElement('div');
        outputCodeWrapperE.className = 'output-code-wrapper';
        outputContentE.appendChild(outputCodeWrapperE);

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
        let js = false;

        // Highlight and display input code
        async function displayInputCode(code) {
            const html = await highlightCode(code, 'tabscript');
            inputCodeWrapperE.innerHTML = html;
        }

        // Update transpiled output
        async function updateOutput() {
            const options = {
                js: js
            };

            // Update tab active state
            if (js) {
                tsTabE.classList.remove('active');
                jsTabE.classList.add('active');
            } else {
                jsTabE.classList.remove('active');
                tsTabE.classList.add('active');
            }

            const result = await transpileCode(currentCode, options);
            
            // Highlight output
            const lang = options.js ? 'javascript' : 'typescript';
            const html = await highlightCode(result.output, lang);
            outputCodeWrapperE.innerHTML = html;

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
        }

        // Initial display
        displayInputCode(initialCode);
        updateOutput();

        // Handle tab clicks
        tsTabE.addEventListener('click', () => {
            if (js) {
                js = false;
                updateOutput();
            }
        });

        jsTabE.addEventListener('click', () => {
            if (!js) {
                js = true;
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

            inputCodeWrapperE.remove();
            editButtonE.style.display = 'none';
            copyButtonE.style.display = 'none';

            // Switch to stacked layout in edit mode
            splitE.classList.add('edit-mode');

            // Ensure header when entering edit mode
            const codeToEdit = ensureHeader(currentCode);
            currentCode = codeToEdit;

            // Create editor container
            const editorContainerE = document.createElement('div');
            editorContainerE.className = 'transpiler-editor-container';
            inputContentE.appendChild(editorContainerE);

            editor = await loadEditor(editorContainerE, 'tabscript', codeToEdit, (newCode) => {
                currentCode = newCode;
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(updateOutput, 300);
            });
        });

        return container;
    }

    // Load Monaco editor with Shiki highlighting
    async function loadEditor(containerE, language, code, onChange) {
        // Load Monaco and Shiki Monaco integration from CDN
        if (!window.monaco) {
            await new Promise(resolve => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.54.0/min/vs/loader.min.js';
                script.onload = resolve;
                document.head.appendChild(script);
            });

            await new Promise(resolve => {
                require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.54.0/min/vs' }});
                require(['vs/editor/editor.main'], resolve);
            });
        }

        // Load shiki-monaco integration
        const { shikiToMonaco } = await import('https://esm.sh/@shikijs/monaco@3');
        
        // Get or create the Shiki highlighter
        const highlighter = await loadShikiHighlighter();

        // Register TabScript language with Monaco
        monaco.languages.register({ id: 'tabscript' });
        monaco.languages.register({ id: 'typescript' });
        monaco.languages.register({ id: 'javascript' });

        // Use Shiki for Monaco syntax highlighting
        if (highlighter) {
            shikiToMonaco(highlighter, monaco);
        }

        // Determine theme
        const isDark = document.documentElement.dataset.theme === 'dark' ||
            (document.documentElement.dataset.theme === 'os' &&
             window.matchMedia('(prefers-color-scheme: dark)').matches);

        // Create editor
        const editor = monaco.editor.create(containerE, {
            value: code,
            language: 'tabscript',
            theme: isDark ? 'github-dark' : 'github-light',
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
            tabSize: 4,
            insertSpaces: false,
            detectIndentation: false,
        });

        // Auto-resize editor
        let lastSetHeight = null;

        const resizeObserver = new ResizeObserver(() => {
            editor.layout();
        });
        resizeObserver.observe(document.body);

        editor.onDidContentSizeChange(() => {
            const contentHeight = editor.getContentHeight();
            const height = Math.max(200, Math.min(600, contentHeight));
            const newHeight = height + 'px';

            if (lastSetHeight !== newHeight) {
                lastSetHeight = newHeight;
                containerE.style.height = newHeight;
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
}
