const test=require('node:test'),assert=require('node:assert/strict');
const logic=require('./logic.cjs');
const root=source=>logic.projectTaskTree(source).roots[0];
const at=(source,line)=>logic.calendarTaskReferences(source,source.split(/\r?\n/).map((raw,line)=>({line,raw})).filter(task=>/^[\s>]*(?:[-*+]|\d+[.)])\s+\[[^\]]\]/.test(task.raw))).get(line);

test('reopening a descendant reopens every completed ancestor and clears only their completion dates',()=>{
 const source='- [X] <!-- gtd-days: 2026-11-06,2026-11-08 --> Root 📅 2026-11-20 ✅ 2026-11-05 ^root\r\n  Parent notes\n  - [x] Parent ⏳ 2026-11-07 ✅ 2026-11-06 ^parent\r\n    - [x] Child ✅ 2026-11-06 ^child\n    - [x] Sibling ✅ 2026-11-06 ^sibling\r\n- [x] Other ✅ 2026-11-04 ^other\n';
 const expected=source.replace('- [X]','- [ ]').replace('Root 📅 2026-11-20 ✅ 2026-11-05','Root 📅 2026-11-20').replace('Parent ⏳ 2026-11-07 ✅ 2026-11-06','Parent ⏳ 2026-11-07').replace('  - [x] Parent','  - [ ] Parent').replace('    - [x] Child ✅ 2026-11-06','    - [ ] Child');
 assert.equal(logic.replaceProjectTask(source,at(source,3),'    - [ ] Child ^child'),expected);
});

test('reopening continues above an unfinished intermediate ancestor without changing its status',()=>{
 const source='- [x] Root ✅ 2026-11-05\n  - [/] In progress\n    - [x] Child ✅ 2026-11-06\n';
 assert.equal(logic.replaceProjectTask(source,at(source,2),'    - [ ] Child'),'- [ ] Root\n  - [/] In progress\n    - [ ] Child\n');
});

test('unrelated tasks under ordinary list siblings do not reopen a false parent',()=>{
 const source='- [x] Root ✅ 2026-11-05\n  - [x] Branch ✅ 2026-11-05\n  - Supporting note\n    - [x] Child ✅ 2026-11-06\n';
 assert.equal(logic.replaceProjectTask(source,at(source,3),'    - [ ] Child'),'- [ ] Root\n  - [x] Branch ✅ 2026-11-05\n  - Supporting note\n    - [ ] Child\n');
});

test('quoted calendar descendants reopen only ancestors in the same quote block',()=>{
 const source='> - [x] Unrelated ✅ 2026-11-05\n\nNormal text\n> - [X] Root ✅ 2026-11-05\n>   1. [x] Parent ✅ 2026-11-06\n>     * [x] Child ✅ 2026-11-06\n';
 assert.equal(logic.replaceProjectTask(source,at(source,5),'>     * [ ] Child'),source.replace('> - [X] Root ✅ 2026-11-05','> - [ ] Root').replace('>   1. [x] Parent ✅ 2026-11-06','>   1. [ ] Parent').replace('>     * [x] Child ✅ 2026-11-06','>     * [ ] Child'));
});

test('completed task name or date edits do not reopen ancestors',()=>{
 const source='- [x] Root ✅ 2026-11-05\n  - [x] Child ✅ 2026-11-06\n';
 assert.equal(logic.replaceProjectTask(source,at(source,1),'  - [x] Renamed 📅 2026-11-20 ✅ 2026-11-06'),source.replace('Child','Renamed 📅 2026-11-20'));
});

test('reopening does not cross headings or treat fenced checkboxes as ancestors',()=>{
 const source='- [x] Previous ✅ 2026-11-05\n## Next\n```md\n- [x] Example ✅ 2026-11-05\n```\n  - [x] Child ✅ 2026-11-06\n';
 assert.equal(logic.replaceProjectTask(source,at(source,5),'  - [ ] Child'),source.replace('  - [x] Child ✅ 2026-11-06','  - [ ] Child'));
});

test('a parent cannot be completed while a direct child is unfinished',()=>{
 const source='## 任务\r\n- [ ] Parent ^parent\r\n  - [ ] Child ^child\r\n';
 assert.throws(()=>logic.replaceProjectTask(source,root(source).reference,'- [x] Parent ✅ 2026-11-06 ^parent'),/1.*子任务.*未完成/);
 assert.equal(root(source).completed,false);
});

test('an unfinished grandchild blocks completion even under an already completed child',()=>{
 const source='- [ ] Parent\n  - [x] Child ✅ 2026-11-05\n    - [ ] Grandchild\n';
 assert.throws(()=>logic.replaceProjectTask(source,root(source).reference,'- [x] Parent'),/1.*子任务.*未完成/);
});

test('all descendant checkboxes must be completed rather than just the leaf progress',()=>{
 const source='- [ ] Parent\n  - [ ] Child\n    - [x] Grandchild\n';
 assert.equal(root(source).done,root(source).total);
 assert.throws(()=>logic.replaceProjectTask(source,root(source).reference,'- [x] Parent'),/子任务.*未完成/);
});

test('completing a ready parent preserves children, mixed line endings, notes and unfinished siblings',()=>{
 const source='- [ ] Parent ^parent\r\n  Description\n  - [x] Child ✅ 2026-11-05 ^child\r\n    - [X] Grandchild\n- [ ] Sibling\r\n';
 const replacement='- [x] Parent ✅ 2026-11-06 ^parent';
 assert.equal(logic.replaceProjectTask(source,root(source).reference,replacement),source.replace('- [ ] Parent ^parent',replacement));
});

test('reopening or renaming an existing completed parent remains possible with unfinished children',()=>{
 const source='- [x] Parent\n  - [ ] Child\n';
 assert.equal(logic.replaceProjectTask(source,root(source).reference,'- [ ] Parent'),'- [ ] Parent\n  - [ ] Child\n');
 assert.equal(logic.renameProjectTask(source,root(source).reference,'Renamed'),'- [x] Renamed\n  - [ ] Child\n');
});

test('unfinished examples inside a code fence do not count as children',()=>{
 const source='- [ ] Parent\n  ```md\n  - [ ] Example\n  ```\n  - [x] Real child\n';
 assert.doesNotThrow(()=>logic.replaceProjectTask(source,root(source).reference,'- [x] Parent'));
});

test('cancelled children are not silently treated as completed',()=>{
 const source='- [ ] Parent\n  - [-] Cancelled\n';
 assert.throws(()=>logic.replaceProjectTask(source,root(source).reference,'- [x] Parent'),/子任务.*未完成/);
});

test('an ordinary list sibling ends the parent block before an unrelated nested checkbox',()=>{
 const source='- [ ] Parent\n- Supporting note\n  - [ ] Unrelated\n';
 assert.doesNotThrow(()=>logic.replaceProjectTask(source,root(source).reference,'- [x] Parent'));
});

test('quoted calendar parents enforce descendant completion too',()=>{
 const source='> - [ ] Parent\n>   - [ ] Child\n';
 const refs=logic.calendarTaskReferences(source,[{line:0,raw:'> - [ ] Parent'},{line:1,raw:'>   - [ ] Child'}]);
 assert.throws(()=>logic.replaceProjectTask(source,refs.get(0),'> - [x] Parent'),/子任务.*未完成/);
});
