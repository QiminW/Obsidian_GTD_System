(async()=>{
 if(app.vault.getName()!=='Obsidian-GTD-Demo')throw Error('Demonstration vault only');
 const p=app.plugins.plugins['gtd-quick-actions'],pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
 const check=(name,pass)=>{results.push({name,pass});if(!pass)throw Error(name);},until=async(fn,label)=>{for(let i=0;i<120;i++){if(await fn())return;await pause(25);}throw Error('Timeout '+label);};
 const originalToday=p.todayDateKey,oldDay=p.currentDayKey,today=originalToday.call(p),tomorrow=window.moment(today).add(1,'day').format('YYYY-MM-DD'),next=window.moment(today).add(2,'days').format('YYYY-MM-DD');
 const path='00 GTD/00 工作区/01 项目/00 工作/__跨天演示_'+Date.now()+'.md',scope='__rollover_'+Date.now(),data=structuredClone(p.data),history=p.undoHistory,entries=history.entries.slice(),focusKey=p.inlineTaskFocusKey;
 const events=[],cleanups=[],host=document.body.createDiv({cls:'gtd-dashboard'}),root=host.createDiv(),w=window.electron.remote.getCurrentWindow();
 host.style.cssText='position:fixed;left:260px;top:60px;width:1250px;height:650px;opacity:0;pointer-events:none';w.webContents.setBackgroundThrottling(false);
 const row=key=>root.querySelector('[data-task-key="block:'+key+'"] > .gtd-task-row'),button=key=>row(key)?.querySelector('[data-gtd-task-today]'),active=key=>button(key)?.getAttribute('aria-pressed')==='true';
 const component={registerEvent(ref){events.push(ref);},register(fn){cleanups.push(fn);}};let file,editor;
 try{
  const content='---\ntype: gtd-project\nstatus: active\narea: 工作\n---\n## 任务\n- [ ] <!-- gtd-days: '+today+' --> 昨天已安排 ^yesterday\n- [ ] <!-- gtd-days: '+tomorrow+' --> 新一天已安排 ^tomorrow\n- [ ] <!-- gtd-days: '+today+','+tomorrow+' --> 连续两天安排 ^both\n- [ ] 没有安排 ^none\n';
  file=await app.vault.create(path,content);p.data.treeExpanded||={};p.data.treeExpanded[scope+'::project:'+path]=true;
  const source=await app.vault.read(app.vault.getAbstractFileByPath('00 GTD/00 工作区/05 系统视图/项目进度.js')),query={where(){return this;},sort(){return this;},array(){return [{file:{path,name:'跨天演示'},status:'active',area:'工作'}];}},AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction('dv','input',source)({container:root,component,current:()=>({file:{path:scope}}),pages:()=>query},{activeOnly:true});
  check('initial Today indicators match the current day',active('yesterday')&&!active('tomorrow')&&active('both')&&!active('none'));
  const rows=['yesterday','tomorrow','both','none'].map(row),buttons=['yesterday','tomorrow','both','none'].map(button),tree=root.querySelector('.gtd-project-progress');
  row('none').querySelector('[data-gtd-task-add]').click();await until(()=>root.querySelector('form.gtd-inline-task-entry input'),'draft');editor=root.querySelector('form.gtd-inline-task-entry input');editor.value='跨天继续输入';editor.dispatchEvent(new Event('input',{bubbles:true}));editor.focus({preventScroll:true});editor.setSelectionRange(2,4);editor.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'zhong'}));
  p.todayDateKey=()=>tomorrow;app.workspace.trigger('gtd-task-day-changed');await pause(100);
  check('yesterday-only arrangement stops highlighting Today after midnight',!active('yesterday'));
  check('new-day and multi-day arrangements highlight Today without adding any date',active('tomorrow')&&active('both')&&!active('none'));
  check('Today labels agree with the new active state',button('yesterday').title==='加入今天'&&button('tomorrow').title==='移出今天'&&button('yesterday').getAttribute('aria-label')==='加入今天：昨天已安排');
  check('rollover updates keep every row and Today button node',rows.every((element,i)=>element===row(['yesterday','tomorrow','both','none'][i]))&&buttons.every((element,i)=>element===button(['yesterday','tomorrow','both','none'][i]))&&tree===root.querySelector('.gtd-project-progress'));
  check('active draft and composition input survive date updates',editor===root.querySelector('form.gtd-inline-task-entry input')&&editor.value==='跨天继续输入'&&editor.selectionStart===2&&editor.selectionEnd===4);
  editor.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));
  p.currentDayKey=tomorrow;p.todayDateKey=()=>next;window.dispatchEvent(new Event('focus'));await pause(120);
  check('returning to Obsidian immediately checks a later day',p.currentDayKey===next&&['yesterday','tomorrow','both','none'].every(key=>!active(key)));
  check('date rollover writes no task dates or undo actions',await app.vault.read(file)===content&&p.undoHistory===history&&history.entries.length===entries.length);
 }catch(error){results.push({name:error.stack,pass:false});}finally{
  editor?.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));p.todayDateKey=originalToday;p.currentDayKey=oldDay;
  for(const fn of cleanups)fn();for(const ref of events)app.workspace.offref(ref);host.remove();for(const [key,state]of p.inlineTaskEntries)if(state.project===path)p.inlineTaskEntries.delete(key);p.inlineTaskFocusKey=focusKey;
  if(file&&app.vault.getAbstractFileByPath(path)===file)await app.vault.delete(file);p.data=data;await p.saveData(p.data);history.entries.splice(0,history.entries.length,...entries);app.workspace.trigger('gtd-task-day-changed');w.webContents.setBackgroundThrottling(true);
  window.__dayRolloverNative={pass:results.every(r=>r.pass),checks:results.length,failed:results.filter(r=>!r.pass),results};
 }
 return JSON.stringify(window.__dayRolloverNative);
})()
