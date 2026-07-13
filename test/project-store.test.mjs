import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
