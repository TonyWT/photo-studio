import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isNativeProjectDocument,
  isSupportedImage,
  normalizeProjectName,
  sortProjectsNewestFirst,
} from '../src/js/studio/project-store.mjs';

test('只接受浏览器可编辑的本地图片文件', () => {
  assert.equal(isSupportedImage({ type: 'image/png', name: 'courtyard.png' }), true);
  assert.equal(isSupportedImage({ type: 'image/webp', name: 'courtyard.webp' }), true);
  assert.equal(isSupportedImage({ type: '', name: 'courtyard.jpg' }), true);
  assert.equal(isSupportedImage({ type: 'application/pdf', name: 'brief.pdf' }), false);
});

test('项目名称会移除扩展名、空白和不安全文件字符', () => {
  assert.equal(normalizeProjectName('  courtyard / edit.png  '), 'courtyard-edit');
  assert.equal(normalizeProjectName('restored-project.json'), 'restored-project');
  assert.equal(normalizeProjectName(''), '未命名项目');
});

test('最近项目按更新时间倒序展示', () => {
  const result = sortProjectsNewestFirst([
    { id: 'old', updatedAt: 10 },
    { id: 'new', updatedAt: 30 },
    { id: 'middle', updatedAt: 20 },
  ]);

  assert.deepEqual(result.map((project) => project.id), ['new', 'middle', 'old']);
});

test('原生项目文件要求对象 info 和正数画布尺寸', () => {
  assert.equal(isNativeProjectDocument({
    info: { width: 7, height: 5 },
    layers: [],
    data: [],
  }), true);

  for (const document of [
    { info: [], layers: [], data: [] },
    { info: {}, layers: [], data: [] },
    { info: { width: 0, height: 5 }, layers: [], data: [] },
    { info: { width: 7, height: -1 }, layers: [], data: [] },
    { info: { width: Number.NaN, height: 5 }, layers: [], data: [] },
  ]) {
    assert.equal(isNativeProjectDocument(document), false);
  }
});

test('原生项目文件拒绝无法安全交给 load_json 的图层和图像数据项', () => {
  const validDocument = {
    info: { width: 7, height: 5 },
    layers: [{ id: 1, type: 'image' }],
    data: [{ id: 1, data: 'data:image/png;base64,AA==' }],
  };

  assert.equal(isNativeProjectDocument(validDocument), true);

  const emptyCanvasLayer = {
    info: { width: 7, height: 5 },
    layers: [{ id: 1, type: null }],
    data: [],
  };

  assert.equal(isNativeProjectDocument(emptyCanvasLayer), true);

  for (const document of [
    { ...validDocument, layers: [null] },
    { ...validDocument, layers: [[]] },
    { ...validDocument, layers: [{}] },
    { ...validDocument, layers: [{ id: 1 }] },
    { ...validDocument, data: [null] },
    { ...validDocument, data: [[]] },
    { ...validDocument, data: [{}] },
    { ...validDocument, data: [{ id: '1', data: 'data:image/png;base64,AA==' }] },
    { ...validDocument, data: [{ id: 1, data: null }] },
  ]) {
    assert.equal(isNativeProjectDocument(document), false);
  }
});
