const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('./logic.cjs');
function display(source) {
  assert.equal(typeof logic.partitionCompletedTasks, 'function', 'partitionCompletedTasks is not implemented');
  const model = logic.projectTaskTree(source);
  return {model, view: logic.partitionCompletedTasks(model.roots)};
}

test('completed leaves leave active work while retaining their guarded source identity', () => {
  const {model,view}=display('- [ ] Pending ^pending\n- [x] Done ✅ 2026-10-29 ^done\n');
  assert.deepEqual([...view.activeKeys], ['block:pending']);
  assert.equal(view.count,1);
  assert.equal(view.groups[0].node,model.roots[1]);
  assert.deepEqual(view.groups[0].ancestors,[]);
  assert.equal(view.groups[0].node.reference.raw,'- [x] Done ✅ 2026-10-29 ^done');
  assert.deepEqual([model.done,model.total],[1,2]);
});

test('fully completed branches are grouped once without losing descendants', () => {
  const {model,view}=display('- [x] Phase ^phase\n  - [x] Draft ^draft\n    - [X] Review ^review\n- [x] Submit ^submit\n');
  assert.deepEqual([...view.activeKeys],[]);
  assert.equal(view.count,4);
  assert.deepEqual(view.groups.map(g=>g.node.key),['block:phase','block:submit']);
  assert.equal(view.groups[0].node.children[0].children[0].key,'block:review');
  assert.deepEqual([model.done,model.total],[2,2]);
});

test('checked ancestors remain active when any descendant is unfinished', () => {
  const {view}=display('- [x] Parent ^parent\n  - [x] Mixed ^mixed\n    - [ ] Pending ^pending\n    - [x] Done ^done\n  - [x] Finished branch ^finished\n    - [x] Finished child ^child\n');
  assert.deepEqual([...view.activeKeys],['block:parent','block:mixed','block:pending']);
  assert.equal(view.count,3);
  assert.deepEqual(view.groups.map(g=>g.node.key),['block:done','block:finished']);
  assert.deepEqual(view.groups[0].ancestors.map(n=>n.title),['Parent','Mixed']);
  assert.deepEqual(view.groups[1].ancestors.map(n=>n.key),['block:parent']);
});

test('unchecked parent remains actionable even when all of its children are complete', () => {
  const {view}=display('- [ ] Parent ^parent\n  - [x] Child ^child\n');
  assert.deepEqual([...view.activeKeys],['block:parent']);
  assert.equal(view.count,1);
  assert.deepEqual(view.groups[0].ancestors.map(n=>n.title),['Parent']);
});

test('cancelled tasks stay visible instead of being counted as completed', () => {
  const {view}=display('- [x] Parent ^parent\n  - [-] Cancelled ^cancelled\n  - [x] Done ^done\n- [-] Other cancellation ^other\n');
  assert.deepEqual([...view.activeKeys],['block:parent','block:cancelled','block:other']);
  assert.equal(view.count,1);
  assert.deepEqual(view.groups.map(g=>g.node.key),['block:done']);
});

test('partitioning repeated labels does not mutate source model or conflate task references', () => {
  const source='- [ ] Stage\n  - [x] Repeat\n  - [ ] Repeat\n- [x] Repeat\n';
  assert.equal(typeof logic.partitionCompletedTasks,'function','partitionCompletedTasks is not implemented');
  const model=logic.projectTaskTree(source),before=JSON.stringify(model);
  const view=logic.partitionCompletedTasks(model.roots);
  assert.equal(JSON.stringify(model),before);
  assert.deepEqual(view.groups.map(g=>g.node.reference.line),[1,3]);
  assert.notEqual(view.groups[0].node.key,view.groups[1].node.key);
  assert.deepEqual([...view.activeKeys].map(key=>key.endsWith('/Repeat:1')), [false,true]);
});

test('unchecking a completed descendant restores its entire ancestor path without changing source order', () => {
  const source='- [x] Parent ^parent\n  - [x] Child ^child\n- [ ] Other ^other\n';
  const first=display(source);
  assert.deepEqual([...first.view.activeKeys],['block:other']);
  const restored=display(source.replace('  - [x] Child','  - [ ] Child'));
  assert.deepEqual([...restored.view.activeKeys],['block:parent','block:child','block:other']);
  assert.equal(restored.view.count,0);
  assert.deepEqual(restored.view.groups,[]);
  assert.deepEqual([restored.model.done,restored.model.total],[0,2]);
});

test('empty projects and projects without completed work have no hidden tasks', () => {
  const empty=display('## 任务\n');
  assert.equal(empty.view.count,0);assert.deepEqual(empty.view.groups,[]);
  const pending=display('- [ ] Parent\n  - [ ] Child\n');
  assert.equal(pending.view.count,0);assert.deepEqual(pending.view.groups,[]);
  assert.equal(pending.view.activeKeys.size,2);
});
