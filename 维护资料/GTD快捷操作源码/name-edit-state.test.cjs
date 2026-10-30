const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const logic=require('./logic.cjs');
function plugin(){
 const Base=class{},obsidian={Plugin:Base,Modal:Base,Notice:Base,TFile:Base,TFolder:Base,Menu:Base,MarkdownRenderChild:Base,MarkdownRenderer:{},Component:Base};
 const Class=vm.runInNewContext('const module={exports:{}};'+fs.readFileSync(__dirname+'/main-body.js','utf8')+';module.exports',{require:()=>obsidian,logic,window:{setTimeout,clearTimeout},console});
 const p=new Class();Object.assign(p,{File:Base,taskTitleEdits:new Map(),projectNameEdits:new Map(),nameEditRequest:0,taskTitleFocusKey:'',app:{workspace:{activeLeaf:{id:'home'},trigger(){}}}});return p;
}
const path='00 GTD/00 工作区/01 项目/Test.md',scope='00 GTD/首页.md';
const nodes=()=>logic.projectTaskTree('- [ ] First\n- [ ] Second\n').roots;
test('switching to another unchanged name keeps only one active editor and does not write',async()=>{
 const p=plugin(),n=nodes();let writes=0;p.renameProjectTask=async()=>{writes++;};
 await p.beginTaskTitleEdit(scope,path,n[0]);await p.beginTaskTitleEdit(scope,path,n[1]);
 assert.equal(p.taskTitleEdits.size,1);assert.equal([...p.taskTitleEdits.values()][0].taskKey,n[1].key);assert.equal(writes,0);
});
test('switching editors waits for the previous changed name to save',async()=>{
 const p=plugin(),n=nodes();let release;const gate=new Promise(resolve=>release=resolve);
 p.renameProjectTask=async()=>{await gate;return {path,before:logic.projectTaskTree('- [ ] First\n- [ ] Second\n'),after:logic.projectTaskTree('- [ ] Changed\n- [ ] Second\n')};};
 const state=await p.beginTaskTitleEdit(scope,path,n[0]);state.draft='Changed';
 const next=p.beginTaskTitleEdit(scope,path,n[1]);await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(state.busy,true);assert.equal(p.taskTitleEdits.size,1);release();await next;
 assert.equal(p.taskTitleEdits.size,1);assert.equal([...p.taskTitleEdits.values()][0].draft,'Second');
 assert.equal([...p.taskTitleEdits.values()][0].reference.version,logic.projectTaskTree('- [ ] Changed\n- [ ] Second\n').roots[1].reference.version);
});
test('a failed save keeps its draft and prevents another editor opening',async()=>{
 const p=plugin(),n=nodes();p.renameProjectTask=async()=>{throw Error('Changed elsewhere');};
 const state=await p.beginTaskTitleEdit(scope,path,n[0]);state.draft='Unsubmitted';await p.beginTaskTitleEdit(scope,path,n[1]);
 assert.equal(p.taskTitleEdits.size,1);assert.equal([...p.taskTitleEdits.values()][0].draft,'Unsubmitted');assert.match(state.error,/Changed elsewhere/);
});
test('a past rename never redirects a new project reusing the old filename',async()=>{
 const p=plugin(),destination=path.replace('Test.md','Renamed.md'),a=new p.File(),b=new p.File();Object.assign(a,{path,basename:'Test'});Object.assign(b,{path:destination,basename:'Renamed'});
 p.app.vault={getAbstractFileByPath:key=>key===path?a:b};
 p.lastNameEditChange={path,newPath:destination,before:logic.projectTaskTree('- [ ] First\n- [ ] Second\n'),after:logic.projectTaskTree('- [ ] First\n- [ ] Second\n')};
 const state=await p.beginProjectNameEdit(scope,path,'Test');assert.equal(state.project,path);assert.equal(state.draft,'Test');
 p.closeProjectNameEdit(state.key);
 const task=await p.beginTaskTitleEdit(scope,path,nodes()[0]);assert.equal(task.project,path);
});
test('a failed optional snapshot does not report a completed project rename as failed',async()=>{
 const p=plugin(),file=new p.File();Object.assign(file,{path,basename:'Test',extension:'md'});
 let reads=0;p.app.vault={getAbstractFileByPath:key=>key===file.path?file:null,read:async()=>{if(++reads===2)throw Error('Temporary read failure');return '- [ ] Keep task\n';}};
 p.app.fileManager={renameFile:async(target,destination)=>{target.path=destination;}};
 Object.assign(p,{data:{},inlineTaskEntries:new Map(),taskDayPanels:new Map(),saveData:async()=>{}});
 const state={key:'edit',scope,project:path,draft:'Renamed',original:'Test',busy:false};p.projectNameEdits.set(state.key,state);
 assert.equal(await p.saveProjectNameEdit(state),true);assert.match(file.path,/Renamed\.md$/);assert.equal(p.projectNameEdits.size,0);
});
