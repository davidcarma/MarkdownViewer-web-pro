/* Browser boundaries for document-controlled markup. Vendored DOMPurify 3.4.18. */
window.RenderBoundary = (() => {
    'use strict';
    const words = value => value.trim().split(/\s+/);
    const clean = (markup, options) => {
        // Template contents have an inert owner document: even the first parse cannot load images.
        const template = document.createElement('template');
        template.innerHTML = markup;
        return DOMPurify.sanitize(template.content, {
            RETURN_DOM_FRAGMENT: true,
            ALLOW_DATA_ATTR: false,
            ALLOW_ARIA_ATTR: false,
            // Preview images may use same-origin blob: URLs; the img pass below
            // still restricts src to blob: or inline data:image only.
            ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|blob):|data:image\/|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
            ...options
        });
    };
    function html(markup) {
        const doc = clean(markup, {
            ALLOWED_TAGS: words(`a abbr article aside b blockquote br caption cite code col colgroup dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p pre q s samp section small span strong sub summary sup table tbody td th thead tfoot tr u ul var`),
            ALLOWED_ATTR: words('alt class colspan data-line data-line-end height href id open rowspan src start title width')
        });
        for (const el of doc.querySelectorAll('*')) {
            if (el.hasAttribute('id')) el.id = 'md-' + el.id;
            if (el.hasAttribute('class')) {
                const language = el.tagName === 'CODE' && [...el.classList].find(c => /^language-[\w+-]+$/.test(c));
                if (language) el.className = language; else el.removeAttribute('class');
            }
            if (el.hasAttribute('href')) {
                const href = el.getAttribute('href');
                if (el.tagName !== 'A') el.removeAttribute('href');
                else if (href.startsWith('#')) el.setAttribute('href', '#md-' + href.slice(1));
                else {
                    let safe = false;
                    try { safe = ['https:', 'http:', 'mailto:'].includes(new URL(href, location.href).protocol); } catch (_) {}
                    if (!safe) el.removeAttribute('href');
                    else { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
                }
            }
            // Only embedded images are passive resources; even a relative URL can be a tracker.
            if (el.tagName === 'IMG') {
                const src = el.getAttribute('src') || '';
                const embedded = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[\w+/=\s]+$/i.test(src);
                const objectUrl = /^blob:/i.test(src);
                if (!embedded && !objectUrl) {
                    const label = `[Image not loaded: ${el.alt || 'image'}]`;
                    let url;
                    try { if (el.getAttribute('src')) url = new URL(el.getAttribute('src'), location.href); } catch (_) {}
                    if (url && ['http:', 'https:'].includes(url.protocol)) {
                        const link = document.createElement('a');
                        link.href = url.href; link.textContent = label;
                        link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer';
                        el.replaceWith(link);
                    } else el.replaceWith(document.createTextNode(label));
                }
            } else el.removeAttribute('src');
        }
        return doc;
    }

    // Mermaid performs layout in a live DOM before returning SVG. Isolate that stage too,
    // not merely its result. The frame has an opaque origin, no network resource access,
    // and can run only the two app-supplied scripts. Documents travel via MessagePort.
    function frameMain() {
        addEventListener('message', async event => {
            if (event.source !== parent || !event.ports[0]) return;
            const port = event.ports[0];
            try {
                const { id, code, config, properties } = event.data;
                mermaid.initialize({ ...config, securityLevel: 'strict', startOnLoad: false });
                const result = await mermaid.render(id, code);
                const host = document.createElement('div');
                document.body.append(host);
                host.innerHTML = result.svg;
                // Flatten theme styles; never export a document-supplied stylesheet into the editor.
                for (const el of host.querySelectorAll('svg, svg *')) {
                    const style = getComputedStyle(el);
                    const declarations = properties.map(key => `${key}:${style.getPropertyValue(key)}`).join(';');
                    el.setAttribute('style', declarations);
                }
                host.querySelectorAll('style').forEach(el => el.remove());
                port.postMessage({ markup: host.innerHTML });
            } catch (err) { port.postMessage({ error: String(err.message || err) }); }
            finally { port.close(); }
        });
    }
    const properties = words('color background-color fill fill-opacity stroke stroke-width stroke-dasharray stroke-opacity opacity font-size font-family font-weight font-style text-anchor dominant-baseline white-space line-height text-align display width height max-width box-sizing align-items justify-content padding-top padding-bottom padding-left padding-right');
    const fragmentPaint = /^url\(["']?#[\w.-]+["']?\)$/i;
    function diagram(markup) {
        const doc = clean(markup, {
            ALLOWED_TAGS: words('svg g path rect circle ellipse line polyline polygon text tspan title desc defs marker symbol use clipPath linearGradient radialGradient stop foreignObject div p span br b i strong em').map(t => t.toLowerCase()),
            HTML_INTEGRATION_POINTS: { foreignobject: true },
            ALLOWED_ATTR: words('xmlns id class x y x1 y1 x2 y2 cx cy r rx ry width height viewBox preserveAspectRatio transform d points dx dy textLength lengthAdjust markerWidth markerHeight refX refY orient markerUnits marker-start marker-mid marker-end clip-path fill-rule clip-rule href offset stop-color style').map(a => a.toLowerCase())
        });
        for (const el of doc.querySelectorAll('*')) {
            if (el.hasAttribute('href') && !/^#[\w.-]+$/.test(el.getAttribute('href'))) el.removeAttribute('href');
            for (const key of ['marker-start','marker-mid','marker-end','clip-path']) {
                if (el.hasAttribute(key) && !fragmentPaint.test(el.getAttribute(key))) el.removeAttribute(key);
            }
            const style = el.style;
            if (!style) continue;
            const values = properties.map(key => [key, style.getPropertyValue(key)]);
            el.removeAttribute('style');
            for (const [key, value] of values) {
                // Computed numeric/keyword/color values only. No functions other than colors,
                // no escapes, variables, resources, or arbitrary properties from the diagram.
                if (/^[\w\s.,%#'"-]+$/.test(value) || /^rgba?\([\d.,%\s]+\)$/.test(value) || fragmentPaint.test(value)) style.setProperty(key, value);
            }
        }
        if (doc.firstElementChild?.localName !== 'svg') throw new Error('Invalid diagram output');
        return doc.firstElementChild;
    }
    // Mermaid is a multi-megabyte library: keep large documents from spawning a frame per fence.
    let queue = Promise.resolve();
    function renderDiagram(id, code, config, signal) {
        const job = queue.then(() => renderInFrame(id, code, config, signal));
        queue = job.catch(() => {});
        return job;
    }
    async function renderInFrame(id, code, config, signal) {
        signal?.throwIfAborted();
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:800px;pointer-events:none;visibility:hidden';
        const nonce = Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
        frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><script nonce="${nonce}" src="lib/mermaid.min.js"></script><script nonce="${nonce}">(${frameMain.toString()})()<\/script>`;
        const { port1, port2 } = new MessageChannel();
        let timer, abort;
        try {
            const result = await new Promise((resolve, reject) => {
                abort = () => reject(new Error('Diagram redraw cancelled'));
                signal?.addEventListener('abort', abort, { once: true });
                timer = setTimeout(() => reject(new Error('Diagram rendering timed out')), 30000);
                port1.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.markup);
                frame.onload = () => frame.contentWindow.postMessage({ id, code, config, properties }, '*', [port2]);
                document.body.append(frame);
            });
            return diagram(result);
        } finally {
            clearTimeout(timer); signal?.removeEventListener('abort', abort);
            port1.close(); port2.close(); frame.remove();
        }
    }
    return Object.freeze({ html, renderDiagram });
})();
