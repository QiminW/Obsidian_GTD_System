module.exports = function installTaskCalendarBridge(plugin, logic, Notice) {
  const calendar = plugin.app.plugins.plugins['tasks-calendar'];
  if (!calendar?.taskStore) return null;
  const store = calendar.taskStore, restores = [], snapshots=new Map(), revisions=new Map(), events=[];
  let disposed=false,refreshTimer;
  const refresh=()=>{window.clearTimeout(refreshTimer);refreshTimer=window.setTimeout(()=>{if(!disposed)calendar.refreshCalendars();},25);};
  const workspace=plugin.app.workspace,orderEvent=workspace?.on('gtd-project-order-changed',refresh);
  if(orderEvent)restores.push(()=>workspace.offref(orderEvent));
  async function prime(file) {
    if(!file?.path?.startsWith('00 GTD/')||file.extension!=='md')return;
    const path=file.path,revision=(revisions.get(path)||0)+1;revisions.set(path,revision);snapshots.delete(path);
    try {
      const content=await plugin.app.vault.read(file);
      if(!disposed&&file.path===path&&revisions.get(path)===revision){snapshots.set(path,content);refresh();}
    }catch(_){if(!disposed)snapshots.delete(path);}
  }
  for(const event of ['create','modify'])events.push(plugin.app.vault.on(event,prime));
  const forget=path=>{for(const key of [...snapshots.keys(),...revisions.keys()])if(key===path||key.startsWith(path+'/')){snapshots.delete(key);revisions.set(key,(revisions.get(key)||0)+1);}};
  events.push(plugin.app.vault.on('delete',file=>{forget(file.path);refresh();}));
  events.push(plugin.app.vault.on('rename',(file,oldPath)=>{forget(oldPath);if(file.extension==='md')prime(file);else for(const child of plugin.app.vault.getMarkdownFiles().filter(child=>child.path.startsWith(file.path+'/')))prime(child);}));
  for(const file of plugin.app.vault.getMarkdownFiles())prime(file);
  const source = task => task._gtdSourceTask || task;
  const inGtd = task => task?.path?.startsWith('00 GTD/');
  const previousFeedback = calendar._gtdTaskError;
  const feedback = (task, error, fallback) => inGtd(source(task)) ? plugin.showTaskActionError(error) : new Notice(fallback);
  calendar._gtdTaskError = feedback;
  restores.push(() => { if (calendar._gtdTaskError === feedback) { if (previousFeedback === undefined) delete calendar._gtdTaskError; else calendar._gtdTaskError = previousFeedback; } });
  const foldedGroups=new Set(),previousDayRenderer=calendar._gtdRenderDayTasks;
  const renderDayGroups=options=>{
    const {mode,gridRef,date,active,completed,jsx,sortable,strategy,renderTask}=options;
    if(mode!=='day'||plugin.data?.calendarDayLayout!=='group'||!gridRef.current?.closest('.gtd-dashboard'))return null;
    const groups=new Map();
    const tasks=[...active,...completed],paths=[...new Set(tasks.map(task=>task.path))];
    const ranks=new Map(logic.orderProjectPaths(paths,plugin.data.projectOrder).map((path,index)=>[path,index]));
    tasks.sort((a,b)=>ranks.get(a.path)-ranks.get(b.path)||(source(a).line??Infinity)-(source(b).line??Infinity));
    const makeGroup=(key,label,full)=>({key,label,full,tasks:[],entries:[],children:new Map(),done:0,total:0});
    const count=(group,task)=>{group.total++;if(task.completed)group.done++;};
    for(const task of tasks){
      const project=task.path.replace(/\.md$/i,'').split('/').pop(),projectKey=JSON.stringify([task.path,null]);
      if(!groups.has(projectKey))groups.set(projectKey,makeGroup(projectKey,project,project));
      let group=groups.get(projectKey);count(group,task);
      const ancestors=task._gtdAncestors||(task._gtdParentTitle?[task._gtdParentTitle]:[]),keys=[];
      ancestors.forEach((label,index)=>{
        keys.push(task._gtdAncestorKeys?.[index]||(index===ancestors.length-1&&task._gtdGroupKey)||'name:'+label);
        const key=JSON.stringify([task.path,keys]);
        if(!group.children.has(key)){const child=makeGroup(key,label,[project,...ancestors.slice(0,index+1)].join(' › '));group.children.set(key,child);group.entries.push({group:child});}
        group=group.children.get(key);count(group,task);
      });
      group.tasks.push(task);group.entries.push({task});
    }
    const renderGroup=group=>{
      const key=date+'::'+group.key;
      return jsx.jsxs('details',{className:'gtd-calendar-task-group',open:!foldedGroups.has(key),onToggle:event=>{if(event.currentTarget.open)foldedGroups.delete(key);else foldedGroups.add(key);},children:[
        jsx.jsxs('summary',{className:'gtd-calendar-group-heading','aria-label':group.full,onClick:event=>event.stopPropagation(),onDoubleClick:event=>event.stopPropagation(),children:[jsx.jsx('span',{className:'gtd-calendar-group-title',children:group.label}),jsx.jsx('span',{className:'gtd-calendar-group-count',children:group.done+'/'+group.total})]}),
        jsx.jsx('div',{className:'gtd-calendar-group-list',children:jsx.jsx(sortable,{id:`tasks:${date}:group:${group.key}:source`,items:group.tasks.map(task=>task.id),strategy,children:group.entries.map(entry=>entry.task?renderTask(entry.task):renderGroup(entry.group))})})
      ]},key);
    };
    return [...groups.values()].map(renderGroup);
  };
  calendar._gtdRenderDayTasks=renderDayGroups;
  restores.push(()=>{if(calendar._gtdRenderDayTasks===renderDayGroups){if(previousDayRenderer===undefined)delete calendar._gtdRenderDayTasks;else calendar._gtdRenderDayTasks=previousDayRenderer;}});
  function wrap(target, name, make) {
    const original = target[name];
    if (typeof original !== 'function') return;
    const wrapped = make(original);
    target[name] = wrapped;
    restores.push(() => { if (target[name] === wrapped) target[name] = original; });
  }
  wrap(store, 'getTasks', original => function () {
    const tasks=original.call(this),groups=new Map(),references=new Map(),leaves=new Map(),contexts=new Map();
    for(const task of tasks)if(inGtd(task)){if(!groups.has(task.path))groups.set(task.path,[]);groups.get(task.path).push(task);}
    for(const [path,indexed] of groups){const text=snapshots.get(path);references.set(path,text===undefined?null:logic.calendarTaskReferences(text,indexed));if(text!==undefined)leaves.set(path,new Set(logic.calendarLeafTasks(text,indexed).map(task=>task.line)));if(references.get(path))contexts.set(path,logic.calendarTaskContexts(text,indexed));}
    return logic.calendarTaskInstances(tasks.filter(task=>!inGtd(task)||!leaves.has(task.path)||leaves.get(task.path).has(task.line)).map(task=>inGtd(task)?{...task,...contexts.get(task.path)?.get(task.line),_gtdReference:references.get(task.path)?.get(task.line)||null}:task));
  });
  wrap(store, 'replaceTask', original => async function (task, replacement) {
    const canonical = source(task);
    if (!inGtd(canonical)) return original.call(this, task, replacement);
    plugin.clearTaskActionNotice();
    return plugin.mutateCalendarTask(canonical, (content, reference) =>
      logic.replaceProjectTask(content, reference, logic.preserveTaskDays(canonical.raw, replacement)));
  });
  wrap(calendar, 'toggleTask', original => function (task) {
    const canonical = source(task);
    if (inGtd(canonical)) plugin.clearTaskActionNotice();
    if (!inGtd(canonical) || !logic.taskDays(canonical.raw).length) return original.call(this, canonical);
    return original.call(this, { ...canonical, raw: logic.stripTaskDays(canonical.raw), _gtdSourceTask: canonical });
  });
  wrap(calendar, 'openTask', original => function (task) { const canonical=source(task);if(inGtd(canonical))plugin.clearTaskActionNotice();return original.call(this, canonical); });
  wrap(calendar, 'createTask', original => function (date) { if(this.settings?.newTaskFile?.trim().startsWith('00 GTD/'))plugin.clearTaskActionNotice();return original.call(this,date); });
  wrap(calendar, 'editTask', original => function (task) {
    const canonical = source(task);
    if (inGtd(canonical)) plugin.clearTaskActionNotice();
    if (!inGtd(canonical) || !logic.taskDays(canonical.raw).length) return original.call(this, canonical);
    return original.call(this, { ...canonical, raw: logic.stripTaskDays(canonical.raw), description: logic.stripTaskDays(canonical.description || ''), _gtdSourceTask: canonical });
  });
  wrap(calendar, 'rescheduleTask', original => async function (task, date) {
    const canonical = source(task);
    if (!inGtd(canonical) || !task._gtdKind) return original.call(this, canonical, date);
    if (task._gtdDay === date) return;
    plugin.clearTaskActionNotice();
    try {
      if (task._gtdKind === 'arrangement') {
        await plugin.mutateCalendarTask(canonical, (content, reference) => {
          const days = logic.taskDays(reference.raw).filter(day => day !== task._gtdDay);
          days.push(date);
          return logic.replaceProjectTask(content, reference, logic.setTaskDays(reference.raw.replace(/[ \t]+⏳[ \t]*\d{4}-\d{2}-\d{2}/gu,''), days));
        });
        new Notice('已移动该天安排');
      } else if (task._gtdKind === 'deadline') {
        await plugin.mutateCalendarTask(canonical, (content, reference) => logic.updateProjectTaskDate(content, reference, 'due', date));
        new Notice('截止日期已修改');
      } else return original.call(this, canonical, date);
    } catch (error) { plugin.showTaskActionError(error); }
  });
  wrap(calendar, 'deleteTask', original => async function (task) {
    const canonical = source(task);
    if (!inGtd(canonical)) return original.call(this, canonical);
    plugin.clearTaskActionNotice();
    try {
      const result = await plugin.mutateCalendarTask(canonical, (content, reference) => logic.deleteProjectTask(content, reference));
      plugin.showTaskDeletionUndo({ path: canonical.path, title: result.title, count: result.count, undo: result.undo });
      return true;
    } catch (error) { plugin.showTaskActionError(error); return false; }
  });
  calendar.refreshCalendars();
  return { calendar, store, restore() { disposed=true;window.clearTimeout(refreshTimer);events.forEach(event=>plugin.app.vault.offref(event));snapshots.clear();restores.reverse().forEach(restore => restore()); calendar.refreshCalendars(); } };
};
