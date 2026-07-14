import { expect, test } from '@playwright/test';
import path from 'node:path';

const desktopFixture = path.resolve('test/fixtures/editor-photo-fixture.png');

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

test('工作台选中工具使用中性底色，不显示青色侧边条', async ({ page }) => {
  await page.goto('/editor/');
  const activeTool = page.getByTestId('tool-arrange');
  await expect(activeTool).toHaveClass(/is-active/);
  await expect(activeTool).toHaveCSS('box-shadow', 'none');
});

test.describe('1920 × 878 已加载图片工作台', () => {
  test.use({ viewport: { width: 1920, height: 878 } });

  test('编辑器已加载本地图像视觉基准', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('image-picker').setInputFiles(desktopFixture);
    await expect(page).toHaveURL(/\/editor\/$/);
    await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
    await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([3840, 2880]);
    await page.evaluate(() => window.app.GUI.GUI_preview.zoom(26));
    await expect(page.getByTestId('editor-zoom')).toHaveText('26%');
    await expect(page.getByTestId('editor-layer-rail').locator('.layer_thumbnail img')).toHaveCount(1);
    await expect(page).toHaveScreenshot('editor-loaded.png', { animations: 'disabled', maxDiffPixelRatio: 0.01 });
  });

  test('Draw 侧栏视觉基准', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('image-picker').setInputFiles(desktopFixture);
    await expect(page).toHaveURL(/\/editor\/$/);
    await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
    await page.evaluate(() => window.app.GUI.GUI_preview.zoom(26));
    await expect(page.getByTestId('editor-zoom')).toHaveText('26%');
    await page.getByTestId('tool-drawing').click();
    await expect(page.getByTestId('drawing-brush-mode-plain')).toBeVisible();
    await expect(page).toHaveScreenshot('editor-drawing.png', { animations: 'disabled', maxDiffPixelRatio: 0.01 });
  });
});
