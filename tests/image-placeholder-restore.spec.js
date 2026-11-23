// @ts-check
// Regression tests for image placeholder repair.
// A valid document must never be rewritten: doing so used to fold every image
// onto one id because images created in the same second share a long prefix.

const { test, expect } = require('@playwright/test');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0kAAAAASUVORK5CYII=';

test.describe('Image placeholder repair', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => window.markdownEditor && window.markdownEditor.imageCollapse
    );
  });

  test('leaves a valid document untouched', async ({ page }) => {
    const result = await page.evaluate((png) => {
      const e = window.markdownEditor;
      const md = [0, 1, 2]
        .map((i) => `## Shot ${i}\n\n![shot ${i}](${png})`)
        .join('\n\n');
      e.editor.value = e.imageCollapse.collapseImages(md);
      e.imageCollapse.isCollapsed = true;

      const before = e.editor.value;
      e.imageCollapse.attemptPlaceholderRestore();

      const ids = [...e.editor.value.matchAll(/\(\.\.\.(IMG_[A-Za-z0-9_]+)\.\.\.\)/g)]
        .map((m) => m[1]);
      return { before, after: e.editor.value, storeSize: e.imageCollapse.imageStore.size, ids };
    }, PNG);

    expect(result.storeSize).toBe(3);
    expect(result.after).toBe(result.before);
    expect(new Set(result.ids).size).toBe(3);
  });

  test('repairs a truncated placeholder when the id is unambiguous', async ({ page }) => {
    const result = await page.evaluate((png) => {
      const e = window.markdownEditor;
      const md = [0, 1, 2]
        .map((i) => `## Shot ${i}\n\n![shot ${i}](${png})`)
        .join('\n\n');
      const collapsed = e.imageCollapse.collapseImages(md);
      e.imageCollapse.isCollapsed = true;

      const id = [...e.imageCollapse.imageStore.keys()][0];
      const truncated = id.slice(0, -4);
      e.editor.value = collapsed.replace(`(...${id}...)`, `(...${truncated}...)`);

      e.imageCollapse.attemptPlaceholderRestore();

      return {
        repaired: e.editor.value.includes(`(...${id}...)`),
        truncatedGone: !e.editor.value.includes(`(...${truncated}...)`),
      };
    }, PNG);

    expect(result.repaired).toBe(true);
    expect(result.truncatedGone).toBe(true);
  });
});
