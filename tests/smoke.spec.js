// @ts-check
// Smoke tests for Markdown Pro (load app, editor, toolbar)

const { test, expect } = require('@playwright/test');

test.describe('Markdown Pro', () => {
  test('loads and shows editor', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Markdown/);
    const editor = page.locator('#editor');
    await expect(editor).toBeVisible();
  });

  test('toolbar has New, Open, Save', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#newFile')).toBeVisible();
    await expect(page.locator('#openFile')).toBeVisible();
    await expect(page.locator('#saveFile')).toBeVisible();
  });

  test('can type in editor', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#editor');
    await editor.fill('# Hello');
    await expect(editor).toHaveValue(/# Hello/);
  });
});
