import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

function showEditableImageError() {
	alertify.error('请选择未锁定的图片图层。');
}

export function captureEditableImageLayer() {
	const layer = config.layer;
	if (!layer || layer.type !== 'image' || layer.locked) {
		showEditableImageError();
		return null;
	}
	return { id: layer.id, reference: layer };
}

export function canCommitToCapturedImageLayer(target) {
	if (!target) return false;
	const activeLayer = config.layer;
	const storedLayer = app.Layers?.get_layer?.(target.id);
	return Boolean(
		activeLayer
		&& activeLayer === target.reference
		&& activeLayer.id === target.id
		&& activeLayer.type === 'image'
		&& !activeLayer.locked
		&& storedLayer === target.reference
		&& storedLayer.type === 'image'
		&& !storedLayer.locked
	);
}

export function commitCapturedFilter(baseLayers, target, change) {
	if (!canCommitToCapturedImageLayer(target)) {
		showEditableImageError();
		return false;
	}
	const canvas = baseLayers.convert_layer_to_canvas(target.id, true);
	change(canvas);
	return app.State.do_action(new app.Actions.Update_layer_image_action(canvas, target.id));
}

// Base_gui discovers every module in this directory and instantiates its default export.
export default class Filter_commit_class {}
