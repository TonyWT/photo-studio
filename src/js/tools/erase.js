import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { copyVisibleLayerImage, hasErasablePixels, isDrawableLayer, notifyNotDrawable, queueLayerImageWrite, settlePaintedLayerImage, shouldPaintOnCurrentLayer, TRANSPARENT_PIXEL } from './../libs/draw-on-layer.js';

class Erase_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'erase';
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.started = false;
		this.strokeLastX = null;
		this.strokeLastY = null;
	}

	load() {
		this.default_events();
	}

	default_dragMove(event, is_touch) {
		if (config.TOOL.name != this.name)
			return;
		this.mousemove(event, is_touch);

		//mouse cursor
		var mouse = this.get_mouse_info(event);
		var params = this.getParams();
		if (params.circle == true)
			this.show_mouse_cursor(mouse.x, mouse.y, params.size, 'circle');
		else
			this.show_mouse_cursor(mouse.x, mouse.y, params.size, 'rect');
	}

	on_params_update() {
		var params = this.getParams();
		var strict_element = document.querySelector('.attributes #strict');

		if (params.circle == false) {
			//hide strict controls
			strict_element.style.display = 'none';
		}
		else {
			//show strict controls
			strict_element.style.display = 'block';
		}
	}

	mousedown(e) {
		this.started = false;
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();
		if (mouse.click_valid == false) {
			return;
		}
		if (config.layer.locked == true) {
			alertify.error('This layer is locked. Unlock it before editing.');
			return;
		}
		if (config.layer.type != 'image') {
			if (shouldPaintOnCurrentLayer() && isDrawableLayer(config.layer) && hasErasablePixels(config.layer)) {
				// Draw 刚提交时会暂时把 type 还原成 null，但 link_canvas 上已经有可见笔触。
			} else if (shouldPaintOnCurrentLayer()) {
				notifyNotDrawable();
				return;
			} else {
				alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
				return;
			}
		}
		if (config.layer.is_vector == true) {
			alertify.error('Layer is vector, convert it to raster to apply this tool.');
			return;
		}
		if (config.layer.rotate || 0 > 0) {
			alertify.error('Erase on rotate object is disabled. Please rasterize first.');
			return;
		}
		this.started = true;
		this.strokeLastX = null;
		this.strokeLastY = null;

		const source = config.layer.link_canvas || config.layer.link;
		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvasCtx = this.tmpCanvas.getContext("2d");
		this.tmpCanvas.width = config.layer.width_original || source?.width || source?.naturalWidth || config.WIDTH;
		this.tmpCanvas.height = config.layer.height_original || source?.height || source?.naturalHeight || config.HEIGHT;
		/** 从当前可见像素取样，才能擦掉尚未写回 `layer.link` 的画笔。 */
		copyVisibleLayerImage(this.tmpCanvasCtx, config.layer);

		const displayWidth = config.layer.width || this.tmpCanvas.width;
		const displayHeight = config.layer.height || this.tmpCanvas.height;
		if (displayWidth && displayHeight) {
			this.tmpCanvasCtx.scale(
				this.tmpCanvas.width / displayWidth,
				this.tmpCanvas.height / displayHeight
			);
		}

		//do erase
		this.erase_general(this.tmpCanvasCtx, 'click', mouse, params.size, params.strict, params.circle, false, params.softness);

		//register tmp canvas for faster redraw
		config.layer.link_canvas = this.tmpCanvas;
		config.need_render = true;
	}

	mousemove(e, is_touch) {
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}
		if (this.started == false) {
			return;
		}
		if (mouse.click_x == mouse.x && mouse.click_y == mouse.y) {
			//same coordinates
			return;
		}

		//do erase
		this.erase_general(this.tmpCanvasCtx, 'move', mouse, params.size, params.strict, params.circle, is_touch, params.softness);

		//draw draft preview
		config.need_render = true;
	}

	mouseup(e) {
		if (this.started == false) {
			return;
		}
		this.started = false;
		this.strokeLastX = null;
		this.strokeLastY = null;
		const canvas = this.tmpCanvas;
		const layer = config.layer;
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		if (!canvas || !layer) return;

		const actions = [];
		if (layer.type != 'image') {
			const image = new Image();
			image.src = TRANSPARENT_PIXEL;
			actions.push(new app.Actions.Update_layer_action(layer.id, {
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
		actions.push(new app.Actions.Update_layer_image_action(canvas, layer.id));
		void settlePaintedLayerImage(
			canvas,
			layer,
			queueLayerImageWrite(layer, () => app.State.do_action(
				new app.Actions.Bundle_action('erase_tool', 'Erase Tool', actions)
			)),
		);
	}

	/**
	 * 在图层像素上盖一个 destination-out 圆戳。
	 * @param {CanvasRenderingContext2D} ctx
	 * @param {number} x
	 * @param {number} y
	 * @param {number} size
	 * @param {number} eraseAlpha
	 * @param {number} softnessValue
	 * @returns {void}
	 */
	stampEraseCircle(ctx, x, y, size, eraseAlpha, softnessValue) {
		ctx.save();
		ctx.globalCompositeOperation = 'destination-out';
		if (softnessValue > 0) {
			const featherStop = Math.max(0.08, 1 - softnessValue / 100);
			const radgrad = ctx.createRadialGradient(
				x, y, size / 2 * featherStop,
				x, y, size / 2);
			radgrad.addColorStop(0, "rgba(255, 255, 255, " + eraseAlpha + ")");
			radgrad.addColorStop(1, "rgba(255, 255, 255, 0)");
			ctx.fillStyle = radgrad;
		} else {
			ctx.fillStyle = "rgba(255, 255, 255, " + eraseAlpha + ")";
		}
		ctx.beginPath();
		ctx.arc(x, y, size / 2, 0, Math.PI * 2, true);
		ctx.fill();
		ctx.restore();
	}

	/**
	 * 按圆形/方形和柔化把目标像素变成透明。
	 * @param {CanvasRenderingContext2D} ctx
	 * @param {'click' | 'move'} type
	 * @param {object} mouse
	 * @param {number} size
	 * @param {boolean} strict
	 * @param {boolean} is_circle
	 * @param {boolean} [is_touch]
	 * @param {number} [softness]
	 * @returns {void}
	 */
	erase_general(ctx, type, mouse, size, strict, is_circle, is_touch, softness) {
		var mouse_x = Math.round(mouse.x) - config.layer.x;
		var mouse_y = Math.round(mouse.y) - config.layer.y;
		var alpha = config.ALPHA;
		const eraseAlpha = alpha / 255;
		const softnessValue = Math.max(0, Math.min(100, Number(softness) || 0));
		const useSoft = is_circle && (softnessValue > 0 || strict == false);
		const stampSoftness = softnessValue > 0 ? softnessValue : (strict == false ? 20 : 0);
		const lastX = Number.isFinite(this.strokeLastX) ? this.strokeLastX : mouse_x;
		const lastY = Number.isFinite(this.strokeLastY) ? this.strokeLastY : mouse_y;

		if (is_circle == false) {
			var size_half = Math.ceil(size / 2);
			if (size == 1) {
				mouse_x = Math.floor(mouse.x) - config.layer.x;
				mouse_y = Math.floor(mouse.y) - config.layer.y;
				size_half = 0;
			}
			ctx.save();
			ctx.globalCompositeOperation = 'destination-out';
			ctx.fillStyle = "rgba(255, 255, 255, " + eraseAlpha + ")";
			ctx.fillRect(mouse_x - size_half, mouse_y - size_half, size, size);
			ctx.restore();
			this.strokeLastX = mouse_x;
			this.strokeLastY = mouse_y;
			return;
		}

		this.stampEraseCircle(ctx, mouse_x, mouse_y, size, eraseAlpha, stampSoftness);

		if (type == 'move' && (mouse_x !== lastX || mouse_y !== lastY)) {
			const dx = mouse_x - lastX;
			const dy = mouse_y - lastY;
			const distance = Math.hypot(dx, dy);
			const spacing = Math.max(1, size / 4);
			if (distance > spacing) {
				const steps = Math.floor(distance / spacing);
				for (let i = 1; i < steps; i++) {
					const t = i / steps;
					this.stampEraseCircle(ctx, lastX + dx * t, lastY + dy * t, size, eraseAlpha, stampSoftness);
				}
			}

			if (!useSoft) {
				ctx.save();
				ctx.globalCompositeOperation = 'destination-out';
				ctx.lineWidth = size;
				ctx.lineCap = 'round';
				ctx.lineJoin = 'round';
				ctx.strokeStyle = "rgba(255, 255, 255, " + eraseAlpha + ")";
				ctx.beginPath();
				ctx.moveTo(lastX, lastY);
				ctx.lineTo(mouse_x, mouse_y);
				ctx.stroke();
				ctx.restore();
			}
		}

		this.strokeLastX = mouse_x;
		this.strokeLastY = mouse_y;
	}

}
export default Erase_class;
