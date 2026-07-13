import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import GUI_tools_class from './../core/gui/gui-tools.js';
import Base_gui_class from './../core/base-gui.js';
import Base_selection_class from './../core/base-selection.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Crop_class extends Base_tools_class {

	constructor(ctx) {
		super();
		var _this = this;
		this.Base_layers = new Base_layers_class();
		this.Base_gui = new Base_gui_class();
		this.GUI_tools = new GUI_tools_class();
		this.ctx = ctx;
		this.name = 'crop';
		this.selection = {
			x: null,
			y: null,
			width: null,
			height: null,
		};
		// A crop is a single document transaction. Pointer-drawn selections and
		// Crop-panel transforms are staging state only; neither may survive a
		// cancel or become their own undo step.
		this.pending_transform = {
			rotation: 0,
			straighten: 0,
			flip_horizontal: false,
			flip_vertical: false,
		};
		var sel_config = {
			enable_background: true,
			enable_borders: true,
			enable_controls: true,
			crop_lines: true,
			enable_rotation: false,
			enable_move: false,
			data_function: function () {
				return _this.selection;
			},
		};
		this.mousedown_selection = null;
		this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);
	}

	load() {
		this.default_events();
	}

	default_dragStart(event) {
		this.is_mousedown_canvas = false;
		if (config.TOOL.name != this.name)
			return;
		if (!event.target.closest('#main_wrapper'))
			return;

		this.is_mousedown_canvas = true;
		this.mousedown(event);
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (this.Base_selection.is_drag == false || mouse.click_valid == false)
			return;

		this.mousedown_selection = JSON.parse(JSON.stringify(this.selection));

		if (this.Base_selection.mouse_lock !== null) {
			return;
		}

		//create new selection
		this.Base_selection.set_selection(mouse.x, mouse.y, 0, 0);
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (this.Base_selection.is_drag == false || mouse.is_drag == false) {
			return;
		}
		if (e.type == 'mousedown' && mouse.click_valid == false) {
			return;
		}
		if (this.Base_selection.mouse_lock !== null) {
			return;
		}

		var width = mouse.x - mouse.click_x;
		var height = mouse.y - mouse.click_y;
		
		if(e.ctrlKey == true || e.metaKey){
			//ctrl is pressed - crop will be calculated based on global width and height ratio
			var ratio = config.WIDTH / config.HEIGHT;
			var width_new = Math.round(height * ratio);
			var height_new = Math.round(width / ratio);

			if(Math.abs(width * 100 / width_new) > Math.abs(height * 100 / height_new)){
				if (width * 100 / width_new > 0)
					height = height_new;
				else
					height = -height_new;
			}
			else{
				if (height * 100 / height_new > 0)
					width = width_new;
				else
					width = -width_new;
			}
		}

		this.Base_selection.set_selection(null, null, width, height);
	}

	async mouseup(e) {
		var mouse = this.get_mouse_info(e);

		if (!this.Base_selection.is_drag) {
			return;
		}
		if (e.type == 'mousedown' && mouse.click_valid == false) {
			return;
		}

		var width = mouse.x - this.selection.x;
		var height = mouse.y - this.selection.y;

		if (width == 0 || height == 0) {
			//cancel selection
			this.Base_selection.reset_selection();
			config.need_render = true;
			return;
		}

		if (this.selection.width != null) {
			//make sure coords not negative
			var details = this.selection;
			var x = details.x;
			var y = details.y;
			if (details.width < 0) {
				x = x + details.width;
			}
			if (details.height < 0) {
				y = y + details.height;
			}
			this.selection = {
				x: x,
				y: y,
				width: Math.abs(details.width),
				height: Math.abs(details.height),
			};
		}

		//control boundaries
		if (this.selection.x < 0) {
			this.selection.width += this.selection.x;
			this.selection.x = 0;
		}
		if (this.selection.y < 0) {
			this.selection.height += this.selection.y;
			this.selection.y = 0;
		}
		if (this.selection.x + this.selection.width > config.WIDTH) {
			this.selection.width = config.WIDTH - this.selection.x;
		}
		if (this.selection.y + this.selection.height > config.HEIGHT) {
			this.selection.height = config.HEIGHT - this.selection.y;
		}

		const action = new app.Actions.Set_selection_action(
			this.selection.x,
			this.selection.y,
			this.selection.width,
			this.selection.height,
			this.mousedown_selection
		);
		// This marker is intentionally attached to the real miniPaint action so
		// cancel can remove it from both undo and redo history after a pointer
		// drag. It is not an editor-shell-only approximation of the selection.
		action.crop_session_owner = this;
		await app.State.do_action(action);
	}

	get_pending_transform() {
		return {
			rotation: this.pending_transform.rotation,
			straighten: this.pending_transform.straighten,
			flip_horizontal: this.pending_transform.flip_horizontal,
			flip_vertical: this.pending_transform.flip_vertical,
		};
	}

	set_straighten_pending(angle) {
		const parsed = Number(angle);
		// Pixlr-style straighten is intentionally limited to a practical range.
		// Rounding prevents a range input from accumulating unusable float noise
		// in the staged crop transaction and its undo snapshot.
		this.pending_transform.straighten = Number.isFinite(parsed)
			? Math.round(Math.max(-45, Math.min(45, parsed)) * 10) / 10
			: 0;
		config.need_render = true;
	}

	rotate_pending(direction) {
		const delta = direction === 'left' ? -90 : 90;
		this.pending_transform.rotation = (this.pending_transform.rotation + delta + 360) % 360;
		config.need_render = true;
	}

	flip_pending(direction) {
		if (direction === 'vertical') {
			this.pending_transform.flip_vertical = !this.pending_transform.flip_vertical;
		} else {
			this.pending_transform.flip_horizontal = !this.pending_transform.flip_horizontal;
		}
		config.need_render = true;
	}

	clear_pending_transform() {
		this.pending_transform.rotation = 0;
		this.pending_transform.straighten = 0;
		this.pending_transform.flip_horizontal = false;
		this.pending_transform.flip_vertical = false;
		config.need_render = true;
	}

	async discard_session_selection_actions(restore_selection) {
		const state = app.State;
		if (!state?.action_history) return;

		for (let index = state.action_history.length - 1; index >= 0; index--) {
			const action = state.action_history[index];
			if (action?.crop_session_owner !== this) continue;

			const was_applied = index < state.action_history_index;
			if (restore_selection && was_applied) {
				// Crop controls do not create other history entries, but preserving
				// later entries makes this safe even if an integration adds one.
				const redo_count = state.action_history_index - index - 1;
				for (let undo_index = state.action_history_index - 1; undo_index >= index; undo_index--) {
					await state.action_history[undo_index].undo();
				}
				state.action_history_index = index;
				state.action_history.splice(index, 1);
				await action.free();
				for (let redo_index = index; redo_index < index + redo_count; redo_index++) {
					await state.action_history[redo_index].do();
					state.action_history_index++;
				}
			} else {
				state.action_history.splice(index, 1);
				if (was_applied) state.action_history_index--;
				await action.free();
			}
		}
	}

	async cancel_session() {
		await this.discard_session_selection_actions(true);
		this.selection = { x: null, y: null, width: null, height: null };
		this.Base_selection.reset_selection();
		this.clear_pending_transform();
		config.need_render = true;
	}

	transform_canvas(canvas, transform) {
		let output = canvas;
		const rotation = transform.rotation % 360;
		if (rotation !== 0) {
			const rotated = document.createElement('canvas');
			rotated.width = rotation % 180 === 0 ? output.width : output.height;
			rotated.height = rotation % 180 === 0 ? output.height : output.width;
			const context = rotated.getContext('2d');
			if (rotation === 90) {
				context.translate(rotated.width, 0);
				context.rotate(Math.PI / 2);
			} else if (rotation === 180) {
				context.translate(rotated.width, rotated.height);
				context.rotate(Math.PI);
			} else if (rotation === 270) {
				context.translate(0, rotated.height);
				context.rotate(-Math.PI / 2);
			}
			context.drawImage(output, 0, 0);
			output = rotated;
		}
		const straighten = Number(transform.straighten) || 0;
		if (Math.abs(straighten) > 0.0001) {
			// Unlike quarter-turns, straightening keeps the current crop bounds.
			// Transparent corners are deliberate: the user can refine the crop box
			// before Apply, and the document does not unexpectedly grow.
			const straightened = document.createElement('canvas');
			straightened.width = output.width;
			straightened.height = output.height;
			const context = straightened.getContext('2d');
			context.translate(straightened.width / 2, straightened.height / 2);
			context.rotate((straighten * Math.PI) / 180);
			context.drawImage(output, -output.width / 2, -output.height / 2);
			output = straightened;
		}
		if (transform.flip_horizontal || transform.flip_vertical) {
			const flipped = document.createElement('canvas');
			flipped.width = output.width;
			flipped.height = output.height;
			const context = flipped.getContext('2d');
			context.translate(transform.flip_horizontal ? flipped.width : 0, transform.flip_vertical ? flipped.height : 0);
			context.scale(transform.flip_horizontal ? -1 : 1, transform.flip_vertical ? -1 : 1);
			context.drawImage(output, 0, 0);
			output = flipped;
		}
		return output;
	}

	transform_rectangle(rectangle, canvas_width, canvas_height, transform) {
		let { x, y, width, height } = rectangle;
		let width_after = canvas_width;
		let height_after = canvas_height;
		const rotation = transform.rotation % 360;
		if (rotation === 90) {
			[x, y, width, height] = [canvas_height - (y + height), x, height, width];
			[width_after, height_after] = [canvas_height, canvas_width];
		} else if (rotation === 180) {
			[x, y] = [canvas_width - (x + width), canvas_height - (y + height)];
		} else if (rotation === 270) {
			[x, y, width, height] = [y, canvas_width - (x + width), height, width];
			[width_after, height_after] = [canvas_height, canvas_width];
		}
		if (transform.flip_horizontal) x = width_after - (x + width);
		if (transform.flip_vertical) y = height_after - (y + height);
		return { x, y, width, height, canvas_width: width_after, canvas_height: height_after };
	}

	/**
	 * Vector layers keep their local width/height when the document turns.  The
	 * renderer rotates text and shapes around that local rectangle's centre, so
	 * swapping width/height here would silently change text wrapping and shape
	 * geometry. Transform the centre through the document operation instead,
	 * then rebuild the same local rectangle around its new centre.
	 */
	transform_vector_rectangle(rectangle, canvas_width, canvas_height, transform) {
		const center = this.transform_rectangle({
			x: rectangle.x + rectangle.width / 2,
			y: rectangle.y + rectangle.height / 2,
			width: 0,
			height: 0,
		}, canvas_width, canvas_height, transform);
		return {
			x: center.x - rectangle.width / 2,
			y: center.y - rectangle.height / 2,
			width: rectangle.width,
			height: rectangle.height,
			canvas_width: center.canvas_width,
			canvas_height: center.canvas_height,
		};
	}

	/**
	 * A reflection has no equivalent in miniPaint's text/vector layer schema.
	 * Rasterize just that layer into the staged crop rectangle before applying
	 * the document transform. This keeps the visible result correct and, because
	 * it is represented by normal Insert/Delete actions in the Crop bundle,
	 * preserves undo/redo as one document transaction.
	 */
	rasterize_vector_for_crop(link, selection, transform) {
		const source = document.createElement('canvas');
		source.width = Math.max(1, Math.round(selection.width));
		source.height = Math.max(1, Math.round(selection.height));
		const context = source.getContext('2d');
		context.save();
		context.translate(-selection.x, -selection.y);
		this.Base_layers.render_object(context, link);
		context.restore();
		return this.transform_canvas(source, transform);
	}

	make_raster_replacement_actions(link, canvas) {
		const replacement = {
			id: link.id,
			parent_id: link.parent_id,
			name: link.name,
			type: 'image',
			data: canvas.toDataURL('image/png'),
			x: 0,
			y: 0,
			width: canvas.width,
			height: canvas.height,
			width_original: canvas.width,
			height_original: canvas.height,
			visible: link.visible,
			is_vector: false,
			hide_selection_if_active: link.hide_selection_if_active,
			opacity: link.opacity,
			order: link.order,
			composition: link.composition,
			rotate: 0,
			params: {},
			status: link.status,
			color: link.color,
			filters: [],
			render_function: null,
		};
		return [
			new app.Actions.Delete_layer_action(link.id, true),
			new app.Actions.Insert_layer_action(replacement, false),
		];
	}

	/**
	 * Arbitrary-angle straightening has no lossless equivalent for a mixed
	 * miniPaint document (text, shapes and images use different local geometry).
	 * Render each affected layer into the selected document rectangle, then turn
	 * that raster in document space.  This preserves visible layer order,
	 * opacity and blend mode while making the transformation one atomic Crop
	 * action that can be undone as a whole.
	 */
	rasterize_layer_for_straighten(link, selection, transform) {
		const source = document.createElement('canvas');
		source.width = Math.max(1, Math.round(selection.width));
		source.height = Math.max(1, Math.round(selection.height));
		const context = source.getContext('2d');
		context.save();
		context.translate(-selection.x, -selection.y);
		this.Base_layers.render_object(context, link);
		context.restore();
		return this.transform_canvas(source, transform);
	}

	async apply_straightened_document(selection, transform) {
		const dimensions = document.createElement('canvas');
		dimensions.width = Math.max(1, Math.round(selection.width));
		dimensions.height = Math.max(1, Math.round(selection.height));
		const output = this.transform_canvas(dimensions, transform);
		const actions = [];

		for (const link of config.layers) {
			if (link.type == null) continue;
			const raster = this.rasterize_layer_for_straighten(link, selection, transform);
			actions.push(...this.make_raster_replacement_actions(link, raster));
		}

		actions.push(
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({ WIDTH: output.width, HEIGHT: output.height }),
			new app.Actions.Prepare_canvas_action('do'),
			new app.Actions.Reset_selection_action(this.selection)
		);
		return app.State.do_action(new app.Actions.Bundle_action('crop_straighten', 'Crop Straighten', actions));
	}

	render(ctx, layer) {
		//nothing
	}

	/**
	 * do actual crop
	 */
	async on_params_update() {
		var params = this.getParams();
		var selection = this.selection;
		params.crop = true;
		this.GUI_tools.show_action_attributes();

		if (selection.width == null || selection.width == 0 || selection.height == 0) {
			alertify.error('Empty selection');
			return;
		}

		// Cropping translates every non-background layer and may raster-crop image
		// data. Refuse the whole operation before preparing any action so a locked
		// sibling can never leave the document half-cropped.
		var locked_name = false;
		for (var locked_index in config.layers) {
			var locked_layer = config.layers[locked_index];
			if (locked_layer.type != null && locked_layer.locked) {
				locked_name = locked_layer.name || locked_layer.id;
				break;
			}
		}
		if (locked_name !== false) {
			alertify.error('Crop cannot modify locked layers. Unlock the layer to continue. (' + locked_name + ')');
			return;
		}
		
		// Existing rotated raster layers still require a deliberate raster/edit
		// workflow. Vector layers are handled below: right-angle crop rotation is
		// semantic, while reflection rasterizes the vector safely.
		var rotated_name = false;
		for (var i in config.layers) {
			var link = config.layers[i];
			if (link.type == null)
				continue;

			if(link.type == 'image' && link.rotate > 0){
				rotated_name = link.name;
				break;
			}
		}
		if (rotated_name !== false) {
			alertify.error('Crop on rotated layer is not supported. Convert it to raster to continue.' + '('+ rotated_name + ')');
			return;
		}

		// A real drag produces Set_selection_action. It is staging history until
		// Apply; remove it now so Crop (including temporary rotate/flip) enters
		// history as one atomic bundle.
		await this.discard_session_selection_actions(false);
		const transform = this.get_pending_transform();

		//controll boundaries
		selection.x = Math.max(selection.x, 0);
		selection.y = Math.max(selection.y, 0);
		selection.width = Math.min(selection.width, config.WIDTH);
		selection.height = Math.min(selection.height, config.HEIGHT);

		if (Math.abs(Number(transform.straighten) || 0) > 0.0001) {
			const result = await this.apply_straightened_document(selection, transform);
			if (result?.status === 'completed') this.clear_pending_transform();
			return result;
		}

		let actions = [];

		for (var i in config.layers) {
			var link = config.layers[i];
			if (link.type == null)
				continue;

			const should_rasterize_vector = link.type !== 'image'
				&& (transform.flip_horizontal || transform.flip_vertical || !Number.isFinite(link.rotate));
			if (should_rasterize_vector) {
				const raster = this.rasterize_vector_for_crop(link, selection, transform);
				actions.push(...this.make_raster_replacement_actions(link, raster));
				continue;
			}

			let x = link.x;
			let y = link.y;
			let width = link.width;
			let height = link.height;
			let width_original = link.width_original;
			let height_original = link.height_original;

			//move
			x -= parseInt(selection.x);
			y -= parseInt(selection.y);

			let image_canvas = null;
			if (link.type == 'image') {
				//also remove unvisible data
				let left = 0;
				if (x < 0)
					left = -x;
				let top = 0;
				if (y < 0)
					top = -y;
				let right = 0;
				if (x + width > selection.width)
					right = x + width - selection.width;
				let bottom = 0;
				if (y + height > selection.height)
					bottom = y + height - selection.height;
				let crop_width = width - left - right;
				let crop_height = height - top - bottom;

				//if image was streched
				let width_ratio = (width / width_original);
				let height_ratio = (height / height_original);

				//create smaller canvas
				let canvas = document.createElement('canvas');
				let ctx = canvas.getContext("2d");
				canvas.width = crop_width / width_ratio;
				canvas.height = crop_height / height_ratio;

				//cut required part
				ctx.translate(-left / width_ratio, -top / height_ratio);
				canvas.getContext("2d").drawImage(link.link, 0, 0);
				ctx.translate(0, 0);
				//update attributes
				width = Math.ceil(canvas.width * width_ratio);
				height = Math.ceil(canvas.height * height_ratio);
				x += left;
				y += top;
				width_original = canvas.width;
				height_original = canvas.height;
				image_canvas = canvas;
			}

			const transformed = link.type === 'image'
				? this.transform_rectangle({ x, y, width, height }, selection.width, selection.height, transform)
				: this.transform_vector_rectangle({ x, y, width, height }, selection.width, selection.height, transform);
			x = transformed.x;
			y = transformed.y;
			width = transformed.width;
			height = transformed.height;
			if (image_canvas) {
				image_canvas = this.transform_canvas(image_canvas, transform);
				width_original = image_canvas.width;
				height_original = image_canvas.height;
				actions.push(new app.Actions.Update_layer_image_action(image_canvas, link.id));
			}

			const settings = {
					x,
					y,
					width,
					height,
					width_original,
					height_original
			};
			// A 90-degree document rotation has an exact vector equivalent: the
			// layer's local orientation rotates with the document while its bounding
			// rectangle was already transformed above. Reflections take the safe
			// raster route because text and arbitrary shapes have no flip field.
			if (link.type !== 'image' && transform.rotation !== 0) {
				settings.rotate = (Number(link.rotate) + transform.rotation + 360) % 360;
			}
			actions.push(new app.Actions.Update_layer_action(link.id, settings));
		}

		actions.push(
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({
				WIDTH: parseInt(this.transform_rectangle({ x: 0, y: 0, width: selection.width, height: selection.height }, selection.width, selection.height, transform).canvas_width),
				HEIGHT: parseInt(this.transform_rectangle({ x: 0, y: 0, width: selection.width, height: selection.height }, selection.width, selection.height, transform).canvas_height)
			}),
			new app.Actions.Prepare_canvas_action('do'),
			new app.Actions.Reset_selection_action(this.selection)
		);
		const result = await app.State.do_action(
			new app.Actions.Bundle_action('crop_tool', 'Crop Tool', actions)
		);
		if (result?.status === 'completed') this.clear_pending_transform();
		return result;
	}

	on_leave() {
		return [
			new app.Actions.Reset_selection_action(this.selection)
		];
	}

}

export default Crop_class;
