import app from './../app.js';
import config from './../config.js';
import { Base_action } from './base.js';

export class Add_layer_filter_action extends Base_action {
	/**
	 * register new live filter
	 *
	 * @param {int} layer_id
	 * @param {string} name
	 * @param {object} params
	 */
	constructor(layer_id, name, params, filter_id) {
		super('add_layer_filter', 'Add Layer Filter');
		if (layer_id == null)
			layer_id = config.layer.id;
		this.layer_id = parseInt(layer_id);
		this.name = name;
		this.params = params;
		this.filter_id = filter_id;
		this.reference_layer = null;
		this.filter_index = null;
		this.old_filter = null;
	}

	async do() {
		this.reference_layer = app.Layers.get_layer(this.layer_id);
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}
		if (this.reference_layer.locked) {
			throw new Error('Aborted - Locked layer filter cannot be changed');
		}
		var filter = {
			id: this.filter_id,
			name: this.name,
			params: this.params,
		};
		this.filter_index = null;
		this.old_filter = null;
		if(this.filter_id) {
			//update
			for(var i in this.reference_layer.filters) {
				if(this.reference_layer.filters[i].id == this.filter_id){
					this.filter_index = Number(i);
					this.old_filter = this.reference_layer.filters[i];
					break;
				}
			}
			if (this.filter_index == null) {
				throw new Error('Aborted - filter with specified id doesn\'t exist in layer');
			}
			// An aborted action must not be considered complete. State only records
			// actions after the target has passed every target and lock check.
			super.do();
			this.reference_layer.filters[this.filter_index] = filter;
		}
		else{
			//insert
			filter.id = Math.floor(Math.random() * 999999999) + 1; // A good UUID library would
			super.do();
			this.reference_layer.filters.push(filter);
			this.filter_index = this.reference_layer.filters.length - 1;
		}
		config.need_render = true;
		app.GUI.GUI_layers.render_layers();
	}

	async undo() {
		super.undo();
		if (this.reference_layer && this.filter_index != null) {
			if (this.old_filter) {
				this.reference_layer.filters[this.filter_index] = this.old_filter;
			}
			else {
				this.reference_layer.filters.splice(this.filter_index, 1);
			}
			this.reference_layer = null;
		}
		config.need_render = true;
		app.GUI.GUI_layers.render_layers();
	}

	free() {
		this.reference_layer = null;
		this.params = null;
		this.old_filter = null;
		this.filter_index = null;
	}
}
