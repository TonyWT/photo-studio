import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

test('工具轨保持连续轨道，不把每个非激活工具画成圆角卡片', async () => {
  const css = await readFile(new URL('./src/css/studio.css', root), 'utf8');

  assert.match(
    css,
    /\.studio-rail-home,\nbody\.photo-studio-editor \.studio-tool-button \{[^}]*border-radius:\s*0\s*!important;[^}]*box-shadow:\s*none\s*!important;/s,
  );
});
