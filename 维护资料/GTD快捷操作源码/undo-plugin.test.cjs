const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const logic=require('./logic.cjs'),UndoHistory=require('./undo-history.cjs');
const ROOT='00 GTD/00 工作区/01 项目',HOME='00 GTD/首页.md',INBOX='00 GTD/00 工作区/00 功能页面/收件箱.md',PATH=ROOT+'/00 工作/Test.md';
function setup(content='## 任务\n- [ ] First ^first\n- [ ] Second ^second\n'){
 const files=new Map(),notices=[],events=[];
 class File{constructor(path,text){this.path=path;this.text=text;this.extension='md';}get basename(){return this.path.split('/').at(-1).slice(0,-3);}}
 const Base=class{},obsidian={Plugin:class{register(){}},Modal:Base,Notice:class{constructor(message){notices.push(message);}},TFile:File,TFolder:Base,Menu:Base,MarkdownRenderChild:Base,MarkdownRenderer:{},Component:Base,parseYaml:value=>value.trim()?JSON.parse(value):null,stringifyYaml:value=>JSON.stringify(value)+'\n'};
 const Class=vm.runInNewContext('const module={exports:{}};'+fs.readFileSync(__dirname+'/main-body.js','utf8')+';module.exports',{require:()=>obsidian,logic,UndoHistory,structuredClone,window:{setTimeout,clearTimeout},console});
 const file=new File(PATH,content),inbox=new File(INBOX,'# 收集箱\n- [ ] Collect ^collect\n');files.set(PATH,file);files.set(INBOX,inbox);
 const vault={getAbstractFileByPath:path=>files.get(path),getMarkdownFiles:()=>[...files.values()],read:async f=>f.text,async process(f,change){if(vault.beforeProcess){const hook=vault.beforeProcess;vault.beforeProcess=null;hook(f);}f.text=change(f.text);},async create(path,text){if(files.has(path))throw Error('exists');const f=new File(path,text);files.set(path,f);return f;}};
 const p=new Class();Object.assign(p,{data:{},inlineTaskEntries:new Map(),taskTitleEdits:new Map(),projectNameEdits:new Map(),taskDayPanels:new Map(),inlineTaskFocusKey:'',taskTitleFocusKey:'',projectNameFocusKey:'',saveData:async()=>{},app:{vault,metadataCache:{getFileCache:()=>({frontmatter:{}})},commands:{executeCommandById:id=>events.push(id)},plugins:{plugins:{'obsidian-tasks-plugin':{apiV1:{executeToggleTaskDoneCommand:raw=>raw.replace('- [ ]','- [x]')}}}},workspace:{activeLeaf:{id:'home',view:{file:{path:HOME},getMode:()=> 'preview',getViewType:()=> 'markdown',containerEl:{querySelector:()=>({})}}},trigger:(...args)=>events.push(args)},fileManager:{async renameFile(f,path){if(files.has(path)&&files.get(path)!==f)throw Error('exists');files.delete(f.path);f.path=path;files.set(path,f);}}}});
 p.installUndoHistory();
 return {p,file,inbox,files,notices,events,vault,File};
}
const ref=(text,key='block:first')=>{const flatten=nodes=>nodes.flatMap(n=>[n,...flatten(n.children)]);return flatten(logic.projectTaskTree(text).roots).find(n=>n.key===key).reference;};
test('adding a child is undoable and preserves the exact original note',async()=>{
 const original='## 任务\r\n- [ ] Parent ^first\r\n\t- [ ] Existing\n\r\n## 资料\r\nKeep';const {p,file}=setup(original);
 await p.addTask({project:PATH,title:'Added',parent:ref(file.text)});assert.match(file.text,/Added/);await p.undoHistory.undo();assert.equal(file.text,original);
});
test('task rename and date edits undo in saved order without losing metadata',async()=>{
 const original='## 任务\n- [ ] <!-- gtd-days: 2026-10-30 --> First 📅 2026-11-01 ^first\n';const {p,file}=setup(original);
 await p.renameProjectTask(PATH,ref(file.text),'Renamed');const renamed=file.text;await p.updateProjectTaskDate(PATH,ref(file.text),'due','2026-11-12');await p.undoHistory.undo();assert.equal(file.text,renamed);await p.undoHistory.undo();assert.equal(file.text,original);
});
test('completion, deletion and same-level ordering restore whole subtrees',async()=>{
 const original='## 任务\n- [ ] Parent ^first\n  Description\n  - [ ] Child ^child\n- [ ] Second ^second\n';const {p,file}=setup(original);
 await p.toggleProjectTask(PATH,ref(file.text,'block:child'));await p.undoHistory.undo();assert.equal(file.text,original);
 await p.deleteProjectTask(PATH,ref(file.text));await p.undoHistory.undo();assert.equal(file.text,original);
 await p.reorderProjectTask(PATH,ref(file.text),ref(file.text,'block:second'),'after');assert.match(file.text,/Second[^]*Parent[^]*Child/);await p.undoHistory.undo();assert.equal(file.text,original);
});
test('today and multiple-day arrangement changes are undoable',async()=>{
 const {p,file}=setup();const before=file.text;await p.toggleProjectTaskDay(PATH,ref(file.text),'2026-11-03');assert.match(file.text,/gtd-days/);await p.undoHistory.undo();assert.equal(file.text,before);
});
test('project metadata undo restores original formatting and surrounding content',async()=>{
 const original='---\r\n{"status":"active","deadline":"2026-11-01","custom":"keep"}\r\n---\r\n## 任务\r\n- [ ] First ^first\r\n';const {p,file}=setup(original);
 await p.updateProjectDeadline(PATH,'2026-12-01','2026-11-01');const dated=file.text;await p.setProjectStatus(PATH,'done');await p.undoHistory.undo();assert.equal(file.text,dated);await p.undoHistory.undo();assert.equal(file.text,original);
});
test('project metadata editing recognizes an existing empty frontmatter block',async()=>{
 const original='---\n---\n## 任务\n- [ ] First ^first\n';const {p,file}=setup(original);await p.updateProjectDeadline(PATH,'2026-12-01','');assert.equal((file.text.match(/^---$/gm)||[]).length,2);await p.undoHistory.undo();assert.equal(file.text,original);
});
test('project display order undoes without reverting unrelated view preferences',async()=>{
 const {p,vault}=setup();await vault.create(ROOT+'/Other.md','## 任务\n');p.data.treeExpanded={existing:true};await p.moveProjectDisplay(PATH,ROOT+'/Other.md','after');await p.undoHistory.undo();assert.equal(p.data.projectOrder,undefined);assert.deepEqual(p.data.treeExpanded,{existing:true});
});
test('moving from inbox undoes both notes as one operation',async()=>{
 const {p,file,inbox}=setup(),a=inbox.text,b=file.text;
 await p.moveInboxTask(ref(inbox.text,'block:collect'),PATH,ref(file.text));assert.doesNotMatch(inbox.text,/Collect/);assert.match(file.text,/  - \[ \] Collect/);await p.undoHistory.undo();assert.equal(inbox.text,a);assert.equal(file.text,b);assert.equal(await p.undoHistory.undo(),null);
});
test('a foreign edit to either moved note stops undo before changing the other',async()=>{
 const {p,file,inbox}=setup();await p.moveInboxTask(ref(inbox.text,'block:collect'),PATH);const a=inbox.text;file.text+='External\n';await assert.rejects(p.undoHistory.undo(),/变化/);assert.equal(inbox.text,a);assert.match(file.text,/External/);
});
test('an external write immediately before the atomic edit survives later undo',async()=>{
 const {p,file,vault}=setup();vault.beforeProcess=f=>f.text+='External before save\n';await p.addTask({project:PATH,title:'Added'});await p.undoHistory.undo();assert.match(file.text,/External before save/);assert.doesNotMatch(file.text,/Added/);
});
test('undo never targets a different file recreated at the same path',async()=>{
 const {p,file,files,File}=setup();await p.addTask({project:PATH,title:'Added'});const replacement=new File(PATH,file.text);files.set(PATH,replacement);await assert.rejects(p.undoHistory.undo(),/变化/);assert.match(replacement.text,/Added/);
});
test('project rename undo restores the file path and keeps occupied destinations safe',async()=>{
 const {p,file,files,File}=setup();await p.renameProject(PATH,'Renamed');assert.equal(file.path,ROOT+'/00 工作/Renamed.md');files.set(PATH,new File(PATH,'Other'));await assert.rejects(p.undoHistory.undo(),/变化|占用/);assert.equal(file.basename,'Renamed');files.delete(PATH);await p.undoHistory.undo();assert.equal(file.path,PATH);
});
test('undoing a parent rename restores the hidden child draft and folding key',async()=>{
 const {p,file}=setup('## 任务\n- [ ] Parent\n  - [ ] Child\n');
 const parent=logic.projectTaskTree(file.text).roots[0],fold=HOME+'::task:'+PATH+'::'+parent.key;
 p.data.treeExpanded={[fold]:false};const draft=p.beginInlineTaskEntry(HOME,PATH,parent);draft.draft='Keep draft';p.hideInlineTaskEntry(draft.key);
 await p.renameProjectTask(PATH,parent.reference,'Renamed');await p.undoHistory.undo();
 const reopened=p.beginInlineTaskEntry(HOME,PATH,logic.projectTaskTree(file.text).roots[0]);assert.equal(reopened.draft,'Keep draft');assert.equal(p.inlineTaskEntries.size,1);assert.equal(p.data.treeExpanded[fold],false);
});
test('consecutive content and rename undo keep a reopened child draft associated',async()=>{
 const {p,file}=setup('## 任务\n- [ ] Parent\n  - [ ] Child\n');const node=()=>logic.projectTaskTree(file.text).roots[0];
 let state=p.beginInlineTaskEntry(HOME,PATH,node());state.draft='Keep draft';p.hideInlineTaskEntry(state.key);await p.renameProjectTask(PATH,node().reference,'Renamed');await p.addTask({project:PATH,title:'Another'});
 state=p.beginInlineTaskEntry(HOME,PATH,node());p.hideInlineTaskEntry(state.key);await p.undoHistory.undo();await p.undoHistory.undo();state=p.beginInlineTaskEntry(HOME,PATH,node());assert.equal(state.draft,'Keep draft');assert.equal(p.inlineTaskEntries.size,1);
});
test('duplicate parent reordering cannot silently redirect a retained child draft',async()=>{
 const {p,file}=setup('## 任务\n- [ ] Parent\n  - [ ] Child A\n- [ ] Parent\n  - [ ] Child B\n');const nodes=()=>logic.projectTaskTree(file.text).roots;
 const original=file.text;let state=p.beginInlineTaskEntry(HOME,PATH,nodes()[1]);state.draft='Intended for B';p.hideInlineTaskEntry(state.key);
 await p.reorderProjectTask(PATH,nodes()[1].reference,nodes()[0].reference,'before');state=p.beginInlineTaskEntry(HOME,PATH,nodes()[1]);await p.saveInlineTaskEntry(state);assert.doesNotMatch(file.text,/Intended for B/);assert.equal(state.draft,'Intended for B');
 p.hideInlineTaskEntry(state.key);await p.undoHistory.undo();assert.equal(file.text,original);state=p.beginInlineTaskEntry(HOME,PATH,nodes()[1]);assert.equal(state.draft,'Intended for B');assert.ok(!state.referenceStale);
});
test('duplicate ancestors also prevent ambiguous descendant draft rebinding',async()=>{
 const {p,file}=setup('## 任务\n- [ ] Parent\n  - [ ] Sub\n    - [ ] Child A\n- [ ] Parent\n  - [ ] Sub\n    - [ ] Child B\n');const nodes=()=>logic.projectTaskTree(file.text).roots;
 let state=p.beginInlineTaskEntry(HOME,PATH,nodes()[1].children[0]);state.draft='Intended for B';p.hideInlineTaskEntry(state.key);await p.reorderProjectTask(PATH,nodes()[1].reference,nodes()[0].reference,'before');state=p.beginInlineTaskEntry(HOME,PATH,nodes()[1].children[0]);await p.saveInlineTaskEntry(state);assert.doesNotMatch(file.text,/Intended for B/);assert.equal(state.draft,'Intended for B');
});
test('a stable parent ID does not make duplicate unmarked children unambiguous',async()=>{
 const {p,file}=setup('## 任务\n- [ ] Parent ^stable\n  - [ ] Sub\n    - [ ] Child A\n  - [ ] Sub\n    - [ ] Child B\n');const children=()=>logic.projectTaskTree(file.text).roots[0].children;
 let state=p.beginInlineTaskEntry(HOME,PATH,children()[1]);state.draft='Intended for B';p.hideInlineTaskEntry(state.key);await p.reorderProjectTask(PATH,children()[1].reference,children()[0].reference,'before');state=p.beginInlineTaskEntry(HOME,PATH,children()[1]);await p.saveInlineTaskEntry(state);assert.doesNotMatch(file.text,/Intended for B/);assert.equal(state.draft,'Intended for B');
});
function shortcut(target={},extra={}){return {key:'z',ctrlKey:true,target:{isContentEditable:false,closest:()=>null,...target},preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra};}
test('Ctrl+Z in rendered homepage undoes once and shows the action label',async()=>{
 const {p,file,notices}=setup(),before=file.text;await p.addTask({project:PATH,title:'Added'});const event=shortcut();p.handleUndoShortcut(event,{querySelector:()=>null});await p.undoHistory.tail;await new Promise(setImmediate);assert.equal(event.defaultPrevented,true);assert.equal(file.text,before);assert.match(notices.at(-1),/已撤销.*添加任务/);
});
test('editable text, date fields, composition, dialogs and non-GTD pages retain native shortcuts',async()=>{
 for(const mode of ['text','date','editable','composition','dialog','other','source','redo']){
  const {p,file}=setup();await p.addTask({project:PATH,title:'Added'});const event=shortcut();let modal=false;
  if(mode==='text'||mode==='date')event.target.closest=()=>({tagName:'INPUT',type:mode});if(mode==='editable')event.target.isContentEditable=true;if(mode==='composition')event.isComposing=true;if(mode==='dialog')modal=true;if(mode==='other')p.app.workspace.activeLeaf.view.file.path='Other.md';if(mode==='source')p.app.workspace.activeLeaf.view.getMode=()=> 'source';if(mode==='redo')event.shiftKey=true;
  p.handleUndoShortcut(event,{querySelector:()=>modal?{}:null});await p.undoHistory.tail;assert.equal(event.defaultPrevented,undefined,mode);assert.match(file.text,/Added/);
 }
});
test('live-preview readonly task widgets support undo while source text remains native',async()=>{
 const {p,file}=setup(),before=file.text;await p.addTask({project:PATH,title:'Added'});p.app.workspace.activeLeaf.view.getMode=()=> 'source';
 const event=shortcut({closest:selector=>selector==='input,textarea,select'?{tagName:'INPUT',type:'checkbox'}:{}});p.handleUndoShortcut(event,{querySelector:()=>null});await p.undoHistory.tail;await new Promise(setImmediate);assert.equal(file.text,before);assert.equal(event.defaultPrevented,true);
});
test('project creation starts a fresh history without deleting the new project',async()=>{
 const {p,file,files}=setup();await p.addTask({project:PATH,title:'Keep'});p.listAreas=()=>[{path:ROOT+'/00 工作',label:'工作'}];await p.createProject({name:'New',folder:ROOT+'/00 工作'});assert.equal(await p.undoHistory.undo(),null);assert.ok(files.has(ROOT+'/00 工作/New.md'));assert.match(file.text,/Keep/);
});
test('a conflict arriving during a two-note undo compensates the first restored note',async()=>{
 const {p,file,inbox,vault}=setup();await p.moveInboxTask(ref(inbox.text,'block:collect'),PATH);const movedInbox=inbox.text,movedTarget=file.text,original=vault.process;
 vault.process=async(f,change)=>{if(f===file)f.text+='External during undo\n';return original(f,change);};
 await assert.rejects(p.undoHistory.undo(),/变化/);assert.equal(inbox.text,movedInbox);assert.equal(file.text,movedTarget+'External during undo\n');
});
