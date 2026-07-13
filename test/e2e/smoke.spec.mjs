import { expect, test } from '@playwright/test';
import path from 'node:path';

const samplePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQAK+gL+wmnKrQAAAABJRU5ErkJggg==', 'base64');
const desktopFixture = path.resolve('test/fixtures/editor-photo-fixture.png');

async function openHome(page) {
  await page.goto('/');
  await expect(page.locator('[data-page="home"]')).toHaveAttribute('data-ready', 'true');
}

test('主页提供本地打开和新建入口', async ({ page }) => {
  await openHome(page);
  await expect(page.getByTestId('open-image')).toBeVisible();
  await expect(page.getByTestId('create-new')).toBeVisible();
  await expect(page.getByTestId('recent-projects')).toContainText('尚无本地项目');
});

test('主页可选择 2×2 本地拼贴模板并进入编辑器', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('create-collage').click();
  await expect(page.getByTestId('collage-templates')).toBeVisible();
  await page.getByTestId('collage-template-2x2').click();
  await expect(page).toHaveURL(/\/editor\/\?collage=2x2$/);
  await expect(page.locator('body')).toHaveAttribute('data-collage-template', '2x2');
  await expect.poll(() => page.evaluate(() => window.AppConfig.guides.length)).toBe(2);
});

test('新建画布进入独立编辑器路由', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('create-new').click();
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('#canvas_minipaint')).toBeVisible();
});

test('本地上传图片会交接到编辑器', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('#canvas_minipaint')).toBeVisible();
});

test('编辑器只暴露手动 Cutout 工具组合', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
});

test('编辑器提供 Pixlr 风格的非 AI 工作台骨架', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByTestId('editor-tool-rail')).toBeVisible();
  await expect(page.getByTestId('editor-workspace')).toBeVisible();
  await expect(page.getByTestId('editor-layer-rail')).toBeVisible();
  await expect(page.getByTestId('editor-statusbar')).toBeVisible();
  await expect(page.getByTestId('tool-ai')).toHaveCount(0);
  await expect(page.getByTestId('tool-element')).toHaveCount(0);
  await expect(page.getByTestId('tool-cutout')).toBeVisible();
  await expect(page.getByTestId('tool-text')).toBeVisible();
});

test('手动 Cutout 从工作台打开并切换到底层本地选区工具', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('tool-cutout').click();
  await expect(page.getByTestId('editor-tool-panel')).toBeVisible();
  await expect(page.locator('[data-editor-tool-title]')).toHaveText('手动抠图');
  await expect(page.locator('#tools_container .selection')).toHaveClass(/active/);
  await page.locator('[data-editor-panel-close]').click();
  await expect(page.getByTestId('editor-tool-panel')).toBeHidden();
});

test('手动 Cutout 可切换魔术橡皮并调整本地容差', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('tool-cutout').click();
  await page.getByTestId('cutout-mode-magic').click();
  await expect(page.locator('#tools_container .magic_erase')).toHaveClass(/active/);
  await page.getByTestId('cutout-tolerance').fill('37');
  await expect(page.getByTestId('cutout-tolerance')).toHaveValue('37');
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'magic_erase').attributes.power)).toBe(37);
});

test('手动 Cutout 提供真实的柔化、全局取样与选区移除操作', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-cutout').click();
  await expect(page.getByTestId('editor-tool-panel')).toBeVisible();
  await page.getByTestId('cutout-soft-edge').uncheck();
  await page.getByTestId('cutout-global-sample').check();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'magic_erase').attributes)).toMatchObject({ anti_aliasing: false, contiguous: true });
  await page.evaluate(() => {
    window.app.GUI.GUI_tools.tools_modules.selection.object.selection = { x: 0, y: 0, width: 1, height: 1 };
  });
  const historyBefore = await page.evaluate(() => window.State.action_history.length);
  await page.getByTestId('cutout-remove-selection').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(historyBefore);
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.selection.object.selection.width)).toBeNull();
});

test('Adjust 的自动修正会实际写入图片编辑历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-adjust').click();
  await expect(page.getByTestId('adjust-auto')).toBeVisible();
  const historyBefore = await page.evaluate(() => window.State.action_history.length);
  await page.getByTestId('adjust-auto').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(historyBefore);
});

test('导入图片后右侧图层轨显示实际缩略图', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  const thumbnail = page.getByTestId('editor-layer-rail').locator('.layer_thumbnail img');
  await expect(thumbnail).toHaveCount(1);
  await expect(thumbnail).toHaveAttribute('src', /.+/);
});

test('桌面已加载图片状态提供图层收起与可撤销锁定', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([3840, 2880]);
  await expect(page.getByTestId('layers-rail-close')).toBeVisible();
  const lock = page.getByTestId('layer-lock');
  await expect(lock).toHaveCount(1);
  await lock.click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(false);
  await page.getByTestId('layers-rail-close').click();
  await expect(page.locator('body')).toHaveClass(/layers-collapsed/);
});

test('Effect 从工具面板打开本地效果浏览器', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-effect').click();
  await page.getByTestId('effect-browser').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: '特效浏览器' })).toBeVisible();
});

test('Crop 的应用按钮会按当前裁剪选区改变画布尺寸', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();
  await expect(page.getByTestId('crop-apply')).toBeVisible();
  await page.evaluate(() => { window.app.GUI.GUI_tools.tools_modules.crop.object.selection = { x: 0, y: 0, width: 1, height: 1 }; });
  await page.getByTestId('crop-apply').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([1, 1]);
});

test('Crop 比例预设会在画布内建立正确的居中裁剪区域', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();
  await page.getByTestId('crop-ratio-1-1').click();
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({ x: 480, y: 0, width: 2880, height: 2880 });
  await page.getByTestId('crop-ratio-16-9').click();
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({ x: 0, y: 360, width: 3840, height: 2160 });
});

test('Arrange 可复制图层并通过底部撤销恢复', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-arrange').click();
  await expect(page.getByTestId('arrange-duplicate')).toBeVisible();
  await page.getByTestId('arrange-duplicate').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(2);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(1);
});

test('Arrange 可调整不透明度与旋转活动图片图层', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-arrange').click();
  await expect(page.getByTestId('arrange-opacity')).toHaveValue('100');
  await page.getByTestId('arrange-opacity').fill('64');
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.opacity)).toBe(64);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.opacity)).toBe(100);
  await page.getByTestId('arrange-rotate-right').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.rotate)).toBe(90);
});

test('编辑器可保存本地项目', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('create-new').click();
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('save-local-project').click();
  await expect(page.getByTestId('save-local-project')).toHaveText('已保存本地项目');
});
