const { test, expect } = require('@playwright/test');

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRoAAAAAASUVORK5CYII=';
const resource = 'https://resources.example.invalid/illustration.png';
const source = `# Sample\n\n<details open><summary>Notes</summary><b>Visible</b></details>\n\n![Local](${image})\n\n![Illustration](${resource})\n\n$2+2$\n\n\`\`\`mermaid\nflowchart LR\n A[Start] --> B[Finish]\n\`\`\``;

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.markdownEditor?.md);
    await page.evaluate(() => window.markdownEditor.ready);
});

test('preview and processed HTML keep useful content without requesting document resources', async ({ page }) => {
    let loads = 0;
    await page.route(resource, route => { loads++; return route.abort(); });
    await page.evaluate(source => {
        const app = window.markdownEditor;
        app.editor.value = source;
        app.updatePreview();
    }, source);
    const preview = page.locator('#preview');
    await expect(preview.locator('details b')).toHaveText('Visible');
    await expect(preview.locator('img')).toHaveAttribute('src', image);
    await expect(preview.locator('a', { hasText: 'Illustration' })).toHaveAttribute('rel', /noreferrer/);
    await expect(preview.locator('.katex').first()).toBeVisible();
    await expect(preview.locator('.mermaid-diagram svg')).toContainText('Finish', { timeout: 12000 });
    const result = await page.evaluate(async () => {
        const host = document.createElement('template');
        host.innerHTML = await window.markdownEditor.getProcessedHtml();
        return {
            image: host.content.querySelector('img')?.src,
            diagram: host.content.querySelector('svg')?.textContent,
            math: !!host.content.querySelector('.katex'),
            blocked: host.content.querySelector('a')?.getAttribute('href'),
            editor: window.markdownEditor.editor.value
        };
    });
    expect(result).toMatchObject({ image, math: true, blocked: resource, editor: source });
    expect(result.diagram).toContain('Finish');
    expect(loads).toBe(0);
});

test('a redraw cancels pending diagram work without moving a reader back', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const app = window.markdownEditor;
        let finish, started;
        const ready = new Promise(resolve => { started = resolve; });
        app._renderDiagram = () => new Promise(resolve => { started(); finish = resolve; });
        app.editor.value = '```mermaid\nflowchart LR\n A --> B\n```';
        app.updatePreview(); await ready;
        const oldSignal = app._previewWork.signal;
        app.editor.value = Array.from({length: 150}, (_, i) => `Paragraph ${i}`).join('\n\n');
        app.updatePreview();
        app.preview.scrollTop = 400;
        const target = app.preview.scrollTop;
        finish(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
        await new Promise(resolve => setTimeout(resolve, 250));
        return { cancelled: oldSignal.aborted, diagrams: app.preview.querySelectorAll('svg').length, top: app.preview.scrollTop, target };
    });
    expect(result.cancelled).toBe(true);
    expect(result.diagrams).toBe(0);
    expect(result.target).toBeGreaterThan(0);
    expect(result.top).toBe(result.target);
});


test('clipboard, print and PDF use the same boundary and treat filenames as text', async ({ page }) => {
    const result = await page.evaluate(async ([image, resource]) => {
        const app = window.markdownEditor;
        app.editor.value = `<b>Preserved</b> ![inline](${image}) ![outside](${resource})`;
        app.currentFileName = 'Notes <draft> & review.md';
        const documents = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(text) { documents.push(text); } } });
        window.open = () => ({ document: { write(text) { documents.push(text); }, close() {} } });
        await app.copyHtml(); await app.printFile(); await app.exportToPdf();
        return documents.map(markup => {
            const template = document.createElement('template');
            template.innerHTML = markup;
            return { text: template.content.querySelector('b')?.textContent,
                sources: [...template.content.querySelectorAll('img')].map(node => node.getAttribute('src')),
                link: template.content.querySelector('a')?.href,
                name: template.content.querySelector('h1')?.textContent || null };
        });
    }, [image, resource]);
    expect(result).toHaveLength(3);
    for (const entry of result) expect(entry).toMatchObject({ text: 'Preserved', sources: [image], link: resource });
    expect(result.slice(1).map(doc => doc.name)).toEqual(['Notes <draft> & review.md', 'Notes <draft> & review.md']);
});
