// End-to-end: what the writer types survives a save and a reload.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
});

test('Save here persists the document across a reload', async ({ page }) => {
  const body = `# Persisted note ${Date.now()}\n\nThis line must survive a reload.`;
  await page.goto('/');
  await page.locator('#editor').fill(body);

  await page.locator('#saveFile').click();
  await expect(page.locator('.finder-overlay')).toBeVisible();
  await page.locator('#finderSaveHere').click();
  await expect(page.locator('.finder-overlay')).toBeHidden();

  await page.reload();
  await expect(page.locator('#editor')).toHaveValue(new RegExp(body.split('\n')[0].slice(2)));
  await expect(page.locator('#preview')).toContainText('This line must survive a reload.');
});

test('Save to Disk downloads the Markdown source', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('# Download me\n\ncontent');
  await page.locator('#saveFile').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#finderSaveToDisk').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
});
