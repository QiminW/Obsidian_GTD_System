const test=require('node:test'),assert=require('node:assert/strict');
const UndoHistory=require('./undo-history.cjs');
function edit(h,box,next,label='修改'){
 return h.run(label,async()=>{
  const before=box.value;box.value=next;if(before===next)return;
  h.record({check:async()=>assert.equal(box.value,next,'changed'),undo:async()=>{assert.equal(box.value,next);box.value=before;},redo:async()=>{assert.equal(box.value,before);box.value=next;}});
 });
}
test('undo restores saved changes in LIFO order and reports the action',async()=>{
 const h=new UndoHistory(),box={value:'A'};await edit(h,box,'B','改名');await edit(h,box,'C','日期');
 assert.equal(await h.undo(),'日期');assert.equal(box.value,'B');assert.equal(await h.undo(),'改名');assert.equal(box.value,'A');assert.equal(await h.undo(),null);
});
test('unchanged and failed operations without writes do not consume undo',async()=>{
 const h=new UndoHistory(),box={value:'A'};await edit(h,box,'B');await edit(h,box,'B');await assert.rejects(h.run('失败',async()=>{throw Error('failed');}));await h.undo();assert.equal(box.value,'A');assert.equal(await h.undo(),null);
});
test('a failure after a saved write still leaves that real change undoable',async()=>{
 const h=new UndoHistory(),box={value:'A'};
 await assert.rejects(h.run('保存后提示失败',async()=>{const before=box.value;box.value='B';h.record({check:async()=>assert.equal(box.value,'B'),undo:async()=>box.value=before,redo:async()=>box.value='B'});throw Error('notice failed');}));
 await h.undo();assert.equal(box.value,'A');
});
test('foreign changes stop undo without consuming or modifying the entry',async()=>{
 const h=new UndoHistory(),box={value:'A'};await edit(h,box,'B');box.value='External';await assert.rejects(h.undo());assert.equal(box.value,'External');box.value='B';await h.undo();assert.equal(box.value,'A');
});
test('multi-step undo validates every file before changing either one',async()=>{
 const h=new UndoHistory(),a={value:'a'},b={value:'b'};
 await h.run('移入',async()=>{for(const [box,next]of [[a,'A'],[b,'B']]){const old=box.value;box.value=next;h.record({check:async()=>assert.equal(box.value,next),undo:async()=>box.value=old,redo:async()=>box.value=next});}});
 a.value='external';await assert.rejects(h.undo());assert.equal(a.value,'external');assert.equal(b.value,'B');
});
test('an interrupted multi-step undo restores its already undone steps',async()=>{
 const h=new UndoHistory(),box={value:'after'};
 await h.run('移入',async()=>{h.record({check:async()=>{},undo:async()=>{throw Error('disk');},redo:async()=>{}});h.record({check:async()=>assert.equal(box.value,'after'),undo:async()=>box.value='before',redo:async()=>{assert.equal(box.value,'before');box.value='after';}});});
 await assert.rejects(h.undo(),/disk/);assert.equal(box.value,'after');
});
test('concurrent writes and an immediate undo execute in invocation order',async()=>{
 const h=new UndoHistory(),box={value:0};let release;const gate=new Promise(r=>release=r);
 const first=h.run('一',async()=>{await gate;box.value=1;h.record({check:async()=>assert.equal(box.value,1),undo:async()=>box.value=0,redo:async()=>box.value=1});});
 const second=edit(h,box,2,'二'),undo=h.undo();release();await Promise.all([first,second,undo]);assert.equal(box.value,1);await h.undo();assert.equal(box.value,0);
});
test('history retains only the most recent thirty saved actions',async()=>{
 const h=new UndoHistory(),box={value:0};for(let i=1;i<=32;i++)await edit(h,box,i);for(let i=0;i<30;i++)await h.undo();assert.equal(box.value,2);assert.equal(await h.undo(),null);
});
test('clearing history is serialized after earlier saves',async()=>{
 const h=new UndoHistory(),box={value:0};const saved=edit(h,box,1);const cleared=h.clear();await Promise.all([saved,cleared]);assert.equal(await h.undo(),null);assert.equal(box.value,1);
});
