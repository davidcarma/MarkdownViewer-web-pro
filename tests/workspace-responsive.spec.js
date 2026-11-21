const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const DOC = '# Field notes\n\nReview the manuscript.';

for (const width of [320, 390, 768, 1280]) {
  test(`workspace at ${width}px keeps editing and formatting reachable`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.locator('#preview')).not.toBeEmpty();

    const editor = page.getByRole('textbox', { name: 'Markdown editor' });
    const preview = page.getByRole('region', { name: 'Markdown preview' });
    const previewHeading = preview.getByRole('heading', { name: 'Field notes' });

    if (width <= 640) {
      // One full-height pane at a time, chosen with the Write / Preview switch.
      const paneSwitch = page.getByRole('navigation', { name: 'Choose pane' });
      await expect(paneSwitch).toBeVisible();
      await expect(preview).toBeHidden();

      await editor.fill(DOC);
      await paneSwitch.getByRole('button', { name: 'Preview' }).click();
      await expect(previewHeading).toBeVisible();
      await expect(editor).toBeHidden();

      const previewBox = await page.locator('.preview-pane').boundingBox();
      expect(previewBox.height).toBeGreaterThan(200);

      await paneSwitch.getByRole('button', { name: 'Write' }).click();
      await expect(editor).toBeVisible();
      await expect(preview).toBeHidden();
    } else {
      await editor.fill(DOC);
      await expect(previewHeading).toBeVisible();
      const previewBox = await page.locator('.preview-pane').boundingBox();
      const sourceBox = await page.locator('.editor-pane').boundingBox();
      if (width <= 768) expect(previewBox.y).toBeGreaterThanOrEqual(sourceBox.y + sourceBox.height - 1);
      else expect(previewBox.x).toBeGreaterThanOrEqual(sourceBox.x + sourceBox.width - 1);
      expect(previewBox.height).toBeGreaterThan(100);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

    await page.getByRole('button', { name: /Bold/ }).click();
    if (await editor.isVisible()) await expect(editor).toHaveValue(/\*\*/);

    await page.screenshot({ path: info.outputPath('workspace.png') });
  });
}

test('phone settings navigates, indicates theme and returns keyboard focus', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  await trigger.click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const first = settings.getByRole('button', { name: 'Editor' });
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(settings.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await settings.getByRole('button', { name: 'Appearance' }).click();
  const dark = settings.getByRole('button', { name: 'Dark' });
  await dark.click();
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  expect(await settings.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('settings.png') });
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('phone More reveals the low-frequency actions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  const word = page.locator('#openWordFile');
  const more = page.getByRole('button', { name: 'More actions' });
  await expect(word).toBeHidden();
  await expect(more).toBeVisible();
  await more.click();
  await expect(word).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await more.click();
  await expect(word).toBeHidden();
});
