const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const logic=require('./logic.cjs');
const project='00 GTD/00 工作区/01 项目/Test.md',scope='00 GTD/首页.md';
function plugin(){
 const Base=class{},obsidian={Plugin:Base,Modal:Base,Notice:Base,TFile:Base,TFolder:Base,Menu:Base,MarkdownRenderChild:Base,MarkdownRenderer:{},Component:Base};
 const Class=vm.runInNewContext('const module={exports:{}};'+fs.readFileSync(__dirname+'/main-body.js','utf8')+';module.exports',{require:()=>obsidian,logic,window:{setTimeout,clearTimeout},console});
 const p=new Class();Object.assign(p,{inlineTaskEntries:new Map(),inlineTaskFocusKey:'',app:{workspace:{trigger(){}}},listProjects:()=>[{path:project}]});return p;
}
test('outside dismissal hides an unsubmitted draft and the same plus reopens it',()=>{
 const p=plugin(),parent={key:'parent',reference:{line:1,raw:'- [ ] Parent'}};
 const state=p.beginInlineTaskEntry(scope,project,parent);state.draft='Unsubmitted';
 assert.equal(typeof p.hideInlineTaskEntry,'function');p.hideInlineTaskEntry(state.key);
 assert.equal(p.inlineTaskEntriesFor(scope,project).length,0);assert.equal(p.inlineTaskEntries.get(state.key).draft,'Unsubmitted');
 const reopened=p.beginInlineTaskEntry(scope,project,parent);assert.equal(reopened.draft,'Unsubmitted');assert.equal(p.inlineTaskEntriesFor(scope,project).length,1);
});
test('clicks inside the current add form keep it open, outside clicks hide it without saving',()=>{
 const p=plugin(),state=p.beginInlineTaskEntry(scope,project);state.draft='Keep';let saves=0;p.addTask=()=>saves++;
 assert.equal(typeof p.handleInlineEntryOutsideClick,'function');
 p.handleInlineEntryOutsideClick({target:{closest:()=>({dataset:{gtdInlineEntryKey:state.key}})}});assert.equal(p.inlineTaskEntriesFor(scope,project).length,1);
 p.handleInlineEntryOutsideClick({target:{closest:()=>null}});assert.equal(p.inlineTaskEntriesFor(scope,project).length,0);assert.equal(saves,0);
});
test('hiding an empty entry removes it and publishes a targeted dismissal event',()=>{
 const p=plugin(),events=[];p.app.workspace.trigger=(...args)=>events.push(args);const state=p.beginInlineTaskEntry(scope,project);
 p.hideInlineTaskEntry(state.key);assert.equal(p.inlineTaskEntries.size,0);
 assert.equal(events.at(-1)[0],'gtd-inline-task-entry');assert.equal(events.at(-1)[2].type,'hide');assert.equal(events.at(-1)[2].key,state.key);
});
test('outside dismissal during save does not cancel or duplicate the write',async()=>{
 const p=plugin(),state=p.beginInlineTaskEntry(scope,project);state.draft='Save once';let release,writes=0;
 p.addTask=async()=>{writes++;await new Promise(resolve=>release=resolve);};
 const pending=p.saveInlineTaskEntry(state);p.hideInlineTaskEntry(state.key);
 assert.equal(state.busy,true);assert.equal(p.inlineTaskEntriesFor(scope,project).length,0);release();await pending;
 assert.equal(writes,1);assert.equal(p.inlineTaskEntries.size,0);
});
test('a failed hidden save keeps the draft for reopening',async()=>{
 const p=plugin(),state=p.beginInlineTaskEntry(scope,project);state.draft='Retry';let reject;
 p.addTask=()=>new Promise((resolve,fail)=>reject=fail);const pending=p.saveInlineTaskEntry(state);p.hideInlineTaskEntry(state.key);reject(Error('No write'));await pending;
 assert.equal(p.inlineTaskEntries.get(state.key).draft,'Retry');assert.equal(p.inlineTaskEntriesFor(scope,project).length,0);
 assert.equal(p.beginInlineTaskEntry(scope,project).draft,'Retry');
});
