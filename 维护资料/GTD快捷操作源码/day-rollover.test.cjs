const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const timers=[],events=[],listeners=[],cleanups=[],doc={visibilityState:'visible'},win={setInterval:(fn,delay)=>{timers.push({fn,delay});return timers.length;}};
 class Base{};const obsidian={Plugin:Base,Modal:Base,MarkdownRenderChild:Base};
 const Class=vm.runInNewContext('const module={exports:{}};'+fs.readFileSync(__dirname+'/main-body.js','utf8')+';module.exports',{require:()=>obsidian,window:win,document:doc,console});
 const p=new Class();let date='2026-11-10';Object.assign(p,{currentDayKey:date,todayDateKey:()=>date,app:{workspace:{trigger:(...args)=>events.push(args)}},registerInterval:id=>cleanups.push(id),registerDomEvent:(target,name,fn)=>listeners.push({target,name,fn})});
 return {p,doc,win,timers,listeners,events,cleanups,advance:day=>date=day};
}
test('the date check emits one day-change event only when the local day changes, including multi-day sleep',()=>{
 const s=setup();assert.equal(typeof s.p.checkTaskDay,'function');s.p.checkTaskDay();assert.equal(s.events.length,0);
 s.advance('2026-11-11');s.p.checkTaskDay();assert.equal(s.p.currentDayKey,'2026-11-11');assert.deepEqual(s.events,[['gtd-task-day-changed']]);s.p.checkTaskDay();assert.equal(s.events.length,1);
 s.advance('2026-11-14');s.p.checkTaskDay();assert.equal(s.events.length,2);assert.equal(s.p.currentDayKey,'2026-11-14');
});
test('rollover checks keep the 30-second fallback and run immediately on focus and visible resume',()=>{
 const s=setup();assert.equal(typeof s.p.installTaskDayCheck,'function');s.p.installTaskDayCheck();assert.equal(s.timers.length,1);assert.equal(s.timers[0].delay,30000);assert.deepEqual(s.cleanups,[1]);
 const focus=s.listeners.find(e=>e.target===s.win&&e.name==='focus'),visible=s.listeners.find(e=>e.target===s.doc&&e.name==='visibilitychange');assert.ok(focus);assert.ok(visible);
 s.advance('2026-11-11');focus.fn();assert.equal(s.events.length,1);s.timers[0].fn();assert.equal(s.events.length,1);
 s.doc.visibilityState='hidden';s.advance('2026-11-12');visible.fn();assert.equal(s.events.length,1);s.doc.visibilityState='visible';visible.fn();assert.equal(s.events.length,2);assert.equal(s.p.currentDayKey,'2026-11-12');
});
