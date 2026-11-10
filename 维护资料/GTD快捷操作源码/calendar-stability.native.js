(async()=>{
 if(app.vault.getName()!=='Obsidian-GTD-Demo')throw Error('Demonstration vault only');
 const p=app.plugins.plugins['gtd-quick-actions'],calendar=app.plugins.plugins['tasks-calendar'],store=calendar.taskStore,pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
 const check=(name,pass,actual)=>{results.push({name,pass,actual});if(!pass)throw Error(name);},until=async(fn,label)=>{for(let i=0;i<240;i++){const v=await fn();if(v)return v;await pause(30);}throw Error('Timeout: '+label);};
 const history=p.undoHistory,entries=history.entries.slice(),data=structuredClone(p.data),settings=structuredClone(calendar.settings),date=p.todayDateKey(),originalIndex=store.indexFile;
 const w=window.electron.remote.getCurrentWindow();w.webContents.setBackgroundThrottling(false);
 const home=app.vault.getAbstractFileByPath('00 GTD/首页.md'),path='00 GTD/00 工作区/01 项目/00 工作/__日历稳定性_'+Date.now()+'.md';let file,preview,scrollTop,releaseIndex,indexBlocked=false,holdIndex=false,wrappedIndex,frame,running=false,changedCompleted=false;
 const root=()=>[...document.querySelectorAll('.block-language-tasks-calendar.tasks-calendar')].find(e=>e.closest('.gtd-dashboard')&&e.offsetWidth);
 const cards=()=>[...root().querySelectorAll('.tasks-calendar-grid .tasks-calendar-task')].filter(e=>e.dataset.gtdSourcePath===path);
 const groups=()=>[...root().querySelectorAll('.tasks-calendar-grid .gtd-calendar-task-group')].filter(g=>g.querySelector('[data-gtd-source-path="'+path+'"]'));
 const samples=[];
 try{
  await app.workspace.activeLeaf.openFile(home);preview=app.workspace.activeLeaf.view.containerEl.querySelector('.markdown-preview-view');scrollTop=preview.scrollTop;
  await until(()=>{if(root())return root();preview.scrollTop=preview.scrollHeight;return false;},'calendar mounted');
  [...root().querySelectorAll('.tasks-calendar-mode-switch button')].find(b=>b.textContent==='Day').click();root().querySelector('.tasks-calendar-today-button').click();
  root().querySelector('[data-gtd-calendar-layout="group"]').click();if(p.data.calendarCompact===true)root().querySelector('.gtd-calendar-height-toggle').click();
  const hideCompleted=root().querySelector('button[aria-label="Hide completed tasks"]');if(hideCompleted){hideCompleted.click();changedCompleted=true;}
  const content='---\ntype: gtd-project\nstatus: active\narea: 工作\n---\n## 任务\n- [ ] 演示任务 ^root\n'+Array.from({length:10},(_,i)=>'  - [ ] 分支 '+i+' ^branch'+i+'\n'+[0,1].map(j=>'    - [ ] <!-- gtd-days: '+date+' --> 演示叶任务 '+i+'-'+j+' ^leaf'+i+'-'+j).join('\n')).join('\n')+'\n';
  file=await app.vault.create(path,content);await until(()=>root()&&cards().length===20&&groups().length===12,'coherent nested calendar');await pause(200);
  check('nested day calendar starts with all project and ancestor groups',groups().length===12,groups().length);
  const initialHeight=root().offsetHeight,gate=new Promise(resolve=>releaseIndex=resolve);
  wrappedIndex=async function(f){if(holdIndex&&f.path===path){indexBlocked=true;await gate;}return originalIndex.call(this,f);};store.indexFile=wrappedIndex;holdIndex=true;
  running=true;const sample=()=>{if(!running)return;const calendarRoot=root();samples.push({height:calendarRoot?.offsetHeight||0,groups:calendarRoot?groups().length:0});frame=requestAnimationFrame(sample);};frame=requestAnimationFrame(sample);
  const beforeHistory=history.entries.length,target=cards().find(c=>c.querySelector('.tasks-calendar-task-title')?.textContent==='演示叶任务 0-0');target.querySelector('.tasks-calendar-checkbox').focus({preventScroll:true});target.querySelector('.tasks-calendar-checkbox').click();
  await until(async()=>/\[x\].*演示叶任务 0-0/.test(await app.vault.read(file)),'completion written');await until(()=>indexBlocked,'native index held');await pause(150);
  check('source-index mismatch retains every ancestor group',groups().length===12,groups().length);
  const pending=store.getTasks().filter(t=>t.path===path);check('pending calendar source references are disabled without losing ancestry',pending.length===20&&pending.every(t=>t._gtdAncestors.length===2&&t._gtdSourceTask._gtdReference===null));
  holdIndex=false;releaseIndex();await until(()=>cards().length===19&&store.getTasks().filter(t=>t.path===path).every(t=>!!t._gtdSourceTask._gtdReference),'coherent completion displayed');await pause(180);
  running=false;cancelAnimationFrame(frame);const finalHeight=root().offsetHeight;
  check('completion never collapses the calendar hierarchy between frames',samples.every(s=>s.groups===12),Math.min(...samples.map(s=>s.groups)));
  check('calendar height never undershoots the completed layout',samples.every(s=>s.height>=Math.min(initialHeight,finalHeight)-3),{initialHeight,finalHeight,minimum:Math.min(...samples.map(s=>s.height))});
  check('completion still records one undo action',history.entries.length===beforeHistory+1);
  await history.undo();await until(async()=>await app.vault.read(file)===content&&cards().length===20,'completion undo');check('undo restores exact source and nested task cards',await app.vault.read(file)===content&&groups().length===12);
 }catch(error){results.push({name:error.stack,pass:false});}finally{
  running=false;if(frame)cancelAnimationFrame(frame);holdIndex=false;releaseIndex?.();if(store.indexFile===wrappedIndex)store.indexFile=originalIndex;
  for(let i=0;i<100&&store.batchRunning;i++)await pause(20);
  if(file&&app.vault.getAbstractFileByPath(path)===file)await app.vault.delete(file);history.entries.splice(0,history.entries.length,...entries);p.data=data;await p.saveData(p.data);
  if(changedCompleted)root()?.querySelector('button[aria-label="Show completed tasks"]')?.click();calendar.settings=settings;await calendar.saveSettings();p.calendarLayout.refresh();calendar.refreshCalendars();if(preview&&scrollTop!==undefined)preview.scrollTop=scrollTop;w.webContents.setBackgroundThrottling(true);
  window.__calendarStabilityNative={pass:results.every(r=>r.pass),checks:results.length,failed:results.filter(r=>!r.pass),results};
 }
 return JSON.stringify(window.__calendarStabilityNative);
})()
