const test=require('node:test'),assert=require('node:assert/strict');
const logic=require('./logic.cjs');
const flatten=nodes=>nodes.flatMap(n=>[n,...flatten(n.children)]);
const nodes=source=>flatten(logic.projectTaskTree(source).roots);
const ref=(source,title='Parent')=>nodes(source).find(n=>n.title===title).reference;

test('parent deadline fills empty descendants while preserving their own deadlines and nearest dated parent',()=>{
 const source='## 任务\r\n- [ ] Parent ^p\r\n  - [ ] Empty ^a\n  - [ ] Own 📅 2026-11-08 ^b\r\n    - [ ] Grandchild\n- [ ] Sibling\r\n';
 const result=logic.updateProjectTaskDate(source,ref(source),'due','2026-11-12');
 assert.deepEqual(nodes(result).map(n=>n.due),['2026-11-12','2026-11-12','2026-11-08','2026-11-08','']);
 assert.ok(result.includes('^a\n'));assert.ok(result.endsWith('- [ ] Sibling\r\n'));
});

test('parent multi-day picker additions synchronize only the selected day while keeping independent plans and skipping completed descendants',()=>{
 const source='- [ ] <!-- gtd-days: 2026-11-06 --> Parent\n  - [ ] Empty 📅 2026-11-10\n  - [ ] Own ⏳ 2026-11-08\n    - [ ] Grandchild\n  - [x] Done\n  - [-] Cancelled\n';
 const result=logic.setProjectTaskDay(source,ref(source),'2026-11-07');
 assert.deepEqual(nodes(result).map(n=>n.days),[['2026-11-06','2026-11-07'],['2026-11-07'],['2026-11-07','2026-11-08'],['2026-11-07'],[],[]]);
 assert.equal(nodes(result)[1].due,'2026-11-10');
});

test('parent multi-day picker removal removes only the selected day from every descendant',()=>{
 const source='- [ ] <!-- gtd-days: 2026-11-06,2026-11-07 --> Parent\n  - [ ] <!-- gtd-days: 2026-11-07,2026-11-08 --> Child 📅 2026-11-15\n    - [x] <!-- gtd-days: 2026-11-07,2026-11-09 --> Done\n  - [ ] Empty\n- [ ] <!-- gtd-days: 2026-11-07 --> Sibling\n';
 const result=logic.setProjectTaskDay(source,ref(source),'2026-11-07');
 assert.deepEqual(nodes(result).map(n=>n.days),[['2026-11-06'],['2026-11-08'],['2026-11-09'],[],['2026-11-07']]);
 assert.equal(nodes(result)[1].due,'2026-11-15');assert.equal(nodes(result)[2].completed,true);
});

test('parent Today appends today to unfinished descendants without replacing independent dates or completed tasks',()=>{
 const source='- [ ] <!-- gtd-days: 2026-11-09 --> Parent 📅 2026-11-13 ^p\r\n\t- [ ] Own ⏳ 2026-11-03 📅 2026-11-12 ^own\n\t\t- [ ] <!-- gtd-days: 2026-11-08 --> Deep #doing ^deep\n\t- [x] <!-- gtd-days: 2026-11-04 --> Done ✅ 2026-11-05\n- [ ] <!-- gtd-days: 2026-11-02 --> Sibling\n';
 const result=logic.setProjectTaskDay(source,ref(source),'2026-11-10',undefined,{appendToDescendants:true});
 assert.deepEqual(nodes(result).map(n=>n.days),[['2026-11-09','2026-11-10'],['2026-11-03','2026-11-10'],['2026-11-08','2026-11-10'],['2026-11-04'],['2026-11-02']]);
 assert.equal(nodes(result)[1].due,'2026-11-12');assert.equal(nodes(result)[3].completed,true);
 assert.ok(result.includes('Deep #doing ^deep'));assert.ok(result.includes('Done ✅ 2026-11-05'));assert.ok(result.includes('^p\r\n'));assert.ok(result.endsWith('- [ ] <!-- gtd-days: 2026-11-02 --> Sibling\n'));
});

test('removing Today from a parent removes today from all descendants and preserves every other arrangement',()=>{
 const source='- [ ] <!-- gtd-days: 2026-11-09,2026-11-10 --> Parent\r\n  - [ ] <!-- gtd-days: 2026-11-08,2026-11-10 --> Child 📅 2026-11-13\n    - [x] Deep ⏳ 2026-11-10 ✅ 2026-11-09\n  - [ ] Empty\n- [ ] <!-- gtd-days: 2026-11-10 --> Sibling\n';
 const result=logic.setProjectTaskDay(source,ref(source),'2026-11-10',undefined,{appendToDescendants:true});
 assert.deepEqual(nodes(result).map(n=>n.days),[['2026-11-09'],['2026-11-08'],[],[],['2026-11-10']]);
 assert.equal(nodes(result)[1].due,'2026-11-13');assert.equal(nodes(result)[2].completed,true);assert.ok(result.includes('Deep ✅ 2026-11-09'));assert.ok(result.includes('Parent\r\n'));
});

test('Today bypasses generic inheritance for empty completed and cancelled descendants',()=>{
 const source='- [ ] <!-- gtd-days: 2026-11-09 --> Parent\n  - [ ] Empty\n  - [x] Done\n    - [X] Done deep\n  - [-] Cancelled\n  - [x] <!-- gtd-days: 2026-11-10 --> Previously done today\n';
 const result=logic.setProjectTaskDay(source,ref(source),'2026-11-10',undefined,{appendToDescendants:true});
 assert.deepEqual(nodes(result).map(n=>n.days),[['2026-11-09','2026-11-10'],['2026-11-10'],[],[],[],['2026-11-10']]);
 assert.ok(result.endsWith('  - [x] <!-- gtd-days: 2026-11-10 --> Previously done today\n'));
});

test('parent Today respects ordinary-list boundaries and skips fenced task examples',()=>{
 const source='- [ ] Parent\n  ```md\n  - [ ] Example\n  ```\n  - [ ] <!-- gtd-days: 2026-11-09 --> Child\n- Supporting note\n  - [ ] <!-- gtd-days: 2026-11-08 --> Unrelated\n';
 const result=logic.setProjectTaskDay(source,ref(source),'2026-11-10',undefined,{appendToDescendants:true});
 assert.deepEqual(nodes(result).map(n=>n.days),[['2026-11-10'],['2026-11-09','2026-11-10'],['2026-11-08']]);
 assert.ok(result.includes('  - [ ] Example\n'));assert.ok(result.endsWith('- Supporting note\n  - [ ] <!-- gtd-days: 2026-11-08 --> Unrelated\n'));
});

test('resaving the same parent date fills missing children and clearing does not remove their independent dates',()=>{
 const source='- [ ] Parent 📅 2026-11-12\n  - [ ] Child\n';
 const filled=logic.updateProjectTaskDate(source,ref(source),'due','2026-11-12');
 assert.equal(nodes(filled)[1].due,'2026-11-12');
 const cleared=logic.updateProjectTaskDate(filled,ref(filled),'due','');
 assert.equal(nodes(cleared)[0].due,'');assert.equal(nodes(cleared)[1].due,'2026-11-12');
});

test('changing an already dated parent keeps child dates that have already been set',()=>{
 const source='- [ ] Parent 📅 2026-11-10\n  - [ ] Child 📅 2026-11-09\n';
 const result=logic.updateProjectTaskDate(source,ref(source),'due','2026-11-12');
 assert.equal(nodes(result)[1].due,'2026-11-09');
});

test('new children inherit each missing date independently from the closest available ancestor',()=>{
 const source='- [ ] <!-- gtd-days: 2026-11-06,2026-11-07 --> Parent 📅 2026-11-12\n  - [ ] Middle\n';
 const result=logic.insertSubtask(source,'- [ ] Added 📅 2026-11-09 ^added',ref(source,'Middle'));
 const child=nodes(result).find(n=>n.title==='Added');assert.equal(child.due,'2026-11-09');assert.deepEqual(child.days,['2026-11-06','2026-11-07']);
});

test('moving a captured subtree under a dated parent fills missing dates without overwriting the captured dates',()=>{
 const source='- [ ] Captured\n  - [ ] Own 📅 2026-11-09\n',target='## 任务\n- [ ] <!-- gtd-days: 2026-11-06 --> Parent 📅 2026-11-12\n';
 const result=logic.prepareInboxMove(source,nodes(source)[0].reference,target,ref(target));
 assert.deepEqual(nodes(result.target).map(n=>n.due),['2026-11-12','2026-11-12','2026-11-09']);
 assert.deepEqual(nodes(result.target).map(n=>n.days),[['2026-11-06'],['2026-11-06'],['2026-11-06']]);
});

test('calendar edits to a parent deadline use the same non-destructive inheritance',()=>{
 const source='- [ ] Parent\n  - [ ] Child\n  - [ ] Own 📅 2026-11-08\n';
 const result=logic.replaceProjectTask(source,ref(source),'- [ ] Parent 📅 2026-11-12');
 assert.deepEqual(nodes(result).map(n=>n.due),['2026-11-12','2026-11-12','2026-11-08']);
});

test('inherited dates do not rewrite indented examples in fenced code blocks',()=>{
 const source='- [ ] Parent\n  ```md\n  - [ ] Example\n  ```\n  - [ ] Child\n';
 const result=logic.updateProjectTaskDate(source,ref(source),'due','2026-11-12');
 assert.ok(result.includes('  - [ ] Example\n'));assert.equal(nodes(result)[1].due,'2026-11-12');
});

test('an ordinary list sibling keeps unrelated nested tasks outside propagation',()=>{
 const source='- [ ] Parent\n- Supporting note\n  - [ ] Unrelated\n';
 const result=logic.updateProjectTaskDate(source,ref(source),'due','2026-11-12');
 assert.ok(result.endsWith('- Supporting note\n  - [ ] Unrelated\n'));
});

test('ordinary list boundaries also delimit the closest dated task when filling a deeper branch',()=>{
 const source='- [ ] Parent\n  - [ ] Dated 📅 2026-11-08\n  - Supporting note\n    - [ ] Another\n';
 const result=logic.updateProjectTaskDate(source,ref(source),'due','2026-11-12');
 assert.equal(nodes(result).find(n=>n.title==='Another').due,'2026-11-12');
 const added=logic.insertSubtask(result,'- [ ] Added',ref(result,'Another'));
 assert.equal(nodes(added).find(n=>n.title==='Added').due,'2026-11-12');
});

test('new children do not inherit dates from tasks outside an ordinary-list boundary',()=>{
 const source='- [ ] Parent 📅 2026-11-12\n- Supporting note\n  - [ ] Unrelated\n';
 const result=logic.insertSubtask(source,'- [ ] Added',ref(source,'Unrelated'));
 assert.equal(nodes(result).find(n=>n.title==='Added').due,'');
});

test('quoted calendar deadlines fill only that quoted parent block',()=>{
 const source='> - [ ] Parent\n>   - [ ] Child\n> - Supporting note\n>   - [ ] Unrelated\n- [ ] Outside\n';
 const raw=source.split('\n')[0],refs=logic.calendarTaskReferences(source,[{line:0,raw},{line:1,raw:source.split('\n')[1]},{line:3,raw:source.split('\n')[3]},{line:4,raw:'- [ ] Outside'}]);
 const result=logic.updateProjectTaskDate(source,refs.get(0),'due','2026-11-12');
 assert.equal(result,'> - [ ] Parent 📅 2026-11-12\n>   - [ ] Child 📅 2026-11-12\n> - Supporting note\n>   - [ ] Unrelated\n- [ ] Outside\n');
});
