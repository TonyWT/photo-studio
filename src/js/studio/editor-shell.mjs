import { normalizeProjectName, projectStore } from './project-store.mjs';

export const MANUAL_CUTOUT_TOOLS = ['selection', 'magic_erase', 'erase'];

export const EDITOR_TOOL_REGISTRY = Object.freeze({
  arrange: { label: '排列', description: '选择、移动、缩放和排列当前图层。', coreTool: 'select' },
  crop: { label: '裁剪', description: '裁剪图像或画布，并支持比例约束。', coreTool: 'crop' },
  cutout: { label: '手动抠图', description: '使用选区、魔术橡皮和橡皮工具手动抠图。', coreTool: 'selection' },
  adjust: { label: '调整', description: '色彩、光线与细节调整将在此处显示。', coreTool: null },
  effect: { label: '效果', description: '图像效果将在此处显示。', coreTool: null },
  filter: { label: '滤镜', description: '本地图层滤镜将在此处显示。', coreTool: null },
  liquify: { label: '液化', description: '在支持 WebGL2 的浏览器中使用变形笔刷。', coreTool: 'bulge_pinch' },
  retouch: { label: '修饰', description: '修复、克隆与局部细节工具将在此处显示。', coreTool: 'clone' },
  drawing: { label: '绘制', description: '画笔、填充、形状和颜色工具。', coreTool: 'brush' },
  text: { label: '文字', description: '添加和编辑本机字体文字图层。', coreTool: 'text' },
});

export function shouldUseWebGL2(canvas) {
  return Boolean(canvas?.getContext?.('webgl2'));
}

let currentProjectId = null;
let currentProjectName = '未命名项目';

function updateSaveLabel(label) {
  const button = document.querySelector('[data-testid="save-local-project"]');
  if (button) button.textContent = label;
}

function updateCanvasStatus() {
  const dimensions = document.getElementById('studio-document-dimensions');
  const zoom = document.querySelector('[data-testid="editor-zoom"]');
  if (dimensions && window.AppConfig?.WIDTH && window.AppConfig?.HEIGHT) {
    dimensions.textContent = `${window.AppConfig.WIDTH} × ${window.AppConfig.HEIGHT} px`;
  }
  if (zoom && window.AppConfig?.ZOOM) {
    zoom.textContent = `${Math.round(window.AppConfig.ZOOM * 100)}%`;
  }
}

function findToolConfig(name) {
  return window.AppConfig?.TOOLS?.find((tool) => tool.name === name);
}

function setToolAttribute(name, attribute, value) {
  const tool = findToolConfig(name);
  if (tool?.attributes) tool.attributes[attribute] = value;
}

async function activateCoreTool(coreTool) {
  if (!coreTool || !window.app?.GUI?.GUI_tools) return;
  await window.app.GUI.GUI_tools.activate_tool(coreTool);
  updateCanvasStatus();
}

function invokeEditorModule(path, method) {
  const module = window.app?.GUI?.modules?.[path];
  if (typeof module?.[method] !== 'function') return null;
  return module[method]();
}

function getCoreToolModule(name) {
  return window.app?.GUI?.GUI_tools?.tools_modules?.[name]?.object || null;
}

function activeLayerIsEditable() {
  return Boolean(window.AppConfig?.layer) && !window.AppConfig.layer.locked;
}

async function updateActiveLayer(settings) {
  if (!activeLayerIsEditable() || !window.app?.Actions?.Update_layer_action || !window.State?.do_action) return false;
  await window.State.do_action(new window.app.Actions.Update_layer_action(window.AppConfig.layer.id, settings));
  window.app?.GUI?.GUI_layers?.render_layers?.();
  return true;
}

function setupCollageFromQuery() {
  const template = new URLSearchParams(window.location.search).get('collage');
  const templates = {
    '2x2': { columns: 2, rows: 2 },
    '3x1': { columns: 3, rows: 1 },
  };
  const layout = templates[template];
  if (!layout || !window.AppConfig) return false;
  const guides = [];
  for (let column = 1; column < layout.columns; column += 1) {
    guides.push({ x: Math.round(window.AppConfig.WIDTH * column / layout.columns), y: null });
  }
  for (let row = 1; row < layout.rows; row += 1) {
    guides.push({ x: null, y: Math.round(window.AppConfig.HEIGHT * row / layout.rows) });
  }
  window.AppConfig.guides = guides;
  window.AppConfig.guides_enabled = true;
  window.AppConfig.need_render = true;
  document.body.dataset.collageTemplate = template;
  return true;
}

function applyCenteredCropRatio(ratio) {
  const crop = getCoreToolModule('crop');
  const width = window.AppConfig?.WIDTH;
  const height = window.AppConfig?.HEIGHT;
  if (!crop || !width || !height || !ratio) return false;
  let selectionWidth = width;
  let selectionHeight = Math.round(selectionWidth / ratio);
  if (selectionHeight > height) {
    selectionHeight = height;
    selectionWidth = Math.round(selectionHeight * ratio);
  }
  crop.selection = {
    x: Math.round((width - selectionWidth) / 2),
    y: Math.round((height - selectionHeight) / 2),
    width: selectionWidth,
    height: selectionHeight,
  };
  window.AppConfig.need_render = true;
  return true;
}

function renderEditorToolControls(key) {
  const target = document.querySelector('[data-editor-tool-controls]');
  if (!target) return;
  if (key === 'cutout') {
    target.innerHTML = `
    <div class="studio-control-group" aria-label="手动抠图模式">
      <button type="button" data-cutout-mode="selection" data-testid="cutout-mode-selection">矩形选区</button>
      <button type="button" data-cutout-mode="magic_erase" data-testid="cutout-mode-magic">魔术橡皮</button>
      <button type="button" data-cutout-mode="erase" data-testid="cutout-mode-erase">橡皮画笔</button>
    </div>
    <label class="studio-control-range">容差 <output data-cutout-tolerance-output>15</output>
      <input type="range" min="1" max="100" value="15" data-testid="cutout-tolerance">
    </label>
    <label class="studio-control-check">
      <input type="checkbox" data-testid="cutout-soft-edge" checked>
      柔化边缘
    </label>
    <label class="studio-control-check">
      <input type="checkbox" data-testid="cutout-global-sample">
      全局取样
    </label>
    <div class="studio-control-group studio-control-group-two" aria-label="选区操作">
      <button type="button" data-testid="cutout-remove-selection">移除选区</button>
      <button type="button" data-testid="cutout-reset-selection">重置选区</button>
    </div>
  `;
  const tolerance = target.querySelector('[data-testid="cutout-tolerance"]');
  const output = target.querySelector('[data-cutout-tolerance-output]');
  tolerance.addEventListener('input', () => {
    const value = Number(tolerance.value);
    setToolAttribute('magic_erase', 'power', value);
    output.value = String(value);
    output.textContent = String(value);
  });
  const softEdge = target.querySelector('[data-testid="cutout-soft-edge"]');
  const globalSample = target.querySelector('[data-testid="cutout-global-sample"]');
  softEdge.checked = findToolConfig('magic_erase')?.attributes?.anti_aliasing !== false;
  globalSample.checked = findToolConfig('magic_erase')?.attributes?.contiguous === true;
  softEdge.addEventListener('change', () => setToolAttribute('magic_erase', 'anti_aliasing', softEdge.checked));
  globalSample.addEventListener('change', () => setToolAttribute('magic_erase', 'contiguous', globalSample.checked));
  target.querySelector('[data-testid="cutout-remove-selection"]')?.addEventListener('click', () => {
    if (!activeLayerIsEditable()) return;
    getCoreToolModule('selection')?.delete_selection?.();
  });
  target.querySelector('[data-testid="cutout-reset-selection"]')?.addEventListener('click', () => {
    getCoreToolModule('selection')?.clear_selection?.();
  });
  target.querySelectorAll('[data-cutout-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const mode = button.dataset.cutoutMode;
      await window.PhotoStudio?.activateEditorToolMode?.(mode);
      target.querySelectorAll('[data-cutout-mode]').forEach((item) => item.classList.toggle('is-selected', item === button));
    });
  });
    return;
  }

  if (key === 'adjust') {
    target.innerHTML = `
      <div class="studio-control-group studio-control-group-two" aria-label="调整操作">
        <button type="button" data-editor-action="adjust-auto" data-testid="adjust-auto">自动修正</button>
        <button type="button" data-editor-action="adjust-color" data-testid="adjust-color">颜色与光线</button>
        <button type="button" data-editor-action="adjust-bw" data-testid="adjust-bw">黑白</button>
      </div>
    `;
    target.querySelector('[data-editor-action="adjust-auto"]')?.addEventListener('click', () => invokeEditorModule('image/auto_adjust', 'auto_adjust'));
    target.querySelector('[data-editor-action="adjust-color"]')?.addEventListener('click', () => invokeEditorModule('image/color_corrections', 'color_corrections'));
    target.querySelector('[data-editor-action="adjust-bw"]')?.addEventListener('click', () => invokeEditorModule('effects/black_and_white', 'black_and_white'));
    return;
  }

  if (key === 'crop') {
    target.innerHTML = `
      <div class="studio-control-group studio-control-group-two" aria-label="裁剪比例">
        <button type="button" data-testid="crop-ratio-original">原始比例</button>
        <button type="button" data-testid="crop-ratio-1-1">1:1</button>
        <button type="button" data-testid="crop-ratio-4-3">4:3</button>
        <button type="button" data-testid="crop-ratio-16-9">16:9</button>
      </div>
      <div class="studio-control-group studio-control-group-two" aria-label="裁剪操作">
        <button type="button" data-testid="crop-apply">应用裁剪</button>
        <button type="button" data-testid="crop-reset">重置选区</button>
      </div>
      <p class="studio-control-hint">在画布上拖出区域后应用；按住 Command 或 Ctrl 可保持原始比例。</p>
    `;
    target.querySelector('[data-testid="crop-apply"]')?.addEventListener('click', () => getCoreToolModule('crop')?.on_params_update());
    target.querySelector('[data-testid="crop-reset"]')?.addEventListener('click', () => {
      const crop = getCoreToolModule('crop');
      if (!crop) return;
      crop.selection = { x: null, y: null, width: null, height: null };
      crop.Base_selection?.reset_selection();
      window.AppConfig.need_render = true;
    });
    target.querySelector('[data-testid="crop-ratio-original"]')?.addEventListener('click', () => {
      applyCenteredCropRatio(window.AppConfig.WIDTH / window.AppConfig.HEIGHT);
    });
    target.querySelector('[data-testid="crop-ratio-1-1"]')?.addEventListener('click', () => applyCenteredCropRatio(1));
    target.querySelector('[data-testid="crop-ratio-4-3"]')?.addEventListener('click', () => applyCenteredCropRatio(4 / 3));
    target.querySelector('[data-testid="crop-ratio-16-9"]')?.addEventListener('click', () => applyCenteredCropRatio(16 / 9));
    return;
  }

  if (key === 'arrange') {
    const layer = window.AppConfig?.layer;
    const opacity = Number.isFinite(layer?.opacity) ? layer.opacity : 100;
    const locked = Boolean(layer?.locked);
    target.innerHTML = `
      <div class="studio-control-group studio-control-group-two" aria-label="图层排列操作">
        <button type="button" data-testid="arrange-duplicate">复制图层</button>
        <button type="button" data-testid="arrange-delete">删除图层</button>
        <button type="button" data-testid="arrange-up">上移图层</button>
        <button type="button" data-testid="arrange-down">下移图层</button>
      </div>
      <label class="studio-control-range">不透明度 <output data-arrange-opacity-output>${opacity}%</output>
        <input type="range" min="0" max="100" value="${opacity}" data-testid="arrange-opacity" ${locked ? 'disabled' : ''}>
      </label>
      <div class="studio-control-group studio-control-group-two" aria-label="图层变换操作">
        <button type="button" data-testid="arrange-rotate-left" ${locked ? 'disabled' : ''}>向左旋转</button>
        <button type="button" data-testid="arrange-rotate-right" ${locked ? 'disabled' : ''}>向右旋转</button>
        <button type="button" data-testid="arrange-flip-horizontal" ${locked ? 'disabled' : ''}>水平翻转</button>
        <button type="button" data-testid="arrange-flip-vertical" ${locked ? 'disabled' : ''}>垂直翻转</button>
      </div>
      <div class="studio-control-group studio-control-group-two" aria-label="新增图层内容">
        <button type="button" data-testid="arrange-open-image">添加图片</button>
        <button type="button" data-core-tool="text">添加文字</button>
        <button type="button" data-core-tool="shape">绘制形状</button>
      </div>
    `;
    target.querySelector('[data-testid="arrange-duplicate"]')?.addEventListener('click', () => invokeEditorModule('layer/duplicate', 'duplicate'));
    target.querySelector('[data-testid="arrange-delete"]')?.addEventListener('click', () => invokeEditorModule('layer/delete', 'delete'));
    target.querySelector('[data-testid="arrange-up"]')?.addEventListener('click', () => invokeEditorModule('layer/move', 'up'));
    target.querySelector('[data-testid="arrange-down"]')?.addEventListener('click', () => invokeEditorModule('layer/move', 'down'));
    target.querySelector('[data-testid="arrange-open-image"]')?.addEventListener('click', () => window.FileOpen?.open_file());
    const opacityInput = target.querySelector('[data-testid="arrange-opacity"]');
    const opacityOutput = target.querySelector('[data-arrange-opacity-output]');
    opacityInput?.addEventListener('input', () => {
      opacityOutput.textContent = `${opacityInput.value}%`;
      opacityOutput.value = String(opacityInput.value);
    });
    opacityInput?.addEventListener('change', () => updateActiveLayer({ opacity: Number(opacityInput.value) }));
    target.querySelector('[data-testid="arrange-rotate-left"]')?.addEventListener('click', () => {
      if (activeLayerIsEditable()) invokeEditorModule('image/rotate', 'left');
    });
    target.querySelector('[data-testid="arrange-rotate-right"]')?.addEventListener('click', () => {
      if (activeLayerIsEditable()) invokeEditorModule('image/rotate', 'right');
    });
    target.querySelector('[data-testid="arrange-flip-horizontal"]')?.addEventListener('click', () => {
      if (activeLayerIsEditable()) invokeEditorModule('image/flip', 'horizontal');
    });
    target.querySelector('[data-testid="arrange-flip-vertical"]')?.addEventListener('click', () => {
      if (activeLayerIsEditable()) invokeEditorModule('image/flip', 'vertical');
    });
    target.querySelectorAll('[data-core-tool]').forEach((button) => {
      button.addEventListener('click', () => activateCoreTool(button.dataset.coreTool));
    });
    return;
  }

  if (key === 'effect' || key === 'filter') {
    target.innerHTML = `
      <div class="studio-control-group studio-control-group-two" aria-label="本地效果">
        <button type="button" data-testid="${key}-browser">浏览本地${key === 'effect' ? '效果' : '滤镜'}</button>
        <button type="button" data-testid="${key}-contrast">对比度</button>
        <button type="button" data-testid="${key}-blur">模糊</button>
      </div>
    `;
    target.querySelector(`[data-testid="${key}-browser"]`)?.addEventListener('click', () => invokeEditorModule('effects/browser', 'browser'));
    target.querySelector(`[data-testid="${key}-contrast"]`)?.addEventListener('click', () => invokeEditorModule('effects/common/contrast', 'contrast'));
    target.querySelector(`[data-testid="${key}-blur"]`)?.addEventListener('click', () => invokeEditorModule('effects/common/blur', 'blur'));
    return;
  }

  const coreControls = {
    liquify: [['膨胀/收缩', 'bulge_pinch']],
    retouch: [['克隆', 'clone'], ['局部模糊', 'blur'], ['局部锐化', 'sharpen']],
    drawing: [['画笔', 'brush'], ['铅笔', 'pencil'], ['填充', 'fill'], ['形状', 'shape']],
    text: [['文字工具', 'text']],
  };
  const controls = coreControls[key];
  if (!controls) {
    target.replaceChildren();
    return;
  }
  target.innerHTML = `<div class="studio-control-group studio-control-group-two">${controls.map(([label, coreTool]) => `<button type="button" data-core-tool="${coreTool}">${label}</button>`).join('')}</div>`;
  target.querySelectorAll('[data-core-tool]').forEach((button) => {
    button.addEventListener('click', () => activateCoreTool(button.dataset.coreTool));
  });
}

function makeThumbnail() {
  const source = document.getElementById('canvas_minipaint');
  if (!source?.width || !source?.height) return null;
  const scale = Math.min(320 / source.width, 200 / source.height, 1);
  const thumbnail = document.createElement('canvas');
  thumbnail.width = Math.max(1, Math.round(source.width * scale));
  thumbnail.height = Math.max(1, Math.round(source.height * scale));
  thumbnail.getContext('2d').drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
  return thumbnail.toDataURL('image/jpeg', 0.78);
}

async function saveLocalProject() {
  if (!window.FileSave || !window.AppConfig?.layers?.length) return null;
  updateSaveLabel('正在保存…');
  const project = await projectStore.saveProject({
    id: currentProjectId,
    name: currentProjectName,
    document: window.FileSave.export_as_json(),
    thumbnail: makeThumbnail(),
  });
  currentProjectId = project.id;
  currentProjectName = project.name;
  updateSaveLabel('已保存本地项目');
  window.setTimeout(() => updateSaveLabel('保存本地项目'), 1400);
  return project;
}

async function restoreHandoff() {
  const handoff = await projectStore.takeHandoff();
  if (!handoff) return false;
  if (handoff.kind === 'file' && handoff.file) {
    currentProjectName = normalizeProjectName(handoff.file.name);
    await window.FileOpen.open_handler({ target: { files: [handoff.file] } });
    return true;
  }
  if (handoff.kind === 'project' && handoff.projectId) {
    const project = await projectStore.getProject(handoff.projectId);
    if (!project) return false;
    currentProjectId = project.id;
    currentProjectName = project.name;
    await window.FileOpen.load_json(project.document);
    return true;
  }
  return false;
}

async function activateEditorTool(key) {
  const tool = EDITOR_TOOL_REGISTRY[key];
  if (!tool) return;
  const panel = document.querySelector('[data-testid="editor-tool-panel"]');
  const title = document.querySelector('[data-editor-tool-title]');
  const description = document.querySelector('[data-editor-tool-description]');
  document.querySelectorAll('[data-editor-tool]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.editorTool === key);
  });
  if (title) title.textContent = tool.label;
  if (description) description.textContent = tool.description;
  if (panel) panel.hidden = false;
  renderEditorToolControls(key);
  await activateCoreTool(tool.coreTool);
  updateCanvasStatus();
}

async function activateEditorToolMode(coreTool) {
  if (!MANUAL_CUTOUT_TOOLS.includes(coreTool)) return;
  await activateCoreTool(coreTool);
}

function bindWorkbenchControls() {
  document.querySelectorAll('[data-editor-tool]').forEach((button) => {
    button.addEventListener('click', () => activateEditorTool(button.dataset.editorTool));
  });
  document.querySelector('[data-editor-panel-close]')?.addEventListener('click', () => {
    const panel = document.querySelector('[data-testid="editor-tool-panel"]');
    if (panel) panel.hidden = true;
  });
  const refreshLayers = () => window.app?.GUI?.GUI_layers?.render_layers?.();
  document.querySelector('[data-editor-history="undo"]')?.addEventListener('click', async () => {
    await window.State?.undo_action?.();
    refreshLayers();
  });
  document.querySelector('[data-editor-history="redo"]')?.addEventListener('click', async () => {
    await window.State?.redo_action?.();
    refreshLayers();
  });
  document.querySelector('[data-editor-zoom="out"]')?.addEventListener('click', () => document.getElementById('zoom_less')?.click());
  document.querySelector('[data-editor-zoom="in"]')?.addEventListener('click', () => document.getElementById('zoom_more')?.click());
  document.querySelector('[data-testid="export-image"]')?.addEventListener('click', () => window.FileSave?.export());
  document.querySelector('[data-testid="layers-rail-close"]')?.addEventListener('click', (event) => {
    const collapsed = document.body.classList.toggle('layers-collapsed');
    event.currentTarget.setAttribute('aria-pressed', String(collapsed));
    event.currentTarget.setAttribute('aria-label', collapsed ? '展开图层轨' : '收起图层轨');
  });
  window.setInterval(updateCanvasStatus, 300);
}

function registerEditorShell() {
  document.body.classList.add('photo-studio-editor');
  const canvas = document.getElementById('canvas_minipaint');
  document.body.dataset.liquifyAcceleration = shouldUseWebGL2(canvas) ? 'webgl2' : 'unavailable';
  document.body.dataset.manualCutoutTools = MANUAL_CUTOUT_TOOLS.join(',');
  window.PhotoStudio = {
    manualCutoutTools: MANUAL_CUTOUT_TOOLS,
    editorTools: EDITOR_TOOL_REGISTRY,
    activateEditorTool,
    activateEditorToolMode,
    saveLocalProject,
  };
  document.querySelector('[data-testid="save-local-project"]')?.addEventListener('click', saveLocalProject);
  bindWorkbenchControls();
  window.addEventListener('pagehide', () => { saveLocalProject().catch(() => undefined); });
  window.setInterval(() => { saveLocalProject().catch(() => undefined); }, 30000);
  restoreHandoff()
    .then((handoff) => {
      if (!handoff) setupCollageFromQuery();
      updateCanvasStatus();
    })
    .catch(() => updateSaveLabel('本地项目恢复失败'));
  updateCanvasStatus();
}

if (typeof window !== 'undefined') {
  window.addEventListener('photo-studio:ready', registerEditorShell, { once: true });
}
