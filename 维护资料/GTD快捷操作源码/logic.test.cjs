const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const file = require('node:path').join(__dirname, 'logic.cjs');
const logic = fs.existsSync(file) ? require(file) : {};
function feature(name) { assert.equal(typeof logic[name], 'function', `${name} is not implemented`); return logic[name]; }

test('task keeps the planned day separate from the deadline', () => {
  assert.equal(feature('buildTaskLine')({title:'写报告',scheduled:'2026-10-29',due:'2026-11-02'}), '- [ ] 写报告 ⏳ 2026-10-29 📅 2026-11-02');
});
test('a deadline alone does not invent a planned day', () => {
  assert.equal(feature('buildTaskLine')({title:'交报告',due:'2026-11-02'}), '- [ ] 交报告 📅 2026-11-02');
  assert.equal(logic.buildTaskLine({title:'整理资料'}), '- [ ] 整理资料');
});
test('invalid calendar dates and multiline task input cannot write malformed tasks', () => {
  const build=feature('buildTaskLine');
  assert.throws(()=>build({title:'  '}));
  assert.throws(()=>build({title:'报告\n- [ ] 其他任务'}));
  assert.throws(()=>build({title:'报告',scheduled:'2026-02-30'}));
});
test('adding to a task section preserves nested tasks and the following section', () => {
  const source='# 项目\n\n## 多层任务\n\n- [ ] 阶段 #gtd/group\n  - [ ] 原行动\n\n## 相关资料\n\n[[课程笔记]]\n';
  assert.equal(feature('insertTask')(source,'- [ ] 新行动','project'), '# 项目\n\n## 多层任务\n\n- [ ] 阶段 #gtd/group\n  - [ ] 原行动\n- [ ] 新行动\n\n## 相关资料\n\n[[课程笔记]]\n');
});
test('adding to an inbox without a task section preserves its previous content', () => {
  assert.equal(feature('insertTask')('# 收件箱\n\n原记录\n','- [ ] 新事项','inbox'), '# 收件箱\n\n原记录\n\n## 待整理\n\n- [ ] 新事项\n');
});
test('project names cannot escape their folder or use reserved Windows names', () => {
  const validate=feature('validateProjectName');
  for(const bad of ['../外部','a/b','CON','报告.','a:b',''])assert.throws(()=>validate(bad));
  assert.equal(validate('  学习计划  '),'学习计划');
});
test('new projects store metadata without inventing unfinished tasks', () => {
  const note=feature('buildProjectNote')({name:'学习计划',area:'学习',outcome:'完成"课程"',deadline:'2026-12-01'});
  assert.ok(note.includes('area: "学习"\n'));
  assert.ok(note.includes('outcome: "完成\\"课程\\""\n'));
  assert.ok(note.includes('deadline: 2026-12-01\n'));
  assert.ok(note.includes('## 任务\n'));
  assert.ok(!note.includes('- [ ]'));
});

test('new areas receive the next numbered project folder and reject duplicate labels', () => {
  const next=feature('nextAreaFolder');
  assert.equal(next('科研',['00 工作','01 学习']),'02 科研');
  assert.equal(next('生活',['00 工作','05 研究']),'06 生活');
  assert.throws(()=>next('工作',['00 工作','01 学习']));
});
test('an area note lists projects from its own folder and links back home', () => {
  const note=feature('buildAreaNote')({name:'科研',folder:'00 GTD/00 工作区/01 项目/02 科研'});
  assert.ok(note.includes('[[00 GTD/首页|首页]]'));
  assert.ok(note.includes('LIST FROM "00 GTD/00 工作区/01 项目/02 科研"'));
  assert.ok(note.includes('type: gtd-area'));
});

test('parent choices keep hierarchy and ignore completed tasks, frontmatter and code examples', () => {
  const parse=feature('listParentTasks');
  const source='---\nexample: "- [ ] 假任务"\n---\n# 项目\n- [ ] 第一章 #gtd/group\n  - [ ] 练习\n- [ ] 第二章\n  - [ ] 练习\n- [x] 完成的任务\n```markdown\n- [ ] 代码里的任务\n```\n';
  const choices=parse(source);
  assert.deepEqual(choices.map(t=>t.label),['第一章','第一章 › 练习','第二章','第二章 › 练习']);
  assert.equal(choices[3].line,7);
  assert.equal(choices[3].raw,'  - [ ] 练习');
});
test('a child is appended after the complete parent subtree without touching its sibling', () => {
  const insert=feature('insertSubtask');
  const source='# 项目\n\n- [ ] 阶段 #gtd/group\n  - [ ] 已有子项\n    - [ ] 孙任务\n- [ ] 其他阶段\n\n## 资料\n原笔记\n';
  const parent={line:2,raw:'- [ ] 阶段 #gtd/group'};
  assert.equal(insert(source,'- [ ] 新子项 ⏳ 2026-10-29',parent),'# 项目\n\n- [ ] 阶段 #gtd/group\n  - [ ] 已有子项\n    - [ ] 孙任务\n  - [ ] 新子项 ⏳ 2026-10-29\n- [ ] 其他阶段\n\n## 资料\n原笔记\n');
});
test('splitting a leaf uses indentation without adding a status tag and preserves dates and its block link', () => {
  const insert=feature('insertSubtask');
  const raw='  - [ ] 阅读 📅 2026-11-01 ^reading';
  const source='- [ ] 学习 #gtd/group\n'+raw+'\n\n## 资料\n';
  assert.equal(insert(source,'- [ ] 第一节 ⏳ 2026-10-29',{line:1,raw}),'- [ ] 学习 #gtd/group\n  - [ ] 阅读 📅 2026-11-01 ^reading\n    - [ ] 第一节 ⏳ 2026-10-29\n\n## 资料\n');
});
test('a deeper child uses the current tab indentation and line endings', () => {
  const insert=feature('insertSubtask');
  const raw='\t- [ ] 章节';
  assert.equal(insert('- [ ] 学习 #gtd/group\r\n'+raw+'\r\n','- [ ] 练习',{line:1,raw}),'- [ ] 学习 #gtd/group\r\n\t- [ ] 章节\r\n\t\t- [ ] 练习\r\n');
});
test('a changed or completed parent rejects insertion instead of attaching to another task', () => {
  const insert=feature('insertSubtask');
  assert.throws(()=>insert('- [ ] 改名后\n','- [ ] 子项',{line:0,raw:'- [ ] 原名字'}));
  assert.throws(()=>insert('- [x] 已完成\n','- [ ] 子项',{line:0,raw:'- [x] 已完成'}));
});
test('identical parent titles remain distinct insertion targets', () => {
  const insert=feature('insertSubtask');
  assert.equal(insert('- [ ] 重复\n- [ ] 重复\n','- [ ] 第二个下面的子项',{line:1,raw:'- [ ] 重复'}),'- [ ] 重复\n- [ ] 重复\n  - [ ] 第二个下面的子项\n');
});
test('editing a project while its parent picker is open cannot select the wrong identical task', () => {
  const source='- [ ] 重复\n- [ ] 重复\n';
  const reference=logic.listParentTasks(source)[1];
  assert.throws(()=>logic.insertSubtask('- [ ] 重复\n'+source,'- [ ] 子项',reference));
});
test('batch entry retains the original parent without a status tag and refreshes its reference', () => {
  const select=feature('retainedParent');
  const source='- [ ] 父任务\n';
  const previous=logic.listParentTasks(source)[0];
  const updated=logic.insertSubtask(source,'- [ ] 子项',previous);
  const selected=select(logic.listParentTasks(updated),previous);
  assert.equal(selected.raw,'- [ ] 父任务');
  assert.equal(selected.line,0);
  assert.notEqual(selected.version,previous.version);
});
test('batch entry does not retain a renamed or shifted parent', () => {
  const select=feature('retainedParent');
  const previous=logic.listParentTasks('- [ ] 父任务\n')[0];
  assert.equal(select(logic.listParentTasks('- [ ] 改名\n'),previous),null);
  assert.equal(select(logic.listParentTasks('\n- [ ] 父任务\n'),previous),null);
});

test('project tree preserves nested tasks and counts only concrete non-cancelled leaves', () => {
  const tree=feature('projectTaskTree')('- [ ] 阶段 #gtd/group\n  - [x] 练习一 ✅ 2026-10-28\n  - [ ] 阅读 #gtd/group\n    - [ ] 第一节\n- [-] 已取消\n- [ ] 独立任务\n- [ ] 空分组 #gtd/group\n');
  assert.equal(tree.total,4);assert.equal(tree.done,1);
  assert.equal(tree.roots[0].total,2);assert.equal(tree.roots[0].done,1);
  assert.equal(tree.roots[0].children[1].children[0].title,'第一节');
  assert.equal(tree.roots[0].children[1].children[0].depth,2);
});
test('tree disclosure keys survive completion metadata and group marking', () => {
  const tree=feature('projectTaskTree');
  const before=tree('- [ ] 阶段\n  - [ ] 任务 ⏳ 2026-10-28\n');
  const after=tree('- [ ] 阶段 #gtd/group\n  - [x] 任务 ⏳ 2026-10-28 ✅ 2026-10-28\n');
  assert.equal(before.roots[0].key,after.roots[0].key);
  assert.equal(before.roots[0].children[0].key,after.roots[0].children[0].key);
  assert.equal(after.roots[0].children[0].completed,true);
});
test('checkbox replacement changes one task and preserves its surrounding note and CRLF', () => {
  const source='# 项目\r\n- [ ] 任务\r\n\r\n## 资料\r\n保留\r\n';
  const tree=feature('projectTaskTree')(source);
  const replace=feature('replaceProjectTask');
  assert.equal(replace(source,tree.roots[0].reference,'- [x] 任务 ✅ 2026-10-28'),'# 项目\r\n- [x] 任务 ✅ 2026-10-28\r\n\r\n## 资料\r\n保留\r\n');
});
test('recurring-task replacement retains both the completed and next task', () => {
  const source='- [ ] 复习 🔁 every day ⏳ 2026-10-28\n';
  const tree=feature('projectTaskTree')(source);
  const replaced=feature('replaceProjectTask')(source,tree.roots[0].reference,'- [x] 复习 🔁 every day ⏳ 2026-10-28 ✅ 2026-10-28\n- [ ] 复习 🔁 every day ⏳ 2026-10-29');
  assert.equal(logic.projectTaskTree(replaced).total,2);
  assert.equal(logic.projectTaskTree(replaced).done,1);
});
test('a stale checkbox cannot overwrite another task after an outside edit', () => {
  const source='- [ ] 原任务\n';const ref=feature('projectTaskTree')(source).roots[0].reference;
  assert.throws(()=>feature('replaceProjectTask')('- [ ] 其他任务\n',ref,'- [x] 原任务'));
});
test('completing a parent does not modify children or inflate leaf progress', () => {
  const source='- [ ] 分组 #gtd/group\n  - [ ] 具体行动\n';
  const tree=feature('projectTaskTree')(source);
  const after=logic.projectTaskTree(feature('replaceProjectTask')(source,tree.roots[0].reference,'- [x] 分组 #gtd/group ✅ 2026-10-28'));
  assert.equal(after.roots[0].completed,true);
  assert.equal(after.roots[0].children[0].completed,false);
  assert.equal(after.total,1);assert.equal(after.done,0);
});

test('deleting a parent removes its descendants and indented notes without consuming siblings or sections', () => {
  const source='# 项目\n\n## 任务\n- [ ] 阶段 #gtd/group\n  阶段说明\n  - [ ] 子任务\n    - [x] 孙任务\n\n- [ ] 保留行动\n\n## 资料\n保留资料\n';
  const result=feature('deleteProjectTask')(source,logic.projectTaskTree(source).roots[0].reference);
  assert.equal(result.content,'# 项目\n\n## 任务\n\n- [ ] 保留行动\n\n## 资料\n保留资料\n');
  assert.equal(result.count,3);
  assert.equal(feature('restoreProjectTask')(result.content,result.undo),source);
});
test('deleting a duplicate leaf targets the selected instance and leaves its parent and siblings intact', () => {
  const source='- [ ] 父任务 #gtd/group\n  - [ ] 重复\n  - [ ] 重复\n- [ ] 其他\n';
  const selected=logic.projectTaskTree(source).roots[0].children[1].reference;
  assert.equal(feature('deleteProjectTask')(source,selected).content,'- [ ] 父任务 #gtd/group\n  - [ ] 重复\n- [ ] 其他\n');
});
test('task deletion and undo preserve CRLF and whether the note has a final newline', () => {
  for(const source of ['- [ ] 唯一任务','- [ ] 唯一任务\n','# 项目\r\n- [ ] 唯一任务\r\n\r\n## 资料\r\n保留\r\n']){
    const result=feature('deleteProjectTask')(source,logic.projectTaskTree(source).roots[0].reference);
    assert.equal(feature('restoreProjectTask')(result.content,result.undo),source);
    assert.ok(!result.content.includes('唯一任务'));
    if(source.includes('\r\n'))assert.equal(result.content,'# 项目\r\n\r\n## 资料\r\n保留\r\n');
  }
});
test('a stale delete reference cannot remove a shifted or changed task', () => {
  const source='- [ ] 重复\n- [ ] 重复\n';
  const reference=logic.projectTaskTree(source).roots[1].reference;
  assert.throws(()=>feature('deleteProjectTask')('- [ ] 新任务\n'+source,reference),/变化/);
  assert.throws(()=>feature('deleteProjectTask')(source,{...reference,raw:'- [ ] 别的任务'}),/变化/);
});
test('undo refuses to overwrite edits made after deletion', () => {
  const source='- [ ] 删除\n- [ ] 保留\n';
  const result=feature('deleteProjectTask')(source,logic.projectTaskTree(source).roots[0].reference);
  assert.throws(()=>feature('restoreProjectTask')(result.content+'\n新笔记\n',result.undo),/变化/);
});
test('deleting from mixed LF and CRLF notes preserves the next task and every remaining delimiter', () => {
  const source='# 项目\r\n\n- [ ] 删除\n- [ ] 保留\n## 资料\n保留笔记';
  const result=logic.deleteProjectTask(source,logic.projectTaskTree(source).roots[0].reference);
  assert.equal(result.content,'# 项目\r\n\n- [ ] 保留\n## 资料\n保留笔记');
  assert.equal(logic.restoreProjectTask(result.content,result.undo),source);
});
test('editing the planned day keeps deadline, recurrence, state, block link and surrounding mixed line endings', () => {
  const source='# 项目\r\n\n- [ ] 复习 🔁 every day #gtd/doing ⏳ 2026-10-28 📅 2026-11-02 ^review\n\n## 资料\r\n保留';
  const reference=logic.projectTaskTree(source).roots[0].reference;
  assert.equal(feature('updateProjectTaskDate')(source,reference,'scheduled','2026-10-30'),'# 项目\r\n\n- [ ] 复习 🔁 every day #gtd/doing ⏳ 2026-10-30 📅 2026-11-02 ^review\n\n## 资料\r\n保留');
});
test('setting and clearing dates edits independent fields and keeps the block link at the end', () => {
  const source='- [ ] 报告 ^report\n';
  let next=feature('updateProjectTaskDate')(source,logic.projectTaskTree(source).roots[0].reference,'due','2026-11-02');
  assert.equal(next,'- [ ] 报告 📅 2026-11-02 ^report\n');
  next=logic.updateProjectTaskDate(next,logic.projectTaskTree(next).roots[0].reference,'scheduled','2026-10-30');
  next=logic.updateProjectTaskDate(next,logic.projectTaskTree(next).roots[0].reference,'scheduled','');
  assert.equal(next,'- [ ] 报告 📅 2026-11-02 ^report\n');
});
test('date editing rejects stale tasks, invalid dates and unknown fields', () => {
  const source='- [ ] 报告\n',reference=logic.projectTaskTree(source).roots[0].reference;
  const update=feature('updateProjectTaskDate');
  assert.throws(()=>update(source+'新笔记\n',reference,'due','2026-11-02'),/变化/);
  assert.throws(()=>update(source,reference,'due','2026-02-30'));
  assert.throws(()=>update(source,reference,'other','2026-10-30'));
});
test('doing is the only task tag needed and does not change hierarchy titles or progress', () => {
  const source='- [ ] 阶段 #doing\n  - [ ] 子任务\n';
  const tree=logic.projectTaskTree(source);
  assert.equal(tree.roots[0].title,'阶段');assert.equal(tree.total,1);
  const inserted=logic.insertSubtask(source,'- [ ] 第二个子任务',tree.roots[0].reference);
  assert.equal(inserted,'- [ ] 阶段 #doing\n  - [ ] 子任务\n  - [ ] 第二个子任务\n');
});

test('day membership toggles one date without replacing other days, deadline, tag or block ID', () => {
  const source='# 项目\r\n\n- [ ] 报告 #doing 📅 2026-11-02 ^report\n\n## 资料\r\n保留';
  const set=feature('setProjectTaskDay');
  let next=set(source,logic.projectTaskTree(source).roots[0].reference,'2026-10-28');
  assert.equal(next,'# 项目\r\n\n- [ ] <!-- gtd-days: 2026-10-28 --> 报告 #doing 📅 2026-11-02 ^report\n\n## 资料\r\n保留');
  next=set(next,logic.projectTaskTree(next).roots[0].reference,'2026-10-30');
  assert.deepEqual(feature('taskDays')(logic.projectTaskTree(next).roots[0].raw),['2026-10-28','2026-10-30']);
  next=set(next,logic.projectTaskTree(next).roots[0].reference,'2026-10-28');
  assert.deepEqual(logic.taskDays(logic.projectTaskTree(next).roots[0].raw),['2026-10-30']);
  assert.ok(next.includes('📅 2026-11-02'));assert.ok(next.endsWith('## 资料\r\n保留'));
});
test('adding an already selected date is idempotent and stale or invalid day changes are rejected', () => {
  const source='- [ ] <!-- gtd-days: 2026-10-28 --> 报告\n',ref=logic.projectTaskTree(source).roots[0].reference;
  assert.equal(feature('setProjectTaskDay')(source,ref,'2026-10-28',true),source);
  assert.throws(()=>logic.setProjectTaskDay(source+'新笔记\n',ref,'2026-10-30'),/变化/);
  assert.throws(()=>logic.setProjectTaskDay(source,ref,'2026-02-30'));
});
test('task tree hides date storage and counts one task regardless of number of arranged days', () => {
  const tree=logic.projectTaskTree('- [ ] 阶段\n  - [ ] 报告 #doing <!-- gtd-days: 2026-10-28,2026-10-30 -->\n');
  assert.equal(tree.roots[0].children[0].title,'报告');assert.equal(tree.total,1);
  assert.deepEqual(tree.roots[0].children[0].days,['2026-10-28','2026-10-30']);
});
test('calendar instances share the canonical task and deduplicate arrangement and deadline on the same day', () => {
  const task={id:'00 GTD/p.md:1',path:'00 GTD/p.md',line:1,raw:'- [ ] 报告 📅 2026-10-30 <!-- gtd-days: 2026-10-28,2026-10-30 -->',description:'报告 <!-- gtd-days: 2026-10-28,2026-10-30 -->',scheduled:null,due:'2026-10-30',start:null,completed:false};
  const instances=feature('calendarTaskInstances')([task]);
  assert.deepEqual(instances.map(t=>t.scheduled),['2026-10-28','2026-10-30']);
  assert.equal(new Set(instances.map(t=>t.id)).size,2);
  assert.ok(instances.every(t=>t._gtdSourceTask===task&&t.description==='报告'));
  const outside={...task,path:'Other/p.md'};assert.equal(logic.calendarTaskInstances([outside])[0],outside);
});
test('deadline-only tasks still appear and migration preserves previous planned dates as arrangements', () => {
  const source='# 项目\r\n- [ ] 阅读 ⏳ 2026-10-29 📅 2026-11-02 ^reading\n\n## 资料\r\n保留';
  const migrated=feature('migrateTaskDays')(source);
  assert.equal(migrated,'# 项目\r\n- [ ] <!-- gtd-days: 2026-10-29 --> 阅读 📅 2026-11-02 ^reading\n\n## 资料\r\n保留');
  assert.equal(logic.migrateTaskDays(migrated),migrated);
  const task={id:'00 GTD/p.md:0',path:'00 GTD/p.md',raw:'- [ ] 报告 📅 2026-11-02',description:'报告',due:'2026-11-02',scheduled:null,start:null};
  assert.deepEqual(feature('calendarTaskInstances')([task]).map(t=>t.scheduled),['2026-11-02']);
});
test('only the actual deadline occurrence is highlighted, including an arranged deadline day', () => {
  const task={id:'deadline',path:'00 GTD/p.md',raw:'- [ ] <!-- gtd-days: 2026-10-29,2026-10-30 --> 同名任务 📅 2026-10-30',description:'同名任务',due:'2026-10-30'};
  const instances=logic.calendarTaskInstances([task]);
  assert.deepEqual(instances.map(t=>[t._gtdDay,t._gtdDeadline]),[['2026-10-29',false],['2026-10-30',true]]);
  assert.equal(instances[1]._gtdKind,'arrangement');
  const noDue={...task,id:'no-due',due:null};
  assert.ok(logic.calendarTaskInstances([noDue]).every(t=>t._gtdDeadline===false));
  const changed={...task,due:'2026-11-01'};
  assert.deepEqual(logic.calendarTaskInstances([changed]).filter(t=>t._gtdDeadline).map(t=>t._gtdDay),['2026-11-01']);
  const completed={...task,completed:true};
  assert.equal(logic.calendarTaskInstances([completed])[1]._gtdDeadline,true);
  const outside={...task,path:'Other/p.md'};
  assert.equal(logic.calendarTaskInstances([outside])[0]._gtdDeadline,undefined);
});
test('calendar changes retain arrangements, but a new recurrence instance does not inherit old arranged days', () => {
  const raw='- [ ] 复习 🔁 every day 📅 2026-10-28 <!-- gtd-days: 2026-10-28 -->';
  const replacement='- [x] 复习 🔁 every day 📅 2026-10-28 ✅ 2026-10-28\n- [ ] 复习 🔁 every day 📅 2026-10-29';
  assert.equal(feature('preserveTaskDays')(raw,replacement),'- [x] <!-- gtd-days: 2026-10-28 --> 复习 🔁 every day 📅 2026-10-28 ✅ 2026-10-28\n- [ ] 复习 🔁 every day 📅 2026-10-29');
  assert.equal(logic.preserveTaskDays(raw,'- [ ] 改名 📅 2026-10-30'),'- [ ] <!-- gtd-days: 2026-10-28 --> 改名 📅 2026-10-30');
});
test('calendar requires the displayed source snapshot and cannot retarget a surviving identical task', () => {
  const source='- [ ] 重复\n- [ ] 重复\n';
  const reference=logic.projectTaskTree(source).roots[0].reference,task={line:0,raw:'- [ ] 重复',_gtdReference:reference};
  assert.equal(feature('calendarTaskReference')(source,task).line,0);
  assert.throws(()=>logic.calendarTaskReference('- [ ] 重复\n',task),/变化/);
  assert.throws(()=>logic.calendarTaskReference(source,{line:0,raw:'- [ ] 重复'}));
  assert.throws(()=>feature('taskDays')('- [ ] 错误 <!-- gtd-days: 2026-02-30 -->'));
});
test('calendar occurrence dates are independent of the native date-preference order', () => {
  const task={id:'00 GTD/p.md:0',path:'00 GTD/p.md',line:0,raw:'- [ ] <!-- gtd-days: 2026-10-28,2026-10-30 --> 报告 📅 2026-11-02',description:'报告',scheduled:null,due:'2026-11-02',start:null};
  const instances=logic.calendarTaskInstances([task]);
  for(const preference of [['due','start','scheduled'],['start','scheduled','due'],['due']])assert.deepEqual(instances.map(instance=>instance[preference.find(field=>instance[field]!==null)]),['2026-10-28','2026-10-30','2026-11-02']);
  assert.equal(task.due,'2026-11-02');
});
test('calendar source snapshots are unavailable while file and native task index disagree', () => {
  const source='- [ ] 一\n- [ ] 二\n';
  const indexed=[{line:0,raw:'- [ ] 一'},{line:1,raw:'- [ ] 二'}];
  assert.equal(feature('calendarTaskReferences')(source,indexed).get(1).raw,'- [ ] 二');
  assert.equal(logic.calendarTaskReferences('- [ ] 二\n',indexed),null);
});
test('calendar snapshots match native fenced and quoted rows without blocking real tasks in the note', () => {
  const source='- [ ] 真实任务\n```md\n- [ ] 示例\n```\n> - [ ] 引用任务 📅 2026-11-02\n';
  const indexed=[{line:0,raw:'- [ ] 真实任务'},{line:2,raw:'- [ ] 示例'},{line:4,raw:'> - [ ] 引用任务 📅 2026-11-02'}];
  const refs=logic.calendarTaskReferences(source,indexed);assert.ok(refs);assert.equal(refs.get(0).line,0);
  assert.equal(logic.updateProjectTaskDate(source,refs.get(4),'due','2026-11-03'),'- [ ] 真实任务\n```md\n- [ ] 示例\n```\n> - [ ] 引用任务 📅 2026-11-03\n');
  assert.equal(logic.deleteProjectTask(source,refs.get(4)).content,'- [ ] 真实任务\n```md\n- [ ] 示例\n```\n');
});
test('calendar completion time does not rename tasks or change disclosure keys', () => {
  const before=logic.projectTaskTree('- [ ] 报告 #doing 📅 2026-10-30 <!-- gtd-days: 2026-10-28 -->\n').roots[0];
  const after=logic.projectTaskTree('- [x] 报告 #doing 🕒 14:18 📅 2026-10-30 ✅ 2026-10-28 <!-- gtd-days: 2026-10-28 -->\n').roots[0];
  assert.equal(after.title,'报告');assert.equal(after.key,before.key);assert.deepEqual(after.days,['2026-10-28']);
});
test('sibling reorder moves the entire subtree while leaving other sections intact', () => {
  const source='# 项目\n\n## 任务\n- [ ] 阶段一\n  - [ ] 子任务一\n    说明\n- [ ] 阶段二 📅 2026-11-02\n  - [ ] 子任务二\n\n## 资料\n保留\n';
  const roots=logic.projectTaskTree(source).roots;
  assert.equal(feature('moveSiblingTask')(source,roots[0].reference,roots[1].reference,'after'),'# 项目\n\n## 任务\n- [ ] 阶段二 📅 2026-11-02\n  - [ ] 子任务二\n- [ ] 阶段一\n  - [ ] 子任务一\n    说明\n\n## 资料\n保留\n');
});
test('sibling reorder preserves mixed delimiters and whether a final newline exists', () => {
  const source='# 项目\r\n- [ ] 一\n- [ ] 二';const roots=logic.projectTaskTree(source).roots;
  assert.equal(feature('moveSiblingTask')(source,roots[1].reference,roots[0].reference,'before'),'# 项目\r\n- [ ] 二\n- [ ] 一');
});
test('sibling reorder rejects cross-parent, cross-section and stale drag operations', () => {
  const source='## 任务\n- [ ] 父一\n  - [ ] 子一\n- [ ] 父二\n  - [ ] 子二\n## 记录\n- [ ] 其他事项\n';
  const tree=logic.projectTaskTree(source),move=feature('moveSiblingTask');
  assert.throws(()=>move(source,tree.roots[0].children[0].reference,tree.roots[1].children[0].reference,'before'),/同级/);
  assert.throws(()=>move(source,tree.roots[0].reference,tree.roots[2].reference,'before'),/同级/);
  assert.throws(()=>move(source+'笔记\n',tree.roots[0].reference,tree.roots[1].reference,'after'),/变化/);
});
test('project display ordering keeps unknown projects and persists requested relative order', () => {
  const ordered=feature('orderProjectPaths')(['a.md','b.md','c.md'],['b.md','deleted.md','a.md']);
  assert.deepEqual(ordered,['b.md','a.md','c.md']);
  assert.deepEqual(feature('moveDisplayItem')(ordered,'c.md','b.md','before'),['c.md','b.md','a.md']);
});
