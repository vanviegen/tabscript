import {tabscript, type PluginModule} from "./tabscript.js";

let transformCache: Record<string,string> = {};
let baseUrl = location.href;

// Plugin loader function for browser environment
function loadPlugin(pluginPath: string): PluginModule {
    // Resolve plugin path relative to current baseUrl
    const absoluteUrl = new URL(pluginPath, baseUrl).toString();
    
    // Fetch the plugin file synchronously
    const xhr = new XMLHttpRequest();
    xhr.open('GET', absoluteUrl, false);
    xhr.send(null);
    
    if (xhr.status !== 200) {
        throw new Error(`Failed to load plugin ${pluginPath}: HTTP ${xhr.status}`);
    }
    
    const pluginSource = xhr.responseText;
    
    // Transpile the plugin TabScript to JavaScript
    const pluginResult = tabscript(pluginSource, { js: true, whitespace: 'pretty', loadPlugin });
    if (pluginResult.errors.length > 0) {
        throw new Error(`Failed to transpile plugin ${pluginPath}: ${pluginResult.errors[0].message}`);
    }
    
    // Evaluate the transpiled code to get the plugin module
    // Convert ES module export to return value
    // Match 'export default' with any whitespace between (including newlines)
    const code = pluginResult.code.replace(/\bexport\s+default/, 'return');
    const pluginFn = Function(code)();
    
    return { default: pluginFn };
}

function transformImport(url: string): string {
    // Do we need to translate?
    if (url.slice(-3)==='.js') return url;

    const absoluteUrl = new URL(url, baseUrl).toString();
    let objectUrl = transformCache[absoluteUrl];
    if (!objectUrl) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', absoluteUrl, false); // false for synchronous request
        xhr.send(null);
        
        if (xhr.status !== 200) {
            throw new Error(`HTTP error! status: ${xhr.status} for ${absoluteUrl}`);
        }
        
        const ts = xhr.responseText;
        let oldBaseUrl = baseUrl;
        baseUrl = absoluteUrl;
        const js = tabscript(ts, {js: true, recover: true, transformImport, loadPlugin}) + "\n//# sourceURL=" + absoluteUrl;
        baseUrl = oldBaseUrl;
        const blob = new Blob([js], { type: 'application/javascript' });
        objectUrl = URL.createObjectURL(blob);
        transformCache[absoluteUrl] = objectUrl;
    }
    console.log(`tabscript browser transformed import`, absoluteUrl, objectUrl);
    return objectUrl;
}

export async function transpile(tsE: Element): Promise<void> {
    let ts: string;
    
    // Check if there's a src attribute
    let src = tsE.getAttribute('src');
    if (src) {
        src = new URL(src, baseUrl).toString();
        // Fetch the TabScript file
        const response = await fetch(src);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${src}: ${response.status} ${response.statusText}`);
        }
        ts = await response.text();
    } else {
        // Use inline code
        ts = tsE.textContent || '';
    }
    
    // Convert TabScript to JavaScript
    const jsE = document.createElement('script');
    let {code: js} = tabscript(ts, {js: true, transformImport, loadPlugin});
    if (src) js += "\n//# sourceURL=" + src;
    jsE.textContent = js;
    jsE.setAttribute('type', 'module');
            
    // Replace the TabScript script with the JavaScript one
    tsE.parentNode!.replaceChild(jsE, tsE);
}

export async function transpileAll(): Promise<void> {
    const tsEs = document.querySelectorAll('script[type="text/tabscript"]');
    for (const tsE of tsEs) {
        try {
            await transpile(tsE);
        } catch(e) {
            console.error(e);
        }
    }
}

document.addEventListener('DOMContentLoaded', transpileAll);