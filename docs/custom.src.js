// This script provides syntax highlighting for all code blocks using Shiki,
// and augments TabScript examples to allow editing and transpilation in real-time.
// This is the source file - it gets bundled by esbuild during build-docs.

// Static imports for Shiki (bundled at build time)
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';
import langTypescript from '@shikijs/langs/typescript';
import langJavascript from '@shikijs/langs/javascript';
import langBash from '@shikijs/langs/bash';
import langShellscript from '@shikijs/langs/shellscript';
import langHtml from '@shikijs/langs/html';
import langJson from '@shikijs/langs/json';
import langCss from '@shikijs/langs/css';

// Static import for tabscript transpiler
import { tabscript } from 'tabscript';

let shikiHighlighter = null;
let shikiHighlighterPromise = null;
let tabscriptGrammar = null;

// Get base URL for assets
function getBaseUrl() {
    const base = document.body.parentElement.getAttribute('data-base') || '/';
    return new URL(base, window.location.href).href;
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
        // Load the TabScript grammar
        const grammar = await loadTabScriptGrammar();
        if (!grammar) {
            console.error('Could not load TabScript grammar');
            return null;
        }

        // Create the TabScript language definition
        const tabscriptLang = {
            ...grammar,
            name: 'tabscript',
            aliases: ['tab']
        };

        // Create JavaScript regex engine (no WASM needed)
        const jsEngine = createJavaScriptRegexEngine({ forgiving: true });

        // Create highlighter with pre-imported themes and languages
        const highlighter = await createHighlighterCore({
            themes: [githubDark, githubLight],
            langs: [
                langTypescript,
                langJavascript,
                langBash,
                langShellscript,
                langHtml,
                langJson,
                langCss,
                tabscriptLang
            ],
            engine: jsEngine
        });

        shikiHighlighter = highlighter;
        return highlighter;
    })();

    return shikiHighlighterPromise;
}

// Determine current theme
function getCurrentTheme() {
    const isDark = document.documentElement.dataset.theme === 'dark' ||
        (document.documentElement.dataset.theme === 'os' &&
         window.matchMedia('(prefers-color-scheme: dark)').matches);
    return isDark ? 'github-dark' : 'github-light';
}

// Highlight code using Shiki
async function highlightCode(code, lang) {
    const highlighter = await loadShikiHighlighter();
    if (!highlighter) {
        // Fallback to plain text
        const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre><code>${escaped}</code></pre>`;
    }

    const theme = getCurrentTheme();
    
    // Map language aliases
    const langMap = {
        'tab': 'tabscript',
        'ts': 'typescript',
        'js': 'javascript',
        'sh': 'bash',
        'shell': 'shellscript',
        'console': 'bash'
    };
    const mappedLang = langMap[lang] || lang;

    // Check if language is supported, fallback to plaintext if not
    const loadedLangs = highlighter.getLoadedLanguages();
    const finalLang = loadedLangs.includes(mappedLang) ? mappedLang : 'text';

    try {
        return highlighter.codeToHtml(code, {
            lang: finalLang,
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
function transpileCode(code, options = {}) {
    // Ensure header exists. Also, TypeDoc comment examples use 4-space indents.
    const codeWithHeader = ensureHeader(code).replace(/    /g, '\t');

    try {
        const result = tabscript(codeWithHeader, {
            js: options.js || false,
            recover: true,
            whitespace: 'pretty'
        });
        let output = result.code;
        if (code !== codeWithHeader) {
            output = output.replace(/\n\n/, ''); // Strip the two empty lines
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

// Create a transpiler widget with side-by-side view and editing
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

        const result = transpileCode(currentCode, options);
        
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

    // Handle edit button - dynamically loads Monaco editor
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

// Load Monaco editor with Shiki highlighting (dynamically imported on demand)
async function loadEditor(containerE, language, code, onChange) {
    // Load Monaco from CDN
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

    // Load shiki-monaco integration dynamically
    const { shikiToMonaco } = await import('https://esm.sh/@shikijs/monaco@3');
    
    // Get the already-loaded Shiki highlighter
    const highlighter = await loadShikiHighlighter();

    // Register TabScript language with Monaco
    monaco.languages.register({ id: 'tabscript' });
    monaco.languages.register({ id: 'typescript' });
    monaco.languages.register({ id: 'javascript' });

    // Use Shiki for Monaco syntax highlighting
    if (highlighter) {
        shikiToMonaco(highlighter, monaco);
    }

    const theme = getCurrentTheme();

    // Create editor
    const editor = monaco.editor.create(containerE, {
        value: code,
        language: 'tabscript',
        theme: theme,
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

// Create a simple highlighted code block (for non-TabScript code)
async function createHighlightedCodeBlock(preE, codeE, code, lang) {
    const html = await highlightCode(code, lang);
    
    // Create a wrapper div
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    
    // Get the generated pre element
    const newPreE = wrapper.querySelector('pre');
    if (newPreE) {
        // Add copy button
        const copyButton = document.createElement('button');
        copyButton.className = 'code-copy-button';
        copyButton.textContent = 'Copy';
        copyButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(code);
                copyButton.textContent = '✓';
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                }, 1000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        });
        newPreE.style.position = 'relative';
        newPreE.appendChild(copyButton);
        
        // Replace original pre with highlighted version
        preE.parentNode.replaceChild(newPreE, preE);
    }
}

// Detect language from code element classes
function detectLanguage(codeE) {
    const classList = Array.from(codeE.classList);
    
    // Check for language-* class
    for (const cls of classList) {
        if (cls.startsWith('language-')) {
            return cls.replace('language-', '');
        }
    }
    
    // Check for direct language class names
    const knownLangs = ['tabscript', 'tab', 'typescript', 'ts', 'javascript', 'js', 'bash', 'sh', 'shell', 'html', 'css', 'json'];
    for (const cls of classList) {
        if (knownLangs.includes(cls)) {
            return cls;
        }
    }
    
    return null;
}

// Check if this is a TabScript code block
function isTabScriptCodeBlock(lang) {
    return lang === 'tabscript' || lang === 'tab' || lang === 'language-tabscript' || lang === 'language-tab';
}

// Process all code blocks on page load
addEventListener('DOMContentLoaded', async () => {
    // Find all code blocks
    const codeBlocks = document.querySelectorAll('pre > code');
    
    for (const codeE of codeBlocks) {
        const preE = codeE.parentElement;
        
        // Skip if already processed
        if (preE.dataset.codeProcessed) continue;
        preE.dataset.codeProcessed = 'true';
        
        // Detect language
        const lang = detectLanguage(codeE);
        if (!lang) continue; // Skip code blocks without language specified
        
        // Extract code text
        const code = codeE.textContent || '';
        
        if (isTabScriptCodeBlock(lang)) {
            // Show full transpiler widget for TabScript
            const widget = createTranspilerWidget(codeE, code);
            preE.parentNode.insertBefore(widget, preE);
            preE.style.display = 'none';
        } else {
            // Apply syntax highlighting for other languages
            await createHighlightedCodeBlock(preE, codeE, code, lang);
        }
    }
});
