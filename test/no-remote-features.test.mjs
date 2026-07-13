import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

test('编辑器配置不包含外部素材或网页字体 API 密钥', async () => {
  const config = await readFile(new URL('./src/js/config.js', root), 'utf8');

  assert.doesNotMatch(config, /pixabay_key/);
  assert.doesNotMatch(config, /google_webfonts_key/);
  assert.doesNotMatch(config, /name:\s*'media'/);
  assert.doesNotMatch(config, /\[Add Font\.\.\.\]/);
});

test('菜单不提供远程打开和素材搜索入口', async () => {
  const menu = await readFile(new URL('./src/js/config-menu.js', root), 'utf8');

  assert.doesNotMatch(menu, /Open URL/);
  assert.doesNotMatch(menu, /Open Data URL/);
  assert.doesNotMatch(menu, /Open Test Template/);
  assert.doesNotMatch(menu, /Search Images/);
});

test('编辑器启动时不会通过 URL 参数加载远程图片', async () => {
  const fileOpen = await readFile(new URL('./src/js/modules/file/open.js', root), 'utf8');
  const textTool = await readFile(new URL('./src/js/tools/text.js', root), 'utf8');

  assert.doesNotMatch(fileOpen, /this\.maybe_file_open_url_handler\(\);/);
  assert.doesNotMatch(textTool, /googleapis\.com\/webfonts/);
  assert.doesNotMatch(textTool, /WebFont\.load\(/);
});
