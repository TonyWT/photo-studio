import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { EDITOR_TOOL_REGISTRY, MANUAL_CUTOUT_TOOLS, shouldUseWebGL2 } from '../src/js/studio/editor-shell.mjs';

test('手动 Cutout 只使用本地选区、魔术橡皮和橡皮工具', () => {
  assert.deepEqual(MANUAL_CUTOUT_TOOLS, ['selection', 'magic_erase', 'erase']);
});

test('Liquify 只在 WebGL2 可用时启用增强模式', () => {
  assert.equal(shouldUseWebGL2({ getContext: (name) => name === 'webgl2' ? {} : null }), true);
  assert.equal(shouldUseWebGL2({ getContext: () => null }), false);
});

test('Liquify 在没有 WebGL2 时给出本地不可用提示', async () => {
  const tool = await readFile(new URL('../src/js/tools/bulge_pinch.js', import.meta.url), 'utf8');
  assert.match(tool, /getContext\('webgl2'\)/);
  assert.match(tool, /Liquify 需要 WebGL2/);
});

test('编辑器壳层提供稳定的保存与返回测试标识', async () => {
  const html = await readFile(new URL('../editor/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-testid="save-local-project"/);
  assert.match(html, /data-testid="editor-home"/);
});

test('编辑器工具注册表只包含明确保留的非 AI 工具', () => {
  assert.deepEqual(Object.keys(EDITOR_TOOL_REGISTRY), [
    'arrange', 'crop', 'cutout', 'adjust', 'effect', 'filter', 'liquify', 'retouch', 'drawing', 'text',
  ]);
  assert.equal('ai' in EDITOR_TOOL_REGISTRY, false);
  assert.equal('element' in EDITOR_TOOL_REGISTRY, false);
  assert.deepEqual(Object.fromEntries(Object.entries(EDITOR_TOOL_REGISTRY).map(([key, tool]) => [key, tool.label])), {
    arrange: 'Arrange', crop: 'Crop', cutout: 'Cutout', adjust: 'Adjust', effect: 'Effect',
    filter: 'Filter', liquify: 'Liquify', retouch: 'Retouch', drawing: 'Draw', text: 'Text',
  });
});
