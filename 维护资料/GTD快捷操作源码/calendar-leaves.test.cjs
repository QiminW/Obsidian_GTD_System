const test=require('node:test'),assert=require('node:assert/strict');
const logic=require('./logic.cjs');
const indexed=content=>content.split(/\r?\n/).map((raw,line)=>({line,raw,path:'00 GTD/project.md'})).filter(t=>/^[\s>]*(?:[-*+]|\d+[.)])\s+\[[^\]]\]/.test(t.raw));
const leaves=content=>logic.calendarLeafTasks(content,indexed(content)).map(t=>t.line);

test('native checkbox rows without a space after the checkbox still identify parents and children',()=>{
 for(const content of ['- [ ]Parent\n  - [ ] Child\n','- [ ] Parent\n  - [ ]Child\n','> - [ ]Parent\n>   - [ ]Child\n'])assert.deepEqual(leaves(content),[1]);
});

test('calendar includes only leaf tasks, including completed leaves and standalone tasks',()=>{
 const content='- [ ] Root\n  - [ ] Branch\n    - [x] Leaf\n  - [ ] Other leaf\n- [ ] Standalone\n';
 assert.deepEqual(leaves(content),[2,3,4]);
});
test('ordinary list siblings and headings cannot turn unrelated tasks into children',()=>{
 const content='- [ ] Standalone\n- Note\n  - [ ] Unrelated\n## Next\n  - [ ] Another\n';
 assert.deepEqual(leaves(content),[0,2,4]);
});
test('quoted and tab-indented task branches use their own source boundaries',()=>{
 const content='> - [ ] Quoted parent\n>   - [ ] Quoted child\n\n- [ ] Parent\n\t- [ ] Child\n- [ ] Final\n';
 assert.deepEqual(leaves(content),[1,4,5]);
});
test('fenced examples do not hide a real task that has no actual children',()=>{
 const content='- [ ] Standalone\n  ```md\n  - [ ] Example\n  ```\n- [ ] Other\n';
 const tasks=indexed(content).filter(t=>t.line!==2);
 assert.deepEqual(logic.calendarLeafTasks(content,tasks).map(t=>t.line),[0,4]);
});
test('parent date inheritance remains saved while calendar counts only dated leaves once per day',()=>{
 let content='- [ ] Parent\n  - [ ] Branch\n    - [ ] Leaf\n  - [ ] Second\n';
 content=logic.updateProjectTaskDate(content,logic.projectTaskTree(content).roots[0].reference,'due','2026-11-13');
 const tasks=indexed(content).map(t=>({...t,id:String(t.line),description:t.raw,due:'2026-11-13'}));
 const refs=logic.calendarTaskReferences(content,tasks),visible=logic.calendarLeafTasks(content,tasks);
 assert.equal(refs.size,4);assert.equal(visible.length,2);
 assert.deepEqual(logic.calendarTaskInstances(visible).map(t=>t._gtdSourceTask.line),[2,3]);
 assert.equal((content.match(/📅 2026-11-13/g)||[]).length,4);
});
