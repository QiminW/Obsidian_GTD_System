(async()=>{
 if(app.vault.getName()!=='Obsidian-GTD-Demo')throw Error('Run only in the generic demonstration vault');
 const fs=require('fs'),source=window.__gtdCalendarSourceRoot||'C:/Users/Administrator/.codex/worktrees/gtd-undo/obsidian',module={exports:{}};
 new Function('module','exports',fs.readFileSync(source+'/维护资料/GTD快捷操作源码/logic.cjs','utf8'))(module,module.exports);const logic=module.exports;
 const p=app.plugins.plugins['gtd-quick-actions'],pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
 const check=(name,pass)=>{results.push({name,pass});if(!pass)throw Error(name)};
 const until=async(fn,label)=>{for(let i=0;i<160;i++){const value=await fn();if(value)return value;await pause(60)}throw Error('Timeout: '+label)};
 const flatten=nodes=>nodes.flatMap(n=>[n,...flatten(n.children)]),visible=e=>!!e?.offsetWidth;
 const history=p.undoHistory,entries=history.entries.slice(),lastProject=p.data.lastProject;
 const w=window.electron.remote.getCurrentWindow();w.webContents.setBackgroundThrottling(false);w.showInactive();w.moveTop();
 const path='00 GTD/00 工作区/01 项目/00 工作/__父子规则验证_'+Date.now()+'.md';let file;
 const initial='---\ntype: gtd-project\narea: 工作\nstatus: active\n---\n## 任务\n- [ ] <!-- gtd-days: 2026-11-06 --> 父任务 ^parent\n  - [ ] 空白子任务 ^empty\n  - [ ] <!-- gtd-days: 2026-11-08 --> 自定子任务 📅 2026-11-15 ^own\n    - [ ] 孙任务 ^grand\n';
 const model=async()=>flatten(logic.projectTaskTree(await app.vault.read(file)).roots);
 const node=async name=>(await model()).find(n=>n.title===name);
 const project=()=>[...document.querySelectorAll('tr[data-project-path]')].find(e=>visible(e)&&e.dataset.projectPath===path);
 const row=name=>[...document.querySelectorAll('.gtd-task-row')].find(e=>visible(e)&&e.closest('tr')?.previousElementSibling?.dataset.projectPath===path&&e.querySelector('.gtd-task-title')?.textContent===name);
 const taskRow=name=>row(name)||[...document.querySelectorAll('.gtd-task-row')].find(e=>visible(e)&&e.querySelector('.gtd-task-title')?.textContent===name&&e.querySelector('input[data-task-key="block:'+({父任务:'parent',空白子任务:'empty',自定子任务:'own',孙任务:'grand'}[name]||'')+'"]'));
 try{
  file=await app.vault.create(path,initial);await until(project,'project indexed');
  if(project().querySelector('.gtd-project-toggle').getAttribute('aria-expanded')!=='true')project().querySelector('.gtd-project-toggle').click();
  await until(()=>taskRow('父任务'),'parent visible');
  for(const branch of project().nextElementSibling.querySelectorAll('details'))branch.open=true;
  taskRow('父任务').querySelector('input[type=checkbox]').click();
  await until(()=>[...project().nextElementSibling.querySelectorAll('.gtd-form-error')].some(e=>e.textContent.includes('子任务未完成')),'completion warning');
  check('blocked homepage completion leaves source unchanged',await app.vault.read(file)===initial);
  check('blocked checkbox returns to unchecked',!taskRow('父任务').querySelector('input[type=checkbox]').checked);
  check('blocked completion does not add undo history',history.entries.length===entries.length);
  let input=taskRow('父任务').querySelector('input[type=date]');input.value='2026-11-20';input.dispatchEvent(new Event('change',{bubbles:true}));
  await until(async()=> (await node('空白子任务')).due==='2026-11-20','deadline inheritance');
  check('independent child deadline stays unchanged',(await node('自定子任务')).due==='2026-11-15');
  check('grandchild inherits its nearest dated parent',(await node('孙任务')).due==='2026-11-15');
  await history.undo();await until(async()=>await app.vault.read(file)===initial,'deadline undo');check('one undo restores the whole date propagation',await app.vault.read(file)===initial);
  await until(()=>taskRow('父任务').querySelector('input[type=date]').value==='','date view refreshed');
  [...taskRow('父任务').querySelectorAll('button')].find(e=>e.textContent==='排').click();
  const day=await until(()=>[...document.querySelectorAll('button[data-gtd-arrange-date="2026-11-07"]')].find(visible),'multi-date picker');day.click();
  await until(async()=> (await node('空白子任务')).days.length===2,'day inheritance');
  check('empty child receives the full current parent plan',JSON.stringify((await node('空白子任务')).days)==='["2026-11-06","2026-11-07"]');
  check('independent child plan stays unchanged',JSON.stringify((await node('自定子任务')).days)==='["2026-11-08"]');
  check('grandchild inherits the nearest independent plan',JSON.stringify((await node('孙任务')).days)==='["2026-11-08"]');
  document.querySelectorAll('.gtd-day-panel').forEach(e=>e.hidePopover?.());
  const calendar=app.plugins.plugins['tasks-calendar'],store=calendar.taskStore;
  const parentCard=await until(()=>store.getTasks().find(t=>t.path===path&&t._gtdSourceTask?.raw?.includes('^parent')&&t._gtdSourceTask?._gtdReference),'calendar source indexed');
  const before=await app.vault.read(file);try{await calendar.toggleTask(parentCard)}catch{}
  check('calendar cannot bypass the parent completion guard',await app.vault.read(file)===before);
  const fresh=await until(()=>store.getTasks().find(t=>t.path===path&&t._gtdSourceTask?.raw?.includes('^parent')&&t._gtdSourceTask?._gtdReference),'calendar reference refreshed');
  await store.replaceTask(fresh,fresh._gtdSourceTask.raw.replace(' ^parent',' 📅 2026-11-20 ^parent'));
  await until(async()=> (await node('空白子任务')).due==='2026-11-20','calendar date inheritance');
  check('calendar date editor fills child dates without overwriting independent ones',(await node('自定子任务')).due==='2026-11-15');
  await until(()=>taskRow('父任务').querySelector('input[type=date]').value==='2026-11-20','homepage date refreshed');
  taskRow('父任务').querySelector('button[title="添加子任务"]').click();
  const entry=await until(()=>[...project().nextElementSibling.querySelectorAll('.gtd-inline-task-entry input')].find(visible),'child entry');entry.value='新子任务';entry.dispatchEvent(new Event('input',{bubbles:true}));entry.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await until(async()=>await node('新子任务'),'child saved');
  check('new child inherits the deadline',(await node('新子任务')).due==='2026-11-20');
  check('new child inherits multi-day planning',(await node('新子任务')).days.length===2);
  entry.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  for(const name of ['孙任务','自定子任务','空白子任务','新子任务']){
   let target=taskRow(name);if(!target)target=await until(()=>[...project().nextElementSibling.querySelectorAll('.gtd-task-row')].find(e=>e.querySelector('.gtd-task-title')?.textContent===name),'child checkbox');
   target.querySelector('input[type=checkbox]').click();await until(async()=> (await node(name)).completed,name+' completed');await until(()=>history.pending===0,'save finished');await pause(100);
  }
  taskRow('父任务').querySelector('input[type=checkbox]').click();await until(async()=> (await node('父任务')).completed,'parent completed');check('homepage allows completion once every descendant is checked',(await node('父任务')).completed);
  await history.undo();check('undoing parent completion keeps every child completed',(await model()).slice(1).every(n=>n.completed)&&!(await node('父任务')).completed);
 }catch(error){results.push({name:error.stack,pass:false})}finally{
  if(file&&app.vault.getAbstractFileByPath(path))await app.vault.delete(file);
  history.entries.splice(0,history.entries.length,...entries);if(lastProject===undefined)delete p.data.lastProject;else p.data.lastProject=lastProject;await p.saveData(p.data);w.webContents.setBackgroundThrottling(true);
  window.__parentPolicyNative={pass:results.every(r=>r.pass),checks:results.length,failed:results.filter(r=>!r.pass),results};
 }
 return JSON.stringify(window.__parentPolicyNative);
})()
