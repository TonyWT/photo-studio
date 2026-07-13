import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class DodgeBurn_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.name = 'dodge_burn';
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.started = false;
	}

	load() {
		this.default_events();
	}

	default_dragMove(event) {
		if (config.TOOL.name != this.name) return;
		this.mousemove(event);
		const mouse = this.get_mouse_info(event);
		const params = this.getParams();
		this.show_mouse_cursor(mouse.x, mouse.y, params.size, 'circle');
	}

	mousedown(e) {
		this.started = false;
		const mouse = this.get_mouse_info(e);
		const params = this.getParams();
		if (!mouse.click_valid || !config.layer || config.layer.locked) return;
		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}
		if (config.layer.rotate || 0 > 0) {
			alertify.error('Dodge/Burn on rotate object is disabled. Please rasterize first.');
			return;
		}

		this.started = true;
		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvas.width = config.layer.width_original;
		this.tmpCanvas.height = config.layer.height_original;
		this.tmpCanvasCtx = this.tmpCanvas.getContext('2d', { willReadFrequently: true });
		this.tmpCanvasCtx.drawImage(config.layer.link, 0, 0);
		this.apply_brush(mouse, params);
		config.layer.link_canvas = this.tmpCanvas;
		config.need_render = true;
	}

	mousemove(e) {
		const mouse = this.get_mouse_info(e);
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
		app.State.do_action(new app.Actions.Bundle_action('dodge_burn_tool', 'Dodge/Burn Tool', [
			new app.Actions.Update_layer_image_action(canvas)
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

		const imageData = this.tmpCanvasCtx.getImageData(left, top, width, height);
		const strength = Math.max(0, Math.min(1, Number(params.strength) / 100 || 0.5));
		const isDodge = params.mode?.value !== 'burn';
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const distanceX = (left + x - centerX) / radiusX;
				const distanceY = (top + y - centerY) / radiusY;
				const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
				if (distance >= 1) continue;
				const amount = strength * (1 - distance) * (1 - distance);
				const index = (y * width + x) * 4;
				for (let channel = 0; channel < 3; channel++) {
					const value = imageData.data[index + channel];
					imageData.data[index + channel] = isDodge
						? Math.round(value + (255 - value) * amount)
						: Math.round(value * (1 - amount));
				}
			}
		}
		this.tmpCanvasCtx.putImageData(imageData, left, top);
	}
}

export default DodgeBurn_class;
