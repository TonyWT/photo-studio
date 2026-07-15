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

async function openSaveMenu(page) {
  const menu = page.getByTestId('save-menu');
  if (!await menu.isVisible()) await page.getByTestId('save-menu-toggle').click();
  await expect(menu).toBeVisible();
}

test('主页提供本地打开和新建入口', async ({ page }) => {
  await openHome(page);
  await expect(page.getByTestId('open-image')).toBeVisible();
  await expect(page.getByTestId('create-new')).toBeVisible();
  await expect(page.getByTestId('dropzone')).toContainText('粘贴图片');
  await expect(page.getByTestId('recent-projects')).toContainText('尚无本地项目');
});

test('主页可从剪贴板粘贴本地图片进入编辑器', async ({ page }) => {
  await openHome(page);
  await page.evaluate(async (bytes) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([new Uint8Array(bytes)], 'clipboard.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }));
  }, [...samplePng]);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => window.AppConfig?.layer?.name)).toBe('clipboard.png');
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

test('2×2 拼贴可向选中分格放入本地图片，并覆盖式自动裁切为图层', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('create-collage').click();
  await page.getByTestId('collage-template-2x2').click();
  await expect(page).toHaveURL(/\/editor\/\?collage=2x2$/);
  await expect(page.getByTestId('collage-slot-0')).toBeVisible();
  await expect(page.getByTestId('collage-slot-3')).toBeVisible();
  await expect(page.locator('#action_attributes')).toBeHidden();
  await page.getByTestId('collage-slot-0').click();

  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ef4444';
    context.fillRect(0, 0, 100, 100);
    context.fillStyle = '#2563eb';
    context.fillRect(100, 0, 100, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('collage-image-picker').setInputFiles({
    name: 'wide-source.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source, 'base64'),
  });

  await expect.poll(() => page.evaluate(() => {
    const layer = window.AppConfig.layers.find((item) => item.params?.collage_slot === 0);
    if (!layer?.link) return null;
    return {
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      widthOriginal: layer.width_original,
      heightOriginal: layer.height_original,
    };
  })).toEqual({
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    widthOriginal: 400,
    heightOriginal: 300,
  });
  await expect(page.getByTestId('collage-slot-0')).toContainText('已填入');
  await expect.poll(() => page.evaluate(() => {
    const layer = window.AppConfig.layers.find((item) => item.params?.collage_slot === 0);
    const canvas = document.createElement('canvas');
    canvas.width = layer.link.naturalWidth;
    canvas.height = layer.link.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(layer.link, 0, 0);
    return {
      left: Array.from(context.getImageData(0, 150, 1, 1).data),
      right: Array.from(context.getImageData(399, 150, 1, 1).data),
    };
  })).toEqual({ left: [239, 68, 68, 255], right: [37, 99, 235, 255] });
});

test('拼贴已填分格可本地缩放和水平调位，并作为单次历史撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('create-collage').click();
  await page.getByTestId('collage-template-2x2').click();

  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ef4444';
    context.fillRect(0, 0, 100, 100);
    context.fillStyle = '#2563eb';
    context.fillRect(100, 0, 300, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('collage-image-picker').setInputFiles({
    name: 'position-source.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source, 'base64'),
  });
  const before = await page.evaluate(() => {
    const layer = window.AppConfig.layers.find((item) => item.params?.collage_slot === 0);
    return {
      pixelHash: window.readLayerPixelHash?.(layer.id) ?? layer.link.src,
      params: layer.params,
      history: window.State.action_history.length,
    };
  });

  await expect(page.getByTestId('collage-zoom')).toHaveValue('1');
  await page.getByTestId('collage-zoom').fill('2');
  await page.getByTestId('collage-zoom').blur();
  await expect.poll(() => page.evaluate(() => {
    const layer = window.AppConfig.layers.find((item) => item.params?.collage_slot === 0);
    return { zoom: layer.params?.collage_zoom, history: window.State.action_history.length };
  })).toEqual({ zoom: 2, history: before.history + 1 });

  const zoomed = await page.evaluate(() => {
    const layer = window.AppConfig.layers.find((item) => item.params?.collage_slot === 0);
    return layer.link.src;
  });
  expect(zoomed).not.toBe(before.pixelHash);

  await page.getByTestId('collage-offset-x').fill('100');
  await page.getByTestId('collage-offset-x').blur();
  await expect.poll(() => page.evaluate(() => {
    const layer = window.AppConfig.layers.find((item) => item.params?.collage_slot === 0);
    return layer.link.src;
  })).not.toBe(zoomed);
  const positioned = await page.evaluate(() => {
    const layer = window.AppConfig.layers.find((item) => item.params?.collage_slot === 0);
    return {
      data: layer.link.src,
      offset: layer.params?.collage_offset_x,
      history: window.State.action_history.length,
    };
  });
  expect(positioned.data).not.toBe(zoomed);
  expect(positioned.offset).toBe(100);
  expect(positioned.history).toBe(before.history + 2);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const layer = window.AppConfig.layers.find((item) => item.params?.collage_slot === 0);
    return { data: layer.link.src, offset: layer.params?.collage_offset_x, zoom: layer.params?.collage_zoom };
  })).toEqual({ data: zoomed, offset: 0, zoom: 2 });
});

test('拼贴画布内可选择分格、拖移图片并以滚轮缩放，且每次编辑均可撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('create-collage').click();
  await page.getByTestId('collage-template-2x2').click();

  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 120;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ef4444';
    context.fillRect(0, 0, 120, 120);
    context.fillStyle = '#2563eb';
    context.fillRect(120, 0, 360, 120);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('collage-image-picker').setInputFiles({
    name: 'canvas-gesture-source.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source, 'base64'),
  });
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layers.find((item) => item.params?.collage_slot === 0)))).toBe(true);

  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const slotThreePoint = {
    x: bounds.x + bounds.width * 0.75,
    y: bounds.y + bounds.height * 0.75,
  };
  await page.mouse.click(slotThreePoint.x, slotThreePoint.y);
  await expect(page.getByTestId('collage-slot-3')).toHaveClass(/is-selected/);

  const slotZeroPoint = {
    x: bounds.x + bounds.width * 0.25,
    y: bounds.y + bounds.height * 0.25,
  };
  await page.mouse.move(slotZeroPoint.x, slotZeroPoint.y);
  await page.mouse.down();
  await page.mouse.move(slotZeroPoint.x + 56, slotZeroPoint.y + 24, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const layer = window.AppConfig.layers.find((item) => item.params?.collage_slot === 0);
    return Number(layer?.params?.collage_offset_x);
  })).toBeGreaterThan(0);
  const afterDrag = await page.evaluate(() => ({
    history: window.State.action_history.length,
    params: window.AppConfig.layers.find((item) => item.params?.collage_slot === 0).params,
  }));

  await page.mouse.wheel(0, -120);
  await expect.poll(() => page.evaluate(() => Number(window.AppConfig.layers.find((item) => item.params?.collage_slot === 0)?.params?.collage_zoom))).toBeGreaterThan(1);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(afterDrag.history + 1);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => ({
    zoom: Number(window.AppConfig.layers.find((item) => item.params?.collage_slot === 0)?.params?.collage_zoom),
    offsetX: Number(window.AppConfig.layers.find((item) => item.params?.collage_slot === 0)?.params?.collage_offset_x),
  }))).toEqual({ zoom: 1, offsetX: afterDrag.params.collage_offset_x });
});

test('新建画布进入独立编辑器路由', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('create-new').click();
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('#canvas_minipaint')).toBeVisible();
});

test('本地上传图片会交接到编辑器', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('#canvas_minipaint')).toBeVisible();
});

test('导出 PNG 使用当前项目名并触发本地下载', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'summer-photo.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.FileSave))).toBe(true);
  await openSaveMenu(page);
  await expect(page.getByTestId('export-format')).toHaveValue('png');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-image').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('summer-photo.png');
});

test('Crop 自定义面板不渲染原生属性盒', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();
  await expect(page.getByTestId('crop-apply')).toBeVisible();
  await expect(page.locator('#action_attributes')).toBeHidden();
});

test('Cutout 自定义面板不渲染空的原生属性盒', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-cutout').click();
  await expect(page.getByTestId('cutout-apply-selection')).toBeVisible();
  await expect(page.locator('#action_attributes')).toBeHidden();
});

test('关闭 Cutout 面板会丢弃未应用的抠图会话状态', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-cutout').click();
  await expect(page.getByTestId('cutout-apply-selection')).toBeVisible();
  const historyBefore = await page.evaluate(() => window.State.action_history.length);

  await page.getByTestId('cutout-remove-selection').click();
  await page.getByTestId('cutout-invert').click();
  await page.getByTestId('cutout-hint-removed').click();
  await expect(page.getByTestId('cutout-remove-selection')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cutout-invert')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cutout-hint-removed')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-editor-panel-close]').click();
  await expect(page.getByTestId('editor-tool-panel')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBefore);

  await page.getByTestId('tool-cutout').click();
  await expect(page.getByTestId('cutout-keep-selection')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cutout-invert')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('cutout-hint-removed')).toHaveAttribute('aria-pressed', 'false');
});

test('导出格式选择器提供 JPEG、WebP 与原生项目入口', async ({ page }) => {
  await page.goto('/editor/');
  await openSaveMenu(page);
  await expect(page.getByTestId('export-format')).toBeVisible();
  await expect(page.getByTestId('export-format').locator('option')).toHaveText(['PNG', 'JPEG', 'WebP']);
  await expect(page.getByTestId('export-project')).toBeVisible();
});

test('状态栏以单一保存入口收束本地保存与导出操作', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByTestId('save-menu-toggle')).toBeVisible();
  await expect(page.getByTestId('save-menu')).toBeHidden();
  await expect(page.getByTestId('export-format')).toBeHidden();

  await page.getByTestId('save-menu-toggle').click();
  await expect(page.getByTestId('save-menu')).toBeVisible();
  await expect(page.getByTestId('save-local-project')).toBeVisible();
  await expect(page.getByTestId('export-format').locator('option')).toHaveText(['PNG', 'JPEG', 'WebP']);
  await expect(page.getByTestId('export-image')).toBeVisible();
  await expect(page.getByTestId('export-project')).toBeVisible();
});

test('导出原生项目会下载包含 info、layers 与 data 的 JSON', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'project-source.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.FileSave))).toBe(true);
  await openSaveMenu(page);
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
  await openSaveMenu(page);
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

test('手动 Cutout 首屏以四个有名称的图标工具格呈现', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'cutout-tool-icons.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-cutout').click();

  for (const [testId, label] of [
    ['cutout-tool-shape', '形状选区'],
    ['cutout-mode-magic', '魔术选区'],
    ['cutout-mode-erase', '画笔抠图'],
    ['cutout-mode-lasso', '自由套索'],
  ]) {
    const control = page.getByTestId(testId);
    await expect(control).toHaveAttribute('aria-label', label);
    await expect(control).toHaveAttribute('title', label);
    await expect(control.locator('img')).toHaveCount(1);
    await expect(control.locator('img')).toHaveAttribute('alt', '');
    await expect(control.locator('.sr_only')).toHaveText(label);
    await expect(control).toHaveCSS('min-height', '40px');
  }
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
  await expect.poll(() => page.evaluate(() => {
    const rail = document.querySelector('[data-testid="editor-tool-rail"]');
    const workspace = document.querySelector('[data-testid="editor-workspace"]');
    return [Math.round(rail.getBoundingClientRect().width), Math.round(workspace.getBoundingClientRect().left)];
  })).toEqual([56, 56]);
  for (const [testId, icon] of [
    ['editor-home', 'home.svg'],
    ['tool-cutout', 'scissors.svg'],
    ['tool-adjust', 'sliders.svg'],
    ['tool-effect', 'desaturate.svg'],
    ['tool-filter', 'braille.svg'],
    ['tool-liquify', 'yin-yang.svg'],
    ['tool-retouch', 'bandage.svg'],
  ]) {
    await expect(page.getByTestId(testId).locator('img')).toHaveAttribute('src', new RegExp(`\\.\\./images/icons/${icon.replace('.', '\\.')}$`));
  }
});

test('工作台工具轨在悬停时显示 Pixlr 风格的工具标签', async ({ page }) => {
  await page.goto('/editor/');
  const expectedLabels = [
    ['tool-arrange', 'ARRANGE'],
    ['tool-crop', 'CROP'],
    ['tool-cutout', 'CUTOUT'],
    ['tool-adjust', 'ADJUST'],
    ['tool-effect', 'EFFECT'],
    ['tool-filter', 'FILTER'],
    ['tool-liquify', 'LIQUIFY'],
    ['tool-retouch', 'RETOUCH'],
    ['tool-drawing', 'DRAW'],
    ['tool-text', 'TEXT'],
  ];

  for (const [testId, label] of expectedLabels) {
    const tool = page.getByTestId(testId);
    await expect(tool).toHaveAttribute('data-tooltip', label);
  }

  const arrange = page.getByTestId('tool-arrange');
  await arrange.hover();
  await expect.poll(() => arrange.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return { content: style.content, display: style.display, background: style.backgroundColor };
  })).toEqual({ content: '"ARRANGE"', display: 'flex', background: 'rgb(0, 169, 223)' });
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

test('手动 Cutout 以 Shape、Magic、Draw、Lasso 四个一级工具分组，画笔设置会写入本地橡皮状态', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('tool-cutout').click();
  await expect(page.getByTestId('cutout-tool-shape')).toBeVisible();
  await expect(page.getByTestId('cutout-mode-magic')).toBeVisible();
  await expect(page.getByTestId('cutout-mode-erase')).toBeVisible();
  await expect(page.getByTestId('cutout-mode-lasso')).toBeVisible();

  await page.getByTestId('cutout-mode-erase').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.canvasToolMode)).toBe('erase');
  await expect(page.getByTestId('cutout-erase-size')).toBeVisible();
  await page.getByTestId('cutout-erase-size').fill('72');
  await page.getByTestId('cutout-erase-circle').uncheck();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'erase').attributes)).toMatchObject({ size: 72, circle: false });
});

test('手动 Cutout 提供 None、Light、Medium 柔化、全局取样与选区移除操作', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-cutout').click();
  await expect(page.getByTestId('editor-tool-panel')).toBeVisible();
  await page.getByTestId('cutout-mode-magic').click();
  await page.getByTestId('cutout-tool-shape').click();
  await page.getByTestId('cutout-softness-none').click();
  await page.getByTestId('cutout-mode-magic').click();
  await page.getByTestId('cutout-global-sample').check();
  await page.getByTestId('cutout-tool-shape').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'magic_erase').attributes)).toMatchObject({ anti_aliasing: false, contiguous: true });
  await expect.poll(() => page.evaluate(() => window.PhotoStudio.getCutoutSelection().softness)).toBe('none');
  await page.getByTestId('cutout-softness-light').click();
  await expect(page.getByTestId('cutout-softness-light')).toHaveClass(/is-selected/);
  await expect.poll(() => page.evaluate(() => window.PhotoStudio.getCutoutSelection().softness)).toBe('light');
  await page.getByTestId('cutout-softness-medium').click();
  await expect(page.getByTestId('cutout-softness-medium')).toHaveClass(/is-selected/);
  await expect.poll(() => page.evaluate(() => window.PhotoStudio.getCutoutSelection().softness)).toBe('medium');
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'magic_erase').attributes.anti_aliasing)).toBe(true);
  await page.evaluate(() => {
    window.app.GUI.GUI_tools.tools_modules.selection.object.selection = { x: 0, y: 0, width: 1, height: 1 };
  });
  const historyBefore = await page.evaluate(() => window.State.action_history.length);
  await page.getByTestId('cutout-remove-selection').click();
  await page.getByTestId('cutout-apply-selection').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(historyBefore);
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.selection.object.selection.width)).toBeNull();
});

test('手动 Cutout 的 Light 和 Medium 会在本地遮罩边缘产生可验证的 alpha 羽化', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-cutout').click();
  const setRectangle = () => page.evaluate(() => {
    window.app.GUI.GUI_tools.tools_modules.selection.object.selection = { x: 1200, y: 900, width: 1000, height: 800 };
    window.AppConfig.need_render = true;
  });
  const alphaAt = (x, y) => page.evaluate(({ x, y }) => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return context.getImageData(x, y, 1, 1).data[3];
  }, { x, y });

  await setRectangle();
  await page.getByTestId('cutout-softness-none').click();
  await page.getByTestId('cutout-keep-selection').click();
  await page.getByTestId('cutout-apply-selection').click();
  await expect.poll(() => alphaAt(1196, 1300)).toBe(0);
  await expect.poll(() => alphaAt(1200, 1300)).toBe(255);
  await page.locator('[data-editor-history="undo"]').click();

  await setRectangle();
  await page.getByTestId('cutout-softness-light').click();
  await page.getByTestId('cutout-keep-selection').click();
  await page.getByTestId('cutout-apply-selection').click();
  await expect.poll(() => alphaAt(1199, 1300)).toBeGreaterThan(0);
  await expect.poll(() => alphaAt(1199, 1300)).toBeLessThan(255);
  await page.locator('[data-editor-history="undo"]').click();

  await setRectangle();
  await page.getByTestId('cutout-softness-medium').click();
  await page.getByTestId('cutout-keep-selection').click();
  await page.getByTestId('cutout-apply-selection').click();
  await expect.poll(() => alphaAt(1196, 1300)).toBeGreaterThan(0);
  await expect.poll(() => alphaAt(1196, 1300)).toBeLessThan(255);
});

test('手动 Cutout 的套索、椭圆、加减选、反选与 Keep/Remove 均本地可撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-cutout').click();

  await expect(page.getByTestId('cutout-mode-lasso')).toBeVisible();
  await expect(page.getByTestId('cutout-mode-ellipse')).toBeVisible();
  await expect(page.getByTestId('cutout-invert')).toBeVisible();
  await expect(page.getByTestId('cutout-keep-selection')).toBeVisible();
  await expect(page.getByTestId('cutout-selection-advanced')).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('cutout-operation-add')).not.toBeVisible();
  await page.getByTestId('cutout-selection-advanced').click();
  await expect(page.getByTestId('cutout-selection-advanced')).toHaveAttribute('open', '');
  await expect(page.getByTestId('cutout-operation-add')).toBeVisible();
  await expect(page.getByTestId('cutout-operation-subtract')).toBeVisible();

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
  await page.getByTestId('cutout-tool-shape').click();
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
  await page.getByTestId('cutout-apply-selection').click();
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
  await page.getByTestId('cutout-apply-selection').click();
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
  await page.getByTestId('cutout-apply-selection').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBeGreaterThan(inverseHistory);
  expect(await readAlphaAt(maskPoints)).toEqual({ lasso: 0, subtract: 255, add: 0, outside: 255 });
  await page.locator('[data-editor-history="undo"]').click();
  await page.getByTestId('layer-lock').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  await page.waitForTimeout(150);
  const lockedHistory = await page.evaluate(() => window.State.action_history.length);
  await page.getByTestId('cutout-keep-selection').click();
  await page.getByTestId('cutout-apply-selection').click();
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(lockedHistory);
});

test('手动 Cutout 会先选择 Keep/Remove 模式，再由 Apply cutout 单次提交', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-cutout').click();
  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds.x + bounds.width * 0.28, bounds.y + bounds.height * 0.28);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.58, bounds.y + bounds.height * 0.58);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const selection = window.app.GUI.GUI_tools.tools_modules.selection.object.selection;
    return Boolean(selection?.width && selection?.height);
  })).toBe(true);

  const history = await page.evaluate(() => window.State.action_history.length);
  await page.getByTestId('cutout-remove-selection').click();
  await expect(page.getByTestId('cutout-remove-selection')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cutout-keep-selection')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history);
  await page.getByTestId('cutout-apply-selection').click();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history + 1);
});

test('手动 Cutout 的 Hint removed 只在本地预览即将移除区域，不写入历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-cutout').click();
  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds.x + bounds.width * 0.28, bounds.y + bounds.height * 0.28);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.58, bounds.y + bounds.height * 0.58);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const selection = window.app.GUI.GUI_tools.tools_modules.selection.object.selection;
    return Boolean(selection?.width && selection?.height);
  })).toBe(true);

  const history = await page.evaluate(() => window.State.action_history.length);
  await expect(page.getByTestId('cutout-hint-removed')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('cutout-hint-removed').click();
  await expect(page.getByTestId('cutout-hint-removed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cutout-hint-overlay')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="cutout-hint-overlay"]');
    if (!(overlay instanceof HTMLCanvasElement)) return 0;
    return overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data
      .filter((_, index) => index % 4 === 3)
      .reduce((sum, alpha) => sum + alpha, 0);
  })).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history);
  await page.getByTestId('cutout-hint-removed').click();
  await expect(page.getByTestId('cutout-hint-removed')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('cutout-hint-overlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history);
});

test('手动 Cutout 的三角、星形、心形与直线选区会生成对应本地遮罩，且 Keep 可撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorToolMode))).toBe(true);
  await page.getByTestId('tool-cutout').click();

  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const drawShape = async (name) => {
    await page.getByTestId(`cutout-mode-${name}`).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.canvasToolMode)).toBe(`cutout-${name}`);
    await page.mouse.move(bounds.x + bounds.width * 0.28, bounds.y + bounds.height * 0.24);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.58, bounds.y + bounds.height * 0.64);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.PhotoStudio.getCutoutSelection().regions[0]?.shape)).toBe(name);
  };
  const alphaSum = () => page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    const context = c.getContext('2d'); context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, c.width, c.height).data
      .filter((_, index) => index % 4 === 3)
      .reduce((sum, value) => sum + value, 0);
  });
  const keepAndUndo = async (beforeAlpha) => {
    const historyBefore = await page.evaluate(() => window.State.action_history.length);
    await page.getByTestId('cutout-keep-selection').click();
    await page.getByTestId('cutout-apply-selection').click();
    await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(historyBefore);
    expect(await alphaSum()).toBeLessThan(beforeAlpha);
    await page.locator('[data-editor-history="undo"]').click();
    await expect.poll(alphaSum).toBe(beforeAlpha);
  };

  await expect(page.getByTestId('cutout-mode-triangle')).toBeVisible();
  await expect(page.getByTestId('cutout-mode-star')).toBeVisible();
  await expect(page.getByTestId('cutout-mode-heart')).toBeVisible();
  await expect(page.getByTestId('cutout-mode-line')).toBeVisible();

  await drawShape('triangle');
  const alphaBefore = await alphaSum();
  await keepAndUndo(alphaBefore);

  await page.getByTestId('cutout-reset-selection').click();
  await drawShape('star');
  await keepAndUndo(alphaBefore);
  await page.getByTestId('cutout-reset-selection').click();
  await drawShape('heart');
  await keepAndUndo(alphaBefore);
  await page.getByTestId('cutout-reset-selection').click();
  await drawShape('line');
  await keepAndUndo(alphaBefore);
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
  await page.getByTestId('cutout-apply-selection').click();
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
  await page.getByTestId('cutout-apply-selection').click();
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.State.action_history.length)).toBe(historyBefore);

  await page.getByTestId('tool-cutout').click();
  await expect(page.getByTestId('cutout-rotation-warning')).toBeVisible();
  await expect(page.getByTestId('cutout-mode-lasso')).toBeDisabled();
  await expect(page.getByTestId('cutout-tool-shape')).toBeDisabled();
  await expect(page.getByTestId('cutout-keep-selection')).toBeDisabled();
  await expect(page.getByTestId('cutout-remove-selection')).toBeDisabled();
  await expect(page.getByTestId('cutout-apply-selection')).toBeDisabled();
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

test('Adjust 首屏以三个有名称的图标快捷调整呈现 Auto、B&W、Pop', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'adjust-icon-grid.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-adjust').click();

  for (const [testId, label] of [
    ['adjust-auto', 'Auto'],
    ['adjust-bw', 'B&W'],
    ['adjust-pop', 'Pop'],
  ]) {
    const shortcut = page.getByTestId(testId);
    await expect(shortcut).toHaveAttribute('aria-label', label);
    await expect(shortcut).toHaveAttribute('title', label);
    await expect(shortcut.locator('img')).toHaveCount(1);
    await expect(shortcut.locator('img')).toHaveAttribute('alt', '');
    await expect(shortcut.locator('.studio-adjust-shortcut-label')).toHaveText(label);
    await expect(shortcut).toHaveCSS('min-height', '76px');
  }
});

test('Adjust 首屏从快捷调整开始，不以说明文字挤占参考的顶部操作区', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'adjust-top-level.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-adjust').click();
  await expect(page.getByTestId('adjust-auto')).toBeVisible();

  const topLevel = await page.locator('[data-editor-tool-controls]').evaluate((root) => ({
    firstClass: root.firstElementChild?.className ?? '',
    hasHint: Boolean(root.querySelector('.studio-control-hint')),
  }));
  expect(topLevel).toEqual({ firstClass: expect.stringContaining('studio-adjust-presets'), hasHint: false });
});

test('Adjust 的 Color 与 Light 分组以有名称的图标操作呈现', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'adjust-section-icons.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-adjust').click();

  for (const [testId, label, icon] of [
    ['adjust-color', '高级色彩', 'adjust-pop.svg'],
    ['adjust-light', '高级光线', 'adjust-bw.svg'],
  ]) {
    const control = page.getByTestId(testId);
    await expect(control).toHaveAttribute('aria-label', label);
    await expect(control).toHaveAttribute('title', label);
    await expect(control.locator('img')).toHaveAttribute('src', new RegExp(`/images/icons/${icon}$`));
    await expect(control.locator('img')).toHaveAttribute('alt', '');
    await expect(control.locator('.sr_only')).toHaveText(label);
    await expect(control).toHaveCSS('min-height', '28px');
  }
});

test('Adjust 面板提供 Color、Light 的对应滑杆，并将面板值带入本地预览和重置', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-adjust').click();

  for (const testId of [
    'adjust-vibrance', 'adjust-saturation', 'adjust-temperature', 'adjust-tint', 'adjust-hue',
    'adjust-brightness', 'adjust-exposure', 'adjust-contrast',
  ]) {
    await expect(page.getByTestId(testId)).toBeVisible();
  }
  await page.getByTestId('adjust-vibrance').fill('20');
  await page.getByTestId('adjust-saturation').fill('24');
  await page.getByTestId('adjust-temperature').fill('30');
  await page.getByTestId('adjust-tint').fill('-10');
  await page.getByTestId('adjust-hue').fill('15');
  await page.getByTestId('adjust-brightness').fill('8');
  await page.getByTestId('adjust-exposure').fill('12');
  await page.getByTestId('adjust-contrast').fill('18');
  await page.getByTestId('adjust-apply').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#pop_data_param_v')).toHaveValue('20');
  await expect(dialog.locator('#pop_data_param_s')).toHaveValue('24');
  await expect(dialog.locator('#pop_data_param_red')).toHaveValue('20');
  await expect(dialog.locator('#pop_data_param_green')).toHaveValue('10');
  await expect(dialog.locator('#pop_data_param_blue')).toHaveValue('-40');
  await expect(dialog.locator('#pop_data_param_b')).toHaveValue('8');
  await expect(dialog.locator('#pop_data_param_l')).toHaveValue('12');
  await expect(dialog.locator('#pop_data_param_c')).toHaveValue('18');
  await dialog.locator('[data-id="popup_cancel"]').click();
  await page.getByTestId('adjust-cancel').click();
  await expect(page.getByTestId('editor-tool-panel')).toBeHidden();
  await page.getByTestId('tool-adjust').click();
  await expect(page.getByTestId('adjust-vibrance')).toHaveValue('0');
  await expect(page.getByTestId('adjust-contrast')).toHaveValue('0');
});

test('Adjust 固定操作区取消会关闭面板并丢弃未应用的滑杆值', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-adjust').click();

  const historyBefore = await page.evaluate(() => window.State.action_history.length);
  await expect(page.getByTestId('adjust-brightness')).toBeVisible();
  await page.getByTestId('adjust-brightness').fill('28');
  await expect(page.getByTestId('adjust-panel-footer')).toBeVisible();
  const footer = await page.getByTestId('adjust-panel-footer').boundingBox();
  const viewport = page.viewportSize();
  expect(footer).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.round(footer.y + footer.height)).toBe(viewport.height - 56);
  await page.getByTestId('adjust-cancel').click();
  await expect(page.getByTestId('editor-tool-panel')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBefore);

  await page.getByTestId('tool-adjust').click();
  await expect(page.getByTestId('adjust-brightness')).toHaveValue('0');
  await page.getByTestId('adjust-apply').click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('Adjust 补齐 Light、Details、Scene 的 13 条本地滑杆，并能预览应用后撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-adjust').click();

  const advancedValues = {
    black: '-20', white: '18', highlights: '-15', shadows: '24',
    sharpen: '22', clarity: '18', smooth: '14', blur: '10', grain: '16',
    vignette: '20', glamour: '12', bloom: '16', dehaze: '18',
  };
  for (const [key, value] of Object.entries(advancedValues)) {
    const slider = page.getByTestId(`adjust-${key}`);
    await expect(slider).toBeVisible();
    await slider.fill(value);
  }

  const before = {
    historyIndex: await page.evaluate(() => window.app.State.action_history_index),
    pixels: await page.evaluate(readActiveLayerPixelHash),
  };
  await page.getByTestId('adjust-apply').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('#pop_data_param_black')).toHaveValue('-20');
  await expect(dialog.locator('#pop_data_param_white')).toHaveValue('18');
  await expect(dialog.locator('#pop_data_param_shadows')).toHaveValue('24');
  await expect(dialog.locator('#pop_data_param_grain')).toHaveValue('16');
  await expect(dialog.locator('#pop_data_param_dehaze')).toHaveValue('18');
  await dialog.locator('[data-id="popup_ok"]').click();
  await expect.poll(() => page.evaluate(() => window.app.State.action_history_index)).toBe(before.historyIndex + 1);
  await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).not.toBe(before.pixels);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(readActiveLayerPixelHash)).toBe(before.pixels);
});

test('Adjust 的 Vibrance 独立于 Saturation 写入本地像素并可撤销', async ({ page }) => {
  await openHome(page);
  const mutedFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(156, 132, 120)';
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = 'rgb(240, 28, 18)';
    context.fillRect(1, 0, 1, 1);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'vibrance.png',
    mimeType: 'image/png',
    buffer: Buffer.from(mutedFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig?.layer?.link))).toBe(true);
  await page.getByTestId('tool-adjust').click();
  const before = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const image = window.AppConfig.layer.link;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  await page.getByTestId('adjust-vibrance').fill('100');
  await page.getByTestId('adjust-apply').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('#pop_data_param_v')).toHaveValue('100');
  await expect(dialog.locator('#pop_data_param_s')).toHaveValue('0');
  await dialog.locator('[data-id="popup_ok"]').click();
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const image = window.AppConfig.layer.link;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    return pixel[0] - pixel[1];
  })).toBeGreaterThan(before[0] - before[1]);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const image = window.AppConfig.layer.link;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  })).toEqual(before);
});

test('Adjust 预览对话框提供真实 Compare 和 Reset，不在确认前写入历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-adjust').click();
  const beforeHistory = await page.evaluate(() => window.State.action_history.length);
  await page.getByTestId('adjust-color').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('popup-compare')).toBeVisible();
  await expect(dialog.getByTestId('popup-reset')).toBeVisible();

  const red = dialog.locator('#pop_data_param_red');
  await red.fill('55');
  await expect(red).toHaveValue('55');
  const compare = dialog.getByTestId('popup-compare');
  const compareBox = await compare.boundingBox();
  expect(compareBox).not.toBeNull();
  await page.mouse.move(compareBox.x + compareBox.width / 2, compareBox.y + compareBox.height / 2);
  await page.mouse.down();
  await expect(dialog).toHaveAttribute('data-preview-mode', 'original');
  await page.mouse.up();
  await expect(dialog).toHaveAttribute('data-preview-mode', 'adjusted');

  await dialog.getByTestId('popup-reset').click();
  await expect(red).toHaveValue('12');
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(beforeHistory);
  await dialog.locator('[data-id="popup_cancel"]').click();
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
  await expect(lock).toHaveAttribute('aria-label', '锁定图层');
  await expect(lock.locator('img')).toHaveAttribute('src', /\/images\/icons\/unlock\.svg$/);
  await lock.click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(true);
  await expect(lock).toHaveAttribute('aria-label', '解锁图层');
  await expect(lock.locator('img')).toHaveAttribute('src', /\/images\/icons\/lock\.svg$/);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.locked))).toBe(false);
  await page.getByTestId('layers-rail-close').click();
  await expect(page.locator('body')).toHaveClass(/layers-collapsed/);
});

test('Effect 提供分类卡、真实本地预设，并保留全部效果浏览器', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-effect').click();
  const categories = page.locator('.studio-effect-category');
  await expect(categories).toHaveCount(11);
  await expect.poll(() => categories.first().evaluate((card) => {
    const grid = card.parentElement;
    const media = card.querySelector('.studio-effect-category-media');
    const copy = card.querySelector('.studio-effect-category-copy');
    const gridColumns = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
    const mediaBox = media.getBoundingClientRect();
    const copyBox = copy.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    return {
      gridColumns,
      mediaStartsAfterCopy: mediaBox.left > copyBox.left,
      sameRow: Math.abs(mediaBox.top - copyBox.top) < 1,
      cardHeight: Math.round(cardBox.height),
    };
  })).toEqual({
    gridColumns: 1,
    mediaStartsAfterCopy: true,
    sameRow: true,
    cardHeight: 150,
  });
  await expect(page.getByTestId('effect-category-retro').locator('img')).toHaveAttribute('src', /^data:image\//);
  await page.getByTestId('effect-category-mono').click();
  await expect(page.getByTestId('effect-category-back')).toBeVisible();
  await expect(page.locator('.studio-effect-preset')).toHaveCount(11);
  const before = await page.evaluate(() => ({
    historyIndex: window.app.State.action_history_index,
    pixelHash: (() => {
      const image = window.AppConfig.layer.link;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data).join(',');
    })(),
  }));
  await page.getByTestId('effect-preset-mono-black_and_white').click();
  await page.getByTestId('effect-apply').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('[data-id="popup_ok"]').click();
  await expect.poll(() => page.evaluate(() => window.app.State.action_history_index)).toBe(before.historyIndex + 1);
  await expect.poll(() => page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data).join(',');
  })).not.toBe(before.pixelHash);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data).join(',');
  })).toBe(before.pixelHash);
  await page.getByTestId('effect-browser').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: '特效浏览器' })).toBeVisible();
});

test('Effect 在固定底部操作区暂存预设，取消不写入历史', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-effect').click();
  if (await page.getByTestId('effect-category-back').isVisible()) {
    await page.getByTestId('effect-category-back').click();
  }
  await expect(page.getByTestId('effect-apply')).toBeVisible();
  await expect(page.getByTestId('effect-apply')).toBeDisabled();
  await page.getByTestId('effect-category-mono').click();

  const historyIndex = await page.evaluate(() => window.app.State.action_history_index);
  const preset = page.getByTestId('effect-preset-mono-black_and_white');
  await preset.click();
  await expect(preset).toHaveClass(/is-selected/);
  await expect(page.getByRole('dialog')).toBeHidden();

  const footer = page.getByTestId('effect-panel-footer');
  await expect(footer).toBeVisible();
  await expect(footer.locator('[data-testid="effect-apply"]')).toBeEnabled();
  await expect.poll(() => footer.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return Math.round(box.bottom);
  })).toBe(await page.evaluate(() => window.innerHeight - 56));

  await page.getByTestId('effect-cancel').click();
  await expect(page.locator('.studio-effect-category')).toHaveCount(11);
  await expect.poll(() => page.evaluate(() => window.app.State.action_history_index)).toBe(historyIndex);
});

test('Effect 提供 11 组共 108 个原创本地预设，并保留每组可检验的配方入口', async ({ page }) => {
  const expectedPresetCounts = {
    mono: 11,
    friends: 20,
    instage: 12,
    retro: 10,
    tuning: 5,
    portrait: 5,
    food: 5,
    urban: 6,
    nature: 3,
    colors: 21,
    artzy: 10,
  };
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-effect').click();
  if (await page.getByTestId('effect-category-back').isVisible()) {
    await page.getByTestId('effect-category-back').click();
  }
  await expect(page.locator('.studio-effect-category')).toHaveCount(Object.keys(expectedPresetCounts).length);
  for (const [category, count] of Object.entries(expectedPresetCounts)) {
    await page.getByTestId(`effect-category-${category}`).click();
    const presets = page.locator(`[data-effect-category="${category}"]`);
    await expect(presets).toHaveCount(count);
    expect(await presets.evaluateAll((buttons) => buttons.every((button) => Boolean(button.dataset.effectRecipe)))).toBe(true);
    await presets.first().click();
    await page.getByTestId('effect-apply').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('[data-id="popup_cancel"]').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByTestId('effect-category-back').click();
  }
});

test('不同本地 Effect 配方会产生不同像素结果，且都能撤销', async ({ page }) => {
  const pixelHash = () => page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data).join(',');
  });
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-effect').click();
  const baseline = await pixelHash();
  await page.getByTestId('effect-category-mono').click();
  await page.getByTestId('effect-preset-mono-black_and_white').click();
  await page.getByTestId('effect-apply').click();
  await page.locator('[data-id="popup_ok"]').click();
  await expect.poll(pixelHash).not.toBe(baseline);
  const mono = await pixelHash();
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(pixelHash).toBe(baseline);
  await page.getByTestId('effect-category-back').click();
  await page.getByTestId('effect-category-friends').click();
  await page.getByTestId('effect-preset-friends-friends-01').click();
  await page.getByTestId('effect-apply').click();
  await page.locator('[data-id="popup_ok"]').click();
  await expect.poll(pixelHash).not.toBe(baseline);
  const portrait = await pixelHash();
  expect(portrait).not.toBe(mono);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(pixelHash).toBe(baseline);
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

test('Filter 以当前本地图片生成可点击的卡片预览，而非静态素材占位', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-filter').click();
  const cards = page.locator('.studio-filter-card');
  await expect(cards).toHaveCount(6);
  const hdr = page.getByTestId('filter-hdr');
  await expect(hdr).toHaveClass(/studio-filter-card/);
  await expect(hdr.locator('.studio-filter-card-media img')).toHaveAttribute('src', /^data:image\//);
});

test('Filter 首屏从第一张滤镜卡开始，不以说明文字挤占参考顶部空间', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-filter').click();
  await expect(page.getByTestId('filter-hdr')).toBeVisible();

  const topLevel = await page.locator('[data-editor-tool-controls]').evaluate((root) => ({
    firstClass: root.firstElementChild?.className ?? '',
    hasHint: Boolean(root.querySelector('.studio-control-hint')),
  }));
  expect(topLevel).toEqual({ firstClass: 'studio-filter-card-list', hasHint: false });
});

test('Filter 六张本地图像卡都有对应的分类图标与可见标题', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(filterPixelFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio))).toBe(true);
  await page.getByTestId('tool-filter').click();

  for (const [testId, label] of [
    ['filter-hdr', 'HDR'],
    ['filter-focus-bokeh', 'Focus / Bokeh'],
    ['filter-reflect', 'Reflect'],
    ['filter-dispersion', 'Dispersion'],
    ['filter-glitch', 'Glitch'],
    ['filter-colorize', 'Colorize'],
  ]) {
    const card = page.getByTestId(testId);
    await expect(card.locator('.studio-filter-card-icon img')).toHaveCount(1);
    await expect(card.locator('.studio-filter-card-icon img')).toHaveAttribute('alt', '');
    await expect(card.locator('.studio-filter-card-copy strong')).toHaveText(label);
  }
});

test('工具面板标题栏使用参考中的居中标题与固定高度', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-filter').click();
  await expect(page.getByTestId('filter-hdr')).toBeVisible();
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="editor-tool-panel"]');
    const heading = panel?.querySelector('.studio-tool-panel-heading');
    const title = panel?.querySelector('[data-editor-tool-title]');
    const close = panel?.querySelector('[data-editor-panel-close]');
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, height: value.height, center: value.left + value.width / 2 };
    };
    return { panel: rect(panel), heading: rect(heading), title: rect(title), close: rect(close) };
  });

  expect(geometry.heading.top).toBe(geometry.panel.top);
  expect(geometry.heading.height).toBe(56);
  expect(Math.abs(geometry.title.center - geometry.panel.center)).toBeLessThanOrEqual(2);
  expect(geometry.close.right).toBeLessThanOrEqual(geometry.panel.right - 10);
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

test('Crop 固定操作区将取消和应用固定在编辑器状态栏上方', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'crop-footer.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorTool))).toBe(true);
  await page.getByTestId('tool-crop').click();

  const controlOrder = await page.locator('[data-editor-tool-controls]').evaluate((root) => [
    'crop-output-width',
    'crop-straighten',
    'crop-aspect-enabled',
    'crop-rotate-left',
    'crop-image-size',
    'crop-panel-footer',
  ].map((testId) => {
    const element = root.querySelector(`[data-testid="${testId}"]`);
    return [...root.querySelectorAll('[data-testid]')].indexOf(element);
  }));
  expect(controlOrder).toEqual([...controlOrder].sort((left, right) => left - right));

  const footer = page.getByTestId('crop-panel-footer');
  await expect(footer).toBeVisible();
  await expect(footer.locator('button')).toHaveCount(2);
  const bounds = await footer.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.round(bounds.y + bounds.height)).toBe(viewport.height - 56);
  await footer.getByTestId('crop-cancel').click();
  await expect(page.getByTestId('editor-tool-panel')).toBeHidden();
});

test('Crop 首屏将尺寸、旋转和调整尺寸保持为参考对应的纵向分组', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'crop-panel-groups.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();
  await expect(page.getByTestId('crop-apply')).toBeVisible();

  const controls = page.locator('[data-editor-tool-controls]');
  await expect(controls.locator('.studio-crop-dimensions')).toHaveCount(1);
  await expect(controls.locator('.studio-crop-dimensions .studio-control-number')).toHaveCount(2);
  await expect(controls.locator('.studio-crop-operation-section')).toHaveCount(2);
  await expect(controls.locator('.studio-crop-operation-section').nth(0).locator('strong')).toHaveText('旋转与翻转');
  await expect(controls.locator('.studio-crop-operation-section').nth(1).locator('strong')).toHaveText('调整尺寸');
  await expect(controls.locator('.studio-crop-resize-actions button')).toHaveCount(2);

  const order = await controls.evaluate((root) => [
    root.querySelector('.studio-crop-dimensions'),
    root.querySelector('.studio-crop-operation-section'),
    root.querySelector('.studio-crop-resize-actions'),
  ].map((element) => [...root.children].findIndex((child) => child === element || child.contains(element))));
  expect(order).toEqual([...order].sort((left, right) => left - right));
});

test('Crop 的旋转与翻转首屏使用四个有名称的图标工具格', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'crop-transform-icons.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();

  for (const [testId, label] of [
    ['crop-rotate-left', '向左旋转 90°'],
    ['crop-rotate-right', '向右旋转 90°'],
    ['crop-flip-horizontal', '水平翻转'],
    ['crop-flip-vertical', '垂直翻转'],
  ]) {
    const control = page.getByTestId(testId);
    await expect(control).toHaveAttribute('aria-label', label);
    await expect(control).toHaveAttribute('title', label);
    await expect(control.locator('img')).toHaveCount(1);
    await expect(control.locator('img')).toHaveAttribute('alt', '');
    await expect(control.locator('.sr_only')).toHaveText(label);
    await expect(control).toHaveCSS('min-height', '40px');
  }
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

  await openSaveMenu(page);
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
    await openSaveMenu(page);
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
  await page.getByTestId('crop-aspect-enabled').check();
  await page.getByTestId('crop-aspect-ratio').selectOption('1:1');
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({ x: 480, y: 0, width: 2880, height: 2880 });
  await page.getByTestId('crop-aspect-ratio').selectOption('16:9');
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({ x: 0, y: 360, width: 3840, height: 2160 });
});

test('Crop 开启比例锁定后，输入宽或高都会保持已选比例', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();

  await page.getByTestId('crop-aspect-enabled').check();
  await page.getByTestId('crop-aspect-ratio').selectOption('4:3');
  await expect(page.getByTestId('crop-output-width')).toHaveValue('3840');
  await expect(page.getByTestId('crop-output-height')).toHaveValue('2880');

  await page.getByTestId('crop-output-width').fill('2400');
  await expect(page.getByTestId('crop-output-height')).toHaveValue('1800');
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({
    x: 720, y: 540, width: 2400, height: 1800,
  });

  await page.getByTestId('crop-output-height').fill('1200');
  await expect(page.getByTestId('crop-output-width')).toHaveValue('1600');
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({
    x: 1120, y: 840, width: 1600, height: 1200,
  });
});

test('Crop 比例菜单提供竖版比例与本地输出尺寸预设', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();
  await page.getByTestId('crop-aspect-enabled').check();

  await page.getByTestId('crop-aspect-ratio').selectOption('9:16');
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({
    x: 1110, y: 0, width: 1620, height: 2880,
  });

  await page.getByTestId('crop-output-preset').selectOption('1920x1080');
  await expect(page.getByTestId('crop-output-width')).toHaveValue('1920');
  await expect(page.getByTestId('crop-output-height')).toHaveValue('1080');
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({
    x: 0, y: 360, width: 3840, height: 2160,
  });
});

test('Crop 比例菜单保留参考的 3:4 Profile 和完整社交输出尺寸', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-crop').click();
  await page.getByTestId('crop-aspect-enabled').check();

  await page.getByTestId('crop-aspect-ratio').selectOption('3:4');
  await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.crop.object.selection)).toEqual({
    x: 840, y: 0, width: 2160, height: 2880,
  });

  const preset = page.getByTestId('crop-output-preset');
  await expect(preset.locator('option')).toHaveCount(26);
  await preset.selectOption('851x315');
  await expect(page.getByTestId('crop-output-width')).toHaveValue('851');
  await expect(page.getByTestId('crop-output-height')).toHaveValue('315');
  await preset.selectOption('2560x1440');
  await expect(page.getByTestId('crop-output-width')).toHaveValue('2560');
  await expect(page.getByTestId('crop-output-height')).toHaveValue('1440');
  await preset.selectOption('2400x3300');
  await expect(page.getByTestId('crop-output-width')).toHaveValue('2400');
  await expect(page.getByTestId('crop-output-height')).toHaveValue('3300');
  await page.getByTestId('crop-apply').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([2400, 3300]);
});

test('Crop 输出尺寸预设作为单个撤销动作恢复原始画布', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.app?.GUI?.GUI_tools?.tools_modules?.crop))).toBe(true);
  await page.getByTestId('tool-crop').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOL.name)).toBe('crop');
  await page.getByTestId('crop-aspect-enabled').check();
  const before = await page.evaluate(() => ({
    width: window.AppConfig.WIDTH,
    height: window.AppConfig.HEIGHT,
    history: window.State.action_history.length,
  }));

  await page.getByTestId('crop-output-preset').selectOption('2400x3300');
  await page.getByTestId('crop-apply').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([2400, 3300]);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([before.width, before.height]);
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

test('Crop 提供本地 Image size 与 Canvas size 入口，并打开可提交的尺寸对话框', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorTool))).toBe(true);
  await page.getByTestId('tool-crop').click();
  await expect(page.getByTestId('crop-image-size')).toBeVisible();
  await expect(page.getByTestId('crop-canvas-size')).toBeVisible();

  await page.getByTestId('crop-image-size').click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /Resize|调整大小/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('crop-canvas-size').click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /Canvas Size|画布尺寸/i })).toBeVisible();
});

test('Crop Image size 与 Canvas size 会真实改变尺寸，并各自支持撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorTool))).toBe(true);
  await page.getByTestId('tool-crop').click();

  await page.getByTestId('crop-image-size').click();
  await page.locator('#pop_data_width').fill('1920');
  await page.locator('#pop_data_height').fill('1440');
  await page.getByRole('dialog').getByRole('button', { name: /确定|OK|Apply/i }).click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([1920, 1440]);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([3840, 2880]);

  await page.getByTestId('tool-crop').click();
  await page.getByTestId('crop-canvas-size').click();
  await page.locator('#pop_data_w').fill('4000');
  await page.locator('#pop_data_h').fill('3000');
  await page.getByRole('dialog').getByRole('button', { name: /确定|OK|Apply/i }).click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([4000, 3000]);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([3840, 2880]);
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
  // Undo restores Crop's interactive mask as well as the document. That mask
  // is intentionally painted over the working canvas, so suppress it only
  // for this raw-pixel read. Do not activate another core tool here: that
  // would create a new history entry and invalidate the subsequent Redo.
  await page.evaluate(() => {
    window.__cropToolForVisualCheck = window.AppConfig.TOOL;
    window.AppConfig.TOOL = window.AppConfig.TOOLS.find((tool) => tool.name === 'select');
    window.AppConfig.need_render = true;
  });
  await expect.poll(() => page.evaluate(() => {
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
  })).toEqual({ blue: beforeTextPixels.blue, green: beforeTextPixels.green });
  await page.evaluate(() => {
    window.AppConfig.TOOL = window.__cropToolForVisualCheck;
    delete window.__cropToolForVisualCheck;
    window.AppConfig.need_render = true;
  });
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

test('Arrange 可直接在画布上拖动活动图层，并作为单次变换撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-arrange').click();
  await expect(page.locator('#tools_container .select')).toHaveClass(/active/);
  const before = await page.evaluate(() => ({
    x: window.AppConfig.layer.x,
    y: window.AppConfig.layer.y,
    history: window.State.action_history.length,
    index: window.State.action_history_index,
  }));
  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.6, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => ({ x: window.AppConfig.layer.x, y: window.AppConfig.layer.y }))).not.toEqual({ x: before.x, y: before.y });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => ({ x: window.AppConfig.layer.x, y: window.AppConfig.layer.y }))).toEqual({ x: before.x, y: before.y });
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.index);
});

test('Arrange 可通过画布手柄缩放活动图片图层，并可撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-arrange').click();
  await page.getByTestId('arrange-x').fill('120');
  await page.getByTestId('arrange-y').fill('120');
  await page.getByTestId('arrange-width').fill('1600');
  await page.getByTestId('arrange-height').fill('1100');
  await page.getByTestId('arrange-apply-transform').click();
  await expect.poll(() => page.evaluate(() => ({
    x: window.AppConfig.layer.x,
    y: window.AppConfig.layer.y,
    width: window.AppConfig.layer.width,
    height: window.AppConfig.layer.height,
  }))).toEqual({ x: 120, y: 120, width: 1600, height: 1100 });

  const before = await page.evaluate(() => ({
    x: window.AppConfig.layer.x,
    y: window.AppConfig.layer.y,
    width: window.AppConfig.layer.width,
    height: window.AppConfig.layer.height,
    history: window.State.action_history.length,
    index: window.State.action_history_index,
  }));
  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const scale = bounds.width / 3840;
  const handle = {
    x: bounds.x + (before.x + before.width) * scale + 7,
    y: bounds.y + (before.y + before.height) * scale + 7,
  };
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 80, handle.y + 55, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => ({
    x: window.AppConfig.layer.x,
    y: window.AppConfig.layer.y,
    width: window.AppConfig.layer.width,
    height: window.AppConfig.layer.height,
  }))).toEqual(expect.objectContaining({ x: before.x, y: before.y, width: expect.any(Number), height: expect.any(Number) }));
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.width)).toBeGreaterThan(before.width);
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.height)).toBeGreaterThan(before.height);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => ({
    x: window.AppConfig.layer.x,
    y: window.AppConfig.layer.y,
    width: window.AppConfig.layer.width,
    height: window.AppConfig.layer.height,
  }))).toEqual({ x: before.x, y: before.y, width: before.width, height: before.height });
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.index);
});

test('Arrange 可通过画布旋转手柄旋转活动图层，并可撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-arrange').click();
  await page.getByTestId('arrange-x').fill('120');
  await page.getByTestId('arrange-y').fill('120');
  await page.getByTestId('arrange-width').fill('1600');
  await page.getByTestId('arrange-height').fill('1100');
  await page.getByTestId('arrange-rotation').fill('0');
  await page.getByTestId('arrange-apply-transform').click();
  const before = await page.evaluate(() => ({
    x: window.AppConfig.layer.x,
    y: window.AppConfig.layer.y,
    width: window.AppConfig.layer.width,
    height: window.AppConfig.layer.height,
    rotate: window.AppConfig.layer.rotate,
    zoom: window.AppConfig.ZOOM,
    history: window.State.action_history.length,
    index: window.State.action_history_index,
  }));
  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const scale = bounds.width / 3840;
  const block = 12 / before.zoom;
  const rotateDistance = Math.max(
    Math.min(before.width * 0.9, Math.abs(before.width - 2 * block)),
    before.width / 2 - block / 2,
  );
  const rotateHandle = {
    x: bounds.x + (before.x + rotateDistance + block / 2.4 + 2 / before.zoom) * scale,
    y: bounds.y + (before.y - block / 2.4 - 2 / before.zoom) * scale,
  };
  await page.mouse.move(rotateHandle.x, rotateHandle.y);
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + (before.x + before.width / 2 + 520) * scale,
    bounds.y + (before.y + before.height / 2 - 120) * scale,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.rotate)).not.toBe(before.rotate);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.rotate)).toBe(before.rotate);
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.index);
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

test('Arrange 可将活动图层下移，并以撤销/重做恢复图层顺序', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-arrange').click();
  await expect(page.getByTestId('arrange-duplicate')).toBeVisible();
  await page.getByTestId('arrange-duplicate').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(2);

  const before = await page.evaluate(() => ({
    activeId: window.AppConfig.layer.id,
    orders: window.AppConfig.layers.map((layer) => ({ id: layer.id, order: layer.order })),
  }));
  const activeBeforeOrder = before.orders.find((layer) => layer.id === before.activeId)?.order;
  expect(activeBeforeOrder).toBeDefined();

  await page.getByTestId('arrange-down').click();
  await expect.poll(() => page.evaluate((activeId) => window.AppConfig.layers
    .find((layer) => layer.id === activeId)?.order, before.activeId)).toBeLessThan(activeBeforeOrder);
  const moved = await page.evaluate(() => window.AppConfig.layers.map((layer) => ({ id: layer.id, order: layer.order })));

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.map((layer) => ({ id: layer.id, order: layer.order })))).toEqual(before.orders);
  await page.locator('[data-editor-history="redo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.map((layer) => ({ id: layer.id, order: layer.order })))).toEqual(moved);
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
  await page.locator('.studio-retouch-advanced > summary').click();
  await expect(page.getByTestId('retouch-sharpen')).toBeVisible();
  await page.getByTestId('retouch-size').fill('21');
  await page.getByTestId('retouch-blur-strength').fill('64');
  await page.getByTestId('retouch-clone-source').selectOption('Previous');
  await page.getByTestId('retouch-clone-aligned').check();
  await expect.poll(() => page.evaluate(() => ({
    cloneSize: window.AppConfig.TOOLS.find((tool) => tool.name === 'clone').attributes.size,
    blurSize: window.AppConfig.TOOLS.find((tool) => tool.name === 'blur').attributes.size,
    sharpenSize: window.AppConfig.TOOLS.find((tool) => tool.name === 'sharpen').attributes.size,
    desaturateSize: window.AppConfig.TOOLS.find((tool) => tool.name === 'desaturate').attributes.size,
    blurStrength: window.AppConfig.TOOLS.find((tool) => tool.name === 'blur').attributes.strength,
    cloneSource: window.AppConfig.TOOLS.find((tool) => tool.name === 'clone').attributes.source_layer.value,
    cloneAligned: window.AppConfig.TOOLS.find((tool) => tool.name === 'clone').attributes.aligned,
  }))).toEqual({ cloneSize: 21, blurSize: 21, sharpenSize: 21, desaturateSize: 21, blurStrength: 64, cloneSource: 'Previous', cloneAligned: true });
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

test('Retouch 首屏按参考的 Repair、Clone、Detail、Toning 四类本地工作流排序', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'retouch.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-retouch').click();
  const primary = page.locator('.studio-retouch-primary [data-testid]');
  await expect(primary).toHaveCount(4);
  await expect(primary.nth(0)).toHaveAttribute('data-testid', 'retouch-repair');
  await expect(primary.nth(1)).toHaveAttribute('data-testid', 'retouch-clone');
  await expect(primary.nth(2)).toHaveAttribute('data-testid', 'retouch-blur');
  await expect(primary.nth(3)).toHaveAttribute('data-testid', 'retouch-dodge');
  await expect(primary.nth(2)).toContainText('细节');
  await expect(primary.nth(3)).toContainText('明暗');
});

test('Retouch 首屏以四个有名称的图标工具格呈现本地工作流', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'retouch-icon-grid.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-retouch').click();
  await expect(page.locator('#action_attributes')).toBeHidden();

  for (const [testId, label] of [
    ['retouch-repair', '修复'],
    ['retouch-clone', '克隆'],
    ['retouch-blur', '细节'],
    ['retouch-dodge', '明暗'],
  ]) {
    const tool = page.getByTestId(testId);
    await expect(tool).toHaveAttribute('aria-label', label);
    await expect(tool).toHaveAttribute('title', label);
    await expect(tool.locator('img')).toHaveCount(1);
    await expect(tool.locator('img')).toHaveAttribute('alt', '');
    await expect(tool.locator('.sr_only')).toHaveText(label);
    await expect(tool).toHaveCSS('min-height', '40px');
  }
});

test('Retouch Clone 的 Aligned 跨笔保持采样偏移', async ({ page }) => {
  await openHome(page);
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270; canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = '#000'; context.fillRect(0, 0, 270, 270);
    context.fillStyle = '#f00'; context.fillRect(40, 120, 25, 30);
    context.fillStyle = '#00f'; context.fillRect(65, 120, 25, 30);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({ name: 'aligned-clone.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig?.layer?.link))).toBe(true);
  await page.getByTestId('tool-retouch').click();
  await page.getByTestId('retouch-clone').click();
  await page.evaluate(() => {
    const attributes = window.AppConfig.TOOLS.find((tool) => tool.name === 'clone').attributes;
    attributes.size = 20; attributes.anti_aliasing = false; attributes.aligned = true;
    attributes.source_layer.value = 'Current';
    const clone = window.app.GUI.GUI_tools.tools_modules.clone.object;
    clone.clone_coords = { x: 50, y: 135 };
    clone.aligned_offset = null;
  });
  const canvas = page.locator('#canvas_minipaint');
  const historyBefore = await page.evaluate(() => window.State.action_history.length);
  await canvas.click({ position: { x: 150, y: 135 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBefore + 1);
  await canvas.click({ position: { x: 175, y: 135 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBefore + 2);
  const pixels = await page.evaluate(() => {
    const source = window.AppConfig.layer.link;
    const copy = document.createElement('canvas'); copy.width = source.naturalWidth; copy.height = source.naturalHeight;
    const context = copy.getContext('2d', { willReadFrequently: true }); context.drawImage(source, 0, 0);
    return [
      Array.from(context.getImageData(150, 135, 1, 1).data),
      Array.from(context.getImageData(160, 120, 30, 30).data),
    ];
  });
  expect(pixels[0]).toEqual([255, 0, 0, 255]);
  expect(pixels[1].some((value, index) => index % 4 === 2 && value === 255)).toBe(true);
});

test('Retouch Blur 与 Sharpen 都会写入本地像素，并可分别撤销', async ({ page }) => {
  await openHome(page);
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270; canvas.height = 270;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(135, 135, 4, 135, 135, 105);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.18, '#e4e4e4');
    gradient.addColorStop(0.55, '#5a5a5a');
    gradient.addColorStop(1, '#101010');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({ name: 'retouch-detail.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-retouch').click();
  await page.locator('.studio-retouch-advanced > summary').click();
  const canvas = page.locator('#canvas_minipaint');

  for (const testId of ['retouch-blur', 'retouch-sharpen']) {
    await page.getByTestId(testId).click();
    await expect(page.locator(`#tools_container .${testId === 'retouch-blur' ? 'blur' : 'sharpen'}`)).toHaveClass(/active/);
    await page.getByTestId('retouch-size').fill('90');
    if (testId === 'retouch-blur') await page.getByTestId('retouch-blur-strength').fill('18');
    const before = await page.evaluate(() => ({
      history: window.State.action_history.length,
      index: window.State.action_history_index,
      hash: window.AppConfig.layer.link.src,
    }));
    await canvas.click({ position: { x: 135, y: 135 } });
    await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);
    await expect.poll(() => page.evaluate(() => window.AppConfig.layer.link.src)).not.toBe(before.hash);
    await page.locator('[data-editor-history="undo"]').click();
    await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.index);
    await expect.poll(() => page.evaluate(() => window.AppConfig.layer.link.src)).toBe(before.hash);
  }
});

test('Retouch 修复笔刷会用邻域中值消除局部瑕疵，并可撤销', async ({ page }) => {
  await openHome(page);
  const repairFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(40, 140, 200)';
    context.fillRect(0, 0, 270, 270);
    context.fillStyle = 'rgb(255, 0, 255)';
    context.fillRect(135, 135, 1, 1);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'repair-blemish.png',
    mimeType: 'image/png',
    buffer: Buffer.from(repairFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-retouch').click();
  await expect(page.getByTestId('retouch-repair')).toBeVisible();
  await expect(page.getByTestId('retouch-spot')).toBeVisible();
  await page.locator('.studio-retouch-advanced > summary').click();
  for (const [testId, quality] of [
    ['retouch-quality-speed', 'speed'],
    ['retouch-quality-balanced', 'balanced'],
    ['retouch-quality-quality', 'quality'],
  ]) {
    await page.getByTestId(testId).click();
    await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'repair').attributes.quality.value)).toBe(quality);
  }
  await page.getByTestId('retouch-quality-balanced').click();
  await page.getByTestId('retouch-repair').click();
  await expect(page.locator('#tools_container .repair')).toHaveClass(/active/);
  await expect(page.getByTestId('retouch-repair')).toHaveClass(/is-selected/);
  await page.getByTestId('retouch-size').fill('1');
  const before = await page.evaluate(() => ({
    history: window.State.action_history.length,
    index: window.State.action_history_index,
    pixel: (() => {
      const canvas = document.getElementById('canvas_minipaint');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      return Array.from(context.getImageData(135, 135, 1, 1).data);
    })(),
  }));
  expect(before.pixel).toEqual([255, 0, 255, 255]);

  await page.locator('#canvas_minipaint').click({ position: { x: 134, y: 134 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = window.AppConfig.layer.link.naturalWidth;
    canvas.height = window.AppConfig.layer.link.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(window.AppConfig.layer.link, 0, 0);
    return Array.from(context.getImageData(135, 135, 1, 1).data);
  })).toEqual([40, 140, 200, 255]);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = window.AppConfig.layer.link.naturalWidth;
    canvas.height = window.AppConfig.layer.link.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(window.AppConfig.layer.link, 0, 0);
    return Array.from(context.getImageData(135, 135, 1, 1).data);
  })).toEqual(before.pixel);
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.index);
});

test('Retouch 减淡笔刷会局部提亮并提供可撤销的本地像素修改', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'dodge.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-retouch').click();
  await page.locator('.studio-retouch-advanced > summary').click();
  await expect(page.getByTestId('retouch-dodge')).toBeVisible();
  await page.getByTestId('retouch-dodge').click();
  await expect(page.locator('#tools_container .dodge_burn')).toHaveClass(/active/);
  await page.getByTestId('retouch-size').fill('1');
  await page.getByTestId('retouch-dodge-burn-strength').fill('100');
  const before = await page.evaluate(() => ({
    hash: window.AppConfig.layer.link.src,
    history: window.State.action_history.length,
    index: window.State.action_history_index,
  }));
  await page.locator('#canvas_minipaint').click({ position: { x: 1, y: 1 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.link.src)).not.toBe(before.hash);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.link.src)).toBe(before.hash);
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.index);
});

test('Retouch 加深笔刷会局部压暗并提供可撤销的本地像素修改', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'burn.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-retouch').click();
  await page.locator('.studio-retouch-advanced > summary').click();
  await page.getByTestId('retouch-burn').click();
  await expect(page.locator('#tools_container .dodge_burn')).toHaveClass(/active/);
  await page.getByTestId('retouch-size').fill('1');
  await page.getByTestId('retouch-dodge-burn-strength').fill('100');
  const before = await page.evaluate(() => ({
    hash: window.AppConfig.layer.link.src,
    history: window.State.action_history.length,
    index: window.State.action_history_index,
  }));
  await page.locator('#canvas_minipaint').click({ position: { x: 1, y: 1 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.link.src)).not.toBe(before.hash);
  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.link.src)).toBe(before.hash);
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.index);
});

test('Retouch 减淡/加深提供 Dark、Mid、Light 色调范围，并写入本地笔刷参数', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'tone-range.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-retouch').click();
  await page.locator('.studio-retouch-advanced > summary').click();
  await page.getByTestId('retouch-tone-dark').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'dodge_burn').attributes.range.value)).toBe('dark');
  await page.getByTestId('retouch-tone-mid').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'dodge_burn').attributes.range.value)).toBe('mid');
  await page.getByTestId('retouch-tone-light').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'dodge_burn').attributes.range.value)).toBe('light');
});

test('Retouch 的色调范围会影响 Dodge 的本地像素权重', async ({ page }) => {
  await openHome(page);
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270; canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(230, 230, 230)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({ name: 'tone-weight.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-retouch').click();
  await page.locator('.studio-retouch-advanced > summary').click();
  await page.getByTestId('retouch-dodge').click();
  await page.getByTestId('retouch-size').fill('30');
  await page.getByTestId('retouch-dodge-burn-strength').fill('100');
  const readCenter = () => page.evaluate(() => {
    const image = window.AppConfig.layer.link;
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(135, 135, 1, 1).data);
  });

  await page.getByTestId('retouch-tone-dark').click();
  await page.locator('#canvas_minipaint').click({ position: { x: 135, y: 135 } });
  await expect.poll(readCenter).toEqual([230, 230, 230, 255]);
  await page.locator('[data-editor-history="undo"]').click();

  await page.getByTestId('retouch-tone-light').click();
  await page.locator('#canvas_minipaint').click({ position: { x: 135, y: 135 } });
  await expect.poll(async () => (await readCenter())[0]).toBeGreaterThan(230);
});

test('Liquify 面板回写本地内核参数，并按 WebGL2 与锁定状态安全执行', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-liquify').click();

  await expect(page.getByTestId('liquify-mode-bulge')).toBeVisible();
  await expect(page.getByTestId('liquify-mode-pinch')).toBeVisible();
  await expect(page.getByTestId('liquify-mode-push')).toBeVisible();
  await expect(page.getByTestId('liquify-mode-twirl-left')).toBeVisible();
  await expect(page.getByTestId('liquify-mode-twirl-right')).toBeVisible();
  await expect(page.getByTestId('liquify-mode-restore')).toBeVisible();
  await expect(page.getByTestId('liquify-radius')).toHaveAttribute('min', '1');
  await expect(page.getByTestId('liquify-radius')).toHaveAttribute('max', '500');
  await expect(page.getByTestId('liquify-strength')).toHaveAttribute('min', '1');
  await expect(page.getByTestId('liquify-strength')).toHaveAttribute('max', '100');
  await expect(page.getByTestId('liquify-density')).toHaveAttribute('min', '1');
  await expect(page.getByTestId('liquify-high-quality')).not.toBeChecked();
  await expect(page.getByTestId('liquify-apply')).toBeDisabled();
  await expect(page.getByTestId('liquify-cancel')).toBeDisabled();

  const webgl2Available = await page.evaluate(() => document.body.dataset.liquifyAcceleration === 'webgl2');
  if (!webgl2Available) {
    await expect(page.getByTestId('liquify-status')).toContainText('仅本地 WebGL2 可用');
    await expect(page.getByTestId('liquify-mode-bulge')).toBeDisabled();
    await expect(page.getByTestId('liquify-mode-pinch')).toBeDisabled();
    await expect(page.getByTestId('liquify-mode-push')).toBeDisabled();
    await expect(page.getByTestId('liquify-mode-twirl-left')).toBeDisabled();
    await expect(page.getByTestId('liquify-mode-twirl-right')).toBeDisabled();
    await expect(page.getByTestId('liquify-mode-restore')).toBeDisabled();
    await expect(page.getByTestId('liquify-radius')).toBeDisabled();
    await expect(page.getByTestId('liquify-strength')).toBeDisabled();
    await expect(page.getByTestId('liquify-density')).toBeDisabled();
    await expect(page.getByTestId('liquify-high-quality')).toBeDisabled();
    return;
  }

  await expect(page.getByTestId('liquify-status')).toContainText('本地 WebGL2 已启用');
  await page.getByTestId('liquify-mode-pinch').click();
  await page.getByTestId('liquify-radius').fill('123');
  await page.getByTestId('liquify-strength').fill('67');
  await page.getByTestId('liquify-density').fill('42');
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'bulge_pinch').attributes)).toMatchObject({
    bulge: false,
    mode: { value: 'pinch' },
    radius: 123,
    power: 67,
    density: 42,
  });

  const historyBefore = await page.evaluate(() => window.State.action_history.length);
  const sourceBefore = await page.evaluate(() => window.AppConfig.layer.link.src);
  await page.locator('#canvas_minipaint').click({ position: { x: 500, y: 300 } });
  await expect.poll(() => page.evaluate(() => Boolean(window.AppConfig.layer.link_canvas))).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const tool = window.app.GUI.GUI_tools.tools_modules.bulge_pinch.object;
    return window.AppConfig.layer.link_canvas !== tool.tmpCanvas;
  })).toBe(true);
  await expect(page.getByTestId('liquify-apply')).toBeEnabled();
  await expect(page.getByTestId('liquify-cancel')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(historyBefore);
  await page.getByTestId('liquify-high-quality').check();
  await expect.poll(() => page.evaluate(() => {
    const tool = window.app.GUI.GUI_tools.tools_modules.bulge_pinch.object;
    return window.AppConfig.layer.link_canvas === tool.tmpCanvas;
  })).toBe(true);
  await page.getByTestId('liquify-high-quality').uncheck();
  await expect.poll(() => page.evaluate(() => {
    const tool = window.app.GUI.GUI_tools.tools_modules.bulge_pinch.object;
    return window.AppConfig.layer.link_canvas !== tool.tmpCanvas;
  })).toBe(true);
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
  await expect(page.getByTestId('liquify-mode-twirl-left')).toBeDisabled();
  await expect(page.getByTestId('liquify-mode-restore')).toBeDisabled();
  await expect(page.getByTestId('liquify-radius')).toBeDisabled();
  await expect(page.getByTestId('liquify-strength')).toBeDisabled();
  await expect(page.getByTestId('liquify-density')).toBeDisabled();
  await expect(page.getByTestId('liquify-high-quality')).toBeDisabled();
  const lockedHistoryLength = await page.evaluate(() => window.State.action_history.length);
  await page.locator('#canvas_minipaint').click({ position: { x: 500, y: 300 } });
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(lockedHistoryLength);
});

test('Liquify 首屏以六个有名称的图标工具格呈现本地模式', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-liquify').click();
  await expect(page.locator('#action_attributes')).toBeHidden();
  const modes = [
    ['liquify-mode-push', '推移'],
    ['liquify-mode-bulge', '膨胀'],
    ['liquify-mode-pinch', '收缩'],
    ['liquify-mode-twirl-left', '左旋'],
    ['liquify-mode-twirl-right', '右旋'],
    ['liquify-mode-restore', '恢复'],
  ];
  for (const [testId, label] of modes) {
    const control = page.getByTestId(testId);
    await expect(control).toHaveAttribute('aria-label', label);
    await expect(control.locator('img')).toHaveCount(1);
    await expect(control.locator('img')).toHaveAttribute('alt', '');
    await expect(control).toContainText(label);
    await expect(control).toHaveCSS('min-height', '40px');
  }
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

test('Liquify 左右旋与恢复模式均写入本地临时会话，而非远程处理', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorTool))).toBe(true);
  await page.getByTestId('tool-liquify').click();
  await expect(page.getByTestId('liquify-mode-twirl-left')).toBeVisible();
  const webgl2Available = await page.evaluate(() => document.body.dataset.liquifyAcceleration === 'webgl2');
  if (!webgl2Available) {
    await expect(page.getByTestId('liquify-mode-twirl-left')).toBeDisabled();
    return;
  }

  const canvas = page.locator('#canvas_minipaint');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const originalPreview = await page.evaluate(() => document.getElementById('canvas_preview').toDataURL());
  for (const [testId, mode] of [
    ['liquify-mode-twirl-left', 'twirl_left'],
    ['liquify-mode-twirl-right', 'twirl_right'],
    ['liquify-mode-restore', 'restore'],
  ]) {
    await page.getByTestId(testId).click();
    await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'bulge_pinch').attributes.mode.value)).toBe(mode);
    await page.locator('#canvas_minipaint').click({ position: { x: bounds.width * 0.5, y: bounds.height * 0.5 } });
    await expect.poll(() => page.evaluate(() => window.app.GUI.GUI_tools.tools_modules.bulge_pinch.object.has_session())).toBe(true);
    await page.getByTestId('liquify-cancel').click();
    await expect.poll(() => page.evaluate(() => document.getElementById('canvas_preview').toDataURL())).toBe(originalPreview);
  }
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

test('Drawing 首屏优先呈现 Brush、Eraser、Pen、Fill、Shape 五个本地入口', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'drawing-tools.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorTool))).toBe(true);
  await page.getByTestId('tool-drawing').click();

  const primaryTools = page.getByTestId('drawing-primary-tools');
  await expect(primaryTools).toBeVisible();
  await expect(primaryTools.locator('button')).toHaveCount(5);
  for (const testId of ['drawing-brush', 'drawing-eraser', 'drawing-pen', 'drawing-fill', 'drawing-shape']) {
    await expect(primaryTools.getByTestId(testId)).toBeVisible();
  }
  for (const [testId, icon] of [
    ['drawing-brush', 'brush.svg'],
    ['drawing-eraser', 'erase.svg'],
    ['drawing-pen', 'pencil.svg'],
    ['drawing-fill', 'fill.svg'],
    ['drawing-shape', 'shape.svg'],
  ]) {
    await expect(primaryTools.getByTestId(testId).locator('img')).toHaveAttribute('src', new RegExp(`/images/icons/${icon}$`));
  }
  await primaryTools.getByTestId('drawing-pen').click();
  await expect(page.locator('#tools_container .pencil')).toHaveClass(/active/);
  await expect(page.getByTestId('drawing-eyedropper')).toBeVisible();
  await expect(page.getByTestId('drawing-gradient')).toBeVisible();
});

test('Drawing 同状态首屏按参考先呈现 3 加 2 图标工具格与颜色笔刷参数', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'drawing-layout.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorTool))).toBe(true);
  await page.getByTestId('tool-drawing').click();
  await expect(page.getByTestId('drawing-primary-tools')).toBeVisible();

  await expect.poll(() => page.evaluate(() => {
    const panel = document.querySelector('.studio-tool-panel');
    const controls = panel.querySelector('.studio-tool-controls');
    const primaryTools = document.querySelector('[data-testid="drawing-primary-tools"]');
    const colorInput = document.querySelector('[data-testid="drawing-color"]');
    const colorField = colorInput.closest('.studio-drawing-color-field');
    const paletteToggle = document.querySelector('[data-testid="drawing-palette-toggle"]');
    const children = [...controls.children];
    const styles = getComputedStyle(primaryTools);
    return {
      firstChildClass: children[0]?.className,
      secondChildClass: children[1]?.className,
      columns: styles.gridTemplateColumns.trim().split(/\s+/).length,
      height: Math.round(primaryTools.getBoundingClientRect().height),
      color: colorInput.value,
      colorWidth: Math.round(colorInput.getBoundingClientRect().width),
      colorFieldWidth: Math.round(colorField.getBoundingClientRect().width),
      paletteToggleWidth: Math.round(paletteToggle.getBoundingClientRect().width),
    };
  })).toEqual({
    firstChildClass: 'studio-drawing-tools',
    secondChildClass: 'studio-control-color studio-drawing-color',
    columns: 3,
    height: 85,
    color: '#ffffff',
    colorWidth: 274,
    colorFieldWidth: 315,
    paletteToggleWidth: 39,
  });
  await expect(page.getByTestId('drawing-color')).toBeVisible();
  await expect(page.getByTestId('drawing-palette-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('drawing-size')).toBeVisible();
  await expect(page.getByTestId('drawing-softness')).toBeVisible();
  await expect(page.getByTestId('drawing-opacity')).toBeVisible();
});

test('Drawing 首屏提供随颜色、尺寸与柔化变化的真实笔刷预览', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'drawing-preview.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorTool))).toBe(true);
  await page.getByTestId('tool-drawing').click();

  const preview = page.getByTestId('drawing-brush-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('role', 'img');
  const before = await page.evaluate(() => {
    const preview = document.querySelector('[data-testid="drawing-brush-preview"]');
    const context = preview.getContext('2d', { willReadFrequently: true });
    const center = context.getImageData(preview.width / 2, preview.height / 2, 1, 1).data;
    return { width: preview.width, height: preview.height, center: Array.from(center) };
  });
  expect(before).toMatchObject({ width: 600, height: 220 });

  await page.getByTestId('drawing-color').fill('#d946ef');
  await page.getByTestId('drawing-size').fill('40');
  await page.getByTestId('drawing-softness').fill('70');
  await page.getByTestId('drawing-opacity').fill('42');
  const after = await page.evaluate(() => {
    const preview = document.querySelector('[data-testid="drawing-brush-preview"]');
    const context = preview.getContext('2d', { willReadFrequently: true });
    return Array.from(context.getImageData(preview.width / 2, preview.height / 2, 1, 1).data);
  });
  expect(after).not.toEqual(before.center);
  expect(after[3]).toBe(255);
});

test('Drawing 会激活画笔并将颜色、尺寸、不透明度和柔化写入本地配置', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await expect(page.getByTestId('drawing-gradient')).toBeVisible();
  await page.getByTestId('drawing-color').fill('#d946ef');
  await page.getByTestId('drawing-size').fill('18');
  await page.getByTestId('drawing-opacity').fill('42');
  await expect(page.getByTestId('drawing-softness')).toHaveValue('20');
  await page.getByTestId('drawing-softness').fill('35');
  await page.getByTestId('drawing-brush').click();
  await expect(page.locator('#tools_container .brush')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => ({
    color: window.AppConfig.COLOR,
    alpha: window.AppConfig.ALPHA,
    size: window.AppConfig.TOOLS.find((tool) => tool.name === 'brush').attributes.size,
    softness: window.AppConfig.TOOLS.find((tool) => tool.name === 'brush').attributes.softness,
  }))).toEqual({ color: '#d946ef', alpha: 107, size: 18, softness: 35 });
});

test('Drawing 调色板色样会写入本地颜色状态并同步形状与渐变前景色', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('tool-drawing').click();
  await expect(page.getByTestId('drawing-palette')).toBeHidden();
  await page.getByTestId('drawing-palette-toggle').click();
  await expect(page.getByTestId('drawing-palette-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('drawing-palette')).toBeVisible();
  await page.getByTestId('drawing-palette-red').click();
  await expect(page.getByTestId('drawing-color')).toHaveValue('#ef4444');
  await expect(page.getByTestId('drawing-palette-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('drawing-palette')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('studio-drawing-palette-open'))).toBe(false);
  await expect.poll(() => page.evaluate(() => ({
    color: window.AppConfig.COLOR,
    shape: window.AppConfig.TOOLS.find((tool) => tool.name === 'shape').attributes.stroke,
    gradient: window.AppConfig.TOOLS.find((tool) => tool.name === 'gradient').attributes.color_1,
  }))).toEqual({ color: '#ef4444', shape: '#ef4444', gradient: '#ef4444' });
});

test('Drawing 形状快捷项会切换到对应的本地画布工具', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('tool-drawing').click();
  for (const [testId, tool] of [
    ['drawing-shape-rectangle', 'rectangle'],
    ['drawing-shape-ellipse', 'ellipse'],
    ['drawing-shape-triangle', 'triangle'],
    ['drawing-shape-star', 'star'],
    ['drawing-shape-heart', 'heart'],
    ['drawing-shape-line', 'line'],
  ]) {
    await page.getByTestId(testId).click();
    await expect.poll(() => page.evaluate(() => window.AppConfig.TOOL.name)).toBe(tool);
  }
});

test('Drawing 可创建可撤销的新空白绘制图层', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles({ name: 'drawing-layer.png', mimeType: 'image/png', buffer: samplePng });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await expect(page.getByTestId('drawing-new-layer')).toBeVisible();

  const before = await page.evaluate(() => ({
    count: window.AppConfig.layers.length,
    historyIndex: window.State.action_history_index,
  }));
  await page.getByTestId('drawing-new-layer').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(before.count + 1);
  await expect.poll(() => page.evaluate(() => ({
    name: window.AppConfig.layer.name,
    type: window.AppConfig.layer.type,
    historyIndex: window.State.action_history_index,
  }))).toEqual({
    name: '新建空白绘制图层',
    type: null,
    historyIndex: before.historyIndex + 1,
  });

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => ({
    count: window.AppConfig.layers.length,
    historyIndex: window.State.action_history_index,
  }))).toEqual(before);
});

test('Drawing 的 Sketchy 笔刷模式会保存在本地图层并可撤销', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(20, 30, 40)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'sketchy-brush-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await expect(page.getByTestId('drawing-brush-mode-sketchy')).toBeVisible();
  await page.getByTestId('drawing-color').fill('#ffffff');
  await page.getByTestId('drawing-size').fill('20');
  await page.getByTestId('drawing-softness').fill('0');
  await page.getByTestId('drawing-opacity').fill('100');
  await page.getByTestId('drawing-brush-mode-sketchy').click();
  await expect.poll(() => page.evaluate(() => {
    const mode = window.AppConfig.TOOLS.find((tool) => tool.name === 'brush').attributes.mode;
    return mode?.value ?? mode;
  })).toBe('sketchy');
  await page.getByTestId('drawing-brush').click();

  const before = await page.evaluate(() => ({
    history: window.State.action_history.length,
    pixel: (() => {
      const canvas = document.getElementById('canvas_minipaint');
      return Array.from(canvas.getContext('2d', { willReadFrequently: true }).getImageData(135, 135, 1, 1).data);
    })(),
  }));
  await page.locator('#canvas_minipaint').click({ position: { x: 134, y: 134 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);
  await expect.poll(() => page.evaluate(() => ({
    mode: window.AppConfig.layer.params.mode?.value ?? window.AppConfig.layer.params.mode,
    pixel: (() => {
      const canvas = document.getElementById('canvas_minipaint');
      return Array.from(canvas.getContext('2d', { willReadFrequently: true }).getImageData(135, 135, 1, 1).data);
    })(),
  }))).toEqual({ mode: 'sketchy', pixel: [255, 255, 255, 255] });

  const sketchyHash = await page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const pixels = canvas.getContext('2d', { willReadFrequently: true }).getImageData(115, 115, 40, 40).data;
    return Array.from(pixels).reduce((hash, value) => Math.imul(hash ^ value, 16777619), 2166136261) >>> 0;
  });

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    return Array.from(canvas.getContext('2d', { willReadFrequently: true }).getImageData(135, 135, 1, 1).data);
  })).toEqual(before.pixel);

  await page.getByTestId('drawing-brush-mode-plain').click();
  await page.locator('#canvas_minipaint').click({ position: { x: 134, y: 134 } });
  const plainHash = await page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const pixels = canvas.getContext('2d', { willReadFrequently: true }).getImageData(115, 115, 40, 40).data;
    return Array.from(pixels).reduce((hash, value) => Math.imul(hash ^ value, 16777619), 2166136261) >>> 0;
  });
  expect(plainHash).not.toBe(sketchyHash);
});

test('Drawing 的八种本地笔刷模式都写入对应图层参数、改变像素且可撤销', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const fixtureCanvas = document.createElement('canvas');
    fixtureCanvas.width = 270;
    fixtureCanvas.height = 270;
    const fixtureContext = fixtureCanvas.getContext('2d');
    fixtureContext.fillStyle = 'rgb(20, 30, 40)';
    fixtureContext.fillRect(0, 0, 270, 270);
    return fixtureCanvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'brush-modes-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await page.getByTestId('drawing-color').fill('#d946ef');
  await page.getByTestId('drawing-size').fill('20');
  await page.getByTestId('drawing-softness').fill('0');
  await page.getByTestId('drawing-opacity').fill('100');
  await page.getByTestId('drawing-brush').click();
  const canvas = page.locator('#canvas_minipaint');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const pixelHash = () => page.evaluate(() => {
    const canvasElement = document.getElementById('canvas_minipaint');
    const pixels = canvasElement.getContext('2d', { willReadFrequently: true })
      .getImageData(92, 92, 86, 56).data;
    return Array.from(pixels).reduce((hash, value) => Math.imul(hash ^ value, 16777619), 2166136261) >>> 0;
  });

  for (const mode of ['plain', 'parallel', 'sketchy', 'shaded', 'furry', 'trail', 'crayon', 'ink']) {
    await page.getByTestId(`drawing-brush-mode-${mode}`).click();
    await expect.poll(() => page.evaluate(() => {
      const value = window.AppConfig.TOOLS.find((tool) => tool.name === 'brush').attributes.mode;
      return value?.value ?? value;
    })).toBe(mode);
    const before = await pixelHash();
    const historyIndex = await page.evaluate(() => window.State.action_history_index);
    await canvas.hover({ position: { x: 94, y: 116 } });
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 168, canvasBox.y + 116, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(historyIndex + 1);
    await expect.poll(pixelHash).not.toBe(before);
    await expect.poll(() => page.evaluate(() => {
      const value = window.AppConfig.layer.params.mode;
      return value?.value ?? value;
    })).toBe(mode);
    await page.locator('[data-editor-history="undo"]').click();
    await expect.poll(pixelHash).toBe(before);
  }
});

test('Drawing 画笔会写入本地像素，并可通过撤销精确恢复', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(20, 30, 40)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'drawing-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await page.getByTestId('drawing-color').fill('#d946ef');
  await page.getByTestId('drawing-size').fill('1');
  await page.getByTestId('drawing-opacity').fill('100');
  await page.getByTestId('drawing-brush').click();
  await expect(page.locator('#tools_container .brush')).toHaveClass(/active/);

  const before = await page.evaluate(() => ({
    history: window.State.action_history.length,
    index: window.State.action_history_index,
    pixel: (() => {
      const canvas = document.createElement('canvas');
      canvas.width = window.AppConfig.layer.link.naturalWidth;
      canvas.height = window.AppConfig.layer.link.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(window.AppConfig.layer.link, 0, 0);
      return Array.from(context.getImageData(135, 135, 1, 1).data);
    })(),
  }));
  expect(before.pixel).toEqual([20, 30, 40, 255]);

  await page.locator('#canvas_minipaint').click({ position: { x: 134, y: 134 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(before.history + 1);
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    return Array.from(context.getImageData(135, 135, 1, 1).data);
  })).not.toEqual(before.pixel);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    return Array.from(context.getImageData(135, 135, 1, 1).data);
  })).toEqual(before.pixel);
  await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(before.index);
});

test('Drawing 柔化会改变画笔外缘像素，并可撤销回到底图', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(20, 30, 40)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'soft-brush-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await page.getByTestId('drawing-color').fill('#ffffff');
  await page.getByTestId('drawing-size').fill('30');
  await page.getByTestId('drawing-opacity').fill('100');
  await page.getByTestId('drawing-softness').fill('0');
  await page.getByTestId('drawing-brush').click();

  const pixelAtOuterEdge = () => page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    return Array.from(context.getImageData(155, 135, 1, 1).data);
  });
  const basePixel = await pixelAtOuterEdge();
  expect(basePixel).toEqual([20, 30, 40, 255]);
  const baseHistory = await page.evaluate(() => window.State.action_history.length);

  await page.locator('#canvas_minipaint').click({ position: { x: 134, y: 134 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(baseHistory + 1);
  await expect.poll(pixelAtOuterEdge).toEqual(basePixel);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(pixelAtOuterEdge).toEqual(basePixel);
  await page.getByTestId('drawing-softness').fill('100');
  await page.locator('#canvas_minipaint').click({ position: { x: 134, y: 134 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(baseHistory + 1);
  await expect.poll(pixelAtOuterEdge).not.toEqual(basePixel);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(pixelAtOuterEdge).toEqual(basePixel);
});

test('Drawing 铅笔笔触会写入本地像素，并可通过撤销精确恢复', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(20, 30, 40)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'pencil-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await page.getByTestId('drawing-color').fill('#d946ef');
  await page.getByTestId('drawing-size').fill('4');
  await page.getByTestId('drawing-opacity').fill('100');
  await page.getByTestId('drawing-pen').click();
  await expect(page.locator('#tools_container .pencil')).toHaveClass(/active/);

  const strokeRegionHash = () => page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(120, 115, 80, 50).data;
    let hash = 2166136261;
    for (const pixel of pixels) hash = Math.imul(hash ^ pixel, 16777619);
    return hash >>> 0;
  });
  const before = await strokeRegionHash();
  const history = await page.evaluate(() => window.State.action_history.length);
  const canvas = page.locator('#canvas_minipaint');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await canvas.hover({ position: { x: 134, y: 134 } });
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 165, canvasBox.y + 134, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history + 1);
  await expect.poll(strokeRegionHash).not.toBe(before);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(strokeRegionHash).toBe(before);
});

test('Drawing 填充会写入本地像素，并可通过撤销精确恢复', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(20, 30, 40)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'fill-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await page.getByTestId('drawing-color').fill('#d946ef');
  await page.getByTestId('drawing-opacity').fill('100');
  await page.getByTestId('drawing-fill').click();
  await expect(page.locator('#tools_container .fill')).toHaveClass(/active/);

  const centerPixel = () => page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    return Array.from(context.getImageData(135, 135, 1, 1).data);
  });
  const before = await centerPixel();
  expect(before).toEqual([20, 30, 40, 255]);
  const history = await page.evaluate(() => window.State.action_history.length);
  await page.locator('#canvas_minipaint').click({ position: { x: 134, y: 134 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history + 1);
  await expect.poll(centerPixel).toEqual([217, 70, 239, 255]);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(centerPixel).toEqual(before);
});

test('Drawing 渐变会写入本地像素，并可通过撤销精确恢复', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(20, 30, 40)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'gradient-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await page.getByTestId('drawing-color').fill('#d946ef');
  await page.getByTestId('drawing-gradient').click();
  await expect(page.locator('#tools_container .gradient')).toHaveClass(/active/);

  const regionHash = () => page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(80, 100, 100, 40).data;
    let hash = 2166136261;
    for (const pixel of pixels) hash = Math.imul(hash ^ pixel, 16777619);
    return hash >>> 0;
  });
  const before = await regionHash();
  const history = await page.evaluate(() => window.State.action_history.length);
  const canvas = page.locator('#canvas_minipaint');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await canvas.hover({ position: { x: 100, y: 120 } });
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 170, canvasBox.y + 120, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history + 1);
  await expect.poll(regionHash).not.toBe(before);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(regionHash).toBe(before);
});

test('Drawing 形状会写入本地像素，并可通过撤销精确恢复', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(20, 30, 40)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'shape-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await page.getByTestId('drawing-shape').click();
  const shapeDialog = page.getByRole('dialog');
  await expect(shapeDialog.getByRole('heading', { name: '形状' })).toBeVisible();
  await shapeDialog.locator('canvas[data-key="rectangle"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOL.name)).toBe('rectangle');

  const regionHash = () => page.evaluate(() => {
    const canvas = document.getElementById('canvas_minipaint');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(100, 100, 80, 80).data;
    let hash = 2166136261;
    for (const pixel of pixels) hash = Math.imul(hash ^ pixel, 16777619);
    return hash >>> 0;
  });
  const before = await regionHash();
  const history = await page.evaluate(() => window.State.action_history.length);
  const canvas = page.locator('#canvas_minipaint');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await canvas.hover({ position: { x: 100, y: 100 } });
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 170, canvasBox.y + 170, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history + 1);
  await expect.poll(regionHash).not.toBe(before);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(regionHash).toBe(before);
});

test('Drawing 的椭圆、三角、星形、心形与直线快捷形状均会写入像素并可撤销', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(20, 30, 40)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'all-shapes-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-drawing').click();
  await page.getByTestId('drawing-color').fill('#d946ef');
  const canvas = page.locator('#canvas_minipaint');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const pixelHash = () => page.evaluate(() => {
    const canvasElement = document.getElementById('canvas_minipaint');
    const pixels = canvasElement.getContext('2d', { willReadFrequently: true })
      .getImageData(40, 40, 190, 190).data;
    let hash = 2166136261;
    for (const pixel of pixels) hash = Math.imul(hash ^ pixel, 16777619);
    return hash >>> 0;
  });

  for (const [testId, tool] of [
    ['drawing-shape-ellipse', 'ellipse'],
    ['drawing-shape-triangle', 'triangle'],
    ['drawing-shape-star', 'star'],
    ['drawing-shape-heart', 'heart'],
    ['drawing-shape-line', 'line'],
  ]) {
    await page.getByTestId(testId).click();
    await expect.poll(() => page.evaluate(() => window.AppConfig.TOOL.name)).toBe(tool);
    const before = await pixelHash();
    const history = await page.evaluate(() => window.State.action_history.length);
    await canvas.hover({ position: { x: 74, y: 74 } });
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 194, canvasBox.y + 172, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history + 1);
    await expect.poll(pixelHash).not.toBe(before);
    await page.locator('[data-editor-history="undo"]').click();
    await expect.poll(pixelHash).toBe(before);
  }
});

test('Drawing 橡皮会将活动图片图层局部变透明，并可通过撤销精确恢复', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(20, 30, 40)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'erase-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorTool))).toBe(true);
  await page.getByTestId('tool-drawing').click();
  await expect(page.getByTestId('drawing-eraser')).toBeVisible();
  await page.getByTestId('drawing-size').fill('30');
  await page.getByTestId('drawing-eraser').click();
  await expect(page.locator('#tools_container .erase')).toHaveClass(/active/);

  const activeLayerPixel = () => page.evaluate(() => {
    const layer = window.AppConfig.layer;
    const canvas = document.createElement('canvas');
    canvas.width = layer.link.naturalWidth;
    canvas.height = layer.link.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(layer.link, 0, 0);
    return Array.from(context.getImageData(135, 135, 1, 1).data);
  });
  const before = await activeLayerPixel();
  expect(before).toEqual([20, 30, 40, 255]);
  const history = await page.evaluate(() => window.State.action_history.length);
  await page.locator('#canvas_minipaint').click({ position: { x: 134, y: 134 } });
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history + 1);
  await expect.poll(activeLayerPixel).toEqual([0, 0, 0, 0]);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(activeLayerPixel).toEqual(before);
});

test('Drawing 取色器从本地图层读取像素颜色，不写入编辑历史', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = '#d946ef';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'eyedropper-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorTool))).toBe(true);
  await page.getByTestId('tool-drawing').click();
  await expect(page.getByTestId('drawing-eyedropper')).toBeVisible();
  await page.getByTestId('drawing-eyedropper').click();
  await expect(page.locator('#tools_container .pick_color')).toHaveClass(/active/);
  const history = await page.evaluate(() => window.State.action_history.length);
  await page.locator('#canvas_minipaint').click({ position: { x: 134, y: 134 } });
  await expect.poll(() => page.evaluate(() => window.AppConfig.COLOR)).toBe('#d946ef');
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBe(history);
});

test('Drawing 笔刷预设会写入可持久化的本地尺寸与柔化参数', async ({ page }) => {
  await openHome(page);
  const drawingFixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 270;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(20, 30, 40)';
    context.fillRect(0, 0, 270, 270);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('image-picker').setInputFiles({
    name: 'brush-preset-base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(drawingFixture, 'base64'),
  });
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.PhotoStudio?.activateEditorTool))).toBe(true);
  await page.getByTestId('tool-drawing').click();
  await page.getByTestId('drawing-color').fill('#ffffff');
  await page.getByTestId('drawing-size').fill('30');
  await page.getByTestId('drawing-opacity').fill('100');
  await page.getByTestId('drawing-brush-preset-hard').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.TOOLS.find((tool) => tool.name === 'brush').attributes)).toMatchObject({
    size: 18, softness: 0,
  });
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
	await expect(page.getByTestId('text-warp')).toBeVisible();

  await page.getByTestId('text-font').selectOption('Verdana');
	await page.getByTestId('text-warp').selectOption('wave');
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
	  warp: attributes.warp.value,
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
	warp: 'wave',
  });
});

test('Text 的新增文字入口明确展示默认文字说明', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('tool-text').click();
  const create = page.getByTestId('text-create');
  await expect(create).toContainText('添加新文字');
  await expect(create).toContainText('默认文字');
});

test('Text 首屏预设卡保持参考面板的浏览密度', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('tool-text').click();
  const geometry = await page.evaluate(() => {
    const box = (selector) => {
      const { top, bottom, height } = document.querySelector(selector).getBoundingClientRect();
      return { top, bottom, height };
    };
    const create = box('[data-testid="text-create"]');
    const first = box('.studio-text-preset:nth-child(1)');
    const third = box('.studio-text-preset:nth-child(3)');
    return {
      firstHeight: first.height,
      createToGridGap: first.top - create.bottom,
      rowGap: third.top - first.bottom,
    };
  });
  expect(geometry).toEqual({
    firstHeight: 118,
    createToGridGap: 49,
    rowGap: 14,
  });
});

test('Text 提供原创本地样式预设卡，并真实写回可编辑文字工具配置', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('tool-text').click();
  const presets = page.locator('.studio-text-preset');
  await expect(presets).toHaveCount(76);
  await expect(page.getByTestId('text-preset-capsule')).toBeVisible();
  await page.getByTestId('text-preset-poster').click();
  await expect(page.getByTestId('text-preset-poster')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('text-font')).toHaveValue('Arial');
  await expect(page.getByTestId('text-size')).toHaveValue('72');
  await expect(page.getByTestId('text-fill')).toHaveValue('#22d3ee');
  await expect(page.getByTestId('text-bold')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('text-stroke')).toHaveValue('#082f49');
  await expect(page.getByTestId('text-stroke-size')).toHaveValue('2');
  await expect.poll(() => page.evaluate(() => {
    const attributes = window.AppConfig.TOOLS.find((tool) => tool.name === 'text').attributes;
    return {
      font: attributes.font.value,
      size: attributes.size,
      fill: attributes.fill,
      bold: attributes.bold.value,
      stroke: attributes.stroke,
      strokeSize: attributes.stroke_size.value,
    };
  })).toEqual({
    font: 'Arial', size: 72, fill: '#22d3ee', bold: true, stroke: '#082f49', strokeSize: 2,
  });
  await page.getByTestId('text-preset-capsule').click();
  await expect(page.getByTestId('text-preset-capsule')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('text-size')).toHaveValue('58');
  await expect(page.getByTestId('text-fill')).toHaveValue('#f8fafc');
  await expect(page.getByTestId('text-stroke-size')).toHaveValue('3');
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

test('Text 曲线会改变文字图层的本地画布像素，并可撤销', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('image-picker').setInputFiles(desktopFixture);
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await page.getByTestId('tool-text').click();
  await page.getByTestId('text-size').fill('72');
  await page.getByTestId('text-create').click();
  await page.locator('#canvas_minipaint').click({ position: { x: 500, y: 240 } });
  await page.locator('#text_tool_keyboard_input').fill('CURVE');
  await page.locator('#text_tool_keyboard_input').blur();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.data?.[0]?.[0]?.text)).toBe('CURVE');

  const before = await page.evaluate(() => window.app.Layers.canvas.toDataURL());
  const historyBefore = await page.evaluate(() => window.State.action_history.length);
  await page.getByTestId('text-curve').fill('36');
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.params.curve)).toBe(36);
  await expect.poll(() => page.evaluate((previous) => window.app.Layers.canvas.toDataURL() !== previous, before)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.State.action_history.length)).toBeGreaterThan(historyBefore);

  await page.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.evaluate(() => window.AppConfig.layer.params.curve || 0)).toBe(0);
  await expect.poll(() => page.evaluate((previous) => window.app.Layers.canvas.toDataURL() === previous, before)).toBe(true);
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
  await openSaveMenu(page);
  await page.getByTestId('save-local-project').click();
  await expect(page.getByTestId('save-local-project')).toHaveText('已保存本地项目');
});

test('本地项目保存后可从首页最近项目重新打开并恢复画布尺寸', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('create-new').click();
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  const dimensions = await page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT]);
  await openSaveMenu(page);
  await page.getByTestId('save-local-project').click();
  await expect(page.getByTestId('save-local-project')).toHaveText('已保存本地项目');

  await page.getByTestId('editor-home').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-page="home"]')).toHaveAttribute('data-ready', 'true');
  const savedProject = page.locator('[data-testid="recent-projects"] [data-open-project]').first();
  await expect(savedProject).toBeVisible();
  await savedProject.click();
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-manual-cutout-tools', 'selection,magic_erase,erase');
  await expect.poll(() => page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual(dimensions);
});
