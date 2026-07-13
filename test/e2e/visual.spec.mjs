import { expect, test } from '@playwright/test';

test('首页视觉基准', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-page="home"]')).toHaveAttribute('data-ready', 'true');
  await expect(page).toHaveScreenshot('home.png', { animations: 'disabled', maxDiffPixelRatio: 0.01 });
});

test('编辑器视觉基准', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await expect(page).toHaveScreenshot('editor.png', { animations: 'disabled', maxDiffPixelRatio: 0.01 });
});
