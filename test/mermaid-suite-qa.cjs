#!/usr/bin/env node
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://127.0.0.1:8080/?suite=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const res = await fetch('/test/mermaid-test-suite.md');
    const markdown = await res.text();
    const ed = window.markdownEditor;
    ed.editor.value = markdown;
    ed.lastSavedContent = markdown;
    ed.updatePreview();
  });
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => ({
    diagrams: document.querySelectorAll('.mermaid-diagram').length,
    svgs: document.querySelectorAll('.mermaid-diagram svg').length,
    errors: document.querySelectorAll('.mermaid-error').length,
    errorText: [...document.querySelectorAll('.mermaid-error')].slice(0, 3).map((e) =>
      e.textContent.replace(/\s+/g, ' ').slice(0, 160)
    ),
    foLh: (() => {
      const fo = document.querySelector('.mermaid-diagram foreignObject div');
      return fo ? getComputedStyle(fo).lineHeight : null;
    })(),
  }));
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
