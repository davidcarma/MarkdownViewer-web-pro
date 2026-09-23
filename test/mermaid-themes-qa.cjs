#!/usr/bin/env node
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://127.0.0.1:8080/?themes=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const res = await fetch('/test/mermaid-identity-store.md');
    const md = await res.text();
    window.markdownEditor.editor.value = md;
    window.markdownEditor.lastSavedContent = md;
    window.markdownEditor.updatePreview();
  });
  await page.waitForFunction(() => document.querySelectorAll('.mermaid-diagram svg').length >= 1, {
    timeout: 10000,
  });
  await page.waitForTimeout(800);
  const themes = ['light', 'dark', 'gwyneth'];
  const out = {};
  for (const t of themes) {
    await page.evaluate((theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      window.markdownEditor.updateMermaidTheme();
      window.markdownEditor.updatePreview();
    }, t);
    await page.waitForTimeout(1500);
    out[t] = await page.evaluate(() => {
      const d = document.querySelector('.mermaid-diagram');
      const fo = d && d.querySelector('foreignObject div');
      return {
        diagrams: document.querySelectorAll('.mermaid-diagram svg').length,
        errors: document.querySelectorAll('.mermaid-error').length,
        foLh: fo ? getComputedStyle(fo).lineHeight : null,
        hasToolbar: !!(d && d.querySelector('.mermaid-toolbar')),
      };
    });
  }
  const mini = await page.evaluate(() => ({
    canvasCount: [...document.querySelectorAll('canvas')].filter((c) => c.width > 20).length,
    mermaidInDom: document.querySelectorAll('.mermaid-diagram').length,
  }));
  console.log(JSON.stringify({ themes: out, mini }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
