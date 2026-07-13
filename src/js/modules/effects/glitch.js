import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import { captureEditableImageLayer, commitCapturedFilter } from './filter-commit.js';

class Effects_glitch_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
	}

	glitch() {
		var _this = this;
		var target = captureEditableImageLayer();
		if (!target) return;

		this.POP.show({
			title: '故障',
			preview: true,
			effects: true,
			params: [
				{name: 'shift', title: 'Shift:', value: 12, range: [1, 80]},
			],
			on_change: function (params, canvas_preview, w, h, canvas) {
				var source = canvas.getContext('2d').getImageData(0, 0, w, h);
				canvas_preview.putImageData(_this.change(source, params), 0, 0);
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
		var shift = Math.max(1, Math.round(Number(params.shift) || 1));
		var bandHeight = Math.max(1, Math.round(image.height / 12));
		for (var y = 0; y < image.height; y++) {
			var band = Math.floor(y / bandHeight);
			var horizontalOffset = band % 2 === 0 ? shift : -shift;
			for (var x = 0; x < image.width; x++) {
				var index = (y * image.width + x) * 4;
				var shiftedX = Math.max(0, Math.min(image.width - 1, x + horizontalOffset));
				var redX = Math.max(0, Math.min(image.width - 1, shiftedX + Math.ceil(shift / 3)));
				var blueX = Math.max(0, Math.min(image.width - 1, shiftedX - Math.ceil(shift / 3)));
				data[index] = source[(y * image.width + redX) * 4];
				data[index + 1] = source[(y * image.width + shiftedX) * 4 + 1];
				data[index + 2] = source[(y * image.width + blueX) * 4 + 2];
			}
		}
		return image;
	}
}

export default Effects_glitch_class;
