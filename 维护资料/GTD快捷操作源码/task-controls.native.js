(async()=>{
 if(app.vault.getName()!=='Obsidian-GTD-Demo')throw Error('Run only in the demonstration vault');
 const p=app.plugins.plugins['gtd-quick-actions'],pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
 const check=(name,pass)=>{results.push({name,pass});if(!pass)throw Error(name)};
 const until=async(fn,label)=>{for(let i=0;i<180;i++){if(await fn())return;await pause(30)}throw Error('Timeout: '+label)};
 const path='00 GTD/00 工作区/01 项目/00 工作/__控件状态验证_'+Date.now()+'.md',scope='__controls_native__'+Date.now();
 const source=await app.vault.read(app.vault.getAbstractFileByPath('00 GTD/00 工作区/05 系统视图/项目进度.js'));
 const originalRead=p.readProjectTaskTree,history=p.undoHistory,entries=history.entries.slice(),lastProject=p.data.lastProject,events=[],cleanups=[],releases=[];
 const w=window.electron.remote.getCurrentWindow();w.webContents.setBackgroundThrottling(false);
 const host=document.body.createDiv({cls:'gtd-dashboard'});host.style.cssText='position:fixed;left:260px;top:60px;width:1250px;height:650px;opacity:0;pointer-events:none';
 const root=host.createDiv(),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const component={registerEvent(ref){events.push(ref)},register(fn){cleanups.push(fn)}};
 let file,hold=false,heldReads=0;
 const task=key=>root.querySelector('li[data-task-key="block:'+key+'"]');
 const row=key=>task(key)?.querySelector(':scope > details > summary,:scope > .gtd-task-row');
 const control=(key,selector)=>row(key)?.querySelector(selector);
 try{
  file=await app.vault.create(path,'---\ntype: gtd-project\nstatus: active\narea: 工作\n---\n## 任务\n- [ ] Parent ^controls-parent\n  - [ ] Child ^controls-child\n- [ ] Other ^controls-other\n');
  p.data.treeExpanded[scope+'::project:'+path]=true;
  const query={where(){return this},sort(){return this},array(){return [{file:{path,name:'控件状态演示'},status:'active',area:'工作'}]}};
  await new AsyncFunction('dv','input',source)({container:root,component,current:()=>({file:{path:scope}}),pages:()=>query},{activeOnly:true});
  const delayedRead=async function(target){const model=await originalRead.call(this,target);if(hold&&target===path){heldReads++;await new Promise(resolve=>releases.push(resolve))}return model};p.readProjectTaskTree=delayedRead;
  hold=true;control('controls-child','[data-gtd-task-checkbox]').click();
  await until(async()=>/\[x\] Child/.test(await app.vault.read(file))&&history.pending===0&&heldReads>0,'checkbox saved, display read delayed');
  check('saved task unlocks controls while display update is still pending',!control('controls-parent','[data-gtd-task-today]').disabled&&!control('controls-other','[data-gtd-task-today]').disabled);
  const date=control('controls-other','[data-gtd-task-date]');date.value='2026-11-20';date.dispatchEvent(new Event('change',{bubbles:true}));
  await until(async()=>/Other 📅 2026-11-20/.test(await app.vault.read(file))&&history.pending===0,'second task saves before prior display update');
  check('another task can save without waiting for the earlier display read',/Other 📅 2026-11-20/.test(await app.vault.read(file)));
  hold=false;p.readProjectTaskTree=originalRead;releases.splice(0).reverse().forEach(release=>release());
  await until(()=>control('controls-other','[data-gtd-task-date]').value==='2026-11-20','latest display wins');
  check('late display results keep the latest saved date',control('controls-other','[data-gtd-task-date]').value==='2026-11-20');
  await until(()=>![...root.querySelectorAll('[data-gtd-task-checkbox],[data-gtd-task-today],[data-gtd-task-date],[data-gtd-task-delete]')].some(e=>e.disabled),'controls ready');
  check('completion and date updates leave all normal controls usable',!control('controls-parent','[data-gtd-task-delete]').disabled);
  check('completed task still blocks only adding children',control('controls-child','[data-gtd-task-add]').disabled&&!control('controls-child','[data-gtd-task-delete]').disabled);
  const before=await app.vault.read(file);hold=true;heldReads=0;p.readProjectTaskTree=delayedRead;
  control('controls-parent','[data-gtd-task-checkbox]').click();
  await until(()=>heldReads>0&&history.pending===0,'ready parent save');
  check('successful parent completion also unlocks before display reads finish',!control('controls-other','[data-gtd-task-today]').disabled);
  hold=false;p.readProjectTaskTree=originalRead;releases.splice(0).forEach(release=>release());await pause(100);
  await history.undo();await until(async()=>await app.vault.read(file)===before,'completion undo');
  check('undo remains available after overlapping display updates',await app.vault.read(file)===before);
  await p.addTask({project:path,parent:(await originalRead.call(p,path)).roots[0].reference,title:'Pending child'});
  await until(()=>row('controls-parent').querySelector('.gtd-task-count')?.textContent==='1/2','mixed child completion');
  const rejectedSource=await app.vault.read(file);hold=true;heldReads=0;p.readProjectTaskTree=delayedRead;
  control('controls-parent','[data-gtd-task-checkbox]').click();await until(()=>heldReads>0&&history.pending===0,'rejected completion display read pending');
  check('rejected parent completion unlocks other task controls immediately',!control('controls-other','[data-gtd-task-today]').disabled);
  check('rejected parent checkbox rolls back before display reread',!control('controls-parent','[data-gtd-task-checkbox]').checked);
  check('rejected completion warns without waiting for display reads',!!p.taskActionNotice?.messageEl.textContent.includes('子任务未完成'));
  check('rejected completion leaves the saved tasks unchanged',await app.vault.read(file)===rejectedSource);
 }catch(error){results.push({name:error.stack,pass:false})}finally{
  hold=false;p.readProjectTaskTree=originalRead;releases.splice(0).forEach(release=>release());await pause(80);
  for(const fn of cleanups)fn();for(const ref of events)app.workspace.offref(ref);host.remove();
  if(file&&app.vault.getAbstractFileByPath(path)===file)await app.vault.delete(file);
  history.entries.splice(0,history.entries.length,...entries);if(lastProject===undefined)delete p.data.lastProject;else p.data.lastProject=lastProject;
  for(const key of Object.keys(p.data.treeExpanded||{}))if(key.includes(path))delete p.data.treeExpanded[key];await p.saveData(p.data);
  p.clearTaskActionNotice();w.webContents.setBackgroundThrottling(true);window.__taskControlsNative={pass:results.every(r=>r.pass),checks:results.length,failed:results.filter(r=>!r.pass),results};
 }
 return JSON.stringify(window.__taskControlsNative);
})()
