(async()=>{
 if(app.vault.getName()!=='Obsidian-GTD-Demo')throw Error('Run only in the demonstration vault');
 const p=app.plugins.plugins['gtd-quick-actions'],calendar=app.plugins.plugins['tasks-calendar'],pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
 const check=(name,pass)=>{results.push({name,pass});if(!pass)throw Error(name)},until=async(fn,label)=>{for(let i=0;i<240;i++){const value=await fn();if(value)return value;await pause(40)}throw Error('Timeout: '+label)};
 const w=window.electron.remote.getCurrentWindow();w.webContents.setBackgroundThrottling(false);w.showInactive();w.moveTop();
 const stamp=Date.now().toString(36).slice(-4),paths=['00 GTD/00 工作区/01 项目/00 工作/示例分享-'+stamp+'.md','00 GTD/00 工作区/01 项目/00 工作/示例课程-'+stamp+'.md'],files=[],date=p.todayDateKey(),history=p.undoHistory,entries=history.entries.slice(),savedData=structuredClone(p.data),savedSettings=structuredClone(calendar.settings),home=app.workspace.getActiveFile();
 const root=()=>[...document.querySelectorAll('.block-language-tasks-calendar.tasks-calendar')].find(e=>e.closest('.gtd-dashboard')&&e.offsetWidth);
 const mode=name=>[...root().querySelectorAll('.tasks-calendar-mode-switch button')].find(e=>e.textContent===name);
 const cards=()=>[...root().querySelectorAll('.tasks-calendar-grid .tasks-calendar-task')].filter(e=>paths.includes(e.dataset.gtdSourcePath));
 const groupButtons=()=>[...root().querySelectorAll('.gtd-calendar-context-switch button')];
 const groups=()=>[...root().querySelectorAll('.tasks-calendar-grid .gtd-calendar-task-group')].filter(g=>g.querySelector('[data-gtd-source-path="'+paths[0]+'"],[data-gtd-source-path="'+paths[1]+'"]'));
 const overdueCards=()=>[...root().querySelectorAll('.tasks-calendar-overdue-list .tasks-calendar-task')].filter(e=>paths.includes(e.dataset.gtdSourcePath));
 const overdueGroups=()=>[...root().querySelectorAll('.tasks-calendar-overdue-list .gtd-calendar-task-group')].filter(g=>g.querySelector('[data-gtd-source-path="'+paths[0]+'"],[data-gtd-source-path="'+paths[1]+'"]'));
 const sourceCard=(path,id)=>calendar.taskStore.getTasks().find(t=>t.path===path&&(t._gtdSourceTask||t).raw.includes('^'+id));
 const capture=async name=>{
  if(!window.__gtdLayoutCaptureFolder)return;
  root().scrollIntoView({block:'start'});await pause(120);
  const fs=require('fs'),rect=root().getBoundingClientRect(),zoom=w.webContents.getZoomFactor(),x=Math.max(0,Math.floor(rect.left*zoom)),y=Math.max(0,Math.floor(rect.top*zoom)),bounds=w.getContentBounds();
  const image=await w.webContents.capturePage({x,y,width:Math.min(Math.ceil(rect.width*zoom),bounds.width-x),height:Math.min(Math.ceil(rect.height*zoom),bounds.height-y)});
  fs.writeFileSync(window.__gtdLayoutCaptureFolder+'/'+name+'.png',image.toPNG());
 };
 try{
  const yesterday=window.moment(date).subtract(1,'day').format('YYYY-MM-DD');
  for(let i=0;i<2;i++)files.push(await app.vault.create(paths[i],'---\ntype: gtd-project\nstatus: active\narea: 工作\n---\n## 任务\n- [ ] 内容整理 ^root\n  - [ ] 准备材料 ^parent\n    - [ ] 核对引用 <!-- gtd-days: '+date+' --> ^first\n    - [ ] '+(i?'整理习题':'导出讲义')+' <!-- gtd-days: '+date+' --> ^second\n    - [ ] 补齐旧资料 <!-- gtd-days: '+yesterday+' --> ^old-first\n    - [ ] 核验旧版本 <!-- gtd-days: '+yesterday+' --> ^old-second\n'+(i?'':'- [ ] 确认时间 <!-- gtd-days: '+date+' --> ^standalone\n')));
  await until(()=>root(),'calendar mounted');mode('Day').click();root().querySelector('.tasks-calendar-today-button').click();
  await until(()=>groupButtons().length===2,'two context layout buttons');
  check('day toolbar provides exactly two layout choices',groupButtons().length===2);
  groupButtons().find(b=>b.dataset.gtdCalendarLayout==='path').click();await until(()=>cards().length===5,'five leaf cards');
  check('path layout keeps the leaf-only task count',cards().length===5);
  const first=cards().find(c=>c.dataset.gtdSourcePath===paths[0]&&c.querySelector('.tasks-calendar-task-title')?.textContent==='核对引用');
  check('inline path shows project and immediate parent',first.querySelector('.gtd-calendar-context').textContent.includes('准备材料')&&first.querySelector('.gtd-calendar-context').textContent.includes('示例分享'));
  check('hover exposes the full ancestor path',first.getAttribute('aria-label').includes('内容整理 › 准备材料'));
  await until(()=>overdueCards().length===4,'four overdue leaf cards');check('overdue cards also show inline ancestry',overdueCards().every(c=>getComputedStyle(c.querySelector('.gtd-calendar-context')).display!=='none'&&c.querySelector('.gtd-calendar-context').textContent.includes('准备材料')));
  await capture('calendar-parent-path');
  groupButtons().find(b=>b.dataset.gtdCalendarLayout==='group').click();await until(()=>groups().length===3,'three source-specific groups');
  check('group preference is saved',p.data.calendarDayLayout==='group');
  check('same parent titles in different projects stay separate',groups().filter(g=>g.querySelector('.gtd-calendar-group-title').textContent.includes('准备材料')).length===2);
  check('grouping preserves every leaf card',cards().length===5);
  check('overdue cards follow parent grouping',overdueGroups().length===2&&overdueCards().length===4);
  await capture('calendar-parent-groups');
  const group=groups().find(g=>g.querySelector('[data-gtd-source-path="'+paths[0]+'"]')&&g.querySelector('.gtd-calendar-group-title').textContent.includes('准备材料'));
  group.querySelector('summary').click();await until(()=>!group.open,'group collapsed');calendar.refreshCalendars();await pause(120);
  check('group folding survives a calendar update',!groups().find(g=>g.querySelector('.gtd-calendar-group-title').textContent===group.querySelector('.gtd-calendar-group-title').textContent).open);
  groupButtons().find(b=>b.dataset.gtdCalendarLayout==='path').click();await pause(100);groupButtons().find(b=>b.dataset.gtdCalendarLayout==='group').click();await pause(100);
  check('switching layouts retains group folding',!groups().find(g=>g.querySelector('.gtd-calendar-group-title').textContent===group.querySelector('.gtd-calendar-group-title').textContent).open);
  groups().forEach(g=>{if(!g.open)g.querySelector('summary').click()});await pause(80);
  const before=await app.vault.read(files[1]),target=cards().find(c=>c.dataset.gtdSourcePath===paths[1]&&c.querySelector('.tasks-calendar-task-title')?.textContent==='核对引用');target.querySelector('.tasks-calendar-checkbox').click();
  await until(async()=>/\[x\].*核对引用/.test(await app.vault.read(files[1]))&&history.pending===0,'grouped checkbox saved');
  check('grouped checkbox writes only its own source project',await app.vault.read(files[0])!==await app.vault.read(files[1])&&!/\[x\].*核对引用/.test(await app.vault.read(files[0])));
  await history.undo();await until(async()=>await app.vault.read(files[1])===before,'grouped completion undo');check('grouped completion supports one-step undo',await app.vault.read(files[1])===before);
  if(p.data.calendarCompact!==true)root().querySelector('.gtd-calendar-height-toggle').click();await pause(120);
  check('grouped compact mode uses More without internal scrolling',!!root().querySelector('.tasks-calendar-grid.is-day [data-gtd-compact-more]')&&cards().filter(c=>getComputedStyle(c).display!=='none').length<=3);
  check('grouped overdue compact mode retains More',!!root().querySelector('.tasks-calendar-overdue-list [data-gtd-compact-more]')&&[...root().querySelectorAll('.tasks-calendar-overdue-list .tasks-calendar-task')].filter(c=>getComputedStyle(c).display!=='none').length===3);
  root().querySelector('.tasks-calendar-grid.is-day [data-gtd-compact-more]').click();await pause(120);check('More restores grouped tasks',p.data.calendarCompact===false&&cards().every(c=>getComputedStyle(c).display!=='none'));
  groupButtons().find(b=>b.dataset.gtdCalendarLayout==='path').click();await pause(100);const oldWidth=root().style.width;root().style.width='390px';await pause(100);
  check('inline ancestry fits a narrow calendar',cards().every(c=>c.scrollWidth<=c.clientWidth+2));root().style.width=oldWidth;
  mode('Week').click();await pause(120);check('week retains compact cards and hides day-layout controls',root().querySelector('.gtd-calendar-context-switch').hidden&&[...root().querySelectorAll('.gtd-calendar-context')].every(e=>getComputedStyle(e).display==='none'));
  mode('Month').click();await pause(120);check('month retains compact cards and hides day-layout controls',root().querySelector('.gtd-calendar-context-switch').hidden);
  mode('Day').click();await pause(120);await app.vault.modify(files[0],(await app.vault.read(files[0])).replace('准备材料','材料核验'));
  await until(()=>cards().find(c=>c.dataset.gtdSourcePath===paths[0]&&c.getAttribute('aria-label')?.includes('材料核验')),'parent rename propagated');check('parent renames update visible paths and hover labels',cards().some(c=>c.querySelector('.gtd-calendar-context')?.textContent.includes('材料核验')));
  const navigation=cards().find(c=>c.dataset.gtdSourcePath===paths[1]).querySelector('.gtd-calendar-context');navigation.click();await until(()=>app.workspace.getActiveFile()?.path===paths[1],'source navigation');check('clicking the path locates the actual source note',app.workspace.getActiveFile()?.path===paths[1]&&!document.querySelector('.modal'));
 }catch(error){results.push({name:error.stack,pass:false})}finally{
  for(const file of files)if(app.vault.getAbstractFileByPath(file.path)===file)await app.vault.delete(file);
  history.entries.splice(0,history.entries.length,...entries);p.data=savedData;await p.saveData(p.data);calendar.settings=savedSettings;await calendar.saveSettings();
  if(home&&app.vault.getAbstractFileByPath(home.path)===home)await app.workspace.activeLeaf.openFile(home);p.calendarLayout.refresh();calendar.refreshCalendars();
  w.webContents.setBackgroundThrottling(true);window.__calendarParentLayout={pass:results.every(r=>r.pass),checks:results.length,failed:results.filter(r=>!r.pass),results};
 }
 return JSON.stringify(window.__calendarParentLayout);
})()
