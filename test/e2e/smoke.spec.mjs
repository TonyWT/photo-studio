import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const samplePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQAK+gL+wmnKrQAAAABJRU5ErkJggg==', 'base64');
const desktopFixture = path.resolve('test/fixtures/editor-photo-fixture.png');
const filterPixelFixture = path.resolve('test/fixtures/filter-pixel-fixture.png');

function readActiveLayerPixelHash() {
  const image = window.AppConfig?.layer?.link;
  if (!image?.naturalWidth || !image?.naturalHeight) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261;

  for (const pixel of pixels) {
    hash = Math.imul(hash ^ pixel, 16777619);
  }

  return `${canvas.width}x${canvas.height}:${hash >>> 0}`;
}

function readLayerPixelHash(layerId) {
  const image = window.AppConfig?.layers?.find((layer) => layer.id === layerId)?.link;
  if (!image?.naturalWidth || !image?.naturalHeight) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261;

  for (const pixel of pixels) {
    hash = Math.imul(hash ^ pixel, 16777619);
  }

  return `${canvas.width}x${canvas.height}:${hash >>> 0}`;
}

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

test('导出 PNG 使用当前项目名并触发本地下载', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'summer-photo.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.FileSave))).toBe(true);
  await expect(page.getByTestId('export-format')).toHaveValue('png');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-image').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('summer-photo.png');
});

test('导出格式选择器提供 JPEG、WebP 与原生项目入口', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByTestId('export-format')).toBeVisible();
  await expect(page.getByTestId('export-format').locator('option')).toHaveText(['PNG', 'JPEG', 'WebP']);
  await expect(page.getByTestId('export-project')).toBeVisible();
});

test('导出原生项目会下载包含 info、layers 与 data 的 JSON', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'project-source.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.FileSave))).toBe(true);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-project').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const project = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(project).toEqual(expect.objectContaining({
    info: expect.any(Object),
    layers: expect.any(Array),
    data: expect.any(Array),
  }));
  expect(project.layers).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: expect.any(Number), type: expect.any(String) }),
  ]));
  expect(project.data).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: expect.any(Number), data: expect.any(String) }),
  ]));
});

test('导入 FileSave 空白画布项目会进入编辑器并恢复画布尺寸', async ({ page }) => {
  await openHome(page);
  const project = {
    info: { width: 7, height: 5, version: '4.14.3', layer_active: 1, guides: [] },
    layers: [{ id: 1, type: null }],
    data: [],
  };
  await page.getByTestId('project-picker').setInputFiles({
    name: 'restored-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => window.AppConfig ? [window.AppConfig.WIDTH, window.AppConfig.HEIGHT] : null)).toEqual([7, 5]);
});

test('导入合法原生项目后选择 PNG 会下载图片而不是 JSON', async ({ page }) => {
  await openHome(page);
  const project = {
    info: { width: 7, height: 5, version: '4.14.3', layer_active: 1, guides: [] },
    layers: [],
    data: [],
  };
  await page.getByTestId('project-picker').setInputFiles({
    name: 'restored-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.FileSave))).toBe(true);
  await page.getByTestId('export-format').selectOption('png');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-image').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  expect(download.suggestedFilename()).not.toMatch(/\.json$/);
});

test('导入无效项目不会离开首页并显示本地错误', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('project-picker').setInputFiles({
    name: 'invalid-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ info: {}, layers: [] })),
  });
  await expect(page).toHaveURL(/^(?!.*\/editor\/).*\/$/);
  await expect(page.getByTestId('project-import-error')).toContainText('不是有效的原生项目文件');
});

test('导入含有空图层或图像数据项的项目会留在首页', async ({ page }) => {
  await openHome(page);
  const project = {
    info: { width: 7, height: 5, version: '4.14.3', layer_active: 1, guides: [] },
    layers: [null],
    data: [null],
  };
  await page.getByTestId('project-picker').setInputFiles({
    name: 'unsafe-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page).toHaveURL(/^(?!.*\/editor\/).*\/$/);
  await expect(page.getByTestId('project-import-error')).toContainText('不是有效的原生项目文件');
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

test('手动 Cutout 的套索、椭圆、加减选、反选与 Keep/Remove 均本地可撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-cutout').click();

  await expect(page.getByTestId('cutout-mode-lasso')).toBeVisible();
  await expect(page.getByTestId('cutout-mode-ellipse')).toBeVisible();
  await expect(page.getByTestId('cutout-operation-add')).toBeVisible();
  await expect(page.getByTestId('cutout-operation-subtract')).toBeVisible();
  await expect(page.getByTestId('cutout-invert')).toBeVisible();
  await expect(page.getByTestId('cutout-keep-selection')).toBeVisible();

  const canvas = page.locator('#canvas_minipaint');
  await page.getByTestId('cutout-mode-lasso').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.canvasToolMode)).toBe('cutout-lasso');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const moveOnCanvas = (x, y) => page.mouse.move(bounds.x + x, bounds.y + y);
  await moveOnCanvas(bounds.width * 0.30, bounds.height * 0.30);
  await page.mouse.down();
  await moveOnCanvas(bounds.width * 0.45, bounds.height * 0.30);
  await moveOnCanvas(bounds.width * 0.45, bounds.height * 0.50);
  await moveOnCanvas(bounds.width * 0.30, bounds.height * 0.50);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.PhotoStudio?.getCutoutSelection?.()?.regions?.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.PhotoStudio?.getCutoutSelection?.()?.regions?.[0]?.shape)).toBe('lasso');

  await page.getByTestId('cutout-operation-add').click();
  await page.getByTestId('cutout-mode-ellipse').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.canvasToolMode)).toBe('cutout-ellipse');
  await moveOnCanvas(bounds.width * 0.48, bounds.height * 0.35);
  await page.mouse.down();
  await moveOnCanvas(bounds.width * 0.58, bounds.height * 0.50);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.PhotoStudio?.getCutoutSelection?.()?.regions?.map((region) => region.operation))).toEqual(['replace', 'add']);

  await page.getByTestId('cutout-operation-subtract').click();
  await moveOnCanvas(bounds.width * 0.33, bounds.height * 0.37);
  await page.mouse.down();
  await moveOnCanvas(bounds.width * 0.37, bounds.height * 0.45);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.PhotoStudio?.getCutoutSelection?.()?.regions?.map((region) => region.operation))).toEqual(['replace', 'add', 'subtract']);

  const maskPoints = await page.evaluate(() => {
    const [lasso, added, subtracted] = window.PhotoStudio.getCutoutSelection().regions;
    const xs = lasso.points.map((point) => point.x);
    const ys = lasso.points.map((point) => point.y);
    return {
      lasso: { x: Math.min(...xs) + 4, y: Math.min(...ys) + 4 },
      subtract: { x: subtracted.x + subtracted.width / 2, y: subtracted.y + subtracted.height / 2 },
      add: { x: added.x + added.width / 2, y: added.y + added.height / 2 },
      outside: { x: 1, y: 1 },
    };
  });
  const readAlphaAt = (points) => page.evaluate((targets) => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return Object.fromEntries(Object.entries(targets).map(([name, point]) => [
      name, context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data[3],
    ]));
  }, points);

  // Reopening the panel must not reset a live custom mode, operation, or inversion.
  await page.getByTestId('cutout-invert').click();
  await page.getByTestId('tool-cutout').click();
  await expect(page.getByTestId('cutout-mode-ellipse')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('cutout-operation-subtract')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('cutout-invert')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('cutout-invert').click();

  const beforeRemove = {
    history: await page.evaluate(() => window.State.action_history.length),
    alpha: await page.evaluate(() => {
      const image = window.AppConfig.layer.link;
      const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
      c.getContext('2d').drawImage(image, 0, 0);
      return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].filter((_, index) => index % 4 === 3).reduce((sum, alpha) => sum + alpha, 0);
    }),
  };
  await page.getByTestId('cutout-remove-selection').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(beforeRemove.history);
  const afterRemoveAlpha = await page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    c.getContext('2d').drawImage(image, 0, 0);
    return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].filter((_, index) => index % 4 === 3).reduce((sum, alpha) => sum + alpha, 0);
  });
  expect(afterRemoveAlpha).toBeLessThan(beforeRemove.alpha);
  expect(await readAlphaAt(maskPoints)).toEqual({ lasso: 0, subtract: 255, add: 0, outside: 255 });
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    c.getContext('2d').drawImage(image, 0, 0);
    return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].filter((_, index) => index % 4 === 3).reduce((sum, alpha) => sum + alpha, 0);
  })).toBe(beforeRemove.alpha);
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    c.getContext('2d').drawImage(image, 0, 0);
    return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].filter((_, index) => index % 4 === 3).reduce((sum, alpha) => sum + alpha, 0);
  })).toBe(afterRemoveAlpha);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    c.getContext('2d').drawImage(image, 0, 0);
    return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].filter((_, index) => index % 4 === 3).reduce((sum, alpha) => sum + alpha, 0);
  })).toBe(beforeRemove.alpha);
  const keepHistory = await page.evaluate(() => window.State.action_history_index);
  await page.getByTestId('cutout-keep-selection').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBeGreaterThan(keepHistory);
  const afterKeepAlpha = await page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    c.getContext('2d').drawImage(image, 0, 0);
    return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].filter((_, index) => index % 4 === 3).reduce((sum, alpha) => sum + alpha, 0);
  });
  expect(afterKeepAlpha).toBeLessThan(beforeRemove.alpha);
  expect(await readAlphaAt(maskPoints)).toEqual({ lasso: 255, subtract: 0, add: 255, outside: 0 });
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    c.getContext('2d').drawImage(image, 0, 0);
    return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].filter((_, index) => index % 4 === 3).reduce((sum, alpha) => sum + alpha, 0);
  })).toBe(beforeRemove.alpha);

  await page.getByTestId('cutout-invert').click();
  await expect.poll(() => page.evaluate(() => window.PhotoStudio?.getCutoutSelection?.()?.inverted)).toBe(true);
  const inverseHistory = await page.evaluate(() => window.State.action_history_index);
  await page.getByTestId('cutout-keep-selection').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBeGreaterThan(inverseHistory);
  expect(await readAlphaAt(maskPoints)).toEqual({ lasso: 0, subtract: 255, add: 0, outside: 255 });
  await page.locator('[data-editor-history="undo"]').click();
  await page.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  await page.waitForTimeout(150);
  const lockedHistory = await page.evaluate(() => window.State.action_history.length);
  await page.getByTestId('cutout-keep-selection').click();
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(lockedHistory);
});

test('自定义 Cutout 选区在缩放平移下使用世界坐标，不串扰核心选区，并精确写入遮罩', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-cutout').click();
  await page.getByTestId('cutout-mode-lasso').click();

  // Force a non-default zoom/pan state. The expected points are deliberately
  // calculated by miniPaint's own world-coordinate conversion, not by DOM size.
  await page.evaluate(() => {
    window.AppConfig.ZOOM = 1.6;
    window.app.GUI.GUI_preview.zoom_data.x = window.AppConfig.visible_width * 0.31;
    window.app.GUI.GUI_preview.zoom_data.y = window.AppConfig.visible_height * 0.42;
    window.AppConfig.need_render = true;
    window.app.Layers.render();
  });
  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const screenPoints = [
    { x: bounds.width * 0.26, y: bounds.height * 0.28 },
    { x: bounds.width * 0.46, y: bounds.height * 0.28 },
    { x: bounds.width * 0.46, y: bounds.height * 0.48 },
    { x: bounds.width * 0.26, y: bounds.height * 0.48 },
  ];
  const expectedPoints = await page.evaluate(({ bounds, screenPoints }) => {
    const tool = window.app.GUI.GUI_tools.tools_modules.selection.object;
    return screenPoints.map((point) => tool.Base_layers.get_world_coords(
      bounds.x + point.x - tool.Base_gui.canvas_offset.x,
      bounds.y + point.y - tool.Base_gui.canvas_offset.y,
    ));
  }, { bounds, screenPoints });
  const coreSelectionBefore = await page.evaluate(() => ({
    ...window.app.GUI.GUI_tools.tools_modules.selection.object.selection,
  }));
  const historyBeforeGesture = await page.evaluate(() => window.State.action_history.length);
  const move = (point) => page.mouse.move(bounds.x + point.x, bounds.y + point.y);
  await move(screenPoints[0]);
  await page.mouse.down();
  for (const point of screenPoints.slice(1)) await move(point);
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions[0]?.points?.length || 0)).toBeGreaterThanOrEqual(4);
  const selectedPoints = await page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions[0].points);
  for (let index = 0; index < expectedPoints.length; index += 1) {
    expect(selectedPoints[index].x).toBeCloseTo(expectedPoints[index].x, 0);
    expect(selectedPoints[index].y).toBeCloseTo(expectedPoints[index].y, 0);
  }
  expect(await page.evaluate(() => window.State.action_history.length)).toBe(historyBeforeGesture);
  expect(await page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.selection.object.selection)).toEqual(coreSelectionBefore);

  await page.getByTestId('cutout-keep-selection').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(historyBeforeGesture);
  const alpha = await page.evaluate(({ inside, outside }) => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const at = (point) => context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data[3];
    return { inside: at(inside), outside: at(outside) };
  }, {
    inside: {
      x: (expectedPoints[0].x + expectedPoints[2].x) / 2,
      y: (expectedPoints[0].y + expectedPoints[2].y) / 2,
    },
    outside: { x: 1, y: 1 },
  });
  expect(alpha.inside).toBe(255);
  expect(alpha.outside).toBe(0);

  // The document capture shield is deliberately uninstalled when leaving
  // Cutout, and a real brush stroke must reach the normal Drawing tool rather
  // than merely avoiding a stale custom Cutout handler.
  await page.getByTestId('tool-drawing').click();
  const regionCount = await page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions.length);
  const drawingBefore = {
    history: await page.evaluate(() => window.State.action_history.length),
    pixelHash: await page.evaluate(readActiveLayerPixelHash),
  };
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.62);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.68, bounds.y + bounds.height * 0.68);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(drawingBefore.history);
  await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).not.toBe(drawingBefore.pixelHash);
  expect(await page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions.length)).toBe(regionCount);
});

test('自定义 Cutout 在画布外释放或取消后释放指针，不再拦截页面事件或污染选区', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-cutout').click();
  await page.getByTestId('cutout-mode-lasso').click();

  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const historyBeforeRelease = await page.evaluate(() => window.State.action_history.length);

  // A real mouse release outside the canvas must still reach its captured
  // pointer-up handler, finalize once, and then stop shielding page events.
  await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.35);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => document.getElementById('canvas_minipaint').hasPointerCapture(1))).toBe(true);
  await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.36);
  await page.mouse.move(Math.max(2, bounds.x - 24), Math.max(2, bounds.y - 24));
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions.length)).toBe(1);
  expect(await page.evaluate(() => window.State.action_history.length)).toBe(historyBeforeRelease);

  await page.evaluate(() => {
    window.__cutoutPageMouseDownCount = 0;
    document.addEventListener('mousedown', () => {
      window.__cutoutPageMouseDownCount += 1;
    }, { capture: true, once: true });
  });
  await page.getByTestId('tool-drawing').click();
  await expect.poll(() => page.evaluate(() => window.__cutoutPageMouseDownCount)).toBe(1);
  await expect.poll(() => page.evaluate(() => document.body.dataset.canvasToolMode)).toBe('brush');

  // A cancellation is terminal too: it must not create a lasso region, and
  // it must clear the shield before the browser emits the eventual pointer-up.
  await page.getByTestId('tool-cutout').click();
  await page.getByTestId('cutout-mode-lasso').click();
  const historyBeforeCancel = await page.evaluate(() => window.State.action_history.length);
  const regionsBeforeCancel = await page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions.length);
  await page.mouse.move(bounds.x + bounds.width * 0.42, bounds.y + bounds.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.56, bounds.y + bounds.height * 0.44);
  await page.evaluate(() => {
    const canvasElement = document.getElementById('canvas_minipaint');
    canvasElement.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
    }));
    window.__cutoutCancelMouseDownCount = 0;
    document.addEventListener('mousedown', () => {
      window.__cutoutCancelMouseDownCount += 1;
    }, { capture: true, once: true });
    document.querySelector('[data-testid="tool-drawing"]').dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    }));
  });
  await expect.poll(() => page.evaluate(() => window.__cutoutCancelMouseDownCount)).toBe(1);
  await page.mouse.up();
  expect(await page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions.length)).toBe(regionsBeforeCancel);
  expect(await page.evaluate(() => window.State.action_history.length)).toBe(historyBeforeCancel);
});

test('Cutout 原生触摸会话切换 Drawing 后仍屏蔽到取消，随后完全释放', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-cutout').click();
  await page.getByTestId('cutout-mode-lasso').click();

  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const first = { x: bounds.x + bounds.width * 0.26, y: bounds.y + bounds.height * 0.26, id: 21 };
  const second = { x: bounds.x + bounds.width * 0.72, y: bounds.y + bounds.height * 0.7, id: 22 };
  const firstMove = { x: first.x + 56, y: first.y + 34, id: 21 };
  const secondMove = { x: second.x - 32, y: second.y - 26, id: 22 };

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  await page.getByTestId('tool-drawing').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.canvasToolMode)).toBe('brush');

  const before = await page.evaluate(() => {
    const select = window.app.GUI.GUI_tools.tools_modules.select.object;
    return {
      history: window.State.action_history.length,
      regions: window.PhotoStudio.getCutoutSelection().regions.length,
      select: { moving: select.moving, resizing: select.resizing, mouseLock: select.Base_selection.mouse_lock },
    };
  });
  const pixelBefore = await page.evaluate(readActiveLayerPixelHash);
  await page.evaluate(() => {
    window.__cutoutMidSessionEscapes = [];
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((type) => {
      document.addEventListener(type, () => window.__cutoutMidSessionEscapes.push(type));
    });
  });

  // These are real Chromium touch events after Drawing has become the active
  // miniPaint tool. The pre-existing Cutout session must still own them.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [firstMove, secondMove] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });

  await expect.poll(() => page.evaluate(() => window.__cutoutMidSessionEscapes)).toEqual([]);
  expect(await page.evaluate(() => window.State.action_history.length)).toBe(before.history);
  expect(await page.evaluate(readActiveLayerPixelHash)).toBe(pixelBefore);
  expect(await page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions.length)).toBe(before.regions);
  expect(await page.evaluate(() => {
    const select = window.app.GUI.GUI_tools.tools_modules.select.object;
    return { moving: select.moving, resizing: select.resizing, mouseLock: select.Base_selection.mouse_lock };
  })).toEqual(before.select);

  // The cancelled session is terminal: a normal Drawing brush stroke must now
  // be able to commit, proving the native Cutout shield did not remain stuck.
  await page.mouse.move(bounds.x + bounds.width * 0.44, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.56);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(before.history);
  await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).not.toBe(pixelBefore);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
});

test('自定义 Cutout 忽略第二个指针，首个手势仍会完成且不留下捕获', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-cutout').click();
  await page.getByTestId('cutout-mode-lasso').click();

  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const firstPointerId = 1;
  const secondPointerId = 2;

  await page.mouse.move(bounds.x + bounds.width * 0.28, bounds.y + bounds.height * 0.28);
  await page.mouse.down();
  await expect.poll(() => page.evaluate((pointerId) => document.getElementById('canvas_minipaint').hasPointerCapture(pointerId), firstPointerId)).toBe(true);

  // Synthetic PointerEvents cannot acquire browser capture, which makes this a
  // direct regression probe: the secondary pointer must not replace the first
  // gesture or attempt its own capture.
  const secondPointerWasCaptured = await page.evaluate(({ pointerId, x, y }) => {
    const canvasElement = document.getElementById('canvas_minipaint');
    canvasElement.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      clientX: x,
      clientY: y,
    }));
    return canvasElement.hasPointerCapture(pointerId);
  }, { pointerId: secondPointerId, x: bounds.x + bounds.width * 0.7, y: bounds.y + bounds.height * 0.7 });
  expect(secondPointerWasCaptured).toBe(false);
  expect(await page.evaluate((pointerId) => document.getElementById('canvas_minipaint').hasPointerCapture(pointerId), firstPointerId)).toBe(true);

  await page.mouse.move(bounds.x + bounds.width * 0.46, bounds.y + bounds.height * 0.28);
  await page.mouse.move(bounds.x + bounds.width * 0.46, bounds.y + bounds.height * 0.48);
  await page.mouse.move(bounds.x + bounds.width * 0.28, bounds.y + bounds.height * 0.48);
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions.length)).toBe(1);
  await expect.poll(() => page.evaluate((pointerId) => document.getElementById('canvas_minipaint').hasPointerCapture(pointerId), firstPointerId)).toBe(false);
  expect(await page.evaluate((pointerId) => document.getElementById('canvas_minipaint').hasPointerCapture(pointerId), secondPointerId)).toBe(false);
});

test('Cutout 触控会话只允许首触创建选区，后续触点直到会话结束均不会穿透', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-cutout').click();
  await page.getByTestId('cutout-mode-lasso').click();

  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const coreSelectBefore = await page.evaluate(() => {
    const select = window.app.GUI.GUI_tools.tools_modules.select.object;
    return {
      history: window.State.action_history.length,
      layer: {
        x: window.AppConfig.layer.x,
        y: window.AppConfig.layer.y,
        width: window.AppConfig.layer.width,
        height: window.AppConfig.layer.height,
        rotate: window.AppConfig.layer.rotate,
      },
      moving: select.moving,
      resizing: select.resizing,
      mouseLock: select.Base_selection.mouse_lock,
    };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 3 });
  const first = { x: bounds.x + bounds.width * 0.28, y: bounds.y + bounds.height * 0.28, id: 1 };
  const second = { x: bounds.x + bounds.width * 0.7, y: bounds.y + bounds.height * 0.7, id: 2 };
  const firstMove = { x: bounds.x + bounds.width * 0.48, y: bounds.y + bounds.height * 0.3, id: 1 };
  const firstMove2 = { x: bounds.x + bounds.width * 0.48, y: bounds.y + bounds.height * 0.48, id: 1 };
  const firstEnd = { x: bounds.x + bounds.width * 0.42, y: bounds.y + bounds.height * 0.5, id: 1 };
  const secondMove = { x: second.x - 36, y: second.y - 36, id: 2 };
  const third = { x: bounds.x + bounds.width * 0.56, y: bounds.y + bounds.height * 0.7, id: 3 };
  const thirdMove = { x: third.x + 34, y: third.y - 28, id: 3 };
  const thirdMove2 = { x: third.x - 28, y: third.y - 42, id: 3 };
  const firstWorld = await page.evaluate(({ x, y }) => {
    const select = window.app.GUI.GUI_tools.tools_modules.select.object;
    const offset = select.Base_gui.canvas_offset;
    return select.Base_layers.get_world_coords(x - offset.x, y - offset.y);
  }, first);

  // This listener runs after the canvas capture layer. It is not a mock: it
  // detects a real native touch event that escaped the Cutout ownership
  // boundary and could therefore reach miniPaint's document-level handlers.
  await page.evaluate(() => {
    window.__cutoutEscapedNativeTouches = [];
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((type) => {
      document.addEventListener(type, (event) => {
        window.__cutoutEscapedNativeTouches.push(type);
      });
    });
  });

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [firstMove, { ...second, x: second.x - 18, y: second.y - 18 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [firstMove2, { ...second, x: second.x - 28, y: second.y - 28 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ ...second, x: second.x - 18, y: second.y - 18 }],
  });

  // The owner has ended, but touch 2 still keeps the Cutout session alive.
  // A third touch must be swallowed, never become a replacement owner, and
  // never be delivered to miniPaint's document-level Select handlers.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...second, x: second.x - 18, y: second.y - 18 }, third],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [secondMove, thirdMove],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [secondMove, thirdMove2],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [secondMove] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect.poll(() => page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions.length)).toBe(1);
  const selectionAfterTouches = await page.evaluate(() => window.PhotoStudio.getCutoutSelection());
  expect(selectionAfterTouches.regions).toHaveLength(1);
  expect(selectionAfterTouches.regions[0].points[0].x).toBeCloseTo(firstWorld.x, 1);
  expect(selectionAfterTouches.regions[0].points[0].y).toBeCloseTo(firstWorld.y, 1);
  expect(await page.evaluate(() => window.__cutoutEscapedNativeTouches)).toEqual([]);
  const coreSelectAfter = await page.evaluate(() => {
    const select = window.app.GUI.GUI_tools.tools_modules.select.object;
    return {
      history: window.State.action_history.length,
      layer: {
        x: window.AppConfig.layer.x,
        y: window.AppConfig.layer.y,
        width: window.AppConfig.layer.width,
        height: window.AppConfig.layer.height,
        rotate: window.AppConfig.layer.rotate,
      },
      moving: select.moving,
      resizing: select.resizing,
      mouseLock: select.Base_selection.mouse_lock,
    };
  });
  expect(coreSelectAfter).toEqual(coreSelectBefore);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
});

test('Cutout 原生 touch 会话在 owner 结束后拒绝第三触成为替代 owner', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-cutout').click();
  await page.getByTestId('cutout-mode-lasso').click();

  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const historyBefore = await page.evaluate(() => window.State.action_history.length);
  const coreBefore = await page.evaluate(() => {
    const select = window.app.GUI.GUI_tools.tools_modules.select.object;
    return { moving: select.moving, resizing: select.resizing, mouseLock: select.Base_selection.mouse_lock };
  });
  const points = {
    first: { id: 11, x: bounds.x + bounds.width * 0.2, y: bounds.y + bounds.height * 0.2 },
    firstMove: { id: 11, x: bounds.x + bounds.width * 0.44, y: bounds.y + bounds.height * 0.22 },
    firstMove2: { id: 11, x: bounds.x + bounds.width * 0.4, y: bounds.y + bounds.height * 0.44 },
    firstEnd: { id: 11, x: bounds.x + bounds.width * 0.2, y: bounds.y + bounds.height * 0.42 },
    second: { id: 12, x: bounds.x + bounds.width * 0.76, y: bounds.y + bounds.height * 0.7 },
    third: { id: 13, x: bounds.x + bounds.width * 0.58, y: bounds.y + bounds.height * 0.66 },
    thirdMove: { id: 13, x: bounds.x + bounds.width * 0.76, y: bounds.y + bounds.height * 0.68 },
    thirdMove2: { id: 13, x: bounds.x + bounds.width * 0.7, y: bounds.y + bounds.height * 0.84 },
    thirdEnd: { id: 13, x: bounds.x + bounds.width * 0.58, y: bounds.y + bounds.height * 0.82 },
  };
  const firstWorld = await page.evaluate(({ x, y }) => {
    const select = window.app.GUI.GUI_tools.tools_modules.select.object;
    const offset = select.Base_gui.canvas_offset;
    return select.Base_layers.get_world_coords(x - offset.x, y - offset.y);
  }, points.first);

  await page.evaluate((touchPoints) => {
    const canvasElement = document.getElementById('canvas_minipaint');
    const touch = (point) => new Touch({
      identifier: point.id,
      target: canvasElement,
      clientX: point.x,
      clientY: point.y,
      pageX: point.x,
      pageY: point.y,
    });
    const dispatch = (type, active, changed) => {
      const activeTouches = active.map(touch);
      canvasElement.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: changed.map(touch),
      }));
    };
    const { first, firstMove, firstMove2, firstEnd, second, third, thirdMove, thirdMove2, thirdEnd } = touchPoints;
    dispatch('touchstart', [first], [first]);
    dispatch('touchstart', [first, second], [second]);
    dispatch('touchmove', [firstMove, second], [firstMove]);
    dispatch('touchmove', [firstMove2, second], [firstMove2]);
    dispatch('touchend', [second], [firstEnd]);
    dispatch('touchstart', [second, third], [third]);
    dispatch('touchmove', [second, thirdMove], [thirdMove]);
    dispatch('touchmove', [second, thirdMove2], [thirdMove2]);
    dispatch('touchend', [second], [thirdEnd]);
    dispatch('touchend', [], [second]);
  }, points);

  await expect.poll(() => page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions.length)).toBe(1);
  const selection = await page.evaluate(() => window.PhotoStudio.getCutoutSelection());
  expect(selection.regions[0].points[0].x).toBeCloseTo(firstWorld.x, 1);
  expect(selection.regions[0].points[0].y).toBeCloseTo(firstWorld.y, 1);
  expect(await page.evaluate(() => window.State.action_history.length)).toBe(historyBefore);
  expect(await page.evaluate(() => {
    const select = window.app.GUI.GUI_tools.tools_modules.select.object;
    return { moving: select.moving, resizing: select.resizing, mouseLock: select.Base_selection.mouse_lock };
  })).toEqual(coreBefore);
});

test('旋转图片图层明确禁用自定义 Cutout 遮罩，应用层同样拒绝写入', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-cutout').click();
  await page.getByTestId('cutout-mode-lasso').click();
  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.3);
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
  await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.5);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions.length)).toBe(1);

  await page.evaluate(() => { window.AppConfig.layer.rotate = 18; });
  const historyBefore = await page.evaluate(() => window.State.action_history.length);
  await page.getByTestId('cutout-keep-selection').click();
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.State.action_history.length)).toBe(historyBefore);

  await page.getByTestId('tool-cutout').click();
  await expect(page.getByTestId('cutout-rotation-warning')).toBeVisible();
  await expect(page.getByTestId('cutout-mode-lasso')).toBeDisabled();
  await expect(page.getByTestId('cutout-mode-ellipse')).toBeDisabled();
  await expect(page.getByTestId('cutout-keep-selection')).toBeDisabled();
  await expect(page.getByTestId('cutout-remove-selection')).toBeDisabled();
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

test('Adjust 七组本地调整均会改变像素并可撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-adjust').click();

  for (const testId of [
    'adjust-auto',
    'adjust-bw',
    'adjust-pop',
    'adjust-color',
    'adjust-light',
    'adjust-details',
    'adjust-scene',
  ]) {
    await expect(page.getByTestId(testId)).toBeVisible();
    const before = {
      historyIndex: await page.evaluate(() => window.State.action_history_index),
      pixelHash: await page.evaluate(readActiveLayerPixelHash),
    };
    await page.getByTestId(testId).click();
    if (testId !== 'adjust-auto') {
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.locator('[data-id="popup_ok"]').click();
      await expect(page.getByRole('dialog')).toBeHidden();
    }
    await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.historyIndex + 1);
    await expect.poll(() => page.evaluate(readActiveLayerPixelHash), `${testId} 应改变活动图片像素`).not.toBe(before.pixelHash);
    await page.locator('[data-editor-history="undo"]').click();
    await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.historyIndex);
    await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).toBe(before.pixelHash);
  }
});

test('Adjust 在锁定图层上不会打开处理流程或写入历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-adjust').click();
  await page.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);

  for (const testId of [
    'adjust-auto',
    'adjust-bw',
    'adjust-pop',
    'adjust-color',
    'adjust-light',
    'adjust-details',
    'adjust-scene',
  ]) {
    const historyBefore = await page.evaluate(() => window.State.action_history.length);
    await page.getByTestId(testId).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBefore);
  }
});

test('Adjust 的预览对话框在确认前被锁定时不会提交图层修改', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-adjust').click();

  for (const testId of [
    'adjust-bw',
    'adjust-pop',
    'adjust-color',
    'adjust-light',
    'adjust-details',
    'adjust-scene',
  ]) {
    await page.getByTestId(testId).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('layer-lock').click();
    await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
    const historyBeforeCommit = await page.evaluate(() => window.State.action_history.length);
    await page.locator('[data-id="popup_ok"]').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBeforeCommit);
    await page.getByTestId('layer-lock').click();
    await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(false);
  }
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

test('Effect 的预览取消不写历史，确认后可撤销；锁定层不能通过动作绕过', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'effect.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-effect').click();
  const before = await page.evaluate(() => ({
    history: window.app.State.action_history.length,
    index: window.app.State.action_history_index,
    filters: window.AppConfig.layer.filters.length,
  }));
  await page.getByTestId('effect-contrast').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('[data-id="popup_cancel"]').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(() => page.evaluate(() => ({
    history: window.app.State.action_history.length,
    index: window.app.State.action_history_index,
    filters: window.AppConfig.layer.filters.length,
  }))).toEqual(before);

  await page.getByTestId('effect-contrast').click();
  await page.locator('[data-id="popup_ok"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.filters.length)).toBe(before.filters + 1);
  await expect.poll(() => page.evaluate(() => window.app.State.action_history_index)).toBe(before.index + 1);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.filters.length)).toBe(before.filters);

  await page.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  for (const testId of ['effect-browser', 'effect-contrast', 'effect-blur']) {
    await expect(page.getByTestId(testId)).toBeDisabled();
    await expect(page.getByTestId(testId)).toHaveAttribute('aria-disabled', 'true');
  }
  const locked = await page.evaluate(() => ({
    history: window.app.State.action_history.length,
    index: window.app.State.action_history_index,
    filters: window.AppConfig.layer.filters.length,
    id: window.AppConfig.layer.id,
  }));
  const actionStatus = await page.evaluate(async (layerId) => {
    const result = await window.app.State.do_action(new window.app.Actions.Add_layer_filter_action(layerId, 'contrast', { value: 25 }));
    return result.status;
  }, locked.id);
  expect(actionStatus).toBe('aborted');
  await expect.poll(() => page.evaluate(() => ({
    history: window.app.State.action_history.length,
    index: window.app.State.action_history_index,
    filters: window.AppConfig.layer.filters.length,
  }))).toEqual({ history: locked.history, index: locked.index, filters: locked.filters });
});

test('Effect 更新已有实时效果时撤销会恢复原有参数', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'effect-update.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  const filter = await page.evaluate(async () => {
    await window.app.State.do_action(new window.app.Actions.Add_layer_filter_action(null, 'contrast', { value: 20 }));
    return { ...window.AppConfig.layer.filters[0], params: { ...window.AppConfig.layer.filters[0].params } };
  });
  await page.evaluate(async (current) => {
    await window.app.State.do_action(new window.app.Actions.Add_layer_filter_action(null, 'contrast', { value: 70 }, current.id));
  }, filter);
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.filters.map((item) => ({ name: item.name, params: item.params })))).toEqual([
    { name: 'contrast', params: { value: 70 } },
  ]);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.filters.map((item) => ({ name: item.name, params: item.params })))).toEqual([
    { name: 'contrast', params: { value: 20 } },
  ]);
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.filters.map((item) => ({ name: item.name, params: item.params })))).toEqual([
    { name: 'contrast', params: { value: 70 } },
  ]);
});

test('六项滤镜均在非均匀样图上实际提交，且撤销恢复原始像素', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-filter').click();
  const fixtureInfo = await page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let index = 0; index < canvas.width * canvas.height * 4; index += 4) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
    }
    return { colors: colors.size, width: canvas.width, height: canvas.height };
  });
  expect(fixtureInfo).toMatchObject({ width: 360, height: 270 });
  expect(fixtureInfo.colors).toBeGreaterThan(1);
  await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).not.toBeNull();

  for (const testId of [
    'filter-hdr',
    'filter-focus-bokeh',
    'filter-reflect',
    'filter-dispersion',
    'filter-glitch',
    'filter-colorize',
  ]) {
    await expect(page.getByTestId(testId)).toBeVisible();
    const before = {
      historyIndex: await page.evaluate(() => window.State.action_history_index),
      pixelHash: await page.evaluate(readActiveLayerPixelHash),
    };
    expect(before.pixelHash).not.toBeNull();
    await page.getByTestId(testId).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('[data-id="popup_ok"]').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.historyIndex + 1);
    await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).not.toBe(before.pixelHash);
    await page.locator('[data-editor-history="undo"]').click();
    await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.historyIndex);
    await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).toBe(before.pixelHash);
  }
});

test('Colorize 打开可配置的本地着色流程而不是 Heatmap', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'nonuniform-filter.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await expect(page.getByTestId('tool-filter')).toBeVisible();
  await page.getByTestId('tool-filter').click();
  await expect(page.getByTestId('filter-colorize')).toBeVisible();
  await page.getByTestId('filter-colorize').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: '颜色着色' })).toBeVisible();
  await expect(page.locator('[data-id="popup_ok"]')).toBeVisible();
  await expect(page.locator('#pop_data_color')).toHaveValue('#4f46e5');
  await expect(page.locator('#pop_data_amount')).toHaveValue('65');
});

test('六项滤镜在应用时验证锁定状态，锁定后不会写入历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'nonuniform-filter.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await expect(page.getByTestId('tool-filter')).toBeVisible();
  await page.getByTestId('tool-filter').click();

  for (const testId of [
    'filter-hdr',
    'filter-focus-bokeh',
    'filter-reflect',
    'filter-dispersion',
    'filter-glitch',
    'filter-colorize',
  ]) {
    await expect(page.getByTestId(testId)).toBeVisible();
    await page.getByTestId(testId).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('layer-lock').click();
    await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
    const historyBeforeCommit = await page.evaluate(() => window.State.action_history.length);
    await page.locator('[data-id="popup_ok"]').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBeforeCommit);
    await page.getByTestId('layer-lock').click();
    await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(false);
  }
});

test('锁定图片图层禁用滤镜工作台，并由目标图层 Action 拒绝像素写入', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'locked-filter.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-arrange').click();
  await page.getByTestId('arrange-duplicate').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(2);
  await page.locator('.layers_list .item.active').getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);

  await page.getByTestId('tool-filter').click();
  for (const testId of [
    'filter-hdr',
    'filter-focus-bokeh',
    'filter-reflect',
    'filter-dispersion',
    'filter-glitch',
    'filter-colorize',
  ]) {
    await expect(page.getByTestId(testId)).toBeDisabled();
    await expect(page.getByTestId(testId)).toHaveAttribute('aria-disabled', 'true');
  }

  const lockedLayerId = await page.evaluate(() => window.AppConfig.layer.id);
  const otherLayerId = await page.evaluate((lockedId) => window.AppConfig.layers.find((layer) => layer.id !== lockedId).id, lockedLayerId);
  await page.evaluate(async (layerId) => {
    await window.State.do_action(new window.app.Actions.Select_layer_action(layerId));
  }, otherLayerId);
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.id)).toBe(otherLayerId);

  const before = {
    hash: await page.evaluate(readLayerPixelHash, lockedLayerId),
    state: await page.evaluate((layerId) => {
      const layer = window.AppConfig.layers.find((candidate) => candidate.id === layerId);
      return {
      id: layer.id,
      source: layer.link.src,
      history: window.State.action_history.length,
      index: window.State.action_history_index,
      };
    }, lockedLayerId),
  };
  const actionStatus = await page.evaluate(async (layerId) => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff00ff';
    context.fillRect(0, 0, 2, 2);
    const result = await window.State.do_action(new window.app.Actions.Update_layer_image_action(canvas, layerId));
    return result.status;
  }, before.state.id);
  expect(actionStatus).toBe('aborted');
  expect(await page.evaluate(readLayerPixelHash, before.state.id)).toBe(before.hash);
  await expect.poll(() => page.evaluate((layerId) => ({
    source: window.AppConfig.layers.find((layer) => layer.id === layerId).link.src,
    history: window.State.action_history.length,
    index: window.State.action_history_index,
  }), before.state.id)).toEqual({
    source: before.state.source,
    history: before.state.history,
    index: before.state.index,
  });
});

test('Crop 的应用按钮会按当前裁剪选区改变画布尺寸并保留所选像素区域', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();
  await expect(page.getByTestId('crop-apply')).toBeVisible();
  const expectedPixel = await page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(1, 0, 1, 1).data);
  });
  await page.evaluate(() => { window.app.GUI.GUI_tools.tools_modules.crop.object.selection = { x: 1, y: 0, width: 1, height: 1 }; });
  await page.getByTestId('crop-apply').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([1, 1]);
  await expect.poll(() => page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  })).toEqual(expectedPixel);
});

test('裁剪后的 PNG 导出可解码，并保留当前画布的精确 RGBA 像素', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'export-crop.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  const expectedPixel = await page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(1, 0, 1, 1).data);
  });
  await page.getByTestId('tool-crop').click();
  await page.evaluate(() => {
    window.app.GUI.GUI_tools.tools_modules.crop.object.selection = { x: 1, y: 0, width: 1, height: 1 };
  });
  await page.getByTestId('crop-apply').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([1, 1]);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-image').click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  const decoded = await page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const image = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, pixel: Array.from(context.getImageData(0, 0, 1, 1).data) };
  }, bytes.toString('base64'));
  expect(decoded).toEqual({ width: 1, height: 1, pixel: expectedPixel });
});

test('JPEG 与 WebP 导出可解码，并保持当前画布尺寸', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'export-formats.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  const dimensions = await page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT]);

  for (const format of ['jpeg', 'webp']) {
    await page.getByTestId('export-format').selectOption(format);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-image').click();
    const download = await downloadPromise;
    const bytes = await readFile(await download.path());
    const decoded = await page.evaluate(async ({ base64, type }) => {
      const blob = await (await fetch(`data:${type};base64,${base64}`)).blob();
      const image = await createImageBitmap(blob);
      return [image.width, image.height];
    }, {
      base64: bytes.toString('base64'),
      type: format === 'jpeg' ? 'image/jpeg' : 'image/webp',
    });
    expect(decoded).toEqual(dimensions);
  }
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

test('Crop 输出宽高会更新临时选区并在应用后写入画布尺寸', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();

  await expect(page.getByTestId('crop-output-width')).toHaveValue('3840');
  await expect(page.getByTestId('crop-output-height')).toHaveValue('2880');
  await page.getByTestId('crop-output-width').fill('1920');
  await page.getByTestId('crop-output-height').fill('1080');
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({
    x: 960, y: 900, width: 1920, height: 1080,
  });
  // The UI is disabled, and the core guard must also reject a programmatic
  // invocation so an integration cannot bypass the document-wide lock check.
  await page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.on_params_update());
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([1920, 1080]);
});

test('Crop 会话内的旋转和翻转仅作为临时变换，应用后以一个可撤销操作提交', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await expect.poll(() => page.evaluate(() => Boolean(window.app?.GUI?.GUI_tools?.tools_modules?.crop))).toBe(true);
  await page.getByTestId('tool-crop').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOL.name)).toBe('crop');

  const initialHistory = await page.evaluate(() => window.State.action_history.length);
  const original = await page.evaluate(() => ({
    width: window.AppConfig.WIDTH,
    height: window.AppConfig.HEIGHT,
    rotate: window.AppConfig.layer.rotate,
  }));
  const originalPixelHash = await page.evaluate(readActiveLayerPixelHash);
  await expect(page.getByTestId('crop-rotate-right')).toBeEnabled();
  await expect(page.getByTestId('crop-flip-horizontal')).toBeEnabled();
  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds.x + bounds.width * 0.20, bounds.y + bounds.height * 0.20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.70, bounds.y + bounds.height * 0.60);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection.width)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(initialHistory + 1);
  const stagedDimensions = await page.evaluate(() => {
    const selection = window.app.GUI.GUI_tools.tools_modules.crop.object.selection;
    return [selection.width, selection.height];
  });
  await page.getByTestId('crop-rotate-right').click();
  await page.getByTestId('crop-flip-horizontal').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(initialHistory + 1);
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.rotate)).toBe(original.rotate);

  await page.getByTestId('crop-apply').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([Math.trunc(stagedDimensions[1]), Math.trunc(stagedDimensions[0])]);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(initialHistory + 1);
  await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).not.toBe(originalPixelHash);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([original.width, original.height]);
  await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).toBe(originalPixelHash);
});

test('Crop 拉直角度只在会话内暂存，应用后作为单个可撤销的像素变换提交', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.app?.GUI?.GUI_tools?.tools_modules?.crop))).toBe(true);
  await page.getByTestId('tool-crop').click();

  const before = await page.evaluate(() => ({
    width: window.AppConfig.WIDTH,
    height: window.AppConfig.HEIGHT,
    history: window.State.action_history.length,
  }));
  const pixelHash = await page.evaluate(readActiveLayerPixelHash);
  await page.evaluate(() => {
    const crop = window.app.GUI.GUI_tools.tools_modules.crop.object;
    crop.selection = { x: 0, y: 0, width: window.AppConfig.WIDTH, height: window.AppConfig.HEIGHT };
  });

  await page.getByTestId('crop-straighten').evaluate((input) => {
    input.value = '13.5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.getByTestId('crop-straighten-value')).toHaveText('13.5°');
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.get_pending_transform())).toEqual({
    rotation: 0,
    straighten: 13.5,
    flip_horizontal: false,
    flip_vertical: false,
  });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history);
  await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).toBe(pixelHash);

  await page.getByTestId('crop-apply').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([before.width, before.height]);
  await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).not.toBe(pixelHash);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).toBe(pixelHash);
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([before.width, before.height]);
});

test('Crop 取消会清理临时选区、无历史写入并保持真实 Crop 工具状态', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'crop-lock.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();
  const historyBeforeCancel = await page.evaluate(() => window.State.action_history.length);
  const documentBeforeCancel = await page.evaluate(() => ({
    width: window.AppConfig.WIDTH,
    height: window.AppConfig.HEIGHT,
    rotate: window.AppConfig.layer.rotate,
  }));
  await page.evaluate(() => {
    window.app.GUI.GUI_tools.tools_modules.crop.object.selection = { x: 0, y: 0, width: 1, height: 1 };
  });
  await page.getByTestId('crop-rotate-right').click();
  await page.getByTestId('crop-flip-vertical').click();
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.get_pending_transform())).toEqual({
    rotation: 90, straighten: 0, flip_horizontal: false, flip_vertical: true,
  });
  await page.getByTestId('crop-cancel').click();
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({
    x: null, y: null, width: null, height: null,
  });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBeforeCancel);
  await expect.poll(() => page.evaluate(() => ({
    width: window.AppConfig.WIDTH,
    height: window.AppConfig.HEIGHT,
    rotate: window.AppConfig.layer.rotate,
  }))).toEqual(documentBeforeCancel);
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.get_pending_transform())).toEqual({
    rotation: 0, straighten: 0, flip_horizontal: false, flip_vertical: false,
  });
  await expect(page.getByTestId('editor-tool-panel')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOL.name)).toBe('crop');

  await page.getByTestId('tool-crop').click();
  await page.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  await expect(page.getByTestId('crop-apply')).toBeDisabled();
  await expect(page.getByTestId('crop-rotate-left')).toBeDisabled();
  await expect(page.getByTestId('crop-flip-horizontal')).toBeDisabled();
});

test('Crop 取消会移除真实指针拖拽产生的选区历史，之后撤销和重做都不会恢复它', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.app?.GUI?.GUI_tools?.tools_modules?.crop))).toBe(true);
  await page.getByTestId('tool-crop').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOL.name)).toBe('crop');
  const historyBeforeDrag = await page.evaluate(() => window.State.action_history.length);
  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  await page.mouse.move(bounds.x + bounds.width * 0.30, bounds.y + bounds.height * 0.30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.60, bounds.y + bounds.height * 0.60);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection.width)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBeforeDrag + 1);

  await page.getByTestId('crop-cancel').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBeforeDrag);
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({
    x: null, y: null, width: null, height: null,
  });
  await page.locator('[data-editor-history="undo"]').click();
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({
    x: null, y: null, width: null, height: null,
  });
});

test('Crop 在任何受影响图层被锁定时拒绝整个应用且不写历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'crop-all-layers.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');

  await page.getByTestId('tool-arrange').click();
  await page.getByTestId('arrange-duplicate').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(2);
  await page.evaluate(() => {
    const activeId = window.AppConfig.layer.id;
    const other = window.AppConfig.layers.find((layer) => layer.id !== activeId);
    other.locked = true;
  });
  await page.getByTestId('tool-crop').click();
  await expect(page.getByTestId('crop-apply')).toBeDisabled();
  await expect(page.getByTestId('crop-rotate-right')).toBeDisabled();
  await page.evaluate(() => {
    window.app.GUI.GUI_tools.tools_modules.crop.object.selection = { x: 0, y: 0, width: 1, height: 1 };
  });
  const before = await page.evaluate(() => ({
    history: window.State.action_history.length,
    dimensions: [window.AppConfig.WIDTH, window.AppConfig.HEIGHT],
    layers: window.AppConfig.layers.map((layer) => ({ id: layer.id, x: layer.x, y: layer.y, width: layer.width, height: layer.height, locked: layer.locked })),
  }));
  // The UI is disabled, and the core guard must also reject a programmatic
  // invocation so an integration cannot bypass the document-wide lock check.
  await page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.on_params_update());
  await expect.poll(() => page.evaluate(() => ({
    history: window.State.action_history.length,
    dimensions: [window.AppConfig.WIDTH, window.AppConfig.HEIGHT],
    layers: window.AppConfig.layers.map((layer) => ({ id: layer.id, x: layer.x, y: layer.y, width: layer.width, height: layer.height, locked: layer.locked })),
  }))).toEqual(before);
});

test('Crop 可从文字或形状图层发起；旋转保留矢量，翻转安全栅格化且 Undo/Redo 还原视觉与状态', async ({ page }) => {
  await page.goto('/editor/');
  await expect.poll(() => page.evaluate(() => Boolean(window.app?.GUI?.GUI_tools?.tools_modules?.crop))).toBe(true);
  await page.evaluate(async () => {
    const rectangle = {
      type: 'rectangle',
      name: 'Crop shape',
      params: { border_size: 0, border: false, fill: true, border_color: '#000000', fill_color: '#ef4444', radius: 0 },
      render_function: ['rectangle', 'render'],
      x: 120,
      y: 100,
      width: 220,
      height: 130,
      rotate: 0,
      is_vector: true,
    };
    // Keep this deliberately *fixed width* and multi-line.  A vector Crop
    // quarter-turn must rotate its rendered glyph layout; it must not swap the
    // layer's local width/height and silently re-wrap the text.
    const text = {
      type: 'text',
      name: 'Crop text',
      params: { boundary: 'box', kerning: 'metrics', text_direction: 'ltr', wrap_direction: 'ttb', halign: 'left', valign: 'top', wrap: 'letter' },
      render_function: ['text', 'render'],
      x: 420,
      y: 170,
      width: 250,
      height: 170,
      rotate: 0,
      is_vector: true,
    };
    await window.State.do_action(new window.app.Actions.Bundle_action('crop_vector_fixture', 'Crop vector fixture', [
      new window.app.Actions.Insert_layer_action(rectangle, false),
      new window.app.Actions.Insert_layer_action(text, false),
    ]));
    const textLayer = window.AppConfig.layers.find((layer) => layer.name === 'Crop text');
    textLayer.data = [
      [{ text: 'BLUE LINE', meta: { size: 46, family: 'Arial', fill_color: '#2563eb' } }],
      [{ text: 'GREEN LINE', meta: { size: 46, family: 'Arial', fill_color: '#16a34a' } }],
    ];
    textLayer._needs_update_data = true;
    window.AppConfig.layer = textLayer;
    window.AppConfig.need_render = true;
  });
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.filter((layer) => layer.type === 'text' || layer.type === 'rectangle').length)).toBe(2);

  // An active text layer must not disable document Crop.
  await page.getByTestId('tool-crop').click();
  await expect(page.getByTestId('crop-apply')).toBeEnabled();
  await page.evaluate(() => {
    const crop = window.app.GUI.GUI_tools.tools_modules.crop.object;
    crop.selection = { x: 0, y: 0, width: window.AppConfig.WIDTH, height: window.AppConfig.HEIGHT };
  });
  const beforeRotatePreview = await page.evaluate(() => document.getElementById('canvas_preview').toDataURL());
  const beforeTextPixels = await page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const bounds = (matches) => {
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          if (matches(data[index], data[index + 1], data[index + 2], data[index + 3])) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
    };
    return {
      canvasWidth: width,
      canvasHeight: height,
      // Anti-aliasing changes exact bytes, so use robust colour regions. The
      // fixture's red rectangle is intentionally outside both regions.
      blue: bounds((r, g, b, a) => b > 120 && b > r * 1.15 && b > g * 1.15 && a > 0),
      green: bounds((r, g, b, a) => g > 75 && g > r * 1.18 && g > b * 1.18 && a > 0),
    };
  });
  expect(beforeTextPixels.blue.width).toBeGreaterThan(beforeTextPixels.blue.height * 1.5);
  expect(beforeTextPixels.green.width).toBeGreaterThan(beforeTextPixels.green.height * 1.5);
  expect(beforeTextPixels.blue.centerY).toBeLessThan(beforeTextPixels.green.centerY);
  const vectorBeforeRotate = await page.evaluate(() => ({
    canvasHeight: window.AppConfig.HEIGHT,
    layers: Object.fromEntries(
      window.AppConfig.layers
        .filter((layer) => layer.name === 'Crop shape' || layer.name === 'Crop text')
        .map((layer) => [layer.name, {
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          centerX: layer.x + layer.width / 2,
          centerY: layer.y + layer.height / 2,
          rotate: layer.rotate,
        }])
    ),
  }));
  await page.getByTestId('crop-rotate-right').click();
  await page.getByTestId('crop-apply').click();
  await expect.poll(() => page.evaluate(() => Object.fromEntries(
    window.AppConfig.layers
      .filter((layer) => layer.name === 'Crop shape' || layer.name === 'Crop text')
      .map((layer) => [layer.name, {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        centerX: layer.x + layer.width / 2,
        centerY: layer.y + layer.height / 2,
        rotate: layer.rotate,
      }])
  ))).toEqual({
    'Crop shape': {
      // A document clockwise quarter-turn maps an object's centre (cx, cy)
      // to (oldHeight - cy, cx). Local vector dimensions must not be swapped:
      // width/height drive text wrapping and the rectangle's local geometry.
      x: vectorBeforeRotate.canvasHeight - vectorBeforeRotate.layers['Crop shape'].centerY - vectorBeforeRotate.layers['Crop shape'].width / 2,
      y: vectorBeforeRotate.layers['Crop shape'].centerX - vectorBeforeRotate.layers['Crop shape'].height / 2,
      width: vectorBeforeRotate.layers['Crop shape'].width,
      height: vectorBeforeRotate.layers['Crop shape'].height,
      centerX: vectorBeforeRotate.canvasHeight - vectorBeforeRotate.layers['Crop shape'].centerY,
      centerY: vectorBeforeRotate.layers['Crop shape'].centerX,
      rotate: 90,
    },
    'Crop text': {
      x: vectorBeforeRotate.canvasHeight - vectorBeforeRotate.layers['Crop text'].centerY - vectorBeforeRotate.layers['Crop text'].width / 2,
      y: vectorBeforeRotate.layers['Crop text'].centerX - vectorBeforeRotate.layers['Crop text'].height / 2,
      width: vectorBeforeRotate.layers['Crop text'].width,
      height: vectorBeforeRotate.layers['Crop text'].height,
      centerX: vectorBeforeRotate.canvasHeight - vectorBeforeRotate.layers['Crop text'].centerY,
      centerY: vectorBeforeRotate.layers['Crop text'].centerX,
      rotate: 90,
    },
  });

  const afterRotatePreview = await page.evaluate(() => document.getElementById('canvas_preview').toDataURL());
  expect(afterRotatePreview).not.toBe(beforeRotatePreview);
  // The rectangle's visual bounding box turns from wide to tall, while its
  // layer width/height above deliberately remain its local 220×130 geometry.
  await expect.poll(() => page.evaluate(() => {
    // The visible editor canvas is the rendered source of truth here. The
    // preview canvas can lag while Crop's overlay owns the render cycle.
    const canvas = document.getElementById('canvas_minipaint');
    const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        // Canvas colour management can shift the exact #ef4444 bytes by a
        // point or two. Select the solid red fixture by range, not one RGB
        // triplet, so this remains a pixel-geometry assertion.
        if (data[index] > 220 && data[index + 1] >= 35 && data[index + 1] <= 105 && data[index + 2] >= 35 && data[index + 2] <= 105 && data[index + 3] > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    return { width: maxX - minX + 1, height: maxY - minY + 1 };
  })).toEqual({ width: 130, height: 220 });

  // The distinct coloured fixed-width text rows are a visual guard against
  // the historical vector double-swap.  After clockwise Crop they become
  // tall glyph runs, their centres rotate with the document, and the earlier
  // blue row moves to the right of the later green row.  This also proves the
  // text layout itself rotates rather than merely its layer metadata.
  const afterTextPixels = await page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const bounds = (matches) => {
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          if (matches(data[index], data[index + 1], data[index + 2], data[index + 3])) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
    };
    return {
      blue: bounds((r, g, b, a) => b > 120 && b > r * 1.15 && b > g * 1.15 && a > 0),
      green: bounds((r, g, b, a) => g > 75 && g > r * 1.18 && g > b * 1.18 && a > 0),
    };
  });
  for (const colour of ['blue', 'green']) {
    expect(afterTextPixels[colour].height).toBeGreaterThan(afterTextPixels[colour].width * 1.5);
    expect(Math.abs(afterTextPixels[colour].width - beforeTextPixels[colour].height)).toBeLessThanOrEqual(4);
    expect(Math.abs(afterTextPixels[colour].height - beforeTextPixels[colour].width)).toBeLessThanOrEqual(4);
    expect(Math.abs(afterTextPixels[colour].centerX - (beforeTextPixels.canvasHeight - beforeTextPixels[colour].centerY))).toBeLessThanOrEqual(3);
    expect(Math.abs(afterTextPixels[colour].centerY - beforeTextPixels[colour].centerX)).toBeLessThanOrEqual(3);
  }
  expect(afterTextPixels.blue.centerX).toBeGreaterThan(afterTextPixels.green.centerX);

  // Crop's quarter-turn is one bundle: Undo restores vector geometry and the
  // text layout dimensions, Redo restores the exact rotated pixels.
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => Object.fromEntries(
    window.AppConfig.layers
      .filter((layer) => layer.name === 'Crop shape' || layer.name === 'Crop text')
      .map((layer) => [layer.name, {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotate: layer.rotate,
      }])
  ))).toEqual(Object.fromEntries(Object.entries(vectorBeforeRotate.layers).map(([name, layer]) => [name, {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotate: layer.rotate,
  }])));
  await expect.poll(() => page.evaluate(() => document.getElementById('canvas_preview').toDataURL())).toBe(beforeRotatePreview);
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => Object.fromEntries(
    window.AppConfig.layers
      .filter((layer) => layer.name === 'Crop shape' || layer.name === 'Crop text')
      .map((layer) => [layer.name, {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotate: layer.rotate,
      }])
  ))).toEqual({
    'Crop shape': {
      x: vectorBeforeRotate.canvasHeight - vectorBeforeRotate.layers['Crop shape'].centerY - vectorBeforeRotate.layers['Crop shape'].width / 2,
      y: vectorBeforeRotate.layers['Crop shape'].centerX - vectorBeforeRotate.layers['Crop shape'].height / 2,
      width: vectorBeforeRotate.layers['Crop shape'].width,
      height: vectorBeforeRotate.layers['Crop shape'].height,
      rotate: 90,
    },
    'Crop text': {
      x: vectorBeforeRotate.canvasHeight - vectorBeforeRotate.layers['Crop text'].centerY - vectorBeforeRotate.layers['Crop text'].width / 2,
      y: vectorBeforeRotate.layers['Crop text'].centerX - vectorBeforeRotate.layers['Crop text'].height / 2,
      width: vectorBeforeRotate.layers['Crop text'].width,
      height: vectorBeforeRotate.layers['Crop text'].height,
      rotate: 90,
    },
  });
  await expect.poll(() => page.evaluate(() => document.getElementById('canvas_preview').toDataURL())).toBe(afterRotatePreview);

  // A subsequent reflection rasterizes the affected vector layers, rather
  // than falsely claiming a text/shape flip was applied semantically.
  const beforeFlip = await page.evaluate(() => {
    // Preview contains the composed document only; the main canvas also draws
    // transient Crop controls, which must not participate in pixel equality.
    const canvas = document.getElementById('canvas_preview');
    return canvas.toDataURL();
  });
  await page.getByTestId('tool-crop').click();
  await expect(page.getByTestId('crop-apply')).toBeEnabled();
  await page.evaluate(() => {
    const crop = window.app.GUI.GUI_tools.tools_modules.crop.object;
    crop.selection = { x: 0, y: 0, width: window.AppConfig.WIDTH, height: window.AppConfig.HEIGHT };
  });
  await page.getByTestId('crop-flip-horizontal').click();
  await page.getByTestId('crop-apply').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.filter((layer) => layer.name === 'Crop shape' || layer.name === 'Crop text').map((layer) => layer.type))).toEqual(['image', 'image']);
  const afterFlip = await page.evaluate(() => document.getElementById('canvas_preview').toDataURL());
  expect(afterFlip).not.toBe(beforeFlip);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.filter((layer) => layer.name === 'Crop shape' || layer.name === 'Crop text').map((layer) => layer.type))).toEqual(['rectangle', 'text']);
  await expect.poll(() => page.evaluate(() => document.getElementById('canvas_preview').toDataURL())).toBe(beforeFlip);
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.filter((layer) => layer.name === 'Crop shape' || layer.name === 'Crop text').map((layer) => layer.type))).toEqual(['image', 'image']);
  await expect.poll(() => page.evaluate(() => document.getElementById('canvas_preview').toDataURL())).toBe(afterFlip);
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
  await page.getByTestId('arrange-composition').selectOption('multiply');
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.composition)).toBe('multiply');
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.composition)).toBe('source-over');
  await page.getByTestId('arrange-rotate-right').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.rotate)).toBe(90);
});

test('Arrange 可重命名、自由变换和添加可撤销的基础 Frame，锁定图层不可编辑', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-arrange').click();
  await expect(page.getByTestId('arrange-name')).toBeVisible();

  const initial = await page.evaluate(() => ({
    id: window.AppConfig.layer.id,
    name: window.AppConfig.layer.name,
    x: window.AppConfig.layer.x,
    y: window.AppConfig.layer.y,
    width: window.AppConfig.layer.width,
    height: window.AppConfig.layer.height,
    rotate: window.AppConfig.layer.rotate,
  }));

  await page.getByTestId('arrange-name').fill('Hero photo');
  await page.getByTestId('arrange-rename').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.name)).toBe('Hero photo');
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.name)).toBe(initial.name);
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.name)).toBe('Hero photo');

  await page.getByTestId('arrange-x').fill('42');
  await page.getByTestId('arrange-y').fill('58');
  await page.getByTestId('arrange-width').fill('920');
  await page.getByTestId('arrange-height').fill('640');
  await page.getByTestId('arrange-rotation').fill('27');
  await page.getByTestId('arrange-apply-transform').click();
  await expect.poll(() => page.evaluate(() => ({
    x: window.AppConfig.layer.x,
    y: window.AppConfig.layer.y,
    width: window.AppConfig.layer.width,
    height: window.AppConfig.layer.height,
    rotate: window.AppConfig.layer.rotate,
  }))).toEqual({ x: 42, y: 58, width: 920, height: 640, rotate: 27 });
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => ({
    x: window.AppConfig.layer.x,
    y: window.AppConfig.layer.y,
    width: window.AppConfig.layer.width,
    height: window.AppConfig.layer.height,
    rotate: window.AppConfig.layer.rotate,
  }))).toEqual({
    x: initial.x,
    y: initial.y,
    width: initial.width,
    height: initial.height,
    rotate: initial.rotate,
  });
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => ({
    x: window.AppConfig.layer.x,
    y: window.AppConfig.layer.y,
    width: window.AppConfig.layer.width,
    height: window.AppConfig.layer.height,
    rotate: window.AppConfig.layer.rotate,
  }))).toEqual({ x: 42, y: 58, width: 920, height: 640, rotate: 27 });

  const previewBeforeFrame = await page.evaluate(() => document.getElementById('canvas_preview').toDataURL());
  await page.getByTestId('arrange-add-frame').click();
  await expect.poll(() => page.evaluate(() => ({
    count: window.AppConfig.layers.length,
    type: window.AppConfig.layer.type,
    name: window.AppConfig.layer.name,
  }))).toEqual({ count: 2, type: 'rectangle', name: 'Frame' });
  await expect.poll(() => page.evaluate(() => document.getElementById('canvas_preview').toDataURL())).not.toBe(previewBeforeFrame);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(1);
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(2);

  await page.locator('.layers_list .item.active').getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  await expect(page.getByTestId('arrange-rename')).toBeDisabled();
  await expect(page.getByTestId('arrange-apply-transform')).toBeDisabled();
  await expect(page.getByTestId('arrange-delete')).toBeDisabled();
});

test('Arrange 在空白新画布添加 Frame 时替换占位层，并保持单层可撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('create-new').click();
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => window.AppConfig?.layers?.map((layer) => layer.type))).toEqual([null]);

  await page.getByTestId('tool-arrange').click();
  await page.getByTestId('arrange-add-frame').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.map((layer) => ({ type: layer.type, name: layer.name })))).toEqual([
    { type: 'rectangle', name: 'Frame' },
  ]);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.map((layer) => layer.type))).toEqual([null]);
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.map((layer) => ({ type: layer.type, name: layer.name })))).toEqual([
    { type: 'rectangle', name: 'Frame' },
  ]);
});

test('锁定图层会拒绝右侧图层栏的复制、排序与删除，但可撤销地切换可见性', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-arrange').click();
  await expect(page.getByTestId('arrange-duplicate')).toBeVisible();
  await page.getByTestId('arrange-duplicate').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(2);

  const activeItem = page.locator('.layers_list .item.active');
  await activeItem.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  const before = await page.evaluate(() => ({
    history: window.State.action_history.length,
    index: window.State.action_history_index,
    activeId: window.AppConfig.layer.id,
    layers: window.AppConfig.layers.map((layer) => ({ id: layer.id, order: layer.order, visible: layer.visible, locked: layer.locked })),
  }));

  for (const selector of ['#layer_duplicate', '#layer_up', '#layer_down', '#layer_raster']) {
    await expect(page.locator(selector)).toBeDisabled();
  }
  await expect(activeItem.locator('#delete')).toBeDisabled();
  await expect(activeItem.locator('#visibility')).toBeEnabled();

  // dispatchEvent bypasses native disabled-button suppression, proving the
  // sidebar handler and lower module guards do not create history entries.
  for (const selector of ['#layer_duplicate', '#layer_up', '#layer_down', '#layer_raster']) {
    await page.locator(selector).dispatchEvent('click');
  }
  await activeItem.locator('#delete').dispatchEvent('click');
  await activeItem.locator('#visibility').click();
  await expect.poll(() => page.evaluate(() => ({
    history: window.State.action_history.length,
    index: window.State.action_history_index,
    layers: window.AppConfig.layers.map((layer) => ({ id: layer.id, order: layer.order, visible: layer.visible, locked: layer.locked })),
  }))).toEqual({
    history: before.history + 1,
    index: before.index + 1,
    layers: before.layers.map((layer) => layer.id === before.activeId ? { ...layer, visible: !layer.visible } : layer),
  });
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => ({
    history: window.State.action_history.length,
    index: window.State.action_history_index,
    layers: window.AppConfig.layers.map((layer) => ({ id: layer.id, order: layer.order, visible: layer.visible, locked: layer.locked })),
  }))).toEqual({
    history: before.history + 1,
    index: before.index,
    layers: before.layers,
  });
});

test('Retouch 提供本地修饰并将局部去色写入可撤销历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-retouch').click();
  await expect(page.getByTestId('retouch-clone')).toBeVisible();
  await expect(page.getByTestId('retouch-blur')).toBeVisible();
  await expect(page.getByTestId('retouch-sharpen')).toBeVisible();
  await page.getByTestId('retouch-size').fill('21');
  await page.getByTestId('retouch-blur-strength').fill('64');
  await page.getByTestId('retouch-clone-source').selectOption('Previous');
  await expect.poll(() => page.evaluate(() => ({
    cloneSize: window.AppConfig.TOOLS.find((tool) => tool.name === 'clone').attributes.size,
    blurSize: window.AppConfig.TOOLS.find((tool) => tool.name === 'blur').attributes.size,
    sharpenSize: window.AppConfig.TOOLS.find((tool) => tool.name === 'sharpen').attributes.size,
    desaturateSize: window.AppConfig.TOOLS.find((tool) => tool.name === 'desaturate').attributes.size,
    blurStrength: window.AppConfig.TOOLS.find((tool) => tool.name === 'blur').attributes.strength,
    cloneSource: window.AppConfig.TOOLS.find((tool) => tool.name === 'clone').attributes.source_layer.value,
  }))).toEqual({ cloneSize: 21, blurSize: 21, sharpenSize: 21, desaturateSize: 21, blurStrength: 0.64, cloneSource: 'Previous' });
  await page.getByTestId('retouch-desaturate').click();
  await expect(page.locator('#tools_container .desaturate')).toHaveClass(/active/);
  await page.evaluate(() => {
    window.AppConfig.TOOLS.find((tool) => tool.name === 'desaturate').attributes.size = 1;
  });
  const historyBefore = await page.evaluate(() => ({
    length: window.State.action_history.length,
    index: window.State.action_history_index,
  }));
  await page.locator('#canvas_minipaint').click({ position: { x: 1, y: 1 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(historyBefore.length);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(historyBefore.index);
  await page.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  const lockedHistoryLength = await page.evaluate(() => window.State.action_history.length);
  await page.locator('#canvas_minipaint').click({ position: { x: 1, y: 1 } });
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(lockedHistoryLength);
});

test('Liquify 面板回写本地内核参数，并按 WebGL2 与锁定状态安全执行', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-liquify').click();

  await expect(page.getByTestId('liquify-mode-bulge')).toBeVisible();
  await expect(page.getByTestId('liquify-mode-pinch')).toBeVisible();
  await expect(page.getByTestId('liquify-radius')).toHaveAttribute('min', '1');
  await expect(page.getByTestId('liquify-radius')).toHaveAttribute('max', '500');
  await expect(page.getByTestId('liquify-strength')).toHaveAttribute('min', '1');
  await expect(page.getByTestId('liquify-strength')).toHaveAttribute('max', '100');
  await expect(page.getByTestId('liquify-density')).toHaveAttribute('min', '1');
  await expect(page.getByTestId('liquify-apply')).toBeDisabled();
  await expect(page.getByTestId('liquify-cancel')).toBeDisabled();

  const webgl2Available = await page.evaluate(() => document.body.dataset.liquifyAcceleration === 'webgl2');
  if (!webgl2Available) {
    await expect(page.getByTestId('liquify-status')).toContainText('仅本地 WebGL2 可用');
    await expect(page.getByTestId('liquify-mode-bulge')).toBeDisabled();
    await expect(page.getByTestId('liquify-mode-pinch')).toBeDisabled();
    await expect(page.getByTestId('liquify-radius')).toBeDisabled();
    await expect(page.getByTestId('liquify-strength')).toBeDisabled();
    await expect(page.getByTestId('liquify-density')).toBeDisabled();
    return;
  }

  await expect(page.getByTestId('liquify-status')).toContainText('本地 WebGL2 已启用');
  await page.getByTestId('liquify-mode-pinch').click();
  await page.getByTestId('liquify-radius').fill('123');
  await page.getByTestId('liquify-strength').fill('67');
  await page.getByTestId('liquify-density').fill('42');
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'bulge_pinch').attributes)).toMatchObject({
    bulge: false,
    radius: 123,
    power: 67,
    density: 42,
  });

  const historyBefore = await page.evaluate(() => window.State.action_history.length);
  const sourceBefore = await page.evaluate(() => window.AppConfig.layer.link.src);
  await page.locator('#canvas_minipaint').click({ position: { x: 500, y: 300 } });
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.link_canvas))).toBe(true);
  await expect(page.getByTestId('liquify-apply')).toBeEnabled();
  await expect(page.getByTestId('liquify-cancel')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBefore);
  await page.getByTestId('liquify-cancel').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.link_canvas))).toBe(false);
  await expect(page.getByTestId('liquify-apply')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.link.src)).toBe(sourceBefore);

  await page.locator('#canvas_minipaint').click({ position: { x: 500, y: 300 } });
  await expect(page.getByTestId('liquify-apply')).toBeEnabled();
  await page.getByTestId('liquify-apply').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(historyBefore);
  const historyIndexAfterStroke = await page.evaluate(() => window.State.action_history_index);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBeLessThan(historyIndexAfterStroke);

  await page.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  await expect(page.getByTestId('liquify-mode-pinch')).toBeDisabled();
  await expect(page.getByTestId('liquify-radius')).toBeDisabled();
  await expect(page.getByTestId('liquify-strength')).toBeDisabled();
  await expect(page.getByTestId('liquify-density')).toBeDisabled();
  const lockedHistoryLength = await page.evaluate(() => window.State.action_history.length);
  await page.locator('#canvas_minipaint').click({ position: { x: 500, y: 300 } });
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(lockedHistoryLength);
});

test('Liquify 推移沿笔触暂存本地预览，并只在应用时写入一次历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-liquify').click();
  const push = page.getByTestId('liquify-mode-push');
  await expect(push).toBeVisible();

  const webgl2Available = await page.evaluate(() => document.body.dataset.liquifyAcceleration === 'webgl2');
  if (!webgl2Available) {
    await expect(push).toBeDisabled();
    return;
  }

  await push.click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'bulge_pinch').attributes)).toMatchObject({
    push: true,
  });
  const before = await page.evaluate(() => ({
    history: window.State.action_history.length,
    preview: document.getElementById('canvas_preview').toDataURL(),
  }));
  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds.x + bounds.width * 0.38, bounds.y + bounds.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.48, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.bulge_pinch.object.has_session())).toBe(true);
  await expect.poll(() => page.evaluate(() => document.getElementById('canvas_preview').toDataURL())).not.toBe(before.preview);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history);

  await page.getByTestId('liquify-apply').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);
  const applied = await page.evaluate(() => document.getElementById('canvas_preview').toDataURL());
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => document.getElementById('canvas_preview').toDataURL())).toBe(before.preview);
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => document.getElementById('canvas_preview').toDataURL())).toBe(applied);
});

test('选区进入锁定图层的不可用液化时，会按标准工具生命周期清理临时选区', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'locked-liquify.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');

  await page.getByTestId('tool-cutout').click();
  await expect(page.locator('#tools_container .selection')).toHaveClass(/active/);
  await page.evaluate(() => {
    window.app.GUI.GUI_tools.tools_modules.selection.object.selection = { x: 0, y: 0, width: 1, height: 1 };
  });
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.selection.object.selection)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  await page.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);

  await page.getByTestId('tool-liquify').click();
  await expect(page.getByTestId('liquify-status')).toContainText('请选择未锁定的图片图层');
  await expect.poll(() => page.evaluate(() => ({
    mode: document.body.dataset.canvasToolMode,
    coreTool: window.AppConfig.TOOL.name,
    activeTool: window.app.GUI.GUI_tools.active_tool,
  }))).toEqual({ mode: 'inactive', coreTool: 'select', activeTool: 'select' });
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.selection.object.selection)).toEqual({ x: null, y: null, width: null, height: null });
  await expect.poll(() => page.evaluate(() => document.cookie.includes('active_tool=noop'))).toBe(false);

  const historyAfterToolExit = await page.evaluate(() => window.State.action_history.length);
  await page.locator('#canvas_minipaint').click({ position: { x: 1, y: 1 } });
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyAfterToolExit);
});

test('裁剪进入锁定图层的不可用液化时，会按标准工具生命周期清理临时裁剪区域', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'locked-crop-liquify.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');

  await page.getByTestId('tool-crop').click();
  await expect(page.locator('#tools_container .crop')).toHaveClass(/active/);
  await page.evaluate(() => {
    window.app.GUI.GUI_tools.tools_modules.crop.object.selection = { x: 0, y: 0, width: 1, height: 1 };
  });
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  await page.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);

  await page.getByTestId('tool-liquify').click();
  await expect(page.getByTestId('liquify-status')).toContainText('请选择未锁定的图片图层');
  await expect.poll(() => page.evaluate(() => ({
    mode: document.body.dataset.canvasToolMode,
    coreTool: window.AppConfig.TOOL.name,
    activeTool: window.app.GUI.GUI_tools.active_tool,
  }))).toEqual({ mode: 'inactive', coreTool: 'select', activeTool: 'select' });
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({ x: null, y: null, width: null, height: null });

  const historyAfterToolExit = await page.evaluate(() => window.State.action_history.length);
  await page.locator('#canvas_minipaint').click({ position: { x: 1, y: 1 } });
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyAfterToolExit);
});

test('Drawing 会激活画笔并将颜色、尺寸和不透明度写入本地配置', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await expect(page.getByTestId('drawing-gradient')).toBeVisible();
  await page.getByTestId('drawing-color').fill('#d946ef');
  await page.getByTestId('drawing-size').fill('18');
  await page.getByTestId('drawing-opacity').fill('42');
  await page.getByTestId('drawing-brush').click();
  await expect(page.locator('#tools_container .brush')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => ({
    color: window.AppConfig.COLOR,
    alpha: window.AppConfig.ALPHA,
    size: window.AppConfig.TOOLS.find((tool) => tool.name === 'brush').attributes.size,
  }))).toEqual({ color: '#d946ef', alpha: 107, size: 18 });
});

test('Drawing 填充不会修改锁定图片图层或写入历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await page.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  await page.getByTestId('drawing-fill').click();
  await expect(page.locator('#tools_container .fill')).toHaveClass(/active/);
  const lockedState = await page.evaluate(() => ({
    historyLength: window.State.action_history.length,
    image: window.AppConfig.layer.link.src,
  }));
  await page.locator('#canvas_minipaint').click({ position: { x: 1, y: 1 } });
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(lockedState.historyLength);
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.link.src)).toBe(lockedState.image);
});

test('Text 面板提供本机字体与完整样式控件，并写回文字工具配置', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('tool-text').click();

  await expect(page.getByTestId('text-create')).toBeVisible();
  await expect(page.getByTestId('text-font')).toBeVisible();
  await expect(page.getByTestId('text-size')).toBeVisible();
  await expect(page.getByTestId('text-fill')).toBeVisible();
  await expect(page.getByTestId('text-bold')).toBeVisible();
  await expect(page.getByTestId('text-italic')).toBeVisible();
  await expect(page.getByTestId('text-underline')).toBeVisible();
  await expect(page.getByTestId('text-align-left')).toBeVisible();
  await expect(page.getByTestId('text-align-center')).toBeVisible();
  await expect(page.getByTestId('text-align-right')).toBeVisible();
  await expect(page.getByTestId('text-stroke')).toBeVisible();
  await expect(page.getByTestId('text-stroke-size')).toBeVisible();
  await expect(page.getByTestId('text-shadow-enabled')).toBeVisible();
  await expect(page.getByTestId('text-background-enabled')).toBeVisible();

  await page.getByTestId('text-font').selectOption('Verdana');
  await page.getByTestId('text-size').fill('52');
  await page.getByTestId('text-fill').fill('#d946ef');
  await page.getByTestId('text-bold').click();
  await page.getByTestId('text-italic').click();
  await page.getByTestId('text-underline').click();
  await page.getByTestId('text-align-center').click();
  await page.getByTestId('text-stroke').fill('#0ea5e9');
  await page.getByTestId('text-stroke-size').fill('3');

  await expect.poll(() => page.evaluate(() => {
    const attributes = window.AppConfig.TOOLS.find((tool) => tool.name === 'text').attributes;
    return {
      font: attributes.font.value,
      size: attributes.size,
      fill: attributes.fill,
      bold: attributes.bold.value,
      italic: attributes.italic.value,
      underline: attributes.underline.value,
      align: attributes.align.value,
      stroke: attributes.stroke,
      strokeSize: attributes.stroke_size.value,
    };
  })).toEqual({
    font: 'Verdana',
    size: 52,
    fill: '#d946ef',
    bold: true,
    italic: true,
    underline: true,
    align: 'center',
    stroke: '#0ea5e9',
    strokeSize: 3,
  });
});

test('Text 可在画布创建文本层、通过本地 textarea 写入并撤销历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-text').click();
  await page.getByTestId('text-align-right').click();
  await page.getByTestId('text-create').click();
  const historyBeforeCreate = await page.evaluate(() => window.State.action_history.length);
  await page.locator('#canvas_minipaint').click({ position: { x: 1, y: 1 } });
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.filter((layer) => layer.type === 'text').length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.params.halign)).toBe('right');
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(historyBeforeCreate);

  await page.locator('#text_tool_keyboard_input').fill('Studio');
  await page.locator('#text_tool_keyboard_input').blur();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.data?.[0]?.[0]?.text)).toBe('Studio');
  await page.getByTestId('text-align-center').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.params.halign)).toBe('center');
  const historyBeforeDecoration = await page.evaluate(() => window.app.State.action_history.length);
  await page.getByTestId('text-shadow-enabled').check();
  await page.getByTestId('text-shadow-color').fill('#0ea5e9');
  await page.getByTestId('text-shadow-blur').fill('9');
  await page.getByTestId('text-background-enabled').check();
  await page.getByTestId('text-background-color').fill('#f59e0b');
  await page.getByTestId('text-background-opacity').fill('48');
  await expect.poll(() => page.evaluate(() => ({
    shadowEnabled: window.AppConfig.layer.params.shadow_enabled,
    shadowColor: window.AppConfig.layer.params.shadow_color,
    shadowBlur: window.AppConfig.layer.params.shadow_blur,
    backgroundEnabled: window.AppConfig.layer.params.background_enabled,
    backgroundColor: window.AppConfig.layer.params.background_color,
    backgroundOpacity: window.AppConfig.layer.params.background_opacity,
  }))).toEqual({
    shadowEnabled: true,
    shadowColor: '#0ea5e9',
    shadowBlur: 9,
    backgroundEnabled: true,
    backgroundColor: '#f59e0b',
    backgroundOpacity: 48,
  });
  await expect.poll(() => page.evaluate(() => window.app.State.action_history.length)).toBeGreaterThan(historyBeforeDecoration);
  const historyBeforeUndo = await page.evaluate(() => window.State.action_history_index);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBeLessThan(historyBeforeUndo);
});

test('Text 锁定活动文字层后阻止输入和样式写入历史，但仍可新建文字层', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-text').click();
  await page.getByTestId('text-create').click();
  await page.locator('#canvas_minipaint').click({ position: { x: 500, y: 180 } });
  await page.locator('#text_tool_keyboard_input').fill('Locked');
  await page.locator('#text_tool_keyboard_input').blur();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.data?.[0]?.[0]?.text)).toBe('Locked');

  await page.locator('.layers_list .item.active').getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  const lockedState = await page.evaluate(() => ({
    historyLength: window.State.action_history.length,
    data: JSON.stringify(window.AppConfig.layer.data),
  }));
  await page.locator('#text_tool_keyboard_input').fill('Edited');
  await page.locator('#text_tool_keyboard_input').blur();
  await page.getByTestId('text-fill').fill('#ef4444');
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => ({
    historyLength: window.State.action_history.length,
    data: JSON.stringify(window.AppConfig.layer.data),
  }))).toEqual(lockedState);

  await page.getByTestId('text-create').click();
  await page.locator('#canvas_minipaint').click({ position: { x: 700, y: 360 } });
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.filter((layer) => layer.type === 'text').length)).toBe(2);
});

test('编辑器可保存本地项目', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('create-new').click();
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('save-local-project').click();
  await expect(page.getByTestId('save-local-project')).toHaveText('已保存本地项目');
});
