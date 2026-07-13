import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import { captureEditableImageLayer, commitCapturedFilter } from './filter-commit.js';

class Effects_colorize_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
	}

	colorize() {
		const target = captureEditableImageLayer();
		if (!target) return;
		const _this = this;
		this.POP.show({
			title: '颜色着色',
			preview: true,
			effects: true,
			params: [
				{ name: 'color', title: '目标颜色:', type: 'color', value: '#4f46e5' },
				{ name: 'amount', title: '强度:', value: 65, range: [0, 100] },
			],
			on_change: function (params, canvasPreview, width, height) {
				const image = canvasPreview.getImageData(0, 0, width, height);
				canvasPreview.putImageData(_this.change(image, params), 0, 0);
			},
			on_finish: function (params) {
				_this.save(params, target);
			},
		});
	}

	save(params, target) {
		return commitCapturedFilter(this.Base_layers, target, (canvas) => {
			const context = canvas.getContext('2d');
			const image = context.getImageData(0, 0, canvas.width, canvas.height);
			context.putImageData(this.change(image, params), 0, 0);
		});
	}

	change(image, params) {
		const { red, green, blue } = this.hexToRgb(params.color);
		const targetHsl = this.rgbToHsl(red, green, blue);
		const amount = Math.max(0, Math.min(1, Number(params.amount) / 100));
		const data = image.data;
		for (let index = 0; index < data.length; index += 4) {
			if (data[index + 3] === 0) continue;
			const luminance = Math.round(0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]);
			const tinted = this.hslToRgb(targetHsl.hue, targetHsl.saturation, luminance / 255);
			data[index] = Math.round(data[index] * (1 - amount) + tinted.red * amount);
			data[index + 1] = Math.round(data[index + 1] * (1 - amount) + tinted.green * amount);
			data[index + 2] = Math.round(data[index + 2] * (1 - amount) + tinted.blue * amount);
		}
		return image;
	}

	hexToRgb(hex) {
		const value = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '') || [];
		return {
			red: parseInt(value[1] || '4f', 16),
			green: parseInt(value[2] || '46', 16),
			blue: parseInt(value[3] || 'e5', 16),
		};
	}

	rgbToHsl(red, green, blue) {
		const r = red / 255;
		const g = green / 255;
		const b = blue / 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const lightness = (max + min) / 2;
		if (max === min) return { hue: 0, saturation: 0, lightness };
		const delta = max - min;
		const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
		let hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
		return { hue: hue / 6, saturation, lightness };
	}

	hslToRgb(hue, saturation, lightness) {
		if (saturation === 0) {
			const value = Math.round(lightness * 255);
			return { red: value, green: value, blue: value };
		}
		const hueToChannel = (p, q, channel) => {
			let value = channel;
			if (value < 0) value += 1;
			if (value > 1) value -= 1;
			if (value < 1 / 6) return p + (q - p) * 6 * value;
			if (value < 1 / 2) return q;
			if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
			return p;
		};
		const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
		const p = 2 * lightness - q;
		return {
			red: Math.round(hueToChannel(p, q, hue + 1 / 3) * 255),
			green: Math.round(hueToChannel(p, q, hue) * 255),
			blue: Math.round(hueToChannel(p, q, hue - 1 / 3) * 255),
		};
	}
}

export default Effects_colorize_class;
