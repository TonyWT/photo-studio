import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

async function readDocument(name) {
  return readFile(new URL(`./docs/${name}`, root), 'utf8');
}

function findRequirementRow(markdown, id) {
  return markdown.split('\n').find((line) => line.startsWith(`| ${id} |`));
}

test('高层需求清单把已验证功能和未收敛视觉差异分开标记', async () => {
  const requirements = await readDocument('non-ai-editor-requirements.md');
  const matrix = await readDocument('pixlr-express-parity-matrix.md');
  const functionCompleteIds = [
    'W-01', 'W-02', 'W-03', 'W-04',
    'A-01', 'A-02',
    'C-01', 'C-02', 'C-03',
    'I-01', 'I-03', 'I-04',
    'R-01', 'D-01', 'T-01',
    'F-01', 'Q-01', 'Q-02',
  ];

  for (const id of functionCompleteIds) {
    const row = findRequirementRow(requirements, id);
    assert.ok(row, `缺少 ${id} 高层需求行`);
    assert.match(row, /功能可用；视觉 P2/, `${id} 不得把已验证功能误标为“部分可用”`);
  }

  for (const id of ['W-01', 'W-02', 'W-05', 'A-01', 'A-05', 'A-07', 'A-08', 'A-09', 'A-10', 'A-11']) {
    const row = findRequirementRow(matrix, id);
    assert.ok(row, `矩阵缺少 ${id} 高层行`);
    assert.match(row, /功能可用；视觉 P2/, `${id} 必须与需求清单使用同一双维状态`);
  }
});

test('逐项侧栏清单覆盖九个参考面板，并且保留项不含待取证状态', async () => {
  const checklist = await readDocument('pixlr-express-side-panel-checklist.md');

  for (const range of [
    'C-01 ～ C-14', 'K-01 ～ K-20', 'J-01 ～ J-16', 'E-01 ～ E-08',
    'F-01 ～ F-08', 'L-01 ～ L-11', 'R-01 ～ R-11', 'D-01 ～ D-13', 'T-01 ～ T-10',
  ]) {
    assert.match(checklist, new RegExp(range.replaceAll('-', '\\-')), `缺少 ${range} 覆盖范围`);
  }

  const rows = checklist.split('\n').filter((line) =>
    /^\| (?:[CKJEF LRD T]-\d{2}|R-01 ～ R-04|D-01 ～ D-05|T-03 ～ T-09) \|/.test(line),
  );
  assert.ok(rows.length >= 80, '逐项清单行数不足，不能只验收一级入口');

  for (const row of rows) {
    if (row.includes('| 保留 |')) {
      assert.doesNotMatch(row, /待取证|未实现/, `保留项缺少可执行结论：${row}`);
    }
  }
});

test('明确排除的 AI 和 Element 能力仍保持非渲染、非请求约束', async () => {
  const requirements = await readDocument('non-ai-editor-requirements.md');
  const matrix = await readDocument('pixlr-express-parity-matrix.md');

  assert.match(requirements, /AI Tools、AI Cutout、Element、在线素材\/图片搜索、远程模型推理/);
  for (const id of ['X-01', 'X-02', 'X-03', 'X-04']) {
    assert.match(matrix, new RegExp(`\\| ${id} \\|`), `矩阵缺少 ${id} 排除说明`);
  }
  assert.match(matrix, /不渲染、不注册快捷键、不发送模型或远程推理请求/);
  assert.match(matrix, /不渲染 Element 入口、素材库、贴纸\/在线素材 API/);
});
