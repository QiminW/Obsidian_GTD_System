const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const logic=require('./logic.cjs'),install=require('./calendar-bridge.cjs');
const bundle=fs.readFileSync(__dirname+'/../../.obsidian/plugins/tasks-calendar/main.js','utf8');
function setup(){
 const native=[],owned=[],clears=[],content='- [ ] Parent\n  - [ ] Child\n',path='00 GTD/project.md';
 class Notice{constructor(message,duration){native.push({message,duration});}}
 const section=(name,next)=>{const start=bundle.indexOf('async '+name+'(',bundle.indexOf('async toggleTask('));return bundle.slice(start,bundle.indexOf(next,start));};
 const methods=[section('toggleTask','async editTask('),section('editTask','async deleteTask('),section('deleteTask','async rescheduleTask('),section('rescheduleTask','rememberTaskOrder('),section('createTask','async openTask('),section('openTask','refreshCalendars(')].join(',');
 const calendar=new Function('ke','No','Hd','gA','yA','z1','Lg','return ({'+methods+'})')({Notice,TFile:class{},MarkdownView:class{}},e=>e.message,s=>s,s=>s,s=>s,async()=>{throw Error('Edit failed')},s=>s);
 const indexed=content.trimEnd().split('\n').map((raw,line)=>({raw,line,path,id:String(line),completed:false})),references=logic.calendarTaskReferences(content,indexed);
 const parent={...indexed[0],_gtdReference:references.get(0)};
 Object.assign(calendar,{app:{vault:{getAbstractFileByPath:()=>null}},settings:{newTaskFile:path},tasksApi:{executeToggleTaskDoneCommand:raw=>raw.replace('[ ]','[x]')},refreshCalendars(){},taskStore:{getTasks:()=>indexed,replaceTask:async()=>{throw Error('Outside failure')},deleteTask:async()=>{throw Error('Outside deletion failure')}}});
 const plugin={app:{plugins:{plugins:{'tasks-calendar':calendar}},vault:{on:()=>({}),offref(){},getMarkdownFiles:()=>[]}},clearTaskActionNotice(){clears.push(true)},showTaskActionError:error=>owned.push(error.message),mutateCalendarTask:async(task,change)=>change(content,task._gtdReference),showTaskDeletionUndo(){}};
 const bridge=install(plugin,logic,Notice);return {calendar,plugin,bridge,parent,native,owned,clears};
}
global.window={setTimeout:()=>0,clearTimeout(){}};
test('native calendar completion failures use GTD feedback and still return false for checkbox rollback',async()=>{
 const s=setup();for(let i=0;i<3;i++)assert.equal(await s.calendar.toggleTask(s.parent),false);
 assert.equal(s.native.length,0);assert.equal(s.owned.length,3);assert.ok(s.owned.every(message=>/子任务未完成/.test(message)));assert.ok(s.clears.length>=3);s.bridge.restore();
});
test('native calendar editor failures use the same feedback channel',async()=>{
 const s=setup();await s.calendar.editTask(s.parent);assert.deepEqual(s.owned,['Edit failed']);assert.equal(s.native.length,0);s.bridge.restore();
});
test('calendar feedback leaves non-GTD failures and bridge restoration unchanged',async()=>{
 const s=setup();await s.calendar.toggleTask({...s.parent,path:'Other/project.md'});
 assert.equal(s.owned.length,0);assert.equal(s.native.length,1);assert.match(s.native[0].message,/Could not update task/);
 s.bridge.restore();assert.equal(s.calendar._gtdTaskError,undefined);await s.calendar.toggleTask(s.parent);assert.equal(s.native.length,2);
});
test('calendar reschedule and deletion errors also use the shared GTD feedback',async()=>{
 const s=setup();s.plugin.mutateCalendarTask=async()=>{throw Error('Write failed')};
 await s.calendar.rescheduleTask({...s.parent,_gtdKind:'deadline',_gtdDay:'2026-11-06'},'2026-11-07');
 assert.equal(await s.calendar.deleteTask(s.parent),false);assert.deepEqual(s.owned,['Write failed','Write failed']);assert.equal(s.native.length,0);s.bridge.restore();
});
test('calendar create and missing-source open failures share GTD feedback too',async()=>{
 const s=setup();await s.calendar.createTask('2026-11-13');await s.calendar.openTask(s.parent);
 assert.equal(s.native.length,0);assert.equal(s.owned.length,2);assert.match(s.owned[1],/Task file not found/);s.bridge.restore();
});
