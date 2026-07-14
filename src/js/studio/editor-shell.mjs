import { isNativeProjectDocument, isSupportedImage, normalizeProjectName, projectStore } from './project-store.mjs';

export const MANUAL_CUTOUT_TOOLS = ['selection', 'magic_erase', 'erase'];
const CUTOUT_SHAPE_MODES = new Set(['lasso', 'ellipse', 'triangle', 'star', 'heart']);

let cutoutSelection = {
  mode: 'selection',
  operation: 'replace',
  inverted: false,
  regions: [],
};
let cutoutPointer = null;
let cutoutTouchSession = null;
let cutoutCoreEventShieldActive = false;

function hasUnsupportedCutoutRotation(layer = window.AppConfig?.layer) {
  const rotation = Number(layer?.rotate ?? 0);
  if (!Number.isFinite(rotation)) return true;
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized > 0.0001 && Math.abs(normalized - 360) > 0.0001;
}

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
  const probe = canvas ?? (typeof document !== 'undefined' ? document.createElement('canvas') : null);
  return Boolean(probe?.getContext?.('webgl2'));
}

let currentProjectId = null;
let currentProjectName = '未命名项目';
let collageWorkspace = null;

const EXPORT_TYPES = Object.freeze({
  png: 'PNG - Portable Network Graphics',
  jpeg: 'JPG - JPG/JPEG Format',
  webp: 'WEBP - Weppy File Format',
});

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

function setToolAttributeValue(name, attribute, value) {
  const tool = findToolConfig(name);
  if (!tool?.attributes) return;
  const current = tool.attributes[attribute];
  if (current && typeof current === 'object' && Object.hasOwn(current, 'value')) {
    current.value = value;
  } else {
    tool.attributes[attribute] = value;
  }
}

function applyTextToolAttribute(attribute, value) {
  setToolAttributeValue('text', attribute, value);
  const layer = window.AppConfig?.layer;
  const layerParamAttributes = new Set([
    'align', 'shadow_enabled', 'shadow_color', 'shadow_blur', 'shadow_x', 'shadow_y',
    'background_enabled', 'background_color', 'background_opacity', 'curve', 'warp',
  ]);
  if (layerParamAttributes.has(attribute) && layer?.type === 'text' && !layer.locked) {
    const property = attribute === 'align' ? 'halign' : attribute;
    updateActiveLayer({ params: { ...layer.params, [property]: value } });
    return;
  }
  const textTool = getCoreToolModule('text');
  if (layer?.type !== 'text' || layer.locked || typeof textTool?.on_params_update !== 'function') return;
  textTool.on_params_update({ key: attribute, value });
}

async function activateCoreTool(coreTool) {
  if (!coreTool) return false;
  // The workbench shell loads before miniPaint finishes registering every
  // core module. A first click must wait for that real module instead of
  // silently leaving the previously active tool (usually Brush) in charge.
  let guiTools = window.app?.GUI?.GUI_tools;
  for (let attempt = 0; attempt < 40 && !guiTools?.tools_modules?.[coreTool]; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    guiTools = window.app?.GUI?.GUI_tools;
  }
  if (!guiTools?.tools_modules?.[coreTool]) return false;
  await guiTools.activate_tool(coreTool);
  document.body.dataset.canvasToolMode = coreTool === 'noop' ? 'inactive' : coreTool;
  updateCanvasStatus();
  return true;
}

async function deactivateCoreTool() {
  // Use the core lifecycle so the previous tool's `on_leave` cleanup runs.
  // `select` is safe on a locked layer and remains a real, persisted miniPaint tool.
  await activateCoreTool('select');
  document.body.dataset.canvasToolMode = 'inactive';
}

function invokeEditorModule(path, method, ...args) {
  const module = window.app?.GUI?.modules?.[path];
  if (typeof module?.[method] !== 'function') return null;
  return module[method](...args);
}

function getCoreToolModule(name) {
  return window.app?.GUI?.GUI_tools?.tools_modules?.[name]?.object || null;
}

function activeLayerIsEditable() {
  return Boolean(window.AppConfig?.layer) && !window.AppConfig.layer.locked;
}

function activeImageLayerIsEditable() {
  return activeLayerIsEditable() && window.AppConfig.layer.type === 'image';
}

// Crop is a document operation: it moves every populated layer and can change
// the canvas bounds.  Looking only at the active raster layer made a text or
// shape layer appear unavailable (and worse, could advertise an enabled apply
// button when another affected layer was locked).
function cropDocumentIsEditable() {
  const layers = window.AppConfig?.layers;
  if (!Array.isArray(layers)) return false;
  return layers.every((layer) => layer?.type == null || !layer.locked);
}

function cloneCutoutSelection() {
  return JSON.parse(JSON.stringify(cutoutSelection));
}

function getRectangleCutoutRegion() {
  const selection = getCoreToolModule('selection')?.selection;
  if (!selection || !Number.isFinite(selection.x) || !Number.isFinite(selection.y)
    || !Number.isFinite(selection.width) || !Number.isFinite(selection.height)
    || selection.width <= 0 || selection.height <= 0) return null;
  return {
    shape: 'rectangle',
    operation: 'replace',
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
  };
}

function currentCutoutRegions() {
  return cutoutSelection.regions.length > 0
    ? cutoutSelection.regions
    : cutoutSelection.mode === 'selection'
      ? [getRectangleCutoutRegion()].filter(Boolean)
      : [];
}

function resetCutoutSelection() {
  const previousMode = cutoutSelection.mode;
  cutoutSelection = { mode: 'selection', operation: 'replace', inverted: false, regions: [] };
  const selection = getCoreToolModule('selection');
  // A custom mask must never mutate miniPaint's rectangle-selection state.
  // Only an explicit reset while using the native rectangle mode clears it.
  if (previousMode === 'selection') selection?.clear_selection?.();
  window.AppConfig.need_render = true;
}

function addCutoutRegion(region) {
  if (cutoutSelection.operation === 'replace' || cutoutSelection.regions.length === 0) {
    cutoutSelection.regions = [{ ...region, operation: 'replace' }];
  } else {
    cutoutSelection.regions.push({ ...region, operation: cutoutSelection.operation });
  }
  window.AppConfig.need_render = true;
}

function cutoutCanvasPoint(event) {
  const canvas = document.getElementById('canvas_minipaint');
  const selectionTool = getCoreToolModule('selection');
  const canvasOffset = selectionTool?.Base_gui?.canvas_offset;
  const toWorld = selectionTool?.Base_layers?.get_world_coords;
  if (!canvas || !canvasOffset || typeof toWorld !== 'function') return null;
  const pageX = Number.isFinite(event.pageX) ? event.pageX : event.clientX + window.scrollX;
  const pageY = Number.isFinite(event.pageY) ? event.pageY : event.clientY + window.scrollY;
  const point = toWorld(pageX - canvasOffset.x, pageY - canvasOffset.y);
  const width = window.AppConfig?.WIDTH;
  const height = window.AppConfig?.HEIGHT;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !width || !height) return null;
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  };
}

function drawCutoutRegion(context, region, layer) {
  const scaleX = context.canvas.width / (layer.width || layer.width_original || context.canvas.width);
  const scaleY = context.canvas.height / (layer.height || layer.height_original || context.canvas.height);
  const map = (point) => ({ x: (point.x - layer.x) * scaleX, y: (point.y - layer.y) * scaleY });
  context.beginPath();
  if (region.shape === 'lasso') {
    const [first, ...rest] = region.points.map(map);
    if (!first || rest.length < 2) return;
    context.moveTo(first.x, first.y);
    rest.forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
  } else if (region.shape === 'ellipse') {
    const start = map({ x: region.x, y: region.y });
    const end = map({ x: region.x + region.width, y: region.y + region.height });
    context.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2,
      Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2);
  } else if (region.shape === 'triangle' || region.shape === 'star' || region.shape === 'heart') {
    const centerX = region.x + region.width / 2;
    const centerY = region.y + region.height / 2;
    const points = [];
    if (region.shape === 'triangle') {
      points.push(
        { x: centerX, y: region.y },
        { x: region.x + region.width, y: region.y + region.height },
        { x: region.x, y: region.y + region.height },
      );
    } else if (region.shape === 'star') {
      const outerX = region.width / 2;
      const outerY = region.height / 2;
      for (let index = 0; index < 10; index += 1) {
        const radius = index % 2 === 0 ? 1 : 0.45;
        const angle = -Math.PI / 2 + index * Math.PI / 5;
        points.push({
          x: centerX + Math.cos(angle) * outerX * radius,
          y: centerY + Math.sin(angle) * outerY * radius,
        });
      }
    } else {
      // A 32-point parametric path gives the familiar heart contour while
      // remaining a regular browser-local canvas mask (no model inference).
      for (let index = 0; index < 32; index += 1) {
        const angle = index * Math.PI * 2 / 32;
        const x = 16 * Math.sin(angle) ** 3;
        const y = -(13 * Math.cos(angle) - 5 * Math.cos(2 * angle)
          - 2 * Math.cos(3 * angle) - Math.cos(4 * angle));
        points.push({
          x: centerX + x * region.width / 32,
          y: centerY + y * region.height / 34,
        });
      }
    }
    const [first, ...rest] = points.map(map);
    context.moveTo(first.x, first.y);
    rest.forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
  } else {
    const start = map({ x: region.x, y: region.y });
    const end = map({ x: region.x + region.width, y: region.y + region.height });
    context.rect(start.x, start.y, end.x - start.x, end.y - start.y);
  }
  context.fill();
}

function layerImageDimensions(layer) {
  const width = layer?.width_original || layer?.link?.naturalWidth || layer?.link?.width;
  const height = layer?.height_original || layer?.link?.naturalHeight || layer?.link?.height;
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height }
    : null;
}

function createCutoutMask(regions, layer, inverted) {
  const dimensions = layerImageDimensions(layer);
  if (!dimensions) return null;
  const mask = document.createElement('canvas');
  mask.width = dimensions.width;
  mask.height = dimensions.height;
  const context = mask.getContext('2d');
  context.fillStyle = '#fff';
  for (const region of regions) {
    if (region.operation === 'replace') context.clearRect(0, 0, mask.width, mask.height);
    context.globalCompositeOperation = region.operation === 'subtract' ? 'destination-out' : 'source-over';
    drawCutoutRegion(context, region, layer);
  }
  context.globalCompositeOperation = 'source-over';
  if (!inverted) return mask;
  const inverse = document.createElement('canvas');
  inverse.width = mask.width;
  inverse.height = mask.height;
  const inverseContext = inverse.getContext('2d');
  inverseContext.fillStyle = '#fff';
  inverseContext.fillRect(0, 0, inverse.width, inverse.height);
  inverseContext.globalCompositeOperation = 'destination-out';
  inverseContext.drawImage(mask, 0, 0);
  return inverse;
}

async function applyCutoutSelection(intent) {
  if (!activeImageLayerIsEditable() || hasUnsupportedCutoutRotation()) return false;
  const regions = currentCutoutRegions();
  if (regions.length === 0) return false;
  const layer = window.AppConfig.layer;
  const dimensions = layerImageDimensions(layer);
  if (!dimensions) return false;
  const result = document.createElement('canvas');
  result.width = dimensions.width;
  result.height = dimensions.height;
  const context = result.getContext('2d');
  context.drawImage(layer.link, 0, 0);
  const mask = createCutoutMask(regions, layer, cutoutSelection.inverted);
  if (!mask) return false;
  context.globalCompositeOperation = intent === 'keep' ? 'destination-in' : 'destination-out';
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = 'source-over';
  await window.State.do_action(new window.app.Actions.Update_layer_image_action(result));
  if (cutoutSelection.regions.length === 0) {
    const selection = getCoreToolModule('selection');
    if (selection?.selection) {
      selection.selection = { x: null, y: null, width: null, height: null };
      window.AppConfig.need_render = true;
    }
  }
  return true;
}

function isCutoutCanvasMouseEvent(event) {
  const canvas = document.getElementById('canvas_minipaint');
  return Boolean(canvas && (event.target === canvas || canvas.contains(event.target)));
}

function shieldCutoutCoreMouseEvent(event) {
  if (!cutoutCoreEventShieldActive || !CUTOUT_SHAPE_MODES.has(cutoutSelection.mode)) return;
  if (!cutoutPointer && !isCutoutCanvasMouseEvent(event)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function releaseCutoutPointer(canvas = document.getElementById('canvas_minipaint'), pointerId) {
  if (!cutoutPointer || (pointerId != null && cutoutPointer.pointerId !== pointerId)) return null;
  const gesture = cutoutPointer;
  cutoutPointer = null;
  if (gesture.source !== 'touch' && canvas?.hasPointerCapture?.(gesture.pointerId)) {
    try {
      canvas.releasePointerCapture(gesture.pointerId);
    } catch {
      // Browsers can release capture automatically during cancellation.
    }
  }
  return gesture;
}

function touchIdentifiers(event) {
  return new Set(Array.from(event?.touches ?? [], (touch) => touch.identifier));
}

function beginCutoutTouchSession(event) {
  const wasActive = Boolean(cutoutTouchSession);
  if (!cutoutTouchSession) {
    // A native touch session outlives the Cutout tool handoff.  A user can
    // switch tools (or lock the layer) while fingers are still down; in that
    // case we cancel only the custom selection path, but retain ownership of
    // every native touch event until the browser reports the session ended.
    cutoutTouchSession = { activeTouchIds: new Set(), ownerPointerId: null, handoffActive: false };
  }
  cutoutTouchSession.activeTouchIds = touchIdentifiers(event);
  return { session: cutoutTouchSession, wasActive };
}

function reconcileCutoutTouchSession(event) {
  if (!cutoutTouchSession) return null;
  cutoutTouchSession.activeTouchIds = touchIdentifiers(event);
  if (cutoutTouchSession.activeTouchIds.size === 0) {
    cutoutTouchSession = null;
    return null;
  }
  return cutoutTouchSession;
}

function canStartCutoutTouchHandoff() {
  return cutoutCoreEventShieldActive && CUTOUT_SHAPE_MODES.has(cutoutSelection.mode)
    && activeImageLayerIsEditable() && !hasUnsupportedCutoutRotation();
}

function cancelCutoutTouchHandoff(canvas = document.getElementById('canvas_minipaint')) {
  if (!cutoutTouchSession) return;
  if (cutoutPointer?.source === 'touch') releaseCutoutPointer(canvas, cutoutPointer.pointerId);
  cutoutTouchSession.ownerPointerId = null;
  cutoutTouchSession.handoffActive = false;
}

function installCutoutCoreEventShield() {
  if (cutoutCoreEventShieldActive) return;
  cutoutCoreEventShieldActive = true;
  ['mousedown', 'mousemove', 'mouseup'].forEach((type) => {
    document.addEventListener(type, shieldCutoutCoreMouseEvent, true);
  });
}

function uninstallCutoutCoreEventShield() {
  if (cutoutCoreEventShieldActive) {
    cutoutCoreEventShieldActive = false;
    ['mousedown', 'mousemove', 'mouseup'].forEach((type) => {
      document.removeEventListener(type, shieldCutoutCoreMouseEvent, true);
    });
  }
  // Do not clear an in-flight native touch session here.  The event handlers
  // stay bound for the page lifetime and must continue swallowing its move/end
  // /cancel events after a switch to another miniPaint tool.
  if (cutoutTouchSession) {
    cancelCutoutTouchHandoff();
  } else {
    releaseCutoutPointer();
  }
}

function bindCutoutCanvasGestures() {
  const canvas = document.getElementById('canvas_minipaint');
  if (!canvas || canvas.dataset.cutoutGesturesBound === 'true') return;
  canvas.dataset.cutoutGesturesBound = 'true';
  const finishCutoutGesture = (gesture, point) => {
    if (!gesture || !point) return;
    const region = cutoutSelection.mode === 'lasso'
      ? { shape: 'lasso', points: [...gesture.points, point] }
      : {
        shape: cutoutSelection.mode,
        x: Math.min(gesture.start.x, point.x),
        y: Math.min(gesture.start.y, point.y),
        width: Math.abs(point.x - gesture.start.x),
        height: Math.abs(point.y - gesture.start.y),
      };
    if ((region.shape === 'lasso' && region.points.length < 4)
      || (region.shape !== 'lasso' && (!region.width || !region.height))) return;
    addCutoutRegion(region);
  };
  canvas.addEventListener('touchstart', (event) => {
    const canStartHandoff = canStartCutoutTouchHandoff();
    if (!cutoutTouchSession && !canStartHandoff) return;
    const { session, wasActive } = beginCutoutTouchSession(event);
    const touch = event.changedTouches?.[0];
    // One native touch session has one owner. Once a first touch has begun,
    // every later touch is swallowed until every original/replacement touch
    // has ended or been cancelled; it can never start a second Cutout path.
    if (!wasActive && canStartHandoff && touch && !cutoutPointer) {
      const point = cutoutCanvasPoint(touch);
      if (point) {
        cutoutPointer = { pointerId: touch.identifier, start: point, points: [point], source: 'touch' };
        session.ownerPointerId = touch.identifier;
        session.handoffActive = true;
      }
    }
    // Stop every native touch event at the canvas. miniPaint's document-level
    // select listeners must never receive a second finger while Cutout owns it.
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, passive: false });
  canvas.addEventListener('touchmove', (event) => {
    if (!cutoutTouchSession) return;
    if (cutoutTouchSession.handoffActive && !canStartCutoutTouchHandoff()) cancelCutoutTouchHandoff(canvas);
    const touch = cutoutTouchSession.handoffActive && cutoutPointer?.source === 'touch'
      ? [...event.touches].find((item) => item.identifier === cutoutPointer.pointerId)
      : null;
    const point = touch && cutoutCanvasPoint(touch);
    if (point) cutoutPointer.points.push(point);
    reconcileCutoutTouchSession(event);
    // Cutout owns the full native touch lifecycle, not only the interval in
    // which its first pointer is still active. A second finger can remain
    // after the first one finishes; it must never fall through to miniPaint.
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, passive: false });
  canvas.addEventListener('touchend', (event) => {
    if (!cutoutTouchSession) return;
    if (cutoutTouchSession.handoffActive && !canStartCutoutTouchHandoff()) cancelCutoutTouchHandoff(canvas);
    const touch = cutoutTouchSession.handoffActive && cutoutPointer?.source === 'touch'
      ? [...event.changedTouches].find((item) => item.identifier === cutoutPointer.pointerId)
      : null;
    if (touch) {
      const gesture = releaseCutoutPointer(canvas, touch.identifier);
      if (cutoutTouchSession) {
        cutoutTouchSession.ownerPointerId = null;
        cutoutTouchSession.handoffActive = false;
      }
      finishCutoutGesture(gesture, cutoutCanvasPoint(touch));
    }
    reconcileCutoutTouchSession(event);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, passive: false });
  canvas.addEventListener('touchcancel', (event) => {
    if (!cutoutTouchSession) return;
    if (cutoutTouchSession.handoffActive && !canStartCutoutTouchHandoff()) cancelCutoutTouchHandoff(canvas);
    const touch = cutoutTouchSession.handoffActive && cutoutPointer?.source === 'touch'
      ? [...event.changedTouches].find((item) => item.identifier === cutoutPointer.pointerId)
      : null;
    if (touch) {
      releaseCutoutPointer(canvas, touch.identifier);
      if (cutoutTouchSession) {
        cutoutTouchSession.ownerPointerId = null;
        cutoutTouchSession.handoffActive = false;
      }
    }
    reconcileCutoutTouchSession(event);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, passive: false });
  canvas.addEventListener('pointerdown', (event) => {
    if (!cutoutCoreEventShieldActive || !CUTOUT_SHAPE_MODES.has(cutoutSelection.mode)
      || !activeImageLayerIsEditable() || hasUnsupportedCutoutRotation()) return;
    if (event.pointerType === 'touch') return;
    // A shape gesture has exactly one owner. Do not replace its state or
    // acquire capture for a second touch while the first pointer is active.
    if (cutoutPointer) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const point = cutoutCanvasPoint(event);
    if (!point) return;
    cutoutPointer = { pointerId: event.pointerId, start: point, points: [point] };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      releaseCutoutPointer(canvas, event.pointerId);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    if (!cutoutPointer) return;
    if (cutoutPointer.pointerId !== event.pointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const point = cutoutCanvasPoint(event);
    if (!point) return;
    cutoutPointer.points.push(point);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') return;
    if (cutoutPointer && cutoutPointer.pointerId !== event.pointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const gesture = releaseCutoutPointer(canvas, event.pointerId);
    if (!gesture) return;
    const point = cutoutCanvasPoint(event);
    if (!point) return;
    finishCutoutGesture(gesture, point);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  const cancelCutoutPointer = (event) => {
    if (event.pointerType === 'touch') return;
    if (cutoutPointer && cutoutPointer.pointerId !== event.pointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const gesture = releaseCutoutPointer(canvas, event.pointerId);
    if (!gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  canvas.addEventListener('pointercancel', cancelCutoutPointer, true);
  canvas.addEventListener('lostpointercapture', cancelCutoutPointer, true);
}

function invokeEditableImageModule(path, method, ...args) {
  if (!activeImageLayerIsEditable()) return false;
  return invokeEditorModule(path, method, ...args);
}

function getLiquifyAvailability() {
  const webgl2Available = shouldUseWebGL2();
  const layer = window.AppConfig?.layer;
  const editableImageLayer = Boolean(layer && layer.type === 'image' && !layer.locked);
  if (!webgl2Available) {
    return { webgl2Available, editableImageLayer, enabled: false, message: '仅本地 WebGL2 可用；当前浏览器已禁用液化。' };
  }
  if (!editableImageLayer) {
    return { webgl2Available, editableImageLayer, enabled: false, message: '请选择未锁定的图片图层后使用液化。' };
  }
  return { webgl2Available, editableImageLayer, enabled: true, message: '本地 WebGL2 已启用；每次笔触都会写入本地历史。' };
}

async function updateActiveLayer(settings) {
  if (!activeLayerIsEditable() || !window.app?.Actions?.Update_layer_action || !window.State?.do_action) return false;
  await window.State.do_action(new window.app.Actions.Update_layer_action(window.AppConfig.layer.id, settings));
  window.app?.GUI?.GUI_layers?.render_layers?.();
  return true;
}

function normalizeLayerName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function normalizeLayerRotation(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = parsed % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function readArrangeTransform(target, layer) {
  const read = (testId, fallback, minimum = Number.NEGATIVE_INFINITY) => {
    const value = Number(target.querySelector(`[data-testid="${testId}"]`)?.value);
    return Number.isFinite(value) && value >= minimum ? value : fallback;
  };
  return {
    x: read('arrange-x', Number(layer.x) || 0),
    y: read('arrange-y', Number(layer.y) || 0),
    width: read('arrange-width', Number(layer.width) || 1, 1),
    height: read('arrange-height', Number(layer.height) || 1, 1),
    rotate: normalizeLayerRotation(read('arrange-rotation', Number(layer.rotate) || 0)),
  };
}

async function insertArrangeFrame() {
  const width = Number(window.AppConfig?.WIDTH);
  const height = Number(window.AppConfig?.HEIGHT);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2
    || !window.app?.Actions?.Insert_layer_action || !window.app?.Actions?.Bundle_action || !window.State?.do_action) return false;
  const inset = Math.max(8, Math.round(Math.min(width, height) * 0.05));
  const frame = {
    type: 'rectangle',
    name: 'Frame',
    x: inset,
    y: inset,
    width: Math.max(1, width - inset * 2),
    height: Math.max(1, height - inset * 2),
    rotate: 0,
    is_vector: true,
    color: null,
    render_function: ['rectangle', 'render'],
    params: {
      fill: false,
      border: true,
      border_color: '#ffffff',
      border_size: Math.max(2, Math.round(Math.min(width, height) * 0.006)),
      radius: 0,
    },
  };
  await window.State.do_action(new window.app.Actions.Bundle_action('add_arrange_frame', 'Add Frame', [
    // Keep the normal insert lifecycle here: on a blank document it replaces
    // miniPaint's type:null starter layer instead of leaving a ghost layer.
    new window.app.Actions.Insert_layer_action(frame),
  ]));
  window.app?.GUI?.GUI_layers?.render_layers?.();
  return true;
}

function getCollageSlotRect(layout, slotIndex) {
  const column = slotIndex % layout.columns;
  const row = Math.floor(slotIndex / layout.columns);
  const left = Math.round(window.AppConfig.WIDTH * column / layout.columns);
  const top = Math.round(window.AppConfig.HEIGHT * row / layout.rows);
  const right = Math.round(window.AppConfig.WIDTH * (column + 1) / layout.columns);
  const bottom = Math.round(window.AppConfig.HEIGHT * (row + 1) / layout.rows);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function findCollageSlotLayer(slotIndex) {
  return window.AppConfig?.layers?.find((layer) => Number(layer?.params?.collage_slot) === slotIndex) ?? null;
}

function loadLocalImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法解码本地图片。'));
    image.src = source;
  });
}

function readLocalImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取本地图片。'));
    reader.onload = () => loadLocalImage(reader.result).then(resolve, reject);
    reader.readAsDataURL(file);
  });
}

function normalizeCollageTransform(params = {}) {
  const clamp = (value, minimum, maximum, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
  };
  return {
    collage_zoom: clamp(params.collage_zoom, 1, 3, 1),
    collage_offset_x: clamp(params.collage_offset_x, -100, 100, 0),
    collage_offset_y: clamp(params.collage_offset_y, -100, 100, 0),
  };
}

function renderCollageSlot(image, rect, params = {}) {
  const transform = normalizeCollageTransform(params);
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext('2d');
  const coverScale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const drawWidth = Math.ceil(image.naturalWidth * coverScale * transform.collage_zoom);
  const drawHeight = Math.ceil(image.naturalHeight * coverScale * transform.collage_zoom);
  const overflowX = Math.max(0, (drawWidth - rect.width) / 2);
  const overflowY = Math.max(0, (drawHeight - rect.height) / 2);
  const drawX = Math.round((rect.width - drawWidth) / 2 + overflowX * transform.collage_offset_x / 100);
  const drawY = Math.round((rect.height - drawHeight) / 2 + overflowY * transform.collage_offset_y / 100);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  return canvas;
}

async function placeCollageImage(file) {
  const workspace = collageWorkspace;
  if (!workspace || !file || !isSupportedImage(file)) return false;
  const { layout, selectedSlot } = workspace;
  const rect = getCollageSlotRect(layout, selectedSlot);
  if (rect.width <= 0 || rect.height <= 0 || !window.app?.Actions?.Insert_layer_action) return false;
  const image = await readLocalImage(file);
  const transform = normalizeCollageTransform();
  const canvas = renderCollageSlot(image, rect, transform);

  const replacement = {
    name: `拼贴 ${selectedSlot + 1} - ${file.name}`,
    type: 'image',
    data: canvas.toDataURL('image/png'),
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    width_original: rect.width,
    height_original: rect.height,
    params: {
      collage_slot: selectedSlot,
      collage_source: image.src,
      ...transform,
    },
  };
  const existing = findCollageSlotLayer(selectedSlot);
  const actions = [];
  if (existing) actions.push(new window.app.Actions.Delete_layer_action(existing.id, true));
  actions.push(new window.app.Actions.Insert_layer_action(replacement));
  await window.State.do_action(new window.app.Actions.Bundle_action(`set_collage_slot_${selectedSlot}`, 'Set Collage Slot', actions));
  window.app?.GUI?.GUI_layers?.render_layers?.();
  renderCollageWorkspace();
  return true;
}

async function updateCollageSlotTransform(settings) {
  const workspace = collageWorkspace;
  const layer = workspace && findCollageSlotLayer(workspace.selectedSlot);
  if (!workspace || !layer?.params?.collage_source || !window.app?.Actions?.Update_layer_image_action
    || !window.app?.Actions?.Update_layer_action || !window.app?.Actions?.Bundle_action || !window.State?.do_action) return false;
  const rect = getCollageSlotRect(workspace.layout, workspace.selectedSlot);
  const transform = normalizeCollageTransform({ ...layer.params, ...settings });
  const image = await loadLocalImage(layer.params.collage_source);
  const canvas = renderCollageSlot(image, rect, transform);
  await window.State.do_action(new window.app.Actions.Bundle_action(
    `adjust_collage_slot_${workspace.selectedSlot}`,
    'Adjust Collage Slot',
    [
      new window.app.Actions.Update_layer_image_action(canvas, layer.id),
      new window.app.Actions.Update_layer_action(layer.id, {
        params: { ...layer.params, ...transform },
      }),
    ],
  ));
  window.app?.GUI?.GUI_layers?.render_layers?.();
  renderCollageWorkspace();
  return true;
}

function renderCollageWorkspace() {
  const workspace = collageWorkspace;
  if (!workspace) return;
  const panel = document.querySelector('[data-testid="editor-tool-panel"]');
  const title = document.querySelector('[data-editor-tool-title]');
  const description = document.querySelector('[data-editor-tool-description]');
  const target = document.querySelector('[data-editor-tool-controls]');
  const attributes = document.getElementById('action_attributes');
  if (!panel || !target) return;
  panel.hidden = false;
  if (title) title.textContent = '拼贴';
  if (description) description.textContent = '选择分格后拖入或选择本地图片；图片会覆盖式裁切为该格尺寸。';
  if (attributes) {
    attributes.innerHTML = '';
    attributes.hidden = true;
  }
  const slots = Array.from({ length: workspace.layout.columns * workspace.layout.rows }, (_, slotIndex) => {
    const rect = getCollageSlotRect(workspace.layout, slotIndex);
    const filled = Boolean(findCollageSlotLayer(slotIndex));
    return `<button type="button" class="${workspace.selectedSlot === slotIndex ? 'is-selected' : ''}" data-collage-slot="${slotIndex}" data-testid="collage-slot-${slotIndex}">分格 ${slotIndex + 1}<small>${rect.width} × ${rect.height} · ${filled ? '已填入' : '空白'}</small></button>`;
  }).join('');
  const selectedLayer = findCollageSlotLayer(workspace.selectedSlot);
  const hasAdjustableSource = Boolean(selectedLayer?.params?.collage_source);
  const transform = normalizeCollageTransform(selectedLayer?.params);
  const transformControls = selectedLayer ? `
    <div class="studio-control-group studio-collage-transform" aria-label="分格内调位">
      <label>缩放 <input type="number" min="1" max="3" step="0.05" value="${transform.collage_zoom}" data-testid="collage-zoom" ${hasAdjustableSource ? '' : 'disabled'}></label>
      <label>横向位置 <input type="number" min="-100" max="100" step="1" value="${transform.collage_offset_x}" data-testid="collage-offset-x" ${hasAdjustableSource ? '' : 'disabled'}></label>
      <label>纵向位置 <input type="number" min="-100" max="100" step="1" value="${transform.collage_offset_y}" data-testid="collage-offset-y" ${hasAdjustableSource ? '' : 'disabled'}></label>
    </div>` : '';
  target.innerHTML = `
    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff" data-testid="collage-image-picker" hidden>
    <div class="studio-control-group studio-control-group-two studio-collage-slots" aria-label="拼贴分格">${slots}</div>
    <button type="button" data-testid="collage-choose-image">选择本地图片</button>
    ${transformControls}
    <p class="studio-control-status" data-testid="collage-status">${selectedLayer ? (hasAdjustableSource ? '可调整缩放和位置；每次确认均可撤销。' : '该格来自旧项目，重新选择本地图片后可调整。') : `当前分格：${workspace.selectedSlot + 1}。可拖入图片或点击选择。`}</p>
  `;
  const picker = target.querySelector('[data-testid="collage-image-picker"]');
  const choose = target.querySelector('[data-testid="collage-choose-image"]');
  const status = target.querySelector('[data-testid="collage-status"]');
  const useFile = async (file) => {
    if (!file) return;
    if (!isSupportedImage(file)) {
      status.textContent = '请选择 PNG、JPG、WebP、GIF、BMP 或 TIFF 图片。';
      return;
    }
    status.textContent = '正在填入本地图片…';
    try {
      await placeCollageImage(file);
      status.textContent = `分格 ${collageWorkspace.selectedSlot + 1} 已填入并自动裁切。`;
    } catch {
      status.textContent = '无法处理这张本地图片。';
    }
  };
  choose.addEventListener('click', () => picker.click());
  picker.addEventListener('change', async () => {
    await useFile(picker.files?.[0]);
    picker.value = '';
  });
  target.querySelectorAll('[data-collage-slot]').forEach((button) => {
    button.addEventListener('click', () => {
      collageWorkspace.selectedSlot = Number(button.dataset.collageSlot);
      renderCollageWorkspace();
    });
    button.addEventListener('dragover', (event) => event.preventDefault());
    button.addEventListener('drop', async (event) => {
      event.preventDefault();
      collageWorkspace.selectedSlot = Number(button.dataset.collageSlot);
      await useFile(event.dataTransfer.files?.[0]);
    });
  });
  if (hasAdjustableSource) {
    const submitTransform = async () => {
      status.textContent = '正在更新本地裁切…';
      try {
        await updateCollageSlotTransform({
          collage_zoom: target.querySelector('[data-testid="collage-zoom"]')?.value,
          collage_offset_x: target.querySelector('[data-testid="collage-offset-x"]')?.value,
          collage_offset_y: target.querySelector('[data-testid="collage-offset-y"]')?.value,
        });
      } catch {
        status.textContent = '无法更新该分格。';
      }
    };
    target.querySelectorAll('[data-testid="collage-zoom"], [data-testid="collage-offset-x"], [data-testid="collage-offset-y"]').forEach((input) => {
      input.addEventListener('change', submitTransform);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') input.blur();
      });
    });
  }
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
  collageWorkspace = { template, layout, selectedSlot: 0 };
  renderCollageWorkspace();
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

function clearCropSelection() {
  const crop = getCoreToolModule('crop');
  if (!crop) return false;
  crop.selection = { x: null, y: null, width: null, height: null };
  crop.Base_selection?.reset_selection();
  if (window.AppConfig) window.AppConfig.need_render = true;
  return true;
}

function cropSelectionOrCanvas() {
  const crop = getCoreToolModule('crop');
  const selection = crop?.selection;
  const width = window.AppConfig?.WIDTH;
  const height = window.AppConfig?.HEIGHT;
  if (!crop || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (Number.isFinite(selection?.x) && Number.isFinite(selection?.y)
    && Number.isFinite(selection?.width) && Number.isFinite(selection?.height)
    && selection.width > 0 && selection.height > 0) {
    return { ...selection };
  }
  return { x: 0, y: 0, width, height };
}

function setCenteredCropOutputDimension(dimension, value) {
  const crop = getCoreToolModule('crop');
  const canvasWidth = window.AppConfig?.WIDTH;
  const canvasHeight = window.AppConfig?.HEIGHT;
  const selection = cropSelectionOrCanvas();
  if (!crop || !selection || !Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight)) return false;
  const max = dimension === 'width' ? canvasWidth : canvasHeight;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return false;
  selection[dimension] = Math.min(parsed, max);
  selection.x = Math.round((canvasWidth - selection.width) / 2);
  selection.y = Math.round((canvasHeight - selection.height) / 2);
  crop.selection = selection;
  window.AppConfig.need_render = true;
  return true;
}

function syncCropOutputInputs(target) {
  const selection = cropSelectionOrCanvas();
  if (!selection || !target) return;
  const width = target.querySelector('[data-testid="crop-output-width"]');
  const height = target.querySelector('[data-testid="crop-output-height"]');
  if (width) width.value = String(Math.round(selection.width));
  if (height) height.value = String(Math.round(selection.height));
}

function renderEditorToolControls(key) {
  const target = document.querySelector('[data-editor-tool-controls]');
  if (!target) return;
  document.getElementById('action_attributes')?.removeAttribute('hidden');
  if (key === 'liquify') {
    const attributes = findToolConfig('bulge_pinch')?.attributes;
    const availability = getLiquifyAvailability();
    if (!attributes) return;
    const radius = Number(attributes.radius) || 80;
    const power = Number(attributes.power) || 50;
    const density = Number(attributes.density) || 50;
    const bulge = attributes.bulge !== false;
	const push = Boolean(attributes.push);
    const liquifyTool = getCoreToolModule('bulge_pinch');
    const previewActive = Boolean(liquifyTool?.has_session?.());
    const disabled = availability.enabled ? '' : 'disabled';
    target.innerHTML = `
      <p class="studio-control-status ${availability.enabled ? 'is-available' : 'is-unavailable'}" data-testid="liquify-status">${previewActive ? '液化预览中：继续点按可叠加，应用后写入一次历史。' : availability.message}</p>
      <div class="studio-control-group" aria-label="液化模式">
        <button type="button" class="${!push && bulge ? 'is-selected' : ''}" aria-pressed="${!push && bulge}" data-testid="liquify-mode-bulge" ${disabled}>膨胀</button>
        <button type="button" class="${!push && !bulge ? 'is-selected' : ''}" aria-pressed="${!push && !bulge}" data-testid="liquify-mode-pinch" ${disabled}>收缩</button>
        <button type="button" class="${push ? 'is-selected' : ''}" aria-pressed="${push}" data-testid="liquify-mode-push" ${disabled}>推移</button>
      </div>
      <label class="studio-control-range">半径 <output data-liquify-radius-output>${radius}px</output>
        <input type="range" min="1" max="500" value="${radius}" data-testid="liquify-radius" ${disabled}>
      </label>
      <label class="studio-control-range">强度 <output data-liquify-strength-output>${power}%</output>
        <input type="range" min="1" max="100" value="${power}" data-testid="liquify-strength" ${disabled}>
      </label>
      <label class="studio-control-range">密度 <output data-liquify-density-output>${density}%</output>
        <input type="range" min="1" max="100" value="${density}" data-testid="liquify-density" ${disabled}>
      </label>
      <div class="studio-control-group studio-control-group-two" aria-label="液化预览操作">
        <button type="button" data-testid="liquify-cancel" ${previewActive && availability.enabled ? '' : 'disabled'}>取消预览</button>
        <button type="button" data-testid="liquify-apply" ${previewActive && availability.enabled ? '' : 'disabled'}>应用液化</button>
      </div>
    `;
    if (!availability.enabled) return;
    const radiusInput = target.querySelector('[data-testid="liquify-radius"]');
    const strengthInput = target.querySelector('[data-testid="liquify-strength"]');
    const densityInput = target.querySelector('[data-testid="liquify-density"]');
    const radiusOutput = target.querySelector('[data-liquify-radius-output]');
    const strengthOutput = target.querySelector('[data-liquify-strength-output]');
    const densityOutput = target.querySelector('[data-liquify-density-output]');
    radiusInput.addEventListener('input', () => {
      setToolAttribute('bulge_pinch', 'radius', Number(radiusInput.value));
      radiusOutput.textContent = `${radiusInput.value}px`;
    });
    strengthInput.addEventListener('input', () => {
      setToolAttribute('bulge_pinch', 'power', Number(strengthInput.value));
      strengthOutput.textContent = `${strengthInput.value}%`;
    });
    densityInput.addEventListener('input', () => {
      setToolAttribute('bulge_pinch', 'density', Number(densityInput.value));
      densityOutput.textContent = `${densityInput.value}%`;
    });
    target.querySelector('[data-testid="liquify-mode-bulge"]')?.addEventListener('click', () => {
      setToolAttribute('bulge_pinch', 'bulge', true);
	  setToolAttribute('bulge_pinch', 'push', false);
      renderEditorToolControls('liquify');
    });
    target.querySelector('[data-testid="liquify-mode-pinch"]')?.addEventListener('click', () => {
      setToolAttribute('bulge_pinch', 'bulge', false);
	  setToolAttribute('bulge_pinch', 'push', false);
      renderEditorToolControls('liquify');
    });
	target.querySelector('[data-testid="liquify-mode-push"]')?.addEventListener('click', () => {
	  setToolAttribute('bulge_pinch', 'push', true);
	  renderEditorToolControls('liquify');
	});
    target.querySelector('[data-testid="liquify-cancel"]')?.addEventListener('click', () => {
      liquifyTool?.cancel_session?.();
      renderEditorToolControls('liquify');
    });
    target.querySelector('[data-testid="liquify-apply"]')?.addEventListener('click', async () => {
      await liquifyTool?.apply_session?.();
      renderEditorToolControls('liquify');
    });
    return;
  }

  if (key === 'cutout') {
    const customMaskDisabled = hasUnsupportedCutoutRotation();
    const disabledAttribute = customMaskDisabled ? ' disabled' : '';
    const modeClass = (mode) => cutoutSelection.mode === mode ? ' class="is-selected"' : '';
    const operationClass = (operation) => cutoutSelection.operation === operation ? ' class="is-selected"' : '';
    target.innerHTML = `
    ${customMaskDisabled ? '<p class="studio-control-hint studio-control-warning" data-testid="cutout-rotation-warning">当前图片图层已旋转。为避免错误的遮罩几何，形状选区和 Keep/Remove 已禁用；请先将图层旋转归零。</p>' : ''}
    <div class="studio-control-group" aria-label="手动抠图模式">
      <button type="button"${modeClass('selection')}${disabledAttribute} data-cutout-mode="selection" data-testid="cutout-mode-selection">矩形选区</button>
      <button type="button"${modeClass('lasso')}${disabledAttribute} data-cutout-mode="lasso" data-testid="cutout-mode-lasso">自由套索</button>
      <button type="button"${modeClass('ellipse')}${disabledAttribute} data-cutout-mode="ellipse" data-testid="cutout-mode-ellipse">椭圆选区</button>
      <button type="button"${modeClass('triangle')}${disabledAttribute} data-cutout-mode="triangle" data-testid="cutout-mode-triangle">三角选区</button>
      <button type="button"${modeClass('star')}${disabledAttribute} data-cutout-mode="star" data-testid="cutout-mode-star">星形选区</button>
      <button type="button"${modeClass('heart')}${disabledAttribute} data-cutout-mode="heart" data-testid="cutout-mode-heart">心形选区</button>
      <button type="button"${modeClass('magic_erase')} data-cutout-mode="magic_erase" data-testid="cutout-mode-magic">魔术橡皮</button>
      <button type="button"${modeClass('erase')} data-cutout-mode="erase" data-testid="cutout-mode-erase">橡皮画笔</button>
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
      <button type="button"${operationClass('replace')} data-cutout-operation="replace" data-testid="cutout-operation-replace">新选区</button>
      <button type="button"${operationClass('add')} data-cutout-operation="add" data-testid="cutout-operation-add">加选</button>
      <button type="button"${operationClass('subtract')} data-cutout-operation="subtract" data-testid="cutout-operation-subtract">减选</button>
      <button type="button" aria-pressed="${cutoutSelection.inverted}"${cutoutSelection.inverted ? ' class="is-selected"' : ''} data-testid="cutout-invert">反选</button>
    </div>
    <div class="studio-control-group studio-control-group-two" aria-label="抠图应用">
      <button type="button"${disabledAttribute} data-testid="cutout-keep-selection">保留选区</button>
      <button type="button"${disabledAttribute} data-testid="cutout-remove-selection">移除选区</button>
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
  target.querySelector('[data-testid="cutout-remove-selection"]')?.addEventListener('click', () => applyCutoutSelection('remove'));
  target.querySelector('[data-testid="cutout-keep-selection"]')?.addEventListener('click', () => applyCutoutSelection('keep'));
  target.querySelector('[data-testid="cutout-reset-selection"]')?.addEventListener('click', () => {
    resetCutoutSelection();
  });
  target.querySelectorAll('[data-cutout-operation]').forEach((button) => {
    button.addEventListener('click', () => {
      cutoutSelection.operation = button.dataset.cutoutOperation;
      target.querySelectorAll('[data-cutout-operation]').forEach((item) => item.classList.toggle('is-selected', item === button));
    });
  });
  target.querySelector('[data-testid="cutout-invert"]')?.addEventListener('click', (event) => {
    cutoutSelection.inverted = !cutoutSelection.inverted;
    event.currentTarget.setAttribute('aria-pressed', String(cutoutSelection.inverted));
    event.currentTarget.classList.toggle('is-selected', cutoutSelection.inverted);
  });
  target.querySelectorAll('[data-cutout-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const mode = button.dataset.cutoutMode;
      await window.PhotoStudio?.activateEditorToolMode?.(mode);
      target.querySelectorAll('[data-cutout-mode]').forEach((item) => item.classList.toggle('is-selected', item.dataset.cutoutMode === cutoutSelection.mode));
    });
  });
    return;
  }

  if (key === 'adjust') {
    target.innerHTML = `
      <p class="studio-control-hint">所有调整都在当前浏览器本地预览；应用后可从底部撤销。仅未锁定的图片图层可编辑。</p>
      <div class="studio-control-group studio-control-group-two" aria-label="本地调整工作台">
        <button type="button" data-testid="adjust-auto">Auto</button>
        <button type="button" data-testid="adjust-bw">B&amp;W</button>
        <button type="button" data-testid="adjust-pop">Pop</button>
        <button type="button" data-testid="adjust-color">Color</button>
        <button type="button" data-testid="adjust-light">Light</button>
        <button type="button" data-testid="adjust-details">Details</button>
        <button type="button" data-testid="adjust-scene">Scene</button>
      </div>
    `;
    const adjustments = {
      'adjust-auto': ['image/auto_adjust', 'auto_adjust'],
      'adjust-bw': ['effects/black_and_white', 'black_and_white'],
      'adjust-pop': ['effects/enrich', 'enrich'],
      'adjust-color': ['image/color_corrections', 'color_corrections', {
        title: 'Color', defaults: { param_red: 12, param_green: 4, param_blue: -6 },
      }],
      'adjust-light': ['image/color_corrections', 'color_corrections', {
        title: 'Light', defaults: { param_l: 12 },
      }],
      'adjust-details': ['effects/sharpen', 'sharpen'],
      'adjust-scene': ['image/color_corrections', 'color_corrections', {
        title: 'Scene', defaults: { param_l: 5, param_red: 10, param_green: 2, param_blue: -8 },
      }],
    };
    for (const [testId, [path, method, options]] of Object.entries(adjustments)) {
      target.querySelector(`[data-testid="${testId}"]`)?.addEventListener('click', () => {
        invokeEditableImageModule(path, method, options);
      });
    }
    return;
  }

  if (key === 'crop') {
    const crop = getCoreToolModule('crop');
    const cropSelection = cropSelectionOrCanvas();
    const cropWidth = Math.round(cropSelection?.width ?? window.AppConfig?.WIDTH ?? 1);
    const cropHeight = Math.round(cropSelection?.height ?? window.AppConfig?.HEIGHT ?? 1);
    const locked = !cropDocumentIsEditable();
    const disabled = locked ? 'disabled' : '';
    const transform = crop?.get_pending_transform?.() ?? {
      rotation: 0,
      straighten: 0,
      flip_horizontal: false,
      flip_vertical: false,
    };
    const straighten = Number(transform.straighten) || 0;
    target.innerHTML = `
      <div class="studio-control-group studio-control-group-two" aria-label="裁剪比例">
        <button type="button" data-testid="crop-ratio-original" ${disabled}>原始比例</button>
        <button type="button" data-testid="crop-ratio-1-1" ${disabled}>1:1</button>
        <button type="button" data-testid="crop-ratio-4-3" ${disabled}>4:3</button>
        <button type="button" data-testid="crop-ratio-16-9" ${disabled}>16:9</button>
      </div>
      <div class="studio-control-group studio-control-group-two" aria-label="裁剪输出尺寸">
        <label class="studio-control-number">宽度
          <input type="number" min="1" max="${window.AppConfig?.WIDTH ?? 1}" value="${cropWidth}" data-testid="crop-output-width" ${disabled}>
        </label>
        <label class="studio-control-number">高度
          <input type="number" min="1" max="${window.AppConfig?.HEIGHT ?? 1}" value="${cropHeight}" data-testid="crop-output-height" ${disabled}>
        </label>
      </div>
      <div class="studio-control-group studio-control-group-two" aria-label="裁剪图层变换">
        <button type="button" data-testid="crop-rotate-left" ${disabled}>向左 90°</button>
        <button type="button" data-testid="crop-rotate-right" ${disabled}>向右 90°</button>
        <button type="button" class="${transform.flip_horizontal ? 'is-selected' : ''}" aria-pressed="${transform.flip_horizontal}" data-testid="crop-flip-horizontal" ${disabled}>水平翻转</button>
        <button type="button" class="${transform.flip_vertical ? 'is-selected' : ''}" aria-pressed="${transform.flip_vertical}" data-testid="crop-flip-vertical" ${disabled}>垂直翻转</button>
      </div>
      <div class="studio-control-group" aria-label="裁剪拉直">
        <label class="studio-control-range">拉直 <output data-testid="crop-straighten-value">${straighten.toFixed(1).replace(/\.0$/, '')}°</output>
          <input type="range" min="-45" max="45" step="0.1" value="${straighten}" data-testid="crop-straighten" ${disabled}>
        </label>
      </div>
      <div class="studio-control-group studio-control-group-two" aria-label="裁剪操作">
        <button type="button" data-testid="crop-apply" ${disabled}>应用裁剪</button>
        <button type="button" data-testid="crop-reset">重置选区</button>
        <button type="button" data-testid="crop-cancel">取消</button>
      </div>
      <div class="studio-control-group studio-control-group-two" aria-label="图片与画布尺寸">
        <button type="button" data-testid="crop-image-size" ${disabled}>图片尺寸</button>
        <button type="button" data-testid="crop-canvas-size" ${disabled}>画布尺寸</button>
      </div>
      <p class="studio-control-hint">在画布上拖出区域后应用；按住 Command 或 Ctrl 可保持原始比例。旋转和翻转会暂存到本次裁剪会话，应用时与裁剪合并为一个撤销步骤。</p>
    `;
    target.querySelector('[data-testid="crop-apply"]')?.addEventListener('click', async () => {
      if (cropDocumentIsEditable()) await crop?.on_params_update();
      updateCanvasStatus();
    });
    target.querySelector('[data-testid="crop-reset"]')?.addEventListener('click', () => {
      clearCropSelection();
      syncCropOutputInputs(target);
    });
    target.querySelector('[data-testid="crop-cancel"]')?.addEventListener('click', async () => {
      await crop?.cancel_session?.();
      // Crop's on_leave persists a Reset_selection_action. Cancel must only
      // discard this UI-local selection, so the real crop tool stays active
      // while its panel is closed without writing an undo entry.
      const panel = document.querySelector('[data-testid="editor-tool-panel"]');
      if (panel) panel.hidden = true;
      document.body.dataset.canvasToolMode = 'crop';
      updateCanvasStatus();
    });
    target.querySelector('[data-testid="crop-image-size"]')?.addEventListener('click', () => {
      invokeEditorModule('image/resize', 'resize');
    });
    target.querySelector('[data-testid="crop-canvas-size"]')?.addEventListener('click', () => {
      invokeEditorModule('image/size', 'size');
    });
    target.querySelector('[data-testid="crop-rotate-left"]')?.addEventListener('click', () => {
      crop?.rotate_pending?.('left');
      renderEditorToolControls('crop');
    });
    target.querySelector('[data-testid="crop-rotate-right"]')?.addEventListener('click', () => {
      crop?.rotate_pending?.('right');
      renderEditorToolControls('crop');
    });
    target.querySelector('[data-testid="crop-flip-horizontal"]')?.addEventListener('click', () => {
      crop?.flip_pending?.('horizontal');
      renderEditorToolControls('crop');
    });
    target.querySelector('[data-testid="crop-flip-vertical"]')?.addEventListener('click', () => {
      crop?.flip_pending?.('vertical');
      renderEditorToolControls('crop');
    });
    target.querySelector('[data-testid="crop-straighten"]')?.addEventListener('input', (event) => {
      crop?.set_straighten_pending?.(event.target.value);
      const current = Number(crop?.get_pending_transform?.().straighten) || 0;
      const output = target.querySelector('[data-testid="crop-straighten-value"]');
      if (output) output.textContent = `${current.toFixed(1).replace(/\.0$/, '')}°`;
    });
    target.querySelector('[data-testid="crop-ratio-original"]')?.addEventListener('click', () => {
      applyCenteredCropRatio(window.AppConfig.WIDTH / window.AppConfig.HEIGHT);
      syncCropOutputInputs(target);
    });
    target.querySelector('[data-testid="crop-ratio-1-1"]')?.addEventListener('click', () => {
      applyCenteredCropRatio(1);
      syncCropOutputInputs(target);
    });
    target.querySelector('[data-testid="crop-ratio-4-3"]')?.addEventListener('click', () => {
      applyCenteredCropRatio(4 / 3);
      syncCropOutputInputs(target);
    });
    target.querySelector('[data-testid="crop-ratio-16-9"]')?.addEventListener('click', () => {
      applyCenteredCropRatio(16 / 9);
      syncCropOutputInputs(target);
    });
    target.querySelector('[data-testid="crop-output-width"]')?.addEventListener('input', (event) => {
      if (setCenteredCropOutputDimension('width', event.target.value)) syncCropOutputInputs(target);
    });
    target.querySelector('[data-testid="crop-output-height"]')?.addEventListener('input', (event) => {
      if (setCenteredCropOutputDimension('height', event.target.value)) syncCropOutputInputs(target);
    });
    return;
  }

  if (key === 'arrange') {
    const layer = window.AppConfig?.layer;
    const opacity = Number.isFinite(layer?.opacity) ? layer.opacity : 100;
    const locked = Boolean(layer?.locked);
    const disabled = locked ? 'disabled' : '';
    const x = Number.isFinite(layer?.x) ? layer.x : 0;
    const y = Number.isFinite(layer?.y) ? layer.y : 0;
    const width = Math.max(1, Number(layer?.width) || 1);
    const height = Math.max(1, Number(layer?.height) || 1);
    const rotate = normalizeLayerRotation(layer?.rotate);
    const compositions = [
      ['source-over', '正常'], ['multiply', '正片叠底'], ['screen', '滤色'], ['overlay', '叠加'],
      ['darken', '变暗'], ['lighten', '变亮'], ['color-dodge', '颜色减淡'], ['color-burn', '颜色加深'],
      ['hard-light', '强光'], ['soft-light', '柔光'], ['difference', '差值'], ['exclusion', '排除'],
    ];
    const composition = compositions.some(([value]) => value === layer?.composition) ? layer.composition : 'source-over';
    target.innerHTML = `
      <div class="studio-control-group studio-control-group-two" aria-label="图层排列操作">
        <button type="button" data-testid="arrange-duplicate" ${disabled}>复制图层</button>
        <button type="button" data-testid="arrange-delete" ${disabled}>删除图层</button>
        <button type="button" data-testid="arrange-up" ${disabled}>上移图层</button>
        <button type="button" data-testid="arrange-down" ${disabled}>下移图层</button>
      </div>
      <div class="studio-control-group" aria-label="图层名称">
        <label class="studio-control-number">名称
          <input type="text" maxlength="120" value="${String(layer?.name ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" data-testid="arrange-name" ${disabled}>
        </label>
        <button type="button" data-testid="arrange-rename" ${disabled}>重命名</button>
      </div>
      <label class="studio-control-range">不透明度 <output data-arrange-opacity-output>${opacity}%</output>
        <input type="range" min="0" max="100" value="${opacity}" data-testid="arrange-opacity" ${disabled}>
      </label>
      <label class="studio-control-select">混合模式
        <select data-testid="arrange-composition" ${disabled}>${compositions.map(([value, label]) => `<option value="${value}" ${value === composition ? 'selected' : ''}>${label}</option>`).join('')}</select>
      </label>
      <div class="studio-control-group studio-control-group-two" aria-label="自由变换">
        <label class="studio-control-number">X
          <input type="number" step="1" value="${x}" data-testid="arrange-x" ${disabled}>
        </label>
        <label class="studio-control-number">Y
          <input type="number" step="1" value="${y}" data-testid="arrange-y" ${disabled}>
        </label>
        <label class="studio-control-number">宽
          <input type="number" min="1" step="1" value="${width}" data-testid="arrange-width" ${disabled}>
        </label>
        <label class="studio-control-number">高
          <input type="number" min="1" step="1" value="${height}" data-testid="arrange-height" ${disabled}>
        </label>
        <label class="studio-control-number">旋转
          <input type="number" step="1" value="${rotate}" data-testid="arrange-rotation" ${disabled}>
        </label>
        <button type="button" data-testid="arrange-apply-transform" ${disabled}>应用变换</button>
      </div>
      <div class="studio-control-group studio-control-group-two" aria-label="图层变换操作">
        <button type="button" data-testid="arrange-rotate-left" ${disabled}>向左旋转</button>
        <button type="button" data-testid="arrange-rotate-right" ${disabled}>向右旋转</button>
        <button type="button" data-testid="arrange-flip-horizontal" ${disabled}>水平翻转</button>
        <button type="button" data-testid="arrange-flip-vertical" ${disabled}>垂直翻转</button>
      </div>
      <div class="studio-control-group studio-control-group-two" aria-label="新增图层内容">
        <button type="button" data-testid="arrange-add-frame">添加基础 Frame</button>
        <button type="button" data-testid="arrange-open-image">添加图片</button>
        <button type="button" data-core-tool="text">添加文字</button>
        <button type="button" data-core-tool="shape">绘制形状</button>
      </div>
    `;
    target.querySelector('[data-testid="arrange-duplicate"]')?.addEventListener('click', () => {
      if (activeLayerIsEditable()) invokeEditorModule('layer/duplicate', 'duplicate');
    });
    target.querySelector('[data-testid="arrange-delete"]')?.addEventListener('click', () => {
      if (activeLayerIsEditable()) invokeEditorModule('layer/delete', 'delete');
    });
    target.querySelector('[data-testid="arrange-up"]')?.addEventListener('click', () => {
      if (activeLayerIsEditable()) invokeEditorModule('layer/move', 'up');
    });
    target.querySelector('[data-testid="arrange-down"]')?.addEventListener('click', () => {
      if (activeLayerIsEditable()) invokeEditorModule('layer/move', 'down');
    });
    target.querySelector('[data-testid="arrange-rename"]')?.addEventListener('click', async () => {
      const name = normalizeLayerName(target.querySelector('[data-testid="arrange-name"]')?.value);
      if (!name || name === layer?.name) return;
      await updateActiveLayer({ name });
      renderEditorToolControls('arrange');
    });
    target.querySelector('[data-testid="arrange-apply-transform"]')?.addEventListener('click', async () => {
      if (!activeLayerIsEditable()) return;
      const settings = readArrangeTransform(target, window.AppConfig.layer);
      const unchanged = ['x', 'y', 'width', 'height', 'rotate'].every((property) => settings[property] === window.AppConfig.layer[property]);
      if (unchanged) return;
      await updateActiveLayer(settings);
      renderEditorToolControls('arrange');
    });
    target.querySelector('[data-testid="arrange-add-frame"]')?.addEventListener('click', async () => {
      if (await insertArrangeFrame()) renderEditorToolControls('arrange');
    });
    target.querySelector('[data-testid="arrange-open-image"]')?.addEventListener('click', () => window.FileOpen?.open_file());
    const opacityInput = target.querySelector('[data-testid="arrange-opacity"]');
    const opacityOutput = target.querySelector('[data-arrange-opacity-output]');
    const compositionInput = target.querySelector('[data-testid="arrange-composition"]');
    opacityInput?.addEventListener('input', () => {
      opacityOutput.textContent = `${opacityInput.value}%`;
      opacityOutput.value = String(opacityInput.value);
    });
    opacityInput?.addEventListener('change', () => updateActiveLayer({ opacity: Number(opacityInput.value) }));
    compositionInput?.addEventListener('change', () => updateActiveLayer({ composition: compositionInput.value }));
    target.querySelector('[data-testid="arrange-rotate-left"]')?.addEventListener('click', () => {
      if (activeLayerIsEditable()) updateActiveLayer({ rotate: normalizeLayerRotation((Number(window.AppConfig.layer.rotate) || 0) - 90) });
    });
    target.querySelector('[data-testid="arrange-rotate-right"]')?.addEventListener('click', () => {
      if (activeLayerIsEditable()) updateActiveLayer({ rotate: normalizeLayerRotation((Number(window.AppConfig.layer.rotate) || 0) + 90) });
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

  if (key === 'effect') {
    const effectDisabled = activeImageLayerIsEditable() ? '' : ' disabled aria-disabled="true"';
    target.innerHTML = `
      <p class="studio-control-hint">效果会先在本地预览；确认后才写入图层历史，可随时取消或撤销。</p>
      <div class="studio-control-group studio-control-group-two" aria-label="本地效果">
        <button type="button" data-testid="effect-browser"${effectDisabled}>浏览本地效果</button>
        <button type="button" data-testid="effect-contrast"${effectDisabled}>对比度</button>
        <button type="button" data-testid="effect-blur"${effectDisabled}>模糊</button>
      </div>
    `;
    target.querySelector('[data-testid="effect-browser"]')?.addEventListener('click', () => {
      if (activeImageLayerIsEditable()) invokeEditorModule('effects/browser', 'browser');
    });
    target.querySelector('[data-testid="effect-contrast"]')?.addEventListener('click', () => {
      if (activeImageLayerIsEditable()) invokeEditorModule('effects/common/contrast', 'contrast');
    });
    target.querySelector('[data-testid="effect-blur"]')?.addEventListener('click', () => {
      if (activeImageLayerIsEditable()) invokeEditorModule('effects/common/blur', 'blur');
    });
    return;
  }

  if (key === 'filter') {
    const layer = window.AppConfig?.layer;
    const filterIsEditable = Boolean(layer && layer.type === 'image' && !layer.locked);
    const filterDisabled = filterIsEditable ? '' : ' disabled aria-disabled="true"';
    target.innerHTML = `
      <p class="studio-control-hint">所有滤镜均在当前浏览器中本地处理，应用后可通过底部撤销恢复。</p>
      <div class="studio-control-group studio-control-group-two" aria-label="本地滤镜工作台">
        <button type="button" data-testid="filter-hdr"${filterDisabled}>HDR</button>
        <button type="button" data-testid="filter-focus-bokeh"${filterDisabled}>Focus / Bokeh</button>
        <button type="button" data-testid="filter-reflect"${filterDisabled}>Reflect</button>
        <button type="button" data-testid="filter-dispersion"${filterDisabled}>Dispersion</button>
        <button type="button" data-testid="filter-glitch"${filterDisabled}>Glitch</button>
        <button type="button" data-testid="filter-colorize"${filterDisabled}>Colorize</button>
      </div>
    `;
    const localFilters = {
      'filter-hdr': ['effects/enrich', 'enrich'],
      'filter-focus-bokeh': ['effects/tilt_shift', 'tilt_shift'],
      'filter-reflect': ['effects/reflect', 'reflect'],
      'filter-dispersion': ['effects/dispersion', 'dispersion'],
      'filter-glitch': ['effects/glitch', 'glitch'],
      'filter-colorize': ['effects/colorize', 'colorize'],
    };
    for (const [testId, [path, method]] of Object.entries(localFilters)) {
      target.querySelector(`[data-testid="${testId}"]`)?.addEventListener('click', () => {
        if (!activeLayerIsEditable()) return;
        invokeEditorModule(path, method);
      });
    }
    return;
  }

  if (key === 'retouch') {
    const editable = activeImageLayerIsEditable();
    const disabled = editable ? '' : ' disabled aria-disabled="true"';
    const cloneAttributes = findToolConfig('clone')?.attributes ?? {};
    const blurAttributes = findToolConfig('blur')?.attributes ?? {};
	const dodgeBurnAttributes = findToolConfig('dodge_burn')?.attributes ?? {};
    const size = Number(blurAttributes.size ?? cloneAttributes.size ?? 30);
    const strength = Math.round(Math.max(0, Math.min(1, Number(blurAttributes.strength ?? 1))) * 100);
	const dodgeBurnStrength = Number(dodgeBurnAttributes.strength ?? 50);
	const dodgeBurnMode = dodgeBurnAttributes.mode?.value ?? 'dodge';
	const activeRetouchTool = window.AppConfig?.TOOL?.name ?? 'clone';
    const source = cloneAttributes.source_layer?.value ?? 'Current';
    target.innerHTML = `
      <label class="studio-control-range">笔刷大小 <output data-retouch-size-output>${size}px</output>
        <input type="range" min="1" max="300" value="${size}" data-testid="retouch-size" ${disabled}>
      </label>
      <label class="studio-control-range">局部模糊强度 <output data-retouch-strength-output>${strength}%</output>
        <input type="range" min="1" max="100" value="${strength}" data-testid="retouch-blur-strength" ${disabled}>
      </label>
	  <label class="studio-control-range">减淡/加深强度 <output data-retouch-dodge-burn-strength-output>${dodgeBurnStrength}%</output>
		<input type="range" min="1" max="100" value="${dodgeBurnStrength}" data-testid="retouch-dodge-burn-strength" ${disabled}>
	  </label>
      <label class="studio-control-select">克隆来源
        <select data-testid="retouch-clone-source" ${disabled}>
          <option value="Current" ${source === 'Current' ? 'selected' : ''}>当前图层</option>
          <option value="Previous" ${source === 'Previous' ? 'selected' : ''}>下一图层</option>
        </select>
      </label>
      <div class="studio-control-group studio-control-group-two" aria-label="本地修饰工具">
        <button type="button" class="${activeRetouchTool === 'clone' ? 'is-selected' : ''}" data-testid="retouch-clone" data-core-tool="clone"${disabled}>克隆</button>
		<button type="button" class="${activeRetouchTool === 'repair' ? 'is-selected' : ''}" data-testid="retouch-repair" data-core-tool="repair"${disabled}>修复</button>
        <button type="button" class="${activeRetouchTool === 'blur' ? 'is-selected' : ''}" data-testid="retouch-blur" data-core-tool="blur"${disabled}>局部模糊</button>
        <button type="button" class="${activeRetouchTool === 'sharpen' ? 'is-selected' : ''}" data-testid="retouch-sharpen" data-core-tool="sharpen"${disabled}>局部锐化</button>
        <button type="button" class="${activeRetouchTool === 'desaturate' ? 'is-selected' : ''}" data-testid="retouch-desaturate" data-core-tool="desaturate"${disabled}>局部去色</button>
		<button type="button" class="${activeRetouchTool === 'dodge_burn' && dodgeBurnMode === 'dodge' ? 'is-selected' : ''}" data-testid="retouch-dodge" data-core-tool="dodge_burn"${disabled}>减淡</button>
		<button type="button" class="${activeRetouchTool === 'dodge_burn' && dodgeBurnMode === 'burn' ? 'is-selected' : ''}" data-testid="retouch-burn" data-core-tool="dodge_burn"${disabled}>加深</button>
      </div>
      <p class="studio-control-hint">仅可在未锁定的图片图层上修饰；每次笔触都会写入本地历史。克隆工具可按住 Alt/Option 设定来源。</p>
    `;
    const sizeInput = target.querySelector('[data-testid="retouch-size"]');
    const strengthInput = target.querySelector('[data-testid="retouch-blur-strength"]');
    const sourceInput = target.querySelector('[data-testid="retouch-clone-source"]');
    sizeInput?.addEventListener('input', () => {
      const nextSize = Number(sizeInput.value);
	  ['clone', 'repair', 'blur', 'sharpen', 'desaturate', 'dodge_burn'].forEach((tool) => setToolAttribute(tool, 'size', nextSize));
      target.querySelector('[data-retouch-size-output]').textContent = `${nextSize}px`;
    });
    strengthInput?.addEventListener('input', () => {
      const nextStrength = Number(strengthInput.value) / 100;
      setToolAttribute('blur', 'strength', nextStrength);
      target.querySelector('[data-retouch-strength-output]').textContent = `${strengthInput.value}%`;
    });
	const dodgeBurnStrengthInput = target.querySelector('[data-testid="retouch-dodge-burn-strength"]');
	dodgeBurnStrengthInput?.addEventListener('input', () => {
	  setToolAttribute('dodge_burn', 'strength', Number(dodgeBurnStrengthInput.value));
	  target.querySelector('[data-retouch-dodge-burn-strength-output]').textContent = `${dodgeBurnStrengthInput.value}%`;
	});
    sourceInput?.addEventListener('change', () => setToolAttributeValue('clone', 'source_layer', sourceInput.value));
	target.querySelector('[data-testid="retouch-dodge"]')?.addEventListener('click', () => {
	  setToolAttributeValue('dodge_burn', 'mode', 'dodge');
	});
	target.querySelector('[data-testid="retouch-burn"]')?.addEventListener('click', () => {
	  setToolAttributeValue('dodge_burn', 'mode', 'burn');
	});
    target.querySelectorAll('[data-core-tool]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!await activateCoreTool(button.dataset.coreTool)) return;
        target.querySelectorAll('[data-core-tool]').forEach((candidate) => candidate.classList.remove('is-selected'));
        button.classList.add('is-selected');
      });
    });
    return;
  }

  if (key === 'drawing') {
    const brushSize = findToolConfig('brush')?.attributes?.size ?? 4;
    const brushSoftness = findToolConfig('brush')?.attributes?.softness ?? 20;
    const opacity = Math.round((window.AppConfig?.ALPHA ?? 255) / 255 * 100);
    const color = window.AppConfig?.COLOR ?? '#008000';
    target.innerHTML = `
      <label class="studio-control-color">颜色
        <input type="color" value="${color}" data-testid="drawing-color">
      </label>
      <label class="studio-control-range">笔触尺寸 <output data-drawing-size-output>${brushSize}px</output>
        <input type="range" min="1" max="100" value="${brushSize}" data-testid="drawing-size">
      </label>
      <label class="studio-control-range">柔化 <output data-drawing-softness-output>${brushSoftness}%</output>
        <input type="range" min="0" max="100" value="${brushSoftness}" data-testid="drawing-softness">
      </label>
      <label class="studio-control-range">不透明度 <output data-drawing-opacity-output>${opacity}%</output>
        <input type="range" min="1" max="100" value="${opacity}" data-testid="drawing-opacity">
      </label>
      <div class="studio-control-group studio-control-group-two" aria-label="本地笔刷预设">
        <button type="button" class="${brushSoftness >= 50 ? 'is-selected' : ''}" data-testid="drawing-brush-preset-soft">柔边</button>
        <button type="button" class="${brushSoftness < 50 ? 'is-selected' : ''}" data-testid="drawing-brush-preset-hard">硬圆</button>
      </div>
      <div class="studio-control-group studio-control-group-two" aria-label="本地绘制工具">
        <button type="button" data-testid="drawing-brush" data-core-tool="brush">画笔</button>
        <button type="button" data-testid="drawing-eraser" data-core-tool="erase">橡皮</button>
        <button type="button" data-testid="drawing-eyedropper" data-core-tool="pick_color">取色</button>
        <button type="button" data-testid="drawing-pencil" data-core-tool="pencil">铅笔</button>
        <button type="button" data-testid="drawing-fill" data-core-tool="fill">填充</button>
        <button type="button" data-testid="drawing-gradient" data-core-tool="gradient">渐变</button>
        <button type="button" data-testid="drawing-shape" data-core-tool="shape">形状</button>
      </div>
    `;
    const colorInput = target.querySelector('[data-testid="drawing-color"]');
    const sizeInput = target.querySelector('[data-testid="drawing-size"]');
    const softnessInput = target.querySelector('[data-testid="drawing-softness"]');
    const opacityInput = target.querySelector('[data-testid="drawing-opacity"]');
    const sizeOutput = target.querySelector('[data-drawing-size-output]');
    const opacityOutput = target.querySelector('[data-drawing-opacity-output]');
    colorInput.addEventListener('input', () => {
      window.AppConfig.COLOR = colorInput.value;
      setToolAttribute('shape', 'stroke', colorInput.value);
      setToolAttribute('gradient', 'color_1', colorInput.value);
    });
    sizeInput.addEventListener('input', () => {
      const size = Number(sizeInput.value);
      ['brush', 'pencil', 'erase', 'shape'].forEach((tool) => setToolAttribute(tool, 'size', size));
      sizeOutput.value = `${size}px`;
      sizeOutput.textContent = `${size}px`;
    });
    softnessInput.addEventListener('input', () => {
      const softness = Number(softnessInput.value);
      setToolAttribute('brush', 'softness', softness);
      target.querySelector('[data-drawing-softness-output]').textContent = `${softness}%`;
    });
    opacityInput.addEventListener('input', () => {
      const value = Number(opacityInput.value);
      window.AppConfig.ALPHA = Math.round(value / 100 * 255);
      opacityOutput.value = `${value}%`;
      opacityOutput.textContent = `${value}%`;
    });
    const applyBrushPreset = ({ size, softness }) => {
      setToolAttribute('brush', 'size', size);
      setToolAttribute('brush', 'softness', softness);
      sizeInput.value = String(size);
      softnessInput.value = String(softness);
      sizeOutput.textContent = `${size}px`;
      target.querySelector('[data-drawing-softness-output]').textContent = `${softness}%`;
      target.querySelectorAll('[data-testid^="drawing-brush-preset-"]').forEach((button) => {
        button.classList.toggle('is-selected', button.dataset.testid === `drawing-brush-preset-${softness >= 50 ? 'soft' : 'hard'}`);
      });
    };
    target.querySelector('[data-testid="drawing-brush-preset-soft"]')?.addEventListener('click', () => applyBrushPreset({ size: 40, softness: 70 }));
    target.querySelector('[data-testid="drawing-brush-preset-hard"]')?.addEventListener('click', () => applyBrushPreset({ size: 18, softness: 0 }));
    target.querySelectorAll('[data-core-tool]').forEach((button) => {
      button.addEventListener('click', () => activateCoreTool(button.dataset.coreTool));
    });
    return;
  }

  if (key === 'text') {
    const attributes = findToolConfig('text')?.attributes;
    if (!attributes) return;
    const font = attributes.font?.value ?? 'Arial';
    const fonts = typeof attributes.font?.values === 'function' ? attributes.font.values().filter(Boolean) : [];
    const size = attributes.size ?? 40;
    const fill = attributes.fill ?? '#008800';
    const stroke = attributes.stroke ?? '#000000';
    const strokeSize = attributes.stroke_size?.value ?? 0;
    const bold = Boolean(attributes.bold?.value);
    const italic = Boolean(attributes.italic?.value);
    const underline = Boolean(attributes.underline?.value);
    const alignment = attributes.align?.value ?? 'left';
    const shadowEnabled = Boolean(attributes.shadow_enabled);
    const backgroundEnabled = Boolean(attributes.background_enabled);
    const curve = Number(attributes.curve) || 0;
	const warp = attributes.warp ?? 'arc';
    target.innerHTML = `
      <button type="button" data-testid="text-create" data-core-tool="text">添加文字</button>
      <label class="studio-control-select">字体
        <select data-testid="text-font">${fonts.map((name) => `<option value="${name}" ${name === font ? 'selected' : ''}>${name}</option>`).join('')}</select>
      </label>
      <label class="studio-control-number">字号
        <input type="number" min="1" max="999" value="${size}" data-testid="text-size">
      </label>
      <label class="studio-control-color">填充色
        <input type="color" value="${fill}" data-testid="text-fill">
      </label>
      <div class="studio-control-group studio-control-group-three" aria-label="文字样式">
        <button type="button" aria-pressed="${bold}" class="${bold ? 'is-selected' : ''}" data-testid="text-bold">加粗</button>
        <button type="button" aria-pressed="${italic}" class="${italic ? 'is-selected' : ''}" data-testid="text-italic">斜体</button>
        <button type="button" aria-pressed="${underline}" class="${underline ? 'is-selected' : ''}" data-testid="text-underline">下划线</button>
      </div>
      <div class="studio-control-group studio-control-group-three" aria-label="文本对齐">
        <button type="button" aria-pressed="${alignment === 'left'}" class="${alignment === 'left' ? 'is-selected' : ''}" data-testid="text-align-left">左对齐</button>
        <button type="button" aria-pressed="${alignment === 'center'}" class="${alignment === 'center' ? 'is-selected' : ''}" data-testid="text-align-center">居中</button>
        <button type="button" aria-pressed="${alignment === 'right'}" class="${alignment === 'right' ? 'is-selected' : ''}" data-testid="text-align-right">右对齐</button>
      </div>
      <label class="studio-control-color">描边色
        <input type="color" value="${stroke}" data-testid="text-stroke">
      </label>
      <label class="studio-control-number">描边宽度
        <input type="number" min="0" max="999" step="0.1" value="${strokeSize}" data-testid="text-stroke-size">
      </label>
      <label class="studio-control-check"><input type="checkbox" data-testid="text-shadow-enabled" ${shadowEnabled ? 'checked' : ''}>文字阴影</label>
      <label class="studio-control-color">阴影色<input type="color" value="${attributes.shadow_color ?? '#000000'}" data-testid="text-shadow-color"></label>
      <label class="studio-control-range">阴影模糊 <output data-text-shadow-blur-output>${attributes.shadow_blur ?? 4}px</output><input type="range" min="0" max="50" value="${attributes.shadow_blur ?? 4}" data-testid="text-shadow-blur"></label>
      <label class="studio-control-check"><input type="checkbox" data-testid="text-background-enabled" ${backgroundEnabled ? 'checked' : ''}>文字背景</label>
      <label class="studio-control-color">背景色<input type="color" value="${attributes.background_color ?? '#000000'}" data-testid="text-background-color"></label>
      <label class="studio-control-range">背景不透明度 <output data-text-background-opacity-output>${attributes.background_opacity ?? 35}%</output><input type="range" min="0" max="100" value="${attributes.background_opacity ?? 35}" data-testid="text-background-opacity"></label>
      <label class="studio-control-range">曲线 <output data-text-curve-output>${curve}</output><input type="range" min="-100" max="100" value="${curve}" data-testid="text-curve"></label>
	  <label class="studio-control-select">Warp
		<select data-testid="text-warp"><option value="arc" ${warp === 'arc' ? 'selected' : ''}>弧线</option><option value="wave" ${warp === 'wave' ? 'selected' : ''}>波浪</option><option value="flag" ${warp === 'flag' ? 'selected' : ''}>旗帜</option></select>
	  </label>
      <p class="studio-control-hint">使用系统字体；点击“添加文字”后在画布中单击或拖拽以创建文本层。</p>
    `;
    const fontInput = target.querySelector('[data-testid="text-font"]');
    const sizeInput = target.querySelector('[data-testid="text-size"]');
    const fillInput = target.querySelector('[data-testid="text-fill"]');
    const strokeInput = target.querySelector('[data-testid="text-stroke"]');
    const strokeSizeInput = target.querySelector('[data-testid="text-stroke-size"]');
    const shadowEnabledInput = target.querySelector('[data-testid="text-shadow-enabled"]');
    const shadowColorInput = target.querySelector('[data-testid="text-shadow-color"]');
    const shadowBlurInput = target.querySelector('[data-testid="text-shadow-blur"]');
    const backgroundEnabledInput = target.querySelector('[data-testid="text-background-enabled"]');
    const backgroundColorInput = target.querySelector('[data-testid="text-background-color"]');
    const backgroundOpacityInput = target.querySelector('[data-testid="text-background-opacity"]');
    const curveInput = target.querySelector('[data-testid="text-curve"]');
	const warpInput = target.querySelector('[data-testid="text-warp"]');
    fontInput.addEventListener('change', () => applyTextToolAttribute('font', fontInput.value));
    sizeInput.addEventListener('input', () => applyTextToolAttribute('size', Number(sizeInput.value)));
    fillInput.addEventListener('input', () => applyTextToolAttribute('fill', fillInput.value));
    strokeInput.addEventListener('input', () => applyTextToolAttribute('stroke', strokeInput.value));
    strokeSizeInput.addEventListener('input', () => applyTextToolAttribute('stroke_size', Number(strokeSizeInput.value)));
    shadowEnabledInput.addEventListener('change', () => applyTextToolAttribute('shadow_enabled', shadowEnabledInput.checked));
    shadowColorInput.addEventListener('input', () => applyTextToolAttribute('shadow_color', shadowColorInput.value));
    shadowBlurInput.addEventListener('input', () => {
      applyTextToolAttribute('shadow_blur', Number(shadowBlurInput.value));
      target.querySelector('[data-text-shadow-blur-output]').textContent = `${shadowBlurInput.value}px`;
    });
    backgroundEnabledInput.addEventListener('change', () => applyTextToolAttribute('background_enabled', backgroundEnabledInput.checked));
    backgroundColorInput.addEventListener('input', () => applyTextToolAttribute('background_color', backgroundColorInput.value));
    backgroundOpacityInput.addEventListener('input', () => {
      applyTextToolAttribute('background_opacity', Number(backgroundOpacityInput.value));
      target.querySelector('[data-text-background-opacity-output]').textContent = `${backgroundOpacityInput.value}%`;
    });
    curveInput.addEventListener('input', () => {
      applyTextToolAttribute('curve', Number(curveInput.value));
      target.querySelector('[data-text-curve-output]').textContent = curveInput.value;
    });
	warpInput.addEventListener('change', () => applyTextToolAttribute('warp', warpInput.value));
    target.querySelectorAll('[data-testid="text-bold"], [data-testid="text-italic"], [data-testid="text-underline"]').forEach((button) => {
      button.addEventListener('click', () => {
        const attribute = button.dataset.testid.replace('text-', '');
        const value = button.getAttribute('aria-pressed') !== 'true';
        applyTextToolAttribute(attribute, value);
        button.setAttribute('aria-pressed', String(value));
        button.classList.toggle('is-selected', value);
      });
    });
    target.querySelectorAll('[data-testid^="text-align-"]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.testid.replace('text-align-', '');
        applyTextToolAttribute('align', value);
        target.querySelectorAll('[data-testid^="text-align-"]').forEach((candidate) => {
          const selected = candidate === button;
          candidate.setAttribute('aria-pressed', String(selected));
          candidate.classList.toggle('is-selected', selected);
        });
      });
    });
    target.querySelectorAll('[data-core-tool]').forEach((button) => {
      button.addEventListener('click', () => activateCoreTool(button.dataset.coreTool));
    });
    return;
  }

  const coreControls = { text: [['文字工具', 'text']] };
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

function exportImage() {
  const format = document.querySelector('[data-testid="export-format"]')?.value || 'png';
  const type = EXPORT_TYPES[format] || EXPORT_TYPES.png;
  return window.FileSave?.save_action({
    name: currentProjectName,
    type,
    quality: 90,
    layers: 'All',
    delay: 400,
  });
}

function exportNativeProject() {
  return window.FileSave?.save_action({
    name: currentProjectName,
    type: 'JSON - Full layers data',
    quality: 90,
    layers: 'All',
    delay: 400,
  });
}

async function restoreHandoff() {
  const handoff = await projectStore.takeHandoff();
  if (!handoff) return false;
  if (handoff.kind === 'file' && handoff.file) {
    currentProjectName = normalizeProjectName(handoff.file.name);
    await window.FileOpen.open_handler({ target: { files: [handoff.file] } });
    return true;
  }
  if (handoff.kind === 'document' && isNativeProjectDocument(handoff.document)) {
    currentProjectName = normalizeProjectName(handoff.name);
    await window.FileOpen.load_json(handoff.document);
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
  if (key !== 'cutout') uninstallCutoutCoreEventShield();
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
  if (key === 'liquify' && !getLiquifyAvailability().enabled) {
    await deactivateCoreTool();
  } else {
    await activateCoreTool(tool.coreTool);
  }
  updateCanvasStatus();
}

async function activateEditorToolMode(coreTool) {
  if (CUTOUT_SHAPE_MODES.has(coreTool)) {
    if (!activeImageLayerIsEditable() || hasUnsupportedCutoutRotation()) return false;
    cutoutSelection.mode = coreTool;
    // miniPaint tools attach document-level mouse listeners. Keep their
    // lifecycle clean, then shield those listeners while our pointer gesture
    // owns the canvas.
    await deactivateCoreTool();
    installCutoutCoreEventShield();
    document.body.dataset.canvasToolMode = `cutout-${coreTool}`;
    return true;
  }
  if (!MANUAL_CUTOUT_TOOLS.includes(coreTool)) return;
  uninstallCutoutCoreEventShield();
  cutoutSelection.mode = coreTool;
  await activateCoreTool(coreTool);
  return true;
}

function refreshLiquifyControlsForActiveLayer() {
  if (document.querySelector('[data-editor-tool="liquify"]')?.classList.contains('is-active')) {
    renderEditorToolControls('liquify');
  }
}

function bindWorkbenchControls() {
  bindCutoutCanvasGestures();
  document.querySelectorAll('[data-editor-tool]').forEach((button) => {
    button.addEventListener('click', () => activateEditorTool(button.dataset.editorTool));
  });
  document.querySelector('[data-editor-panel-close]')?.addEventListener('click', () => {
    const panel = document.querySelector('[data-testid="editor-tool-panel"]');
    if (panel) panel.hidden = true;
  });

  // miniPaint owns the layer-rail click handler. Defer one tick after its
  // lock action so an already-open workbench panel reflects the new
  // editability immediately instead of leaving stale enabled controls.
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-testid="layer-lock"]')) return;
    window.setTimeout(() => {
      getCoreToolModule('bulge_pinch')?.cancel_session?.();
      const activeTool = document.querySelector('[data-editor-tool].is-active')?.dataset.editorTool;
      if (activeTool) renderEditorToolControls(activeTool);
    }, 0);
  });
  const refreshLayers = () => window.app?.GUI?.GUI_layers?.render_layers?.();
  document.querySelector('[data-editor-history="undo"]')?.addEventListener('click', async () => {
    await window.State?.undo_action?.();
    refreshLayers();
    refreshLiquifyControlsForActiveLayer();
  });
  document.querySelector('[data-editor-history="redo"]')?.addEventListener('click', async () => {
    await window.State?.redo_action?.();
    refreshLayers();
    refreshLiquifyControlsForActiveLayer();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.layers_list .lock, .layers_list .layer_name')) return;
    window.setTimeout(() => {
      refreshLiquifyControlsForActiveLayer();
      const activeTool = document.querySelector('[data-editor-tool].is-active')?.dataset.editorTool;
      if (activeTool === 'crop' || activeTool === 'arrange') renderEditorToolControls(activeTool);
    }, 0);
  }, true);
  window.addEventListener('photo-studio-liquify-preview-change', () => {
    if (document.querySelector('[data-editor-tool="liquify"]')?.classList.contains('is-active')) {
      renderEditorToolControls('liquify');
    }
  });
  document.querySelector('[data-editor-zoom="out"]')?.addEventListener('click', () => document.getElementById('zoom_less')?.click());
  document.querySelector('[data-editor-zoom="in"]')?.addEventListener('click', () => document.getElementById('zoom_more')?.click());
  document.querySelector('[data-testid="export-image"]')?.addEventListener('click', exportImage);
  document.querySelector('[data-testid="export-project"]')?.addEventListener('click', exportNativeProject);
  document.querySelector('[data-testid="layers-rail-close"]')?.addEventListener('click', (event) => {
    const collapsed = document.body.classList.toggle('layers-collapsed');
    event.currentTarget.setAttribute('aria-pressed', String(collapsed));
    event.currentTarget.setAttribute('aria-label', collapsed ? '展开图层轨' : '收起图层轨');
  });
  window.setInterval(updateCanvasStatus, 300);
}

function registerEditorShell() {
  document.body.classList.add('photo-studio-editor');
  document.body.dataset.liquifyAcceleration = shouldUseWebGL2() ? 'webgl2' : 'unavailable';
  document.body.dataset.manualCutoutTools = MANUAL_CUTOUT_TOOLS.join(',');
  window.PhotoStudio = {
    manualCutoutTools: MANUAL_CUTOUT_TOOLS,
    editorTools: EDITOR_TOOL_REGISTRY,
    activateEditorTool,
    activateEditorToolMode,
    getCutoutSelection: cloneCutoutSelection,
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
