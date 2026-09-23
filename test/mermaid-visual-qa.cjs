#!/usr/bin/env node
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  console.log('goto');
  await page.goto('http://127.0.0.1:8080/?v=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(800);
  console.log('inject');
  await page.evaluate(async () => {
    const res = await fetch('/test/mermaid-identity-store.md?ts=' + Date.now());
    const markdown = await res.text();
    const ed = window.markdownEditor;
    ed.editor.value = markdown;
    ed.lastSavedContent = markdown;
    ed.updatePreview();
  });
  await page.waitForFunction(() => document.querySelectorAll('.mermaid-diagram svg').length >= 2, { timeout: 15000 });
  await page.waitForTimeout(1000);
  console.log('metrics');
  const metrics = await page.evaluate(() => {
    const cfg = mermaid.mermaidAPI.getConfig();
    return {
      useMaxWidth: cfg.flowchart.useMaxWidth,
      htmlLabels: cfg.htmlLabels,
      foLh: getComputedStyle(document.querySelector('foreignObject div') || document.body).lineHeight,
      labels: [...document.querySelectorAll('.mermaid-diagram .nodeLabel')].map((el) => el.innerHTML),
      diagramCount: document.querySelectorAll('.mermaid-diagram').length,
      errorCount: document.querySelectorAll('.mermaid-error').length,
      slack: [...document.querySelectorAll('.mermaid-diagram')].map((d) => {
        const svg = d.querySelector('svg');
        const vp = d.querySelector('.mermaid-viewport');
        return vp && svg
          ? +(vp.getBoundingClientRect().height - svg.getBoundingClientRect().height).toFixed(1)
          : null;
      }),
    };
  });
  const zoom = await page.evaluate(() => {
    const d = document.querySelector('.mermaid-diagram');
    d.querySelector('.mermaid-zoom-in').click();
    d.querySelector('.mermaid-zoom-in').click();
    const afterIn = d.querySelector('.mermaid-zoom-label').textContent;
    d.querySelector('.mermaid-zoom-reset').click();
    return { afterIn, afterReset: d.querySelector('.mermaid-zoom-label').textContent };
  });
  await page.locator('.mermaid-diagram').first().screenshot({ path: 'test/screenshots/mermaid-local-diagram1.png' });
  await page.locator('.mermaid-diagram').nth(1).screenshot({ path: 'test/screenshots/mermaid-local-diagram2.png' });

  console.log('stress');
  await page.evaluate(async () => {
    const res = await fetch('/test/mermaid-stress-test.md');
    const markdown = await res.text();
    const ed = window.markdownEditor;
    ed.editor.value = markdown;
    ed.lastSavedContent = markdown;
    ed.updatePreview();
  });
  await page.waitForTimeout(4000);
  const stress = await page.evaluate(() => ({
    diagrams: document.querySelectorAll('.mermaid-diagram').length,
    errors: document.querySelectorAll('.mermaid-error').length,
  }));

  console.log(JSON.stringify({ metrics, zoom, stress }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(String(e && e.stack || e));
  process.exit(1);
});
