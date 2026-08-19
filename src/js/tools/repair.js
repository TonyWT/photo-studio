import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Repair_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'repair';
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.started = false;
	}

	load() {
		this.default_events();
	}

	default_dragMove(event) {
		if (config.TOOL.name !== this.name) return;
		this.mousemove(event);
		const mouse = this.get_mouse_info(event);
		this.show_mouse_cursor(mouse.x, mouse.y, this.getParams().size, 'circle');
	}

	mousedown(event) {
		this.started = false;
		const mouse = this.get_mouse_info(event);
		if (!mouse.click_valid || !config.layer || config.layer.locked) return;
		if (config.layer.type !== 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}
		if (config.layer.rotate || 0 > 0) {
			alertify.error('Repair on rotate object is disabled. Please rasterize first.');
			return;
		}

		this.started = true;
		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvas.width = config.layer.width_original;
		this.tmpCanvas.height = config.layer.height_original;
		this.tmpCanvasCtx = this.tmpCanvas.getContext('2d', { willReadFrequently: true });
		this.tmpCanvasCtx.drawImage(config.layer.link, 0, 0);
		this.apply_brush(mouse, this.getParams());
		config.layer.link_canvas = this.tmpCanvas;
		config.need_render = true;
	}

	mousemove(event) {
		const mouse = this.get_mouse_info(event);
		if (!this.started || !mouse.is_drag || !mouse.click_valid) return;
		this.apply_brush(mouse, this.getParams());
		config.need_render = true;
	}

	mouseup() {
		if (!this.started) return;
		this.started = false;
		delete config.layer.link_canvas;
		const canvas = this.tmpCanvas;
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		app.State.do_action(new app.Actions.Bundle_action('repair_tool', 'Repair Tool', [
			new app.Actions.Update_layer_image_action(canvas),
		]));
	}

	/**
	 * 用笔刷外圈像素的均值填补内圈污点。只读取笔刷邻域，避免整图 copy。
	 * @param {object} mouse
	 * @param {object} params
	 */
	apply_brush(mouse, params) {
		if (!this.tmpCanvas || !this.tmpCanvasCtx) return;
		const size = Math.max(1, Number(params.size) || 30);
		let centerX = Math.round(mouse.x) - (Number(config.layer.x) || 0);
		let centerY = Math.round(mouse.y) - (Number(config.layer.y) || 0);
		centerX = Math.round(this.adaptSize(centerX, 'width'));
		centerY = Math.round(this.adaptSize(centerY, 'height'));
		const radiusX = Math.max(1, Math.round(this.adaptSize(size, 'width') / 2));
		const radiusY = Math.max(1, Math.round(this.adaptSize(size, 'height') / 2));
		const margin = Math.max(2, Math.round(Math.max(radiusX, radiusY) * 0.45));
		const sampleLeft = Math.max(0, centerX - radiusX - margin);
		const sampleTop = Math.max(0, centerY - radiusY - margin);
		const sampleRight = Math.min(this.tmpCanvas.width, centerX + radiusX + margin + 1);
		const sampleBottom = Math.min(this.tmpCanvas.height, centerY + radiusY + margin + 1);
		const sampleWidth = sampleRight - sampleLeft;
		const sampleHeight = sampleBottom - sampleTop;
		if (sampleWidth <= 0 || sampleHeight <= 0) return;

		const quality = params.quality?.value ?? params.quality ?? 'balanced';
		const outerScale = quality === 'speed' ? 1.25 : quality === 'quality' ? 1.7 : 1.45;
		const source = this.tmpCanvasCtx.getImageData(sampleLeft, sampleTop, sampleWidth, sampleHeight);
		const ring = [0, 0, 0];
		let ringCount = 0;
		for (let y = 0; y < sampleHeight; y += 1) {
			for (let x = 0; x < sampleWidth; x += 1) {
				const dist = this.brushDistance(sampleLeft + x, sampleTop + y, centerX, centerY, radiusX, radiusY);
				if (dist <= 1 || dist > outerScale) continue;
				const index = (y * sampleWidth + x) * 4;
				ring[0] += source.data[index];
				ring[1] += source.data[index + 1];
				ring[2] += source.data[index + 2];
				ringCount += 1;
			}
		}
		if (ringCount === 0) return;
		ring[0] /= ringCount;
		ring[1] /= ringCount;
		ring[2] /= ringCount;

		const left = Math.max(sampleLeft, centerX - radiusX);
		const top = Math.max(sampleTop, centerY - radiusY);
		const width = Math.min(sampleRight, centerX + radiusX + 1) - left;
		const height = Math.min(sampleBottom, centerY + radiusY + 1) - top;
		if (width <= 0 || height <= 0) return;
		const result = this.tmpCanvasCtx.getImageData(left, top, width, height);
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const dist = this.brushDistance(left + x, top + y, centerX, centerY, radiusX, radiusY);
				if (dist > 1) continue;
				const blend = dist < 0.62 ? 1 : (1 - (dist - 0.62) / 0.38) ** 2;
				const index = (y * width + x) * 4;
				for (let channel = 0; channel < 3; channel += 1) {
					result.data[index + channel] = result.data[index + channel] * (1 - blend) + ring[channel] * blend;
				}
			}
		}
		this.tmpCanvasCtx.putImageData(result, left, top);
	}

	/**
	 * 椭圆笔刷内的归一化距离，圆心为 0，边缘为 1。
	 * @param {number} x
	 * @param {number} y
	 * @param {number} centerX
	 * @param {number} centerY
	 * @param {number} radiusX
	 * @param {number} radiusY
	 * @returns {number}
	 */
	brushDistance(x, y, centerX, centerY, radiusX, radiusY) {
		const distanceX = (x - centerX) / radiusX;
		const distanceY = (y - centerY) / radiusY;
		return Math.sqrt(distanceX * distanceX + distanceY * distanceY);
	}
}

export default Repair_class;
