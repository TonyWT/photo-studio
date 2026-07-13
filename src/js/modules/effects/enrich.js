import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import ImageFilters from './../../libs/imagefilters.js';
import { captureEditableImageLayer, commitCapturedFilter } from './filter-commit.js';

class Effects_enrich_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
	}

	enrich() {
		var _this = this;
		var target = captureEditableImageLayer();
		if (!target) return;

		var settings = {
			title: 'Enrich',
			preview: true,
			effects: true,
			params: [],
			on_change: function (params, canvas_preview, w, h) {
				var img = canvas_preview.getImageData(0, 0, w, h);
				var data = _this.change(img, params);
				canvas_preview.putImageData(data, 0, 0);
			},
			on_finish: function (params) {
				_this.save(params, target);
			},
		};
		this.POP.show(settings);
	}

	save(params, target) {
		return commitCapturedFilter(this.Base_layers, target, (canvas) => {
			var ctx = canvas.getContext("2d");
			var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
			ctx.putImageData(this.change(img, params), 0, 0);
		});
	}

	change(data, params) {
		var filtered = ImageFilters.Enrich(data);

		return filtered;
	}

	demo(canvas_id, canvas_thumb){
		var canvas = document.getElementById(canvas_id);
		var ctx = canvas.getContext("2d");
		ctx.drawImage(canvas_thumb, 0, 0);

		//now update
		var img = ctx.getImageData(0, 0, canvas_thumb.width, canvas_thumb.height);
		var params = {}
		var data = this.change(img, params);
		ctx.putImageData(data, 0, 0);
	}

}

export default Effects_enrich_class;
