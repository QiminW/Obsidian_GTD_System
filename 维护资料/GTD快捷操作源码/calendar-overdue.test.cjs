const test=require('node:test'),assert=require('node:assert/strict'),logic=require('./logic.cjs');
const fs=require('node:fs'),install=require('./calendar-bridge.cjs');
global.window={setTimeout:()=>0,clearTimeout(){}};
const source=(line=1,path='00 GTD/Example.md')=>({id:path+':'+line,path,line,raw:'- [ ] Same title',description:'Same title'});
const occurrence=(task,date,deadline=false)=>({...task,id:task.id+'::gtd-day:'+date,_gtdSourceTask:task,_gtdDay:date,_gtdDeadline:deadline,scheduled:date,due:date});
const filter=(overdue,visible)=>{assert.equal(typeof logic.calendarOverdueTasks,'function');return logic.calendarOverdueTasks(overdue,visible);};
test('a task visible in the main period is omitted from overdue even when its expired arrangement is on another date',()=>{
 const a=source(),b=source(2),old=occurrence(a,'2026-11-09'),past=occurrence(a,'2026-11-10'),today=occurrence(a,'2026-11-11'),other=occurrence(b,'2026-11-08');
 assert.deepEqual(filter([past,other],[old]),[other]);assert.deepEqual(filter([old,past,other],[today]),[other]);assert.equal(past._gtdSourceTask,a);
});
test('overdue keeps the latest expired arrangement once per source task while preserving native card identity and order',()=>{
 const a=source(),b=source(2),first=occurrence(a,'2026-11-07'),other=occurrence(b,'2026-11-08'),last=occurrence(a,'2026-11-10');
 assert.deepEqual(filter([first,other,last,last],[]),[other,last]);assert.equal(filter([first,last],[])[0],last);
});
test('an expired deadline takes precedence over later expired arrangements of the same task',()=>{
 const a=source(),deadline=occurrence(a,'2026-11-08',true),later=occurrence(a,'2026-11-10');assert.deepEqual(filter([deadline,later],[]),[deadline]);
});
test('same labels on different source lines or projects remain separate and outside-GTD tasks are untouched',()=>{
 const a=source(),b=source(2),c=source(1,'00 GTD/Other.md'),external=occurrence(source(1,'Other/Example.md'),'2026-11-07');
 const first=occurrence(a,'2026-11-07'),second=occurrence(b,'2026-11-08'),third=occurrence(c,'2026-11-09');
 assert.deepEqual(filter([first,second,third,external,external],[occurrence(a,'2026-11-11'),external]),[second,third,external,external]);
});

function bridge(){const calendar={taskStore:{getTasks:()=>[]},refreshCalendars(){}},plugin={data:{},app:{plugins:{plugins:{'tasks-calendar':calendar}},vault:{on:()=>({}),offref(){},getMarkdownFiles:()=>[]}}};return {calendar,bridge:install(plugin,logic,class{})};}
test('model filtering uses the visible native date range in every mode and preserves model/source identities outside overdue',()=>{
 const s=bridge(),a=source(),b=source(2),old=occurrence(a,'2026-11-09'),today=occurrence(a,'2026-11-11'),other=occurrence(b,'2026-11-08');
 assert.equal(typeof s.calendar._gtdCalendarModel,'function');
 for(const days of [[new Date(2026,10,11)],[new Date(2026,10,10),new Date(2026,10,11)],Array.from({length:42},(_,i)=>new Date(2026,9,26+i))]){
  const model={days,tasksByDate:new Map([['2026-11-11',[today]]]),overdueTasks:[old,other],today:'2026-11-11',visibleTasks:3};
  const result=s.calendar._gtdCalendarModel(model,{current:{closest:()=>({})}});assert.deepEqual(result.overdueTasks,[other]);assert.equal(result.tasksByDate,model.tasksByDate);assert.equal(result.days,model.days);assert.equal(result.visibleTasks,3);assert.equal(model.overdueTasks.length,2);
  assert.equal(s.calendar._gtdCalendarModel(model,{current:{closest:()=>null}}),model);assert.equal(s.calendar._gtdCalendarModel(model,{current:null}),model);
 }
 s.bridge.restore();assert.equal(s.calendar._gtdCalendarModel,undefined);
});
test('adapted native memo applies the model hook before overdue counts and cards consume it',()=>{
 const s=bridge(),a=source(),past=occurrence(a,'2026-11-09'),today=occurrence(a,'2026-11-11'),model={days:[new Date(2026,10,11)],tasksByDate:new Map([['2026-11-11',[today]]]),overdueTasks:[past]};
 const bundle=fs.readFileSync(__dirname+'/../../.obsidian/plugins/tasks-calendar/main.js','utf8'),start=bundle.indexOf('N=(0,Pe.useMemo)('),end=bundle.indexOf(',{expectRecurringTask:',start);assert.ok(start>=0&&end>start);
 const evaluate=new Function('Pe','iO','H','s','a','O','br','d','v','return '+bundle.slice(start+2,end));
 const result=evaluate({useMemo:fn=>fn()},()=>model,[],{mode:'day'},s.calendar,new Date(2026,10,11),value=>value,'2026-11-11',{current:{closest:()=>({})}});
 assert.deepEqual(result.overdueTasks,[]);assert.equal(result.tasksByDate,model.tasksByDate);s.bridge.restore();
});
