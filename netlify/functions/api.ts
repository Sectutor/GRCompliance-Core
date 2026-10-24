// CRITICAL: Polyfill MUST run before any other code is evaluated
(function polyfill() {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : {};

    // Core Graphics
    if (typeof g.DOMMatrix === 'undefined') {
        g.DOMMatrix = class DOMMatrix {
            constructor() { }
            static fromFloat32Array() { return new DOMMatrix(); }
            static fromFloat64Array() { return new DOMMatrix(); }
            static fromMatrix() { return new DOMMatrix(); }
        };
        if (typeof global !== 'undefined') (global as any).DOMMatrix = g.DOMMatrix;
    }

    // Ensure 'process' is available as some bundlers might hide it
    if (typeof g.process === 'undefined' && typeof require !== 'undefined') {
        try {
            g.process = require('process');
        } catch (e) {
            // ignore
        }
    }

    // DOM stub for libraries. Generated links use APP_URL via appOrigin().
    if (typeof (g as any).location === 'undefined') {
        const stub = 'http://127.0.0.1:3001/';
        (g as any).location = {
            href: stub,
            origin: 'http://127.0.0.1:3001',
            protocol: 'http:',
            host: '127.0.0.1:3001',
            hostname: '127.0.0.1',
            pathname: '/',
            search: '',
            hash: '',
            toString: () => stub,
        };
    }
})();

const serverless = require("serverless-http");

let app;
let loadError: any = null;

try {
    const serverEntry = require("../../server_entry");
    app = serverEntry.app;
} catch (e) {
    console.error("FAILED TO LOAD APP:", e);
    loadError = e;
}

if (app) {
    module.exports.handler = serverless(app, {
        binary: [
            'application/zip',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/*',
        ]
    });
} else {
    module.exports.handler = async (event: any) => {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Initialization Error",
                message: loadError?.message || "App failed to load",
                stack: loadError?.stack
            })
        };
    };
}
