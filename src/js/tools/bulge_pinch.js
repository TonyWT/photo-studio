import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import glfx from './../libs/glfx.js';
import Helper_class from './../libs/helpers.js';

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
		this.started = false;
		this.sessionLayerId = null;
		this.lastPushPoint = null;
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
		}

		if (params.push) {
			this.lastPushPoint = this.get_layer_canvas_point(mouse);
		} else {
			this.bulgePinch_general(mouse, params.power, params.radius, params.bulge);
		}

		//register tmp canvas for faster redraw
		config.layer.link_canvas = this.tmpCanvas;
		config.need_render = true;
		this.announce_session_change();
	}

	is_webgl2_available() {
		const canvas = document.createElement('canvas');
		return Boolean(canvas.getContext('webgl2'));
	}

	mouseup(e) {
		if (this.started == false) return;
		this.started = false;
		this.lastPushPoint = null;
	}

	mousemove(e) {
		const mouse = this.get_mouse_info(e);
		const params = this.getParams();
		if (!this.started || !params.push || !mouse.is_drag || !mouse.click_valid || !this.tmpCanvas) return;
		const point = this.get_layer_canvas_point(mouse);
		if (this.lastPushPoint) this.push_general(this.lastPushPoint, point, params.radius, params.density);
		this.lastPushPoint = point;
		config.need_render = true;
		this.announce_session_change();
	}

	has_session() {
		return this.sessionLayerId != null && this.tmpCanvas != null;
	}

	clear_session_preview() {
		const layer = this.sessionLayerId == null ? null : app.Layers.get_layer(this.sessionLayerId);
		if (layer && layer.link_canvas === this.tmpCanvas) delete layer.link_canvas;
		config.need_render = true;
	}

	announce_session_change() {
		window.dispatchEvent(new CustomEvent('photo-studio-liquify-preview-change'));
	}

	discard_session() {
		this.clear_session_preview();
		if (this.tmpCanvas) {
			this.tmpCanvas.width = 1;
			this.tmpCanvas.height = 1;
		}
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.sessionLayerId = null;
		this.started = false;
		this.lastPushPoint = null;
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

	bulgePinch_general(mouse, power, radius, bulge) {
		if (this.fx_filter == false) {
			//init glfx lib
			this.fx_filter = glfx.canvas();
		}

		var ctx = this.tmpCanvasCtx;
		const point = this.get_layer_canvas_point(mouse);
		var mouse_x = point.x;
		var mouse_y = point.y;

		const density = Math.max(1, Math.min(100, Number(this.getParams().density) || 50));
		power = power / 100 * density / 100;
		if (power > 1) {
			//max 100%
			power = 1;
		}

		if (bulge == false)
			power = -1 * power;

		var texture = this.fx_filter.texture(this.tmpCanvas);
		this.fx_filter.draw(texture).bulgePinch(mouse_x, mouse_y, radius, power).update();	//effect
		this.tmpCanvasCtx.clearRect(0, 0, this.tmpCanvas.width, this.tmpCanvas.height);
		this.tmpCanvasCtx.drawImage(this.fx_filter, 0, 0);
	}

	get_layer_canvas_point(mouse) {
		let x = Math.round(mouse.x) - config.layer.x;
		let y = Math.round(mouse.y) - config.layer.y;
		x = Math.round(this.adaptSize(x, 'width'));
		y = Math.round(this.adaptSize(y, 'height'));
		return { x, y };
	}

	/**
	 * A small, deterministic local warp for the Push subtype.  The displacement
	 * is inverse-sampled from the preceding brush point so dragging right pulls
	 * nearby pixels right with a soft radial falloff.  It runs only on the
	 * temporary Liquify canvas, so Apply/Cancel keep the existing one-history
	 * transaction model and never contact a remote service.
	 */
	push_general(previous, current, radius, density) {
		const radiusX = Math.max(1, Math.round(this.adaptSize(radius, 'width')));
		const radiusY = Math.max(1, Math.round(this.adaptSize(radius, 'height')));
		const influence = Math.max(0.01, Math.min(1, Number(density) / 100 || 0.5));
		const shiftX = (current.x - previous.x) * influence;
		const shiftY = (current.y - previous.y) * influence;
		if (Math.abs(shiftX) < 0.01 && Math.abs(shiftY) < 0.01) return;

		const left = Math.max(0, Math.floor(current.x - radiusX - Math.abs(shiftX)));
		const top = Math.max(0, Math.floor(current.y - radiusY - Math.abs(shiftY)));
		const right = Math.min(this.tmpCanvas.width, Math.ceil(current.x + radiusX + Math.abs(shiftX)));
		const bottom = Math.min(this.tmpCanvas.height, Math.ceil(current.y + radiusY + Math.abs(shiftY)));
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
				const sampleX = Math.round(localX - shiftX * falloff);
				const sampleY = Math.round(localY - shiftY * falloff);
				if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) continue;
				const destinationIndex = (localY * width + localX) * 4;
				const sourceIndex = (sampleY * width + sampleX) * 4;
				imageData.data[destinationIndex] = source[sourceIndex];
				imageData.data[destinationIndex + 1] = source[sourceIndex + 1];
				imageData.data[destinationIndex + 2] = source[sourceIndex + 2];
				imageData.data[destinationIndex + 3] = source[sourceIndex + 3];
			}
		}
		this.tmpCanvasCtx.putImageData(imageData, left, top);
	}

}
export default BulgePinch_class;
