(async()=>{
 if(app.vault.getName()!=='Obsidian-GTD-Demo')throw Error('Demonstration vault only');
 const p=app.plugins.plugins['gtd-quick-actions'],calendar=app.plugins.plugins['tasks-calendar'],pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
 const check=(name,pass,actual)=>{results.push({name,pass,actual});if(!pass)throw Error(name);},until=async(fn,label)=>{for(let i=0;i<240;i++){const v=await fn();if(v)return v;await pause(30);}throw Error('Timeout '+label);};
 const history=p.undoHistory,entries=history.entries.slice(),data=structuredClone(p.data),settings=structuredClone(calendar.settings),home=app.vault.getAbstractFileByPath('00 GTD/首页.md'),today=p.todayDateKey(),past=n=>window.moment(today).subtract(n,'days').format('YYYY-MM-DD');
 const path='00 GTD/00 工作区/01 项目/00 工作/__日历去重_'+Date.now()+'.md',w=window.electron.remote.getCurrentWindow();let file,preview,scrollTop,changedCompleted=false;
 w.webContents.setBackgroundThrottling(false);
 const root=()=>[...document.querySelectorAll('.block-language-tasks-calendar.tasks-calendar')].find(e=>e.closest('.gtd-dashboard')&&e.offsetWidth);
 const all=selector=>[...root().querySelectorAll(selector)],dayCards=()=>all('.tasks-calendar-grid .tasks-calendar-task'),overdueCards=()=>all('.tasks-calendar-overdue-list .tasks-calendar-task'),owned=cards=>cards.filter(c=>c.dataset.gtdSourcePath===path);
 const key=c=>JSON.stringify([c.dataset.gtdSourcePath,c.dataset.gtdSourceLine]);
 const noOverlap=()=>{const visible=new Set(dayCards().map(key));return overdueCards().every(c=>!visible.has(key(c)));};
 const correctCount=()=>Number(root().querySelector('.tasks-calendar-overdue-count')?.textContent||0)===overdueCards().length;
 const state=(mode)=>[...root().querySelectorAll('.tasks-calendar-mode-switch button')].find(b=>b.textContent===mode).click();
 try{
  await app.workspace.activeLeaf.openFile(home);preview=app.workspace.activeLeaf.view.containerEl.querySelector('.markdown-preview-view');scrollTop=preview.scrollTop;
  await until(()=>{if(root())return root();preview.scrollTop=preview.scrollHeight;return false;},'calendar');state('Day');root().querySelector('.tasks-calendar-today-button').click();
  root().querySelector('[data-gtd-calendar-layout="group"]').click();if(p.data.calendarCompact===true)root().querySelector('.gtd-calendar-height-toggle').click();
  const hide=root().querySelector('button[aria-label="Hide completed tasks"]');if(hide){hide.click();changedCompleted=true;}
  const content='---\ntype: gtd-project\nstatus: active\narea: 工作\n---\n## 任务\n- [ ] 演示阶段 ^parent\n  - [ ] <!-- gtd-days: '+[past(2),past(1),today].join(',')+' --> 同名任务 ^a\n  - [ ] <!-- gtd-days: '+[past(4),past(3)].join(',')+' --> 多次过期 📅 '+past(5)+' ^b\n  - [ ] <!-- gtd-days: '+past(1)+' --> 同名任务 ^c\n  - [ ] <!-- gtd-days: '+past(5)+' --> 其他过期 ^d\n';
  file=await app.vault.create(path,content);await until(()=>owned(dayCards()).length===1&&owned(overdueCards()).length>=3,'fixture');await pause(150);
  check('Today lists one source instance while overdue excludes that task and deduplicates its own instances',owned(overdueCards()).length===3,owned(overdueCards()).length);
  check('main and overdue use exact source identities without overlap',dayCards().every(c=>c.dataset.gtdSourceLine!==undefined)&&noOverlap());
  check('same task names on other source lines remain in overdue',owned(overdueCards()).some(c=>c.querySelector('.tasks-calendar-task-title')?.textContent==='同名任务'));
  check('an expired deadline remains the selected overdue card',owned(overdueCards()).find(c=>c.querySelector('.tasks-calendar-task-title')?.textContent==='多次过期')?.dataset.gtdDeadline==='true');
  check('overdue header equals the filtered card count',correctCount());
  for(const layout of ['path','group']){root().querySelector('[data-gtd-calendar-layout="'+layout+'"]').click();await pause(80);check(layout+' layout uses the same overdue deduplication',owned(overdueCards()).length===3&&noOverlap()&&correctCount());}
  root().querySelector('button[aria-label="Previous"]').click();await until(()=>owned(dayCards()).length===2,'yesterday');check('past day keeps distinct same-named tasks and omits their other overdue instances',owned(overdueCards()).length===2&&noOverlap()&&correctCount());
  root().querySelector('button[aria-label="Previous"]').click();await until(()=>owned(dayCards()).length===1,'two days ago');check('browsing an earlier Day still avoids a task duplicate from a later expired arrangement',owned(overdueCards()).length===3&&noOverlap()&&correctCount());
  state('Week');await pause(180);check('week range and overdue have no duplicate source task',noOverlap()&&correctCount());
  state('Month');await pause(180);check('month range and overdue have no duplicate source task',noOverlap()&&correctCount());check('multi-day arrangements remain stored and represented in the main month grid',owned(dayCards()).length>4&&await app.vault.read(file)===content);
  state('Day');root().querySelector('.tasks-calendar-today-button').click();await until(()=>owned(overdueCards()).length===3,'today restored');
  const target=owned(overdueCards()).find(c=>c.querySelector('.tasks-calendar-task-title')?.textContent==='多次过期');target.querySelector('.tasks-calendar-checkbox').click();await until(async()=>/\[x\].*多次过期/.test(await app.vault.read(file))&&history.pending===0,'overdue completion');
  await until(()=>owned(overdueCards()).length===2,'overdue source removed');check('deduplicated overdue card completes its canonical source exactly once',history.entries.length===entries.length+1&&owned(dayCards()).length===1&&correctCount());
  await history.undo();await until(async()=>await app.vault.read(file)===content&&owned(overdueCards()).length===3,'overdue undo');check('one undo restores original dates and overdue membership',await app.vault.read(file)===content&&noOverlap()&&correctCount());
 }catch(error){results.push({name:error.stack,pass:false});}finally{
  if(file&&app.vault.getAbstractFileByPath(path)===file)await app.vault.delete(file);history.entries.splice(0,history.entries.length,...entries);p.data=data;await p.saveData(p.data);
  if(changedCompleted)root()?.querySelector('button[aria-label="Show completed tasks"]')?.click();calendar.settings=settings;await calendar.saveSettings();p.calendarLayout.refresh();calendar.refreshCalendars();if(preview&&scrollTop!==undefined)preview.scrollTop=scrollTop;w.webContents.setBackgroundThrottling(true);
  window.__calendarOverdueNative={pass:results.every(r=>r.pass),checks:results.length,failed:results.filter(r=>!r.pass),results};
 }
 return JSON.stringify(window.__calendarOverdueNative);
})()
