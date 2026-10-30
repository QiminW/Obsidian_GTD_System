const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('./logic.cjs');
const ref = (content, line) => { const node = logic.projectTaskTree(content); const flat = nodes => nodes.flatMap(n => [n, ...flat(n.children)]); return flat(node.roots).find(n => n.line === line).reference; };

test('moving an inbox parent preserves notes, child dates and block links without copying siblings', () => {
  const source = '# 收集箱\r\n## 待整理\r\n- [ ] <!-- gtd-days: 2026-10-28,2026-10-30 --> 报告 📅 2026-11-02 ^report\r\n  补充说明\r\n  - [ ] 查资料 📅 2026-10-29\r\n- [ ] 保留\r\n';
  const target = '# 项目\n\n## 任务\n- [ ] 原任务\n\n## 资料\n正文\n';
  const result = logic.prepareInboxMove(source, ref(source, 2), target);
  assert.equal(result.source, '# 收集箱\r\n## 待整理\r\n- [ ] 保留\r\n');
  assert.equal(result.target, '# 项目\n\n## 任务\n- [ ] 原任务\n- [ ] <!-- gtd-days: 2026-10-28,2026-10-30 --> 报告 📅 2026-11-02 ^report\n  补充说明\n  - [ ] 查资料 📅 2026-10-29\n\n## 资料\n正文\n');
});

test('moving a nested collection item under a project parent rebases the whole subtree', () => {
  const source = '- [ ] 收集父项\n\t- [ ] 被移动项\n\t\t说明\n\t\t- [ ] 子项\n\t- [ ] 留下的子项\n';
  const target = '## 任务\n- [ ] 项目阶段\n  - [ ] 已有子项\n- [ ] 同级\n';
  const result = logic.prepareInboxMove(source, ref(source, 1), target, ref(target, 1));
  assert.equal(result.source, '- [ ] 收集父项\n\t- [ ] 留下的子项\n');
  assert.equal(result.target, '## 任务\n- [ ] 项目阶段\n  - [ ] 已有子项\n  - [ ] 被移动项\n  \t说明\n  \t- [ ] 子项\n- [ ] 同级\n');
});

test('stale inbox or parent references never select a surviving identical task', () => {
  const source = '- [ ] 重复\n- [ ] 重复\n', target = '- [ ] 目标\n- [ ] 目标\n';
  assert.throws(() => logic.prepareInboxMove('- [ ] 重复\n', ref(source, 0), target), /变化/);
  assert.throws(() => logic.prepareInboxMove(source, ref(source, 0), '- [ ] 目标\n', ref(target, 0)), /变化/);
  assert.throws(() => logic.prepareInboxMove('- [x] 已完成\n', ref('- [x] 已完成\n', 0), target), /完成/);
});

test('a move preserves unrelated mixed line endings and a target without final newline', () => {
  const source = '# 收集\r\n- [ ] 移动\n- [ ] 留下';
  const target = '# 项目\r\n## 任务\n- [ ] 原任务\r\n\r\n## 记录\n正文';
  const result = logic.prepareInboxMove(source, ref(source, 1), target);
  assert.equal(result.source, '# 收集\r\n- [ ] 留下');
  assert.equal(result.target, '# 项目\r\n## 任务\n- [ ] 原任务\r\n- [ ] 移动\r\n\r\n## 记录\n正文');
});

test('a project without a task heading gets one while its existing notes remain intact', () => {
  const source = '- [ ] 整理\n';
  assert.equal(logic.prepareInboxMove(source, ref(source, 0), '# 项目\n\n已有资料').target, '# 项目\n\n已有资料\n\n## 任务\n\n- [ ] 整理\n');
});

test('headings in fenced examples cannot capture moved tasks or end the real task section', () => {
  const source='- [ ] 真收集项\n';
  const target='## 资料\n```md\n## 任务\n示例文字\n## 示例章节\n```\n\n## 任务\n- [ ] 真任务\n```md\n## 假边界\n```\n\n## 记录\n正文\n';
  const result=logic.prepareInboxMove(source,ref(source,0),target);
  assert.equal(result.target,'## 资料\n```md\n## 任务\n示例文字\n## 示例章节\n```\n\n## 任务\n- [ ] 真任务\n```md\n## 假边界\n```\n- [ ] 真收集项\n\n## 记录\n正文\n');
  assert.deepEqual(logic.projectTaskTree(result.target).roots.map(node=>node.title),['真任务','真收集项']);
});

test('an unclosed code fence rejects insertion instead of hiding the moved task', () => {
  const source='- [ ] 收集项\n';
  assert.throws(()=>logic.prepareInboxMove(source,ref(source,0),'## 任务\n```md\n示例\n'),/代码块/);
});

test('a changed source rolls back only the inserted target without removing the collection', async () => {
  let source = '- [ ] 收集\n', target = '## 任务\n';
  const plan = logic.prepareInboxMove(source, ref(source, 0), target);
  const writeTarget = async (expected, next) => { assert.equal(target, expected);target = next; };
  await assert.rejects(logic.commitInboxMove(plan, async () => { source += '- [ ] 新收集\n';throw new Error('收集箱已变化'); }, writeTarget), /变化/);
  assert.equal(source, '- [ ] 收集\n- [ ] 新收集\n');
  assert.equal(target, '## 任务\n');
});

test('a target changed during rollback keeps all edits and reports the possible duplicate', async () => {
  const source = '- [ ] 收集\n';let target = '## 任务\n';
  const plan = logic.prepareInboxMove(source, ref(source, 0), target);
  await assert.rejects(logic.commitInboxMove(plan, async () => { target += '新的项目说明\n';throw new Error('变化'); }, async (expected, next) => {if(target!==expected)throw new Error('变化');target=next;}), /重复/);
  assert.equal(target, '## 任务\n- [ ] 收集\n新的项目说明\n');
});
