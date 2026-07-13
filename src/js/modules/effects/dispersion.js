import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import { captureEditableImageLayer, commitCapturedFilter } from './filter-commit.js';

class Effects_dispersion_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
	}

	dispersion() {
		var _this = this;
		var target = captureEditableImageLayer();
		if (!target) return;

		this.POP.show({
			title: '色散',
			preview: true,
			effects: true,
			params: [
				{name: 'distance', title: 'Distance:', value: 8, range: [1, 40]},
			],
			on_change: function (params, canvas_preview, w, h) {
				var image = canvas_preview.getImageData(0, 0, w, h);
				canvas_preview.putImageData(_this.change(image, params), 0, 0);
			},
			on_finish: function (params) {
				_this.save(params, target);
			},
		});
	}

	save(params, target) {
		return commitCapturedFilter(this.Base_layers, target, (canvas) => {
			var ctx = canvas.getContext('2d');
			var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
			ctx.putImageData(this.change(image, params), 0, 0);
		});
	}

	change(image, params) {
		var data = image.data;
		var source = new Uint8ClampedArray(data);
		var distance = Math.max(1, Math.round(Number(params.distance) || 1));
		for (var y = 0; y < image.height; y++) {
			for (var x = 0; x < image.width; x++) {
				var index = (y * image.width + x) * 4;
				var redX = Math.min(image.width - 1, x + distance);
				var blueX = Math.max(0, x - distance);
				data[index] = source[(y * image.width + redX) * 4];
				data[index + 2] = source[(y * image.width + blueX) * 4 + 2];
			}
		}
		return image;
	}
}

export default Effects_dispersion_class;
