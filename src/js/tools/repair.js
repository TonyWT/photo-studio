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
	 * 从笔刷外圈取样填补内圈污点。只读取笔刷邻域，避免整图 copy。
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
		const left = Math.max(0, centerX - radiusX);
		const top = Math.max(0, centerY - radiusY);
		const right = Math.min(this.tmpCanvas.width, centerX + radiusX + 1);
		const bottom = Math.min(this.tmpCanvas.height, centerY + radiusY + 1);
		const width = right - left;
		const height = bottom - top;
		if (width <= 0 || height <= 0) return;

		const quality = params.quality?.value ?? params.quality ?? 'balanced';
		const sampleCount = quality === 'speed' ? 1 : quality === 'quality' ? 8 : 3;
		const margin = Math.max(2, Math.round(Math.max(radiusX, radiusY) * 0.45));
		const sampleLeft = Math.max(0, left - margin);
		const sampleTop = Math.max(0, top - margin);
		const sampleRight = Math.min(this.tmpCanvas.width, right + margin);
		const sampleBottom = Math.min(this.tmpCanvas.height, bottom + margin);
		const source = this.tmpCanvasCtx.getImageData(
			sampleLeft,
			sampleTop,
			sampleRight - sampleLeft,
			sampleBottom - sampleTop,
		);
		const result = this.tmpCanvasCtx.getImageData(left, top, width, height);
		const mixed = [0, 0, 0];
		const sample = [0, 0, 0];

		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const targetX = left + x;
				const targetY = top + y;
				const distanceX = (targetX - centerX) / radiusX;
				const distanceY = (targetY - centerY) / radiusY;
				const dist = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
				if (dist > 1.05) continue;
				const blend = dist >= 1 ? 0.15 : (1 - dist) * (1 - dist);
				if (blend <= 0) continue;

				let dirX = targetX - centerX;
				let dirY = targetY - centerY;
				const length = Math.hypot(dirX, dirY);
				if (length < 1e-6) {
					dirX = 1;
					dirY = 0;
				} else {
					dirX /= length;
					dirY /= length;
				}

				mixed[0] = mixed[1] = mixed[2] = 0;
				for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
					const angle = sampleCount === 1 ? 0 : (sampleIndex / sampleCount) * Math.PI * 2;
					const cos = Math.cos(angle);
					const sin = Math.sin(angle);
					const rayX = dirX * cos - dirY * sin;
					const rayY = dirX * sin + dirY * cos;
					this.sampleSourcePixel(
						source,
						sampleLeft,
						sampleTop,
						centerX + rayX * (radiusX + margin * 0.6),
						centerY + rayY * (radiusY + margin * 0.6),
						sample,
					);
					mixed[0] += sample[0];
					mixed[1] += sample[1];
					mixed[2] += sample[2];
				}

				const targetIndex = (y * width + x) * 4;
				for (let channel = 0; channel < 3; channel += 1) {
					const healed = mixed[channel] / sampleCount;
					result.data[targetIndex + channel] = result.data[targetIndex + channel] * (1 - blend) + healed * blend;
				}
			}
		}
		this.tmpCanvasCtx.putImageData(result, left, top);
	}

	/**
	 * 从邻域 ImageData 双线性取样 RGB。
	 * @param {ImageData} source
	 * @param {number} originX
	 * @param {number} originY
	 * @param {number} imageX
	 * @param {number} imageY
	 * @param {number[]} into
	 */
	sampleSourcePixel(source, originX, originY, imageX, imageY, into) {
		const localX = Math.max(0, Math.min(source.width - 1, imageX - originX));
		const localY = Math.max(0, Math.min(source.height - 1, imageY - originY));
		const x0 = Math.floor(localX);
		const y0 = Math.floor(localY);
		const x1 = Math.min(source.width - 1, x0 + 1);
		const y1 = Math.min(source.height - 1, y0 + 1);
		const tx = localX - x0;
		const ty = localY - y0;
		const at = (x, y) => (y * source.width + x) * 4;
		const i00 = at(x0, y0);
		const i10 = at(x1, y0);
		const i01 = at(x0, y1);
		const i11 = at(x1, y1);
		for (let channel = 0; channel < 3; channel += 1) {
			const topMix = source.data[i00 + channel] * (1 - tx) + source.data[i10 + channel] * tx;
			const bottomMix = source.data[i01 + channel] * (1 - tx) + source.data[i11 + channel] * tx;
			into[channel] = topMix * (1 - ty) + bottomMix * ty;
		}
	}
}

export default Repair_class;
