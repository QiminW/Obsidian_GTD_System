const test=require('node:test'),assert=require('node:assert/strict'),logic=require('./logic.cjs'),install=require('./calendar-bridge.cjs');
global.window={setTimeout:()=>0,clearTimeout(){}};
const path='00 GTD/Projects/Example.md',file={path,extension:'md'};
const original='- [ ] Root\n  - [ ] First branch\n    - [ ] <!-- gtd-days: 2026-11-10 --> First\n  - [ ] Second branch\n    - [ ] <!-- gtd-days: 2026-11-10 --> Second\n';
const indexed=content=>content.trimEnd().split('\n').map((raw,line)=>({raw,line,path,id:path+':'+line,description:raw,completed:/\[[xX]\]/.test(raw)})).filter(t=>/^\s*- \[.\]/.test(t.raw));
async function setup(){
 let text=original,tasks=indexed(text),read=()=>Promise.resolve(text);const handlers=new Map();
 const vault={getMarkdownFiles:()=>[file],read:()=>read(),on:(name,fn)=>(handlers.set(name,fn),{name}),offref:ref=>handlers.delete(ref.name)};
 const store={getTasks:()=>tasks},calendar={taskStore:store,refreshCalendars(){}},plugin={data:{},app:{plugins:{plugins:{'tasks-calendar':calendar}},vault}};
 const bridge=install(plugin,logic,class{});await Promise.resolve();
 return {store,bridge,handlers,setText:value=>text=value,setTasks:value=>tasks=indexed(value),setRead:value=>read=value};
}
const ancestry=tasks=>tasks.map(t=>t._gtdAncestors);
test('calendar keeps the last coherent hierarchy while fresh source waits for the native index',async()=>{
 const s=await setup(),before=s.store.getTasks();assert.deepEqual(ancestry(before),[['Root','First branch'],['Root','Second branch']]);
 const changed=original.replace('[ ] <!-- gtd-days: 2026-11-10 --> First','[x] <!-- gtd-days: 2026-11-10 --> First');
 s.setText(changed);await s.handlers.get('modify')(file);
 const pending=s.store.getTasks();assert.deepEqual(ancestry(pending),[['Root','First branch'],['Root','Second branch']]);assert.deepEqual(pending.map(t=>t.id),before.map(t=>t.id));
 assert.ok(pending.every(t=>t._gtdSourceTask._gtdReference===null));assert.ok(before.every(t=>t._gtdSourceTask._gtdReference));
 assert.throws(()=>logic.calendarTaskReference(changed,pending[0]._gtdSourceTask),/正在同步/);
 s.setTasks(changed);const fresh=s.store.getTasks();assert.deepEqual(ancestry(fresh),[['Root','First branch'],['Root','Second branch']]);assert.equal(fresh[0].completed,true);assert.ok(fresh.every(t=>t._gtdSourceTask._gtdReference));s.bridge.restore();
});
test('calendar keeps one coherent task model when the native index changes before source reading finishes',async()=>{
 const s=await setup(),before=s.store.getTasks();let finish;
 const changed=original+'- [ ] <!-- gtd-days: 2026-11-10 --> Added\n';s.setRead(()=>new Promise(resolve=>finish=resolve));
 const reading=s.handlers.get('modify')(file);s.setTasks(changed);
 const pending=s.store.getTasks();assert.equal(pending.length,2);assert.deepEqual(ancestry(pending),[['Root','First branch'],['Root','Second branch']]);assert.ok(pending.every(t=>t._gtdSourceTask._gtdReference===null));assert.equal(before.length,2);
 finish(changed);await reading;const fresh=s.store.getTasks();assert.equal(fresh.length,3);assert.deepEqual(fresh.at(-1)._gtdAncestors,[]);assert.ok(fresh.every(t=>t._gtdSourceTask._gtdReference));s.bridge.restore();
});
test('removed source tasks are not resurrected from a coherent calendar cache',async()=>{
 const s=await setup();assert.equal(s.store.getTasks().length,2);s.setTasks('');s.handlers.get('delete')(file);assert.equal(s.store.getTasks().length,0);
 const replacement='- [ ] <!-- gtd-days: 2026-11-10 --> Recreated\n';s.setText(replacement);s.setTasks(replacement);await s.handlers.get('create')(file);
 const fresh=s.store.getTasks();assert.equal(fresh.length,1);assert.deepEqual(fresh[0]._gtdAncestors,[]);assert.ok(fresh[0]._gtdSourceTask._gtdReference);s.bridge.restore();
});
test('a coherent task-empty file replaces its old model before later index-first task additions',async()=>{
 const s=await setup();assert.equal(s.store.getTasks().length,2);
 const empty='## No tasks\n';s.setText(empty);s.setTasks(empty);await s.handlers.get('modify')(file);assert.deepEqual(s.store.getTasks(),[]);
 const replacement='- [ ] <!-- gtd-days: 2026-11-10 --> Brand new\n';let finish;s.setRead(()=>new Promise(resolve=>finish=resolve));
 const reading=s.handlers.get('modify')(file);s.setTasks(replacement);assert.deepEqual(s.store.getTasks(),[]);
 finish(replacement);await reading;const fresh=s.store.getTasks();assert.equal(fresh.length,1);assert.equal(fresh[0]._gtdSourceTask.raw.trim(),replacement.trim());assert.ok(fresh[0]._gtdSourceTask._gtdReference);s.bridge.restore();
});
