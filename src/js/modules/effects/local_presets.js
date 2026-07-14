import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import { captureEditableImageLayer, commitCapturedFilter } from './filter-commit.js';

const GROUP_BASES = Object.freeze({
	mono: { saturation: -0.92, contrast: 0.24, brightness: -4, mono: 0.92, tint: [0, 0, 0], tintMix: 0, vignette: 0.06, grain: 2 },
	friends: { saturation: 0.08, contrast: 0.04, brightness: 7, mono: 0, tint: [255, 192, 172], tintMix: 0.10, vignette: 0.02, grain: 1 },
	instage: { saturation: -0.08, contrast: 0.12, brightness: 2, mono: 0, tint: [231, 186, 127], tintMix: 0.12, vignette: 0.12, grain: 5 },
	retro: { saturation: -0.20, contrast: 0.08, brightness: -2, mono: 0, tint: [206, 143, 89], tintMix: 0.16, vignette: 0.18, grain: 8 },
	tuning: { saturation: 0.14, contrast: 0.16, brightness: 4, mono: 0, tint: [255, 255, 255], tintMix: 0, vignette: 0, grain: 0 },
	portrait: { saturation: 0.04, contrast: -0.04, brightness: 9, mono: 0, tint: [255, 207, 185], tintMix: 0.12, vignette: 0.03, grain: 1 },
	food: { saturation: 0.26, contrast: 0.12, brightness: 8, mono: 0, tint: [255, 192, 102], tintMix: 0.10, vignette: 0.03, grain: 1 },
	urban: { saturation: -0.16, contrast: 0.20, brightness: -2, mono: 0, tint: [105, 163, 196], tintMix: 0.12, vignette: 0.14, grain: 3 },
	nature: { saturation: 0.18, contrast: 0.05, brightness: 3, mono: 0, tint: [136, 206, 170], tintMix: 0.08, vignette: 0.02, grain: 0 },
	colors: { saturation: 0.20, contrast: 0.06, brightness: 1, mono: 0, tint: [119, 157, 230], tintMix: 0.18, vignette: 0.05, grain: 2 },
	artzy: { saturation: 0.28, contrast: 0.24, brightness: -3, mono: 0.05, tint: [180, 104, 215], tintMix: 0.18, vignette: 0.10, grain: 6 },
});

function clamp(value, minimum = 0, maximum = 255) {
	return Math.max(minimum, Math.min(maximum, value));
}

function recipeHash(value) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function parseRecipeId(recipeId) {
	if (recipeId === 'black_and_white') return { group: 'mono', index: 0 };
	const [, group = 'artzy', number = '1'] = /^([a-z]+)-(\d{2})$/.exec(recipeId || '') || [];
	return { group: GROUP_BASES[group] ? group : 'artzy', index: Math.max(0, Number(number) - 1) };
}

function profileFor(recipeId) {
	const { group, index } = parseRecipeId(recipeId);
	const base = GROUP_BASES[group];
	const hash = recipeHash(recipeId);
	const cycle = (hash % 17) - 8;
	const accent = (hash >>> 8) % 3;
	const palette = [
		[234, 111, 126],
		[90, 162, 232],
		[127, 196, 132],
	][accent];
	return {
		...base,
		contrast: base.contrast + cycle * 0.012,
		brightness: base.brightness + cycle,
		saturation: base.saturation + cycle * 0.014,
		mono: clamp(base.mono + (index % 4) * 0.015, 0, 1),
		tint: base.tintMix === 0 ? base.tint : base.tint.map((channel, channelIndex) => Math.round(channel * 0.62 + palette[channelIndex] * 0.38)),
		tintMix: clamp(base.tintMix + ((hash >>> 13) % 5) * 0.012, 0, 0.30),
		vignette: clamp(base.vignette + (index % 3) * 0.025, 0, 0.28),
		grain: Math.max(0, base.grain + (hash % 4)),
		seed: hash,
	};
}

class Effects_localPresets_class {
	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
	}

	preset(recipeId, title = '本地效果') {
		const target = captureEditableImageLayer();
		if (!target) return false;
		const profile = profileFor(recipeId);
		const self = this;
		this.POP.show({
			title: `本地效果：${title}`,
			preview: true,
			effects: true,
			params: [{ name: 'intensity', title: '强度:', value: 100, range: [0, 100] }],
			on_change(params, canvasPreview, width, height) {
				const image = canvasPreview.getImageData(0, 0, width, height);
				canvasPreview.putImageData(self.change(image, profile, params), 0, 0);
			},
			on_finish(params) {
				self.save(params, profile, target);
			},
		});
		return true;
	}

	save(params, profile, target) {
		return commitCapturedFilter(this.Base_layers, target, (canvas) => {
			const context = canvas.getContext('2d', { willReadFrequently: true });
			const image = context.getImageData(0, 0, canvas.width, canvas.height);
			context.putImageData(this.change(image, profile, params), 0, 0);
		});
	}

	change(image, profile, params) {
		const intensity = clamp(Number(params?.intensity) || 0, 0, 100) / 100;
		const { data, width, height } = image;
		for (let offset = 0; offset < data.length; offset += 4) {
			if (data[offset + 3] === 0) continue;
			const x = (offset / 4) % width;
			const y = Math.floor(offset / 4 / width);
			const original = [data[offset], data[offset + 1], data[offset + 2]];
			const luminance = 0.2126 * original[0] + 0.7152 * original[1] + 0.0722 * original[2];
			const saturation = 1 + profile.saturation * intensity;
			let red = luminance + (original[0] - luminance) * saturation;
			let green = luminance + (original[1] - luminance) * saturation;
			let blue = luminance + (original[2] - luminance) * saturation;
			const contrast = 1 + profile.contrast * intensity;
			red = (red - 128) * contrast + 128 + profile.brightness * intensity;
			green = (green - 128) * contrast + 128 + profile.brightness * intensity;
			blue = (blue - 128) * contrast + 128 + profile.brightness * intensity;
			const tintMix = profile.tintMix * intensity;
			red = red * (1 - tintMix) + profile.tint[0] * tintMix;
			green = green * (1 - tintMix) + profile.tint[1] * tintMix;
			blue = blue * (1 - tintMix) + profile.tint[2] * tintMix;
			const mono = profile.mono * intensity;
			const mixedLuminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
			red = red * (1 - mono) + mixedLuminance * mono;
			green = green * (1 - mono) + mixedLuminance * mono;
			blue = blue * (1 - mono) + mixedLuminance * mono;
			const distance = Math.hypot((x - width / 2) / Math.max(1, width / 2), (y - height / 2) / Math.max(1, height / 2));
			const edge = 1 - clamp((distance - 0.35) / 1.05, 0, 1) * profile.vignette * intensity;
			const noise = ((((x + 1) * 73856093) ^ ((y + 1) * 19349663) ^ profile.seed) % 17 - 8) * profile.grain * 0.08 * intensity;
			data[offset] = clamp(Math.round(red * edge + noise));
			data[offset + 1] = clamp(Math.round(green * edge + noise));
			data[offset + 2] = clamp(Math.round(blue * edge + noise));
		}
		return image;
	}
}

export default Effects_localPresets_class;
