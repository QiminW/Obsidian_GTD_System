const test=require('node:test'),assert=require('node:assert/strict');
const logic=require('./logic.cjs');
const root=source=>logic.projectTaskTree(source).roots[0];

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
