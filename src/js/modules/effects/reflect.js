import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import { captureEditableImageLayer, commitCapturedFilter } from './filter-commit.js';

class Effects_reflect_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
	}

	reflect() {
		var _this = this;
		var target = captureEditableImageLayer();
		if (!target) return;

		this.POP.show({
			title: '镜像反射',
			preview: true,
			effects: true,
			params: [
				{name: 'amount', title: 'Reflection:', value: 100, range: [0, 100]},
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
		var amount = Math.max(0, Math.min(1, Number(params.amount) / 100));
		var midpoint = Math.floor(image.height / 2);
		for (var y = midpoint; y < image.height; y++) {
			var mirroredY = Math.max(0, midpoint - 1 - (y - midpoint));
			for (var x = 0; x < image.width; x++) {
				var index = (y * image.width + x) * 4;
				var mirrorIndex = (mirroredY * image.width + x) * 4;
				for (var channel = 0; channel < 3; channel++) {
					data[index + channel] = source[index + channel] * (1 - amount) + source[mirrorIndex + channel] * amount;
				}
			}
		}
		return image;
	}
}

export default Effects_reflect_class;
