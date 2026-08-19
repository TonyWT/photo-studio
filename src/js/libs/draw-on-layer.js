import app from './../app.js';
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

/** 空白层转图片时，给 Update_layer_image 一个可写入的初始 src。 */
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Draw 工具在非图像/空白层上的提示文案。 */
export const DRAW_LAYER_ERROR_MESSAGE = '只有在图像图层或空白图层上才能使用绘制工具。';

/**
 * Draw 工作区是否处于打开状态。
 * @returns {boolean}
 */
export function isDrawingWorkspace() {
	return Boolean(document.querySelector('[data-editor-tool="drawing"]')?.classList.contains('is-active'));
}

/**
 * Draw 工作区的绘制操作应画在当前图层上，而不是新建矢量图层。
 * @returns {boolean}
 */
export function shouldPaintOnCurrentLayer() {
	return isDrawingWorkspace();
}

/**
 * 图像图层或尚未写入内容的空白图层都可以直接绘制。
 * @param {object | null | undefined} layer
 * @returns {boolean}
 */
export function isDrawableLayer(layer) {
	if (!layer) return false;
	return layer.type === 'image' || layer.type == null;
}

/**
 * 提示用户当前图层不能使用绘制工具。
 * @returns {void}
 */
export function notifyNotDrawable() {
	alertify.error(DRAW_LAYER_ERROR_MESSAGE);
}

/**
 * 等到图层图像可以绘制，避免 src 刚换完时主画布读到旧图。
 * @param {CanvasImageSource | null | undefined} image
 * @returns {Promise<void>}
 */
export function waitForLayerImage(image) {
	if (!image) return Promise.resolve();
	if (typeof image.decode === 'function') {
		return image.decode().catch(() => undefined);
	}
	if (image.complete) return Promise.resolve();
	return new Promise((resolve) => {
		image.addEventListener('load', () => resolve(), { once: true });
		image.addEventListener('error', () => resolve(), { once: true });
	});
}

/**
 * 图像写回完成前保留 `link_canvas` 预览；完成后只摘掉本次自己挂上的画布。
 * @param {HTMLCanvasElement} canvas
 * @param {object} layer
 * @param {Promise<{status?: string} | void>} actionPromise
 * @returns {Promise<void>}
 */
export async function settlePaintedLayerImage(canvas, layer, actionPromise) {
	const result = await actionPromise;
	if (result?.status !== 'aborted' && layer?.link) {
		await waitForLayerImage(layer.link);
	}
	if (layer && layer.link_canvas === canvas) {
		delete layer.link_canvas;
		config.need_render = true;
	}
}

/** @type {Map<number, Promise<unknown>>} */
const pendingLayerImageWrites = new Map();

/**
 * 同一图层的图像写回按提交顺序串行执行，避免后开始的橡皮被尚未完成的画笔盖回去。
 * @param {object} layer
 * @param {() => Promise<unknown>} startAction
 * @returns {Promise<unknown>}
 */
export function queueLayerImageWrite(layer, startAction) {
	const layerId = layer?.id;
	const previous = (layerId != null && pendingLayerImageWrites.get(layerId)) || Promise.resolve();
	const next = previous.catch(() => undefined).then(startAction);
	if (layerId != null) {
		pendingLayerImageWrites.set(layerId, next);
		next.finally(() => {
			if (pendingLayerImageWrites.get(layerId) === next) {
				pendingLayerImageWrites.delete(layerId);
			}
		});
	}
	return next;
}

/**
 * 复制图层当前可见像素。优先 `link_canvas`（尚未写回的预览），否则用 `link`。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} layer
 * @returns {void}
 */
export function copyVisibleLayerImage(ctx, layer) {
	if (!ctx?.canvas || !layer) return;
	const source = layer.link_canvas || layer.link;
	if (!source) return;
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	ctx.drawImage(source, 0, 0, ctx.canvas.width, ctx.canvas.height);
}

/**
 * 在当前图像层或空白层上建立一次像素绘制会话。
 * 预览走 `link_canvas`；提交时用 `Update_layer_image_action` 写回同一图层。
 */
export class LayerPaintSession {
	/**
	 * @param {object} [application]
	 */
	constructor(application = app) {
		this.app = application;
		this.tmpCanvas = null;
		this.tmpCtx = null;
		this.snapshotCanvas = null;
		this.layer = null;
		this.startedAsBlank = false;
		this.snapshot = null;
		this.active = false;
	}

	/**
	 * 复制当前层像素并挂上预览画布。
	 * @returns {boolean}
	 */
	begin() {
		const layer = this.app.Layers?.get_layer?.() ?? config.layer;
		if (!layer || layer.locked) {
			if (layer?.locked) {
				alertify.error('This layer is locked. Unlock it before editing.');
			} else {
				notifyNotDrawable();
			}
			return false;
		}
		if (!isDrawableLayer(layer)) {
			notifyNotDrawable();
			return false;
		}

		this.layer = layer;
		this.startedAsBlank = layer.type == null;
		this.snapshot = {
			type: layer.type,
			width: layer.width,
			height: layer.height,
			width_original: layer.width_original,
			height_original: layer.height_original,
			x: layer.x,
			y: layer.y,
		};

		this.tmpCanvas = document.createElement('canvas');
		this.tmpCtx = this.tmpCanvas.getContext('2d');

		if (this.startedAsBlank) {
			this.tmpCanvas.width = config.WIDTH;
			this.tmpCanvas.height = config.HEIGHT;
			layer.type = 'image';
			layer.width = config.WIDTH;
			layer.height = config.HEIGHT;
			layer.width_original = config.WIDTH;
			layer.height_original = config.HEIGHT;
			if (layer.x == null) layer.x = 0;
			if (layer.y == null) layer.y = 0;
		} else {
			this.tmpCanvas.width = layer.width_original || layer.width || config.WIDTH;
			this.tmpCanvas.height = layer.height_original || layer.height || config.HEIGHT;
			copyVisibleLayerImage(this.tmpCtx, layer);
		}

		this.snapshotCanvas = document.createElement('canvas');
		this.snapshotCanvas.width = this.tmpCanvas.width;
		this.snapshotCanvas.height = this.tmpCanvas.height;
		this.snapshotCanvas.getContext('2d').drawImage(this.tmpCanvas, 0, 0);

		layer.link_canvas = this.tmpCanvas;
		this.active = true;
		config.need_render = true;
		return true;
	}

	/**
	 * 把临时画布恢复到本次笔触开始时的像素。
	 * @returns {void}
	 */
	restoreSnapshot() {
		if (!this.tmpCtx || !this.snapshotCanvas) return;
		this.tmpCtx.clearRect(0, 0, this.tmpCanvas.width, this.tmpCanvas.height);
		this.tmpCtx.drawImage(this.snapshotCanvas, 0, 0);
	}

	/**
	 * 将世界坐标下的绘制变换到当前图层的原始像素画布。
	 * @param {CanvasRenderingContext2D} ctx
	 * @returns {void}
	 */
	applyWorldToCanvasTransform(ctx) {
		const layer = this.layer;
		const displayWidth = layer.width || this.tmpCanvas.width;
		const displayHeight = layer.height || this.tmpCanvas.height;
		ctx.scale(this.tmpCanvas.width / displayWidth, this.tmpCanvas.height / displayHeight);
		ctx.translate(-(layer.x || 0), -(layer.y || 0));
	}

	/**
	 * 把世界坐标点换算到图层原始像素。
	 * @param {number} worldX
	 * @param {number} worldY
	 * @returns {{x: number, y: number}}
	 */
	toCanvasPoint(worldX, worldY) {
		const layer = this.layer;
		const displayWidth = layer.width || this.tmpCanvas.width;
		const displayHeight = layer.height || this.tmpCanvas.height;
		return {
			x: (worldX - (layer.x || 0)) * (this.tmpCanvas.width / displayWidth),
			y: (worldY - (layer.y || 0)) * (this.tmpCanvas.height / displayHeight),
		};
	}

	/**
	 * 刷新画布预览。
	 * @returns {void}
	 */
	preview() {
		if (!this.active || !this.layer) return;
		this.layer.link_canvas = this.tmpCanvas;
		config.need_render = true;
	}

	/**
	 * 把临时层元数据恢复成 begin() 之前的值，保证 undo 记录到空白层。
	 * @param {{keepPreview?: boolean}} [options] keepPreview 为 true 时保留 `link_canvas`，避免提交空窗。
	 * @returns {void}
	 */
	restoreLayerMeta({ keepPreview = false } = {}) {
		if (!this.layer || !this.snapshot) return;
		this.layer.type = this.snapshot.type;
		this.layer.width = this.snapshot.width;
		this.layer.height = this.snapshot.height;
		this.layer.width_original = this.snapshot.width_original;
		this.layer.height_original = this.snapshot.height_original;
		this.layer.x = this.snapshot.x;
		this.layer.y = this.snapshot.y;
		if (!keepPreview) {
			delete this.layer.link_canvas;
		}
	}

	/**
	 * 把预览像素写入当前图层历史。
	 * 提交完成前继续挂着 `link_canvas`，这样松手后不会先闪回原图再跳到新像素。
	 * @param {string} bundleName
	 * @param {string} bundleTitle
	 * @returns {boolean}
	 */
	commit(bundleName = 'draw_on_layer', bundleTitle = 'Draw') {
		if (!this.active || !this.layer || !this.tmpCanvas) return false;
		const layer = this.layer;
		const canvas = this.tmpCanvas;
		const startedAsBlank = this.startedAsBlank;
		this.active = false;
		this.restoreLayerMeta({ keepPreview: true });
		layer.link_canvas = canvas;
		config.need_render = true;

		const actions = [];
		if (startedAsBlank) {
			const image = new Image();
			image.src = TRANSPARENT_PIXEL;
			actions.push(new this.app.Actions.Update_layer_action(layer.id, {
				type: 'image',
				link: image,
				x: layer.x || 0,
				y: layer.y || 0,
				width: canvas.width,
				height: canvas.height,
				width_original: canvas.width,
				height_original: canvas.height,
			}));
		}
		actions.push(new this.app.Actions.Update_layer_image_action(canvas, layer.id));
		void settlePaintedLayerImage(
			canvas,
			layer,
			queueLayerImageWrite(layer, () =>
				this.app.State.do_action(new this.app.Actions.Bundle_action(bundleName, bundleTitle, actions)),
			),
		);
		this._dispose();
		return true;
	}

	/**
	 * 放弃本次绘制并还原图层元数据。
	 * @returns {void}
	 */
	cancel() {
		if (!this.active) return;
		this.restoreLayerMeta();
		config.need_render = true;
		this._dispose();
	}

	/**
	 * @returns {void}
	 */
	_dispose() {
		this.tmpCanvas = null;
		this.tmpCtx = null;
		this.snapshotCanvas = null;
		this.snapshot = null;
		this.layer = null;
		this.active = false;
	}
}

/**
 * 把矢量形状工具的 `render(ctx, layer)` 画到当前图像层上。
 */
export class ShapePaintController {
	/**
	 * @param {object} tool
	 */
	constructor(tool) {
		this.tool = tool;
		this.session = null;
		this.draft = null;
		this.click = { x: null, y: null };
	}

	/**
	 * @returns {boolean}
	 */
	get active() {
		return Boolean(this.session?.active);
	}

	/**
	 * @param {number} clickX
	 * @param {number} clickY
	 * @param {object} [extraDraft]
	 * @returns {boolean}
	 */
	begin(clickX, clickY, extraDraft = {}) {
		if (this.session?.active) this.session.cancel();
		this.session = new LayerPaintSession();
		if (!this.session.begin()) {
			this.session = null;
			return false;
		}
		this.click = { x: clickX, y: clickY };
		this.draft = {
			type: this.tool.name,
			params: this.tool.clone(this.tool.getParams()),
			x: clickX,
			y: clickY,
			width: 0,
			height: 0,
			rotate: 0,
			color: config.COLOR,
			status: 'draft',
			...extraDraft,
		};
		return true;
	}

	/**
	 * @param {object} fields
	 * @returns {void}
	 */
	updateDraft(fields) {
		if (!this.draft) return;
		Object.assign(this.draft, fields);
		this.paint();
	}

	/**
	 * 用工具自身的 render 把草稿画到预览画布上。
	 * @param {(ctx: CanvasRenderingContext2D, draft: object) => void} [customPaint]
	 * @returns {void}
	 */
	paint(customPaint) {
		if (!this.active || !this.draft) return;
		this.session.restoreSnapshot();
		const ctx = this.session.tmpCtx;
		ctx.save();
		ctx.globalAlpha = config.ALPHA / 255;
		this.session.applyWorldToCanvasTransform(ctx);
		if (typeof customPaint === 'function') {
			customPaint(ctx, this.draft);
		} else {
			this.tool.render(ctx, this.draft);
		}
		ctx.restore();
		this.session.preview();
	}

	/**
	 * @param {string} bundleName
	 * @param {string} bundleTitle
	 * @returns {boolean}
	 */
	commit(bundleName, bundleTitle) {
		if (!this.active) return false;
		const committed = this.session.commit(bundleName, bundleTitle);
		this.session = null;
		this.draft = null;
		return committed;
	}

	/**
	 * @returns {void}
	 */
	cancel() {
		this.session?.cancel();
		this.session = null;
		this.draft = null;
	}
}
