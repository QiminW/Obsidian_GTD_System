const test=require('node:test'),assert=require('node:assert/strict'),logic=require('./logic.cjs');
const indexed=(content,path='00 GTD/Projects/Example.md')=>content.split(/\r?\n/).map((raw,line)=>({raw,line,path,id:path+':'+line})).filter(t=>/^[\s>]*(?:[-*+]|\d+[.)])\s+\[[^\]]\]/.test(t.raw));
const contexts=(content,path)=>logic.calendarTaskContexts(content,indexed(content,path));
test('calendar metadata carries exact full ancestry and direct parent without task metadata',()=>{
 const source='- [ ] Root #doing 📅 2026-11-20 ^root\n  - [ ] Parent ✅ 2026-11-06 ^parent\n    - [ ] Child\n';
 const meta=contexts(source).get(2);assert.deepEqual(meta._gtdAncestors,['Root','Parent']);assert.equal(meta._gtdParentTitle,'Parent');
 assert.equal(contexts(source).get(0)._gtdParentTitle,'');
});
test('same parent labels in different branches or projects remain separate groups',()=>{
 const source='- [ ] Parent\n  - [ ] Child\n- [ ] Parent\n  - [ ] Child\n',a=contexts(source),b=contexts(source,'00 GTD/Projects/Other.md');
 assert.notEqual(a.get(1)._gtdGroupKey,a.get(3)._gtdGroupKey);assert.notEqual(a.get(1)._gtdGroupKey,b.get(1)._gtdGroupKey);
});
test('stable parent block IDs retain grouping identity after renaming',()=>{
 const source='- [ ] Parent ^parent\n  - [ ] Child\n';
 assert.equal(contexts(source).get(1)._gtdGroupKey,contexts(source.replace('Parent','Renamed')).get(1)._gtdGroupKey);
});
test('ordinary list siblings end false parents but preserve the actual upper ancestor',()=>{
 const source='- [ ] Root\n  - [ ] Previous\n  - Note\n    - [ ] Child\n';assert.deepEqual(contexts(source).get(3)._gtdAncestors,['Root']);
});
test('quoted and no-space checkbox syntax produces correct parent paths',()=>{
 const source='> - [ ]Root\n>   - [ ]Parent\n>     - [ ]Child\n';assert.deepEqual(contexts(source).get(2)._gtdAncestors,['Root','Parent']);
});
test('standalone tasks group by project and metadata does not modify indexed source references',()=>{
 const source='- [ ] One\n- [ ] Two\n',tasks=indexed(source),before=structuredClone(tasks),meta=logic.calendarTaskContexts(source,tasks);
 assert.equal(meta.get(0)._gtdGroupKey,meta.get(1)._gtdGroupKey);assert.deepEqual(tasks,before);
});
test('every ancestor has its own source identity so shared paths merge without merging duplicate labels',()=>{
 const source='- [ ] Root ^root\n  - [ ] Same\n    - [ ] First\n  - [ ] Same\n    - [ ] Second\n';
 const meta=contexts(source),a=meta.get(2)._gtdAncestorKeys,b=meta.get(4)._gtdAncestorKeys;
 assert.equal(a.length,2);assert.equal(a[0],b[0]);assert.notEqual(a[1],b[1]);
 assert.deepEqual(a,contexts(source.replace('Root','Renamed')).get(2)._gtdAncestorKeys);
});
