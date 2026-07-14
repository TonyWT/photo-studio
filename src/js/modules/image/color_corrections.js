import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Dialog_class from './../../libs/popup.js';
import Helper_class from './../../libs/helpers.js';
import ImageFilters_class from './../../libs/imagefilters.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Image_colorCorrections_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.ImageFilters = ImageFilters_class;
	}

	color_corrections(options = {}) {
		var _this = this;
		var defaults = options.defaults || {};

		if (config.layer?.type != 'image' || config.layer.locked) {
			alertify.error('This layer must contain an unlocked image.');
			return;
		}

		var settings = {
			title: options.title || 'Color Corrections',
			preview: true,
			on_change: function (params, canvas_preview, w, h, canvas) {
				//destructive effects
				var img = this.layer_active_small_ctx.getImageData(0, 0, w, h);
				var data = _this.do_corrections(img, params, false);
				canvas_preview.putImageData(data, 0, 0);

				//non-destructive
				canvas_preview.filter = "brightness(" + (1 + (params.param_b / 100)) + ")";
				canvas_preview.filter += " contrast(" + (1 + (params.param_c / 100)) + ")";
				canvas_preview.filter += " saturate(" + (1 + (params.param_s / 100)) + ")";
				canvas_preview.filter += " hue-rotate(" + params.param_h + "deg)";

				canvas_preview.drawImage(canvas, 0, 0);
			},
			params: [
				{name: "param_b", title: "Brightness:", value: defaults.param_b ?? "0", range: [-100, 100]},
				{name: "param_c", title: "Contrast:", value: defaults.param_c ?? "0", range: [-100, 100]},
				{name: "param_v", title: "Vibrance:", value: defaults.param_v ?? "0", range: [-100, 100]},
				{name: "param_s", title: "Saturation:", value: defaults.param_s ?? "0", range: [-100, 100]},
				{name: "param_h", title: "Hue:", value: defaults.param_h ?? "0", range: [-180, 180]},
				{},
				{name: "param_l", title: "Luminance:", value: defaults.param_l ?? "0", range: [-100, 100]},
				{name: "param_black", title: "Black:", value: defaults.param_black ?? "0", range: [-100, 100]},
				{name: "param_white", title: "White:", value: defaults.param_white ?? "0", range: [-100, 100]},
				{name: "param_highlights", title: "Highlights:", value: defaults.param_highlights ?? "0", range: [-100, 100]},
				{name: "param_shadows", title: "Shadows:", value: defaults.param_shadows ?? "0", range: [-100, 100]},
				{},
				{name: "param_sharpen", title: "Sharpen:", value: defaults.param_sharpen ?? "0", range: [0, 100]},
				{name: "param_clarity", title: "Clarity:", value: defaults.param_clarity ?? "0", range: [0, 100]},
				{name: "param_smooth", title: "Smooth:", value: defaults.param_smooth ?? "0", range: [0, 100]},
				{name: "param_blur", title: "Blur:", value: defaults.param_blur ?? "0", range: [0, 100]},
				{name: "param_grain", title: "Grain:", value: defaults.param_grain ?? "0", range: [0, 100]},
				{},
				{name: "param_vignette", title: "Vignette:", value: defaults.param_vignette ?? "0", range: [0, 100]},
				{name: "param_glamour", title: "Glamour:", value: defaults.param_glamour ?? "0", range: [0, 100]},
				{name: "param_bloom", title: "Bloom:", value: defaults.param_bloom ?? "0", range: [0, 100]},
				{name: "param_dehaze", title: "Dehaze:", value: defaults.param_dehaze ?? "0", range: [0, 100]},
				{},
				{name: "param_red", title: "Red channel:", value: defaults.param_red ?? "0", range: [-255, 255]},
				{name: "param_green", title: "Green channel:", value: defaults.param_green ?? "0", range: [-255, 255]},
				{name: "param_blue", title: "Blue channel:", value: defaults.param_blue ?? "0", range: [-255, 255]},
			],
			on_finish: function (params) {
				_this.save_changes(params);
			},
		};
		this.POP.show(settings);
	}

	save_changes(params) {
		if (config.layer?.type !== 'image' || config.layer.locked) {
			alertify.error('This layer must contain an unlocked image.');
			return false;
		}

		//get canvas from layer
		var canvas = this.Base_layers.convert_layer_to_canvas(null, true);
		var ctx = canvas.getContext("2d");

		//change data
		var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
		var data = this.do_corrections(img, params);
		ctx.putImageData(data, 0, 0);

		//save
		app.State.do_action(
			new app.Actions.Update_layer_image_action(canvas)
		);

		//non-destructive filters
		//multiple do_action() + do_corrections() does not work together yet.
		if(params.param_b != 0) {
			var parameters = {value: params.param_b};
			var filter_id = null;
			app.State.do_action(
				new app.Actions.Add_layer_filter_action(null, 'brightness', parameters, filter_id)
			);
		}
		if(params.param_c != 0) {
			var parameters = {value: params.param_c};
			var filter_id = null;
			app.State.do_action(
				new app.Actions.Add_layer_filter_action(null, 'contrast', parameters, filter_id)
			);
		}
		if(params.param_s != 0) {
			var parameters = {value: params.param_s};
			var filter_id = null;
			app.State.do_action(
				new app.Actions.Add_layer_filter_action(null, 'saturate', parameters, filter_id)
			);
		}
		if(params.param_h != 0) {
			var parameters = {value: params.param_h};
			var filter_id = null;
			app.State.do_action(
				new app.Actions.Add_layer_filter_action(null, 'hue-rotate', parameters, filter_id)
			);
		}
	}

	/**
	 * corrections (destructive)
	 *
	 * @param data
	 * @param params
	 * @returns {*}
	 */
	do_corrections(data, params) {
		// Vibrance differs from saturation: it preferentially expands muted
		// colours and leaves already-saturated pixels comparatively stable.
		// This is deliberately kept in the local pixel pipeline (rather than a
		// CSS filter) so the exported raster and undo history contain the same
		// deterministic result as the preview.
		if (params.param_v != 0) {
			var vibrance = Math.max(-1, Math.min(1, Number(params.param_v) / 100));
			for (var i = 0; i < data.data.length; i += 4) {
				var r = data.data[i];
				var g = data.data[i + 1];
				var b = data.data[i + 2];
				var max = Math.max(r, g, b);
				var min = Math.min(r, g, b);
				var chroma = max - min;
				var saturation = max === 0 ? 0 : chroma / max;
				var weight = vibrance >= 0 ? 1 - saturation : saturation;
				var factor = 1 + vibrance * weight;
				var average = (r + g + b) / 3;
				data.data[i] = Math.max(0, Math.min(255, Math.round(average + (r - average) * factor)));
				data.data[i + 1] = Math.max(0, Math.min(255, Math.round(average + (g - average) * factor)));
				data.data[i + 2] = Math.max(0, Math.min(255, Math.round(average + (b - average) * factor)));
			}
		}

		//luminance
		if(params.param_l != 0) {
			var data = this.ImageFilters.HSLAdjustment(data, 0, 0, params.param_l);
		}

		//RGB corrections
		if(params.param_red != 0 || params.param_green != 0 || params.param_blue != 0) {
			var data = this.ImageFilters.ColorTransformFilter(data, 1, 1, 1, 1,
				params.param_red, params.param_green, params.param_blue, 1);
		}

		// The remaining Adjust controls deliberately use a deterministic local
		// pixel pass.  It keeps preview, exported pixels and undo in the same
		// browser-only pipeline without introducing a remote image service.
		var advanced = [
			'param_black', 'param_white', 'param_highlights', 'param_shadows',
			'param_sharpen', 'param_clarity', 'param_smooth', 'param_blur',
			'param_grain', 'param_vignette', 'param_glamour', 'param_bloom', 'param_dehaze',
		].some((key) => Number(params[key] || 0) !== 0);
		if (advanced) {
			var clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
			var source = new Uint8ClampedArray(data.data);
			var width = data.width;
			var height = data.height;
			var black = Number(params.param_black || 0);
			var white = Number(params.param_white || 0);
			var highlights = Number(params.param_highlights || 0);
			var shadows = Number(params.param_shadows || 0);
			var sharpen = Number(params.param_sharpen || 0) / 100;
			var clarity = Number(params.param_clarity || 0) / 100;
			var smooth = Number(params.param_smooth || 0) / 100;
			var blur = Number(params.param_blur || 0) / 100;
			var grain = Number(params.param_grain || 0) / 100;
			var vignette = Number(params.param_vignette || 0) / 100;
			var glamour = Number(params.param_glamour || 0) / 100;
			var bloom = Number(params.param_bloom || 0) / 100;
			var dehaze = Number(params.param_dehaze || 0) / 100;
			var blurMix = Math.min(0.82, (smooth * 0.38) + (blur * 0.44));
			for (var y = 0; y < height; y++) {
				for (var x = 0; x < width; x++) {
					var offset = (x + y * width) * 4;
					if (source[offset + 3] === 0) continue;
					var sumR = 0, sumG = 0, sumB = 0, count = 0;
					for (var oy = -1; oy <= 1; oy++) {
						for (var ox = -1; ox <= 1; ox++) {
							var nx = Math.max(0, Math.min(width - 1, x + ox));
							var ny = Math.max(0, Math.min(height - 1, y + oy));
							var neighbor = (nx + ny * width) * 4;
							sumR += source[neighbor]; sumG += source[neighbor + 1]; sumB += source[neighbor + 2]; count++;
						}
					}
					var r = source[offset], g = source[offset + 1], b = source[offset + 2];
					var avgR = sumR / count, avgG = sumG / count, avgB = sumB / count;
					r = r * (1 - blurMix) + avgR * blurMix;
					g = g * (1 - blurMix) + avgG * blurMix;
					b = b * (1 - blurMix) + avgB * blurMix;
					var luminance = (r + g + b) / 765;
					var shadowWeight = Math.pow(1 - luminance, 1.4);
					var highlightWeight = Math.pow(luminance, 1.4);
					var tonalDelta = (black * shadowWeight + shadows * shadowWeight + white * highlightWeight + highlights * highlightWeight) * 0.62;
					var localContrast = 1 + clarity * 0.38 + dehaze * 0.28;
					r = 127.5 + (r - 127.5) * localContrast + tonalDelta;
					g = 127.5 + (g - 127.5) * localContrast + tonalDelta;
					b = 127.5 + (b - 127.5) * localContrast + tonalDelta;
					r += (source[offset] - avgR) * sharpen * 0.7;
					g += (source[offset + 1] - avgG) * sharpen * 0.7;
					b += (source[offset + 2] - avgB) * sharpen * 0.7;
					var centeredX = (x / Math.max(1, width - 1)) * 2 - 1;
					var centeredY = (y / Math.max(1, height - 1)) * 2 - 1;
					var edge = Math.min(1, Math.sqrt(centeredX * centeredX + centeredY * centeredY));
					var vignetteFactor = 1 - vignette * edge * edge * 0.62;
					var sheen = glamour * (1 - Math.abs(luminance - 0.62) * 1.8) * 26 + bloom * highlightWeight * 30;
					var noiseSeed = ((x + 1) * 73856093) ^ ((y + 1) * 19349663);
					var noise = (((noiseSeed >>> 0) % 101) - 50) * grain * 0.24;
					data.data[offset] = clamp((r + sheen + noise) * vignetteFactor);
					data.data[offset + 1] = clamp((g + sheen + noise) * vignetteFactor);
					data.data[offset + 2] = clamp((b + sheen + noise) * vignetteFactor);
				}
			}
		}

		return data;
	}

}

export default Image_colorCorrections_class;
