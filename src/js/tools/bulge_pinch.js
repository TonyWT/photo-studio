import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import glfx from './../libs/glfx.js';
import Helper_class from './../libs/helpers.js';

/**
 * 从 ImageData 缓冲区做双线性取样，避免推移时出现块状像素。
 * @param {Uint8ClampedArray} source
 * @param {number} width
 * @param {number} height
 * @param {number} x
 * @param {number} y
 * @param {Uint8ClampedArray} destination
 * @param {number} destIndex
 */
function sampleBilinear(source, width, height, x, y, destination, destIndex) {
	const maxX = width - 1;
	const maxY = height - 1;
	if (x < 0 || y < 0 || x > maxX || y > maxY) {
		const cx = Math.max(0, Math.min(maxX, Math.round(x)));
		const cy = Math.max(0, Math.min(maxY, Math.round(y)));
		const srcIndex = (cy * width + cx) * 4;
		destination[destIndex] = source[srcIndex];
		destination[destIndex + 1] = source[srcIndex + 1];
		destination[destIndex + 2] = source[srcIndex + 2];
		destination[destIndex + 3] = source[srcIndex + 3];
		return;
	}
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = Math.min(maxX, x0 + 1);
	const y1 = Math.min(maxY, y0 + 1);
	const fx = x - x0;
	const fy = y - y0;
	const i00 = (y0 * width + x0) * 4;
	const i10 = (y0 * width + x1) * 4;
	const i01 = (y1 * width + x0) * 4;
	const i11 = (y1 * width + x1) * 4;
	const w00 = (1 - fx) * (1 - fy);
	const w10 = fx * (1 - fy);
	const w01 = (1 - fx) * fy;
	const w11 = fx * fy;
	for (let channel = 0; channel < 4; channel++) {
		destination[destIndex + channel] = source[i00 + channel] * w00
			+ source[i10 + channel] * w10
			+ source[i01 + channel] * w01
			+ source[i11 + channel] * w11;
	}
}

/**
 * 把 1–100 的滑杆值夹到 (0, 1]。
 * @param {unknown} value
 * @returns {number}
 */
function unitAmount(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0.5;
	return Math.max(0.01, Math.min(1, parsed / 100));
}

class BulgePinch_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.fx_filter = false;
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'bulge_pinch';
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.previewCanvas = null;
		this.previewCanvasCtx = null;
		this.previewDownsampleCanvas = null;
		this.previewDownsampleCtx = null;
		this.regionCanvas = null;
		this.regionCanvasCtx = null;
		this.sourceCanvas = null;
		this.sourceCanvasCtx = null;
		this.started = false;
		this.sessionLayerId = null;
		this.lastStrokePoint = null;
		this.previewRaf = 0;
	}

	load() {
		this.default_events();
	}

	default_dragMove(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousemove(event);

		//mouse cursor
		var mouse = this.get_mouse_info(event);
		var params = this.getParams();
		this.show_mouse_cursor(mouse.x, mouse.y, params.radius, 'circle');
	}

	mousedown(e) {
		this.started = false;
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();
		if (mouse.click_valid == false) {
			return;
		}
		if (!config.layer || config.layer.locked) {
			alertify.error('This layer is locked. Unlock it before editing.');
			return;
		}
		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}
		if (!this.is_webgl2_available()) {
			alertify.error('Liquify 需要 WebGL2；当前浏览器已禁用该工具。');
			return;
		}
		if (this.sessionLayerId != null && this.sessionLayerId != config.layer.id) {
			this.cancel_session();
		}
		this.started = true;

		// Keep strokes in a temporary WebGL-backed canvas until the user chooses
		// Apply. That gives Liquify a real preview/cancel lifecycle rather than
		// committing one undo entry for every dab.
		if (!this.tmpCanvas) {
			this.sessionLayerId = config.layer.id;
			this.tmpCanvas = document.createElement('canvas');
			this.tmpCanvasCtx = this.tmpCanvas.getContext("2d");
			this.tmpCanvas.width = config.layer.width_original;
			this.tmpCanvas.height = config.layer.height_original;
			this.tmpCanvasCtx.drawImage(config.layer.link, 0, 0);
			this.sourceCanvas = document.createElement('canvas');
			this.sourceCanvas.width = this.tmpCanvas.width;
			this.sourceCanvas.height = this.tmpCanvas.height;
			this.sourceCanvasCtx = this.sourceCanvas.getContext("2d", {willReadFrequently: true});
			this.sourceCanvasCtx.drawImage(config.layer.link, 0, 0);
		}

		const point = this.get_layer_canvas_point(mouse);
		this.lastStrokePoint = point;
		this.apply_dab(point, null, params);
		this.announce_session_change();
		this.queue_preview(params);
	}

	is_webgl2_available() {
		const canvas = document.createElement('canvas');
		return Boolean(canvas.getContext('webgl2'));
	}

	mouseup(e) {
		if (this.started == false) return;
		this.started = false;
		this.lastStrokePoint = null;
		this.flush_preview();
	}

	mousemove(e) {
		const mouse = this.get_mouse_info(e);
		const params = this.getParams();
		if (!this.started || !mouse.is_drag || !mouse.click_valid || !this.tmpCanvas) return;
		const point = this.get_layer_canvas_point(mouse);
		if (this.lastStrokePoint) this.apply_stroke(this.lastStrokePoint, point, params);
		this.lastStrokePoint = point;
		this.queue_preview(params);
	}

	has_session() {
		return this.sessionLayerId != null && this.tmpCanvas != null;
	}

	clear_session_preview() {
		const layer = this.sessionLayerId == null ? null : app.Layers.get_layer(this.sessionLayerId);
		if (layer && (layer.link_canvas === this.tmpCanvas || layer.link_canvas === this.previewCanvas)) delete layer.link_canvas;
		config.need_render = true;
	}

	/**
	 * 合并同一帧内的多次笔触，只刷新一次预览，保证拖拽实时且不卡顿。
	 * @param {object} params
	 */
	queue_preview(params) {
		this.pendingPreviewParams = params;
		if (this.previewRaf) return;
		this.previewRaf = requestAnimationFrame(() => {
			this.previewRaf = 0;
			this.refresh_preview(this.pendingPreviewParams);
			config.need_render = true;
		});
	}

	flush_preview() {
		if (this.previewRaf) {
			cancelAnimationFrame(this.previewRaf);
			this.previewRaf = 0;
		}
		if (this.tmpCanvas) {
			this.refresh_preview(this.pendingPreviewParams || this.getParams());
			config.need_render = true;
		}
	}

	refresh_preview(params = this.getParams()) {
		if (!this.tmpCanvas || this.sessionLayerId == null) return false;
		const layer = app.Layers.get_layer(this.sessionLayerId);
		if (!layer) return false;
		if (params.high_quality) {
			layer.link_canvas = this.tmpCanvas;
			config.need_render = true;
			return true;
		}
		if (!this.previewCanvas) {
			this.previewCanvas = document.createElement('canvas');
			this.previewCanvas.width = this.tmpCanvas.width;
			this.previewCanvas.height = this.tmpCanvas.height;
			this.previewCanvasCtx = this.previewCanvas.getContext('2d');
			this.previewDownsampleCanvas = document.createElement('canvas');
			this.previewDownsampleCanvas.width = Math.max(1, Math.round(this.tmpCanvas.width / 2));
			this.previewDownsampleCanvas.height = Math.max(1, Math.round(this.tmpCanvas.height / 2));
			this.previewDownsampleCtx = this.previewDownsampleCanvas.getContext('2d');
		}
		this.previewDownsampleCtx.clearRect(0, 0, this.previewDownsampleCanvas.width, this.previewDownsampleCanvas.height);
		this.previewDownsampleCtx.drawImage(this.tmpCanvas, 0, 0, this.previewDownsampleCanvas.width, this.previewDownsampleCanvas.height);
		this.previewCanvasCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
		this.previewCanvasCtx.imageSmoothingEnabled = true;
		this.previewCanvasCtx.drawImage(this.previewDownsampleCanvas, 0, 0, this.previewCanvas.width, this.previewCanvas.height);
		layer.link_canvas = this.previewCanvas;
		config.need_render = true;
		return true;
	}

	announce_session_change() {
		window.dispatchEvent(new CustomEvent('photo-studio-liquify-preview-change'));
	}

	discard_session() {
		if (this.previewRaf) {
			cancelAnimationFrame(this.previewRaf);
			this.previewRaf = 0;
		}
		this.clear_session_preview();
		if (this.tmpCanvas) {
			this.tmpCanvas.width = 1;
			this.tmpCanvas.height = 1;
		}
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		if (this.previewCanvas) {
			this.previewCanvas.width = 1;
			this.previewCanvas.height = 1;
		}
		if (this.previewDownsampleCanvas) {
			this.previewDownsampleCanvas.width = 1;
			this.previewDownsampleCanvas.height = 1;
		}
		if (this.regionCanvas) {
			this.regionCanvas.width = 1;
			this.regionCanvas.height = 1;
		}
		this.previewCanvas = null;
		this.previewCanvasCtx = null;
		this.previewDownsampleCanvas = null;
		this.previewDownsampleCtx = null;
		this.regionCanvas = null;
		this.regionCanvasCtx = null;
		if (this.sourceCanvas) {
			this.sourceCanvas.width = 1;
			this.sourceCanvas.height = 1;
		}
		this.sourceCanvas = null;
		this.sourceCanvasCtx = null;
		this.sessionLayerId = null;
		this.started = false;
		this.lastStrokePoint = null;
		this.announce_session_change();
	}

	cancel_session() {
		if (!this.has_session()) return false;
		this.discard_session();
		return true;
	}

	async apply_session() {
		if (!this.has_session()) return false;
		const layer = app.Layers.get_layer(this.sessionLayerId);
		if (!layer || layer.locked || layer.type != 'image') {
			this.discard_session();
			alertify.error('请选择未锁定的图片图层后使用液化。');
			return false;
		}
		this.flush_preview();
		const canvas = this.tmpCanvas;
		const layerId = this.sessionLayerId;
		this.clear_session_preview();
		try {
			await app.State.do_action(
				new app.Actions.Bundle_action('bulge_pinch_tool', 'Liquify Apply', [
					new app.Actions.Update_layer_image_action(canvas, layerId)
				])
			);
		}
		finally {
			this.discard_session();
		}
		return true;
	}

	on_leave() {
		this.cancel_session();
	}

	/**
	 * 沿拖拽路径插值落笔，使膨胀/收缩/旋转像 Pixlr 一样随鼠标连续变形。
	 * @param {{x:number,y:number}} from
	 * @param {{x:number,y:number}} to
	 * @param {object} params
	 */
	apply_stroke(from, to, params) {
		const mode = this.get_mode(params);
		const radius = Math.max(1, Number(params.radius) || 80);
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const distance = Math.hypot(dx, dy);
		if (mode === 'push') {
			if (distance < 0.5) return;
			this.push_general(from, to, radius, params.density, params.power);
			return;
		}
		const step = Math.max(1, radius * 0.18);
		const steps = distance < 0.5 ? 1 : Math.max(1, Math.ceil(distance / step));
		for (let index = 1; index <= steps; index++) {
			const t = index / steps;
			this.apply_dab({ x: from.x + dx * t, y: from.y + dy * t }, from, params);
		}
	}

	/**
	 * 在当前点落下一次笔触。推移在没有位移时不处理。
	 * @param {{x:number,y:number}} point
	 * @param {{x:number,y:number}|null} previous
	 * @param {object} params
	 */
	apply_dab(point, previous, params) {
		const mode = this.get_mode(params);
		const radius = Math.max(1, Number(params.radius) || 80);
		if (mode === 'push') {
			if (!previous) return;
			this.push_general(previous, point, radius, params.density, params.power);
			return;
		}
		if (mode === 'restore') {
			this.restore_general(point, radius, params.density, params.power);
			return;
		}
		if (mode === 'twirl_left' || mode === 'twirl_right') {
			this.twirl_general(point, params.power, radius, params.density, mode === 'twirl_left' ? -1 : 1);
			return;
		}
		this.bulgePinch_general(point, params.power, radius, params.density, mode !== 'pinch');
	}

	ensure_fx_filter() {
		if (this.fx_filter == false) {
			this.fx_filter = glfx.canvas();
		}
		return this.fx_filter;
	}

	/**
	 * 复用局部画布，只把笔刷范围交给 glfx，保证大图拖拽仍然实时。
	 * @param {number} width
	 * @param {number} height
	 * @returns {HTMLCanvasElement}
	 */
	get_region_canvas(width, height) {
		if (!this.regionCanvas) {
			this.regionCanvas = document.createElement('canvas');
			this.regionCanvasCtx = this.regionCanvas.getContext('2d');
		}
		if (this.regionCanvas.width !== width || this.regionCanvas.height !== height) {
			this.regionCanvas.width = width;
			this.regionCanvas.height = height;
		}
		return this.regionCanvas;
	}

	/**
	 * 在笔刷半径内调用 miniPaint 自带的 glfx 滤镜。
	 * @param {{x:number,y:number}} point
	 * @param {number} radius
	 * @param {(filter: object, localX: number, localY: number) => void} applyEffect
	 */
	apply_region_effect(point, radius, applyEffect) {
		if (!this.tmpCanvas || !this.tmpCanvasCtx) return;
		const pad = Math.max(2, Math.ceil(radius) + 2);
		const left = Math.max(0, Math.floor(point.x - pad));
		const top = Math.max(0, Math.floor(point.y - pad));
		const right = Math.min(this.tmpCanvas.width, Math.ceil(point.x + pad));
		const bottom = Math.min(this.tmpCanvas.height, Math.ceil(point.y + pad));
		const width = right - left;
		const height = bottom - top;
		if (width <= 1 || height <= 1) return;
		const region = this.get_region_canvas(width, height);
		this.regionCanvasCtx.clearRect(0, 0, width, height);
		this.regionCanvasCtx.drawImage(this.tmpCanvas, left, top, width, height, 0, 0, width, height);
		const filter = this.ensure_fx_filter();
		const texture = filter.texture(region);
		filter.draw(texture);
		applyEffect(filter, point.x - left, point.y - top);
		filter.update();
		if (typeof texture.destroy === 'function') texture.destroy();
		this.tmpCanvasCtx.drawImage(filter, 0, 0, width, height, left, top, width, height);
	}

	/**
	 * 使用上游 miniPaint / glfx 的 bulgePinch 做局部膨胀或收缩。
	 * @param {{x:number,y:number}} point
	 * @param {number} power
	 * @param {number} radius
	 * @param {number} density
	 * @param {boolean} bulge
	 */
	bulgePinch_general(point, power, radius, density, bulge) {
		const intensity = unitAmount(power) * unitAmount(density) * 0.55;
		const strength = bulge ? intensity : -intensity;
		this.apply_region_effect(point, radius, (filter, localX, localY) => {
			filter.bulgePinch(localX, localY, radius, strength);
		});
	}

	get_mode(params) {
		const configured = params.mode?.value ?? params.mode;
		if (typeof configured === 'string' && configured.length > 0) return configured;
		if (params.push) return 'push';
		return params.bulge === false ? 'pinch' : 'bulge';
	}

	/**
	 * 使用上游 glfx.swirl 做局部旋转。
	 * @param {{x:number,y:number}} point
	 * @param {number} power
	 * @param {number} radius
	 * @param {number} density
	 * @param {number} direction
	 */
	twirl_general(point, power, radius, density, direction) {
		const intensity = unitAmount(power) * unitAmount(density);
		const angle = direction * intensity * Math.PI * 0.35;
		this.apply_region_effect(point, radius, (filter, localX, localY) => {
			filter.swirl(localX, localY, radius, angle);
		});
	}

	/** Restore only the affected disc from the image that opened this session.
	 * This keeps the operation local and temporary until the normal Apply action.
	 */
	restore_general(point, radius, density, power) {
		if (!this.sourceCanvasCtx || !this.tmpCanvasCtx) return;
		const radiusX = Math.max(1, Math.round(this.adaptSize(radius, 'width')));
		const radiusY = Math.max(1, Math.round(this.adaptSize(radius, 'height')));
		const left = Math.max(0, Math.floor(point.x - radiusX));
		const top = Math.max(0, Math.floor(point.y - radiusY));
		const right = Math.min(this.tmpCanvas.width, Math.ceil(point.x + radiusX));
		const bottom = Math.min(this.tmpCanvas.height, Math.ceil(point.y + radiusY));
		const width = right - left;
		const height = bottom - top;
		if (width <= 0 || height <= 0) return;
		const current = this.tmpCanvasCtx.getImageData(left, top, width, height);
		const original = this.sourceCanvasCtx.getImageData(left, top, width, height);
		const strength = unitAmount(power) * unitAmount(density);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const nx = (left + x - point.x) / radiusX;
				const ny = (top + y - point.y) / radiusY;
				const distance = Math.sqrt(nx * nx + ny * ny);
				if (distance >= 1) continue;
				const alpha = (1 - distance) * (1 - distance) * strength;
				const index = (y * width + x) * 4;
				for (let channel = 0; channel < 4; channel++) {
					current.data[index + channel] = current.data[index + channel] * (1 - alpha) + original.data[index + channel] * alpha;
				}
			}
		}
		this.tmpCanvasCtx.putImageData(current, left, top);
	}

	get_layer_canvas_point(mouse) {
		let x = Math.round(mouse.x) - config.layer.x;
		let y = Math.round(mouse.y) - config.layer.y;
		x = Math.round(this.adaptSize(x, 'width'));
		y = Math.round(this.adaptSize(y, 'height'));
		return { x, y };
	}

	/**
	 * 推移：沿拖拽方向做局部反向采样。使用双线性插值，并把 Strength 计入位移幅度。
	 * @param {{x:number,y:number}} previous
	 * @param {{x:number,y:number}} current
	 * @param {number} radius
	 * @param {number} density
	 * @param {number} power
	 */
	push_general(previous, current, radius, density, power) {
		const radiusX = Math.max(1, Math.round(this.adaptSize(radius, 'width')));
		const radiusY = Math.max(1, Math.round(this.adaptSize(radius, 'height')));
		const influence = unitAmount(power) * unitAmount(density);
		const shiftX = (current.x - previous.x) * influence;
		const shiftY = (current.y - previous.y) * influence;
		if (Math.abs(shiftX) < 0.01 && Math.abs(shiftY) < 0.01) return;

		const extra = Math.ceil(Math.max(Math.abs(shiftX), Math.abs(shiftY))) + 1;
		const left = Math.max(0, Math.floor(current.x - radiusX - extra));
		const top = Math.max(0, Math.floor(current.y - radiusY - extra));
		const right = Math.min(this.tmpCanvas.width, Math.ceil(current.x + radiusX + extra));
		const bottom = Math.min(this.tmpCanvas.height, Math.ceil(current.y + radiusY + extra));
		const width = right - left;
		const height = bottom - top;
		if (width <= 0 || height <= 0) return;

		const imageData = this.tmpCanvasCtx.getImageData(left, top, width, height);
		const source = new Uint8ClampedArray(imageData.data);
		for (let localY = 0; localY < height; localY++) {
			for (let localX = 0; localX < width; localX++) {
				const dx = (left + localX - current.x) / radiusX;
				const dy = (top + localY - current.y) / radiusY;
				const distance = Math.sqrt(dx * dx + dy * dy);
				if (distance >= 1) continue;
				const falloff = (1 - distance) * (1 - distance);
				const sampleX = localX - shiftX * falloff;
				const sampleY = localY - shiftY * falloff;
				const destinationIndex = (localY * width + localX) * 4;
				sampleBilinear(source, width, height, sampleX, sampleY, imageData.data, destinationIndex);
			}
		}
		this.tmpCanvasCtx.putImageData(imageData, left, top);
	}

}
export default BulgePinch_class;
