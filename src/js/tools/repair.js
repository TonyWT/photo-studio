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

	apply_brush(mouse, params) {
		let centerX = Math.round(mouse.x) - config.layer.x;
		let centerY = Math.round(mouse.y) - config.layer.y;
		centerX = Math.round(this.adaptSize(centerX, 'width'));
		centerY = Math.round(this.adaptSize(centerY, 'height'));
		const radiusX = Math.max(1, Math.round(this.adaptSize(params.size, 'width') / 2));
		const radiusY = Math.max(1, Math.round(this.adaptSize(params.size, 'height') / 2));
		const left = Math.max(0, centerX - radiusX);
		const top = Math.max(0, centerY - radiusY);
		const right = Math.min(this.tmpCanvas.width, centerX + radiusX + 1);
		const bottom = Math.min(this.tmpCanvas.height, centerY + radiusY + 1);
		const width = right - left;
		const height = bottom - top;
		if (width <= 0 || height <= 0) return;

		const source = this.tmpCanvasCtx.getImageData(0, 0, this.tmpCanvas.width, this.tmpCanvas.height);
		const result = this.tmpCanvasCtx.getImageData(left, top, width, height);
		const quality = params.quality?.value ?? params.quality ?? 'balanced';
		// The three local modes deliberately trade the sample window size for
		// speed. They remain deterministic median repair; no model or network
		// inference is involved.
		const sampleRadius = quality === 'speed' ? 1 : quality === 'quality' ? 3 : 2;
		const channelValues = new Array((sampleRadius * 2 + 1) ** 2);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const targetX = left + x;
				const targetY = top + y;
				const distanceX = (targetX - centerX) / radiusX;
				const distanceY = (targetY - centerY) / radiusY;
				if (Math.sqrt(distanceX * distanceX + distanceY * distanceY) > 1) continue;
				const targetIndex = (y * width + x) * 4;
				for (let channel = 0; channel < 3; channel++) {
					let count = 0;
					for (let offsetY = -sampleRadius; offsetY <= sampleRadius; offsetY++) {
						const sampleY = Math.max(0, Math.min(source.height - 1, targetY + offsetY));
						for (let offsetX = -sampleRadius; offsetX <= sampleRadius; offsetX++) {
							const sampleX = Math.max(0, Math.min(source.width - 1, targetX + offsetX));
							channelValues[count++] = source.data[(sampleY * source.width + sampleX) * 4 + channel];
						}
					}
					channelValues.sort((a, b) => a - b);
					result.data[targetIndex + channel] = channelValues[Math.floor(count / 2)];
				}
			}
		}
		this.tmpCanvasCtx.putImageData(result, left, top);
	}
}

export default Repair_class;
