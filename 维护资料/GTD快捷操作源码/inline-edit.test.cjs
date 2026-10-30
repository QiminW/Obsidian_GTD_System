const test=require('node:test');
const assert=require('node:assert/strict');
const logic=require('./logic.cjs');
const ref=content=>logic.projectTaskTree(content).roots[0].reference;

test('renaming changes only the selected task name, retaining dates, completion and its subtree',()=>{
  const raw='\t- [x] <!-- gtd-days: 2026-10-29,2026-10-30 --> **旧任务** #doing 📅 2026-11-01 🕒 09:15 ✅ 2026-10-29 ^stable';
  const source='# 任务\r\n'+raw+'\r\n\t\t- [ ] 子任务\r\n\t\t说明\r\n- [ ] 同级\n';
  assert.equal(typeof logic.renameProjectTask,'function');
  assert.equal(logic.editableTaskName(raw),'**旧任务**');
  const changed=logic.renameProjectTask(source,ref(source),'**新任务**');
  assert.equal(changed,source.replace('**旧任务**','**新任务**'));
});

test('renaming retains recurrence, priority, IDs and ordinary tags',()=>{
  const source='- [ ] 阅读 [[课程]] #课程 🔼 🔁 every week on Monday 📅 2026-11-02 🆔 abc123 ⛔ parent1 ^reading\n';
  assert.equal(logic.editableTaskName(source.trimEnd()),'阅读 [[课程]]');
  const changed=logic.renameProjectTask(source,ref(source),'复习 [[课程]]');
  assert.equal(changed,source.replace('阅读 [[课程]]','复习 [[课程]]'));
});

test('renaming remains exact for duplicate names, rejects stale references, and does not alter another line',()=>{
  const source='- [ ] 重复\n- [ ] 重复\n';
  const reference=logic.projectTaskTree(source).roots[1].reference;
  assert.equal(logic.renameProjectTask(source,reference,'第二项'),'- [ ] 重复\n- [ ] 第二项\n');
  assert.throws(()=>logic.renameProjectTask(source+'新说明\n',reference,'变更'),/变化/);
  for(const title of ['', '  ', '多行\n任务', '<!-- gtd-days: 2026-10-30 --> 任务'])assert.throws(()=>logic.renameProjectTask(source,reference,title));
});
test('the name editor cannot introduce conflicting task properties',()=>{
  const source='- [ ] 原任务 🔁 every week 📅 2026-11-01 🆔 original ⛔ parent\n';
  for(const title of ['新任务 🔁 every day','新任务 🆔 changed','新任务 ⛔ other','新任务 🏁 delete','新任务 🕒 09:30','新任务 🔼']){
    assert.throws(()=>logic.renameProjectTask(source,ref(source),title),/任务标记/);
  }
});

test('a no-op rename preserves the complete raw task line',()=>{
  const source='1. [ ] <!-- gtd-days: 2026-10-29 -->  旧任务   📅 2026-11-02 ^id\r\n';
  assert.equal(logic.renameProjectTask(source,ref(source),'旧任务'),source);
});
test('an unnamed dated task gains a name before its metadata and keeps its block link last',()=>{
  const source='- [ ] <!-- gtd-days: 2026-10-29 --> 📅 2026-11-01 ^id\n';
  assert.equal(logic.renameProjectTask(source,ref(source),'补充名称'),'- [ ] <!-- gtd-days: 2026-10-29 --> 补充名称 📅 2026-11-01 ^id\n');
});
test('renaming preserves dependency lists with spaces after commas',()=>{
  const source='- [ ] 旧任务 ⛔ first, second, third 📅 2026-11-01\n';
  assert.equal(logic.editableTaskName(source.trimEnd()),'旧任务');
  assert.equal(logic.renameProjectTask(source,ref(source),'新任务'),source.replace('旧任务','新任务'));
});

test('project deadlines accept valid dates and clearing, and reject invalid calendar dates',()=>{
  assert.equal(typeof logic.projectDeadlineValue,'function');
  assert.equal(logic.projectDeadlineValue('2028-02-29'),'2028-02-29');
  assert.equal(logic.projectDeadlineValue(''),'');
  for(const value of ['2026-02-29','2026-13-01','tomorrow'])assert.throws(()=>logic.projectDeadlineValue(value));
});
