module.exports = function installTaskCalendarBridge(plugin, logic, Notice) {
  const calendar = plugin.app.plugins.plugins['tasks-calendar'];
  if (!calendar?.taskStore) return null;
  const store = calendar.taskStore, restores = [], snapshots=new Map(), revisions=new Map(), coherent=new Map(), events=[];
  const isProject = task => task?.path?.startsWith('00 GTD/00 工作区/01 项目/') && /\.md$/i.test(task.path);
  const metadata = plugin.app.metadataCache;
  const projectStatus = task => {
    const file = plugin.app.vault.getAbstractFileByPath?.(task.path);
    return file && metadata?.getFileCache(file)?.frontmatter?.status;
  };
  let disposed=false,refreshTimer;
  const refresh=()=>{window.clearTimeout(refreshTimer);refreshTimer=window.setTimeout(()=>{if(!disposed)calendar.refreshCalendars();},25);};
  const workspace=plugin.app.workspace,orderEvent=workspace?.on('gtd-project-order-changed',refresh);
  if(orderEvent)restores.push(()=>workspace.offref(orderEvent));
  const metadataEvent = metadata?.on?.('changed', file => { if (isProject(file)) refresh(); });
  if (metadataEvent) restores.push(() => metadata.offref(metadataEvent));
  async function prime(file) {
    if(!file?.path?.startsWith('00 GTD/')||file.extension!=='md')return;
    const path=file.path,revision=(revisions.get(path)||0)+1;revisions.set(path,revision);snapshots.delete(path);
    try {
      const content=await plugin.app.vault.read(file);
      if(!disposed&&file.path===path&&revisions.get(path)===revision){snapshots.set(path,content);refresh();}
    }catch(_){if(!disposed)snapshots.delete(path);}
  }
  for(const event of ['create','modify'])events.push(plugin.app.vault.on(event,prime));
  const forget=path=>{for(const key of [...snapshots.keys(),...revisions.keys(),...coherent.keys()])if(key===path||key.startsWith(path+'/')){snapshots.delete(key);coherent.delete(key);revisions.set(key,(revisions.get(key)||0)+1);}};
  events.push(plugin.app.vault.on('delete',file=>{forget(file.path);refresh();}));
  events.push(plugin.app.vault.on('rename',(file,oldPath)=>{forget(oldPath);if(file.extension==='md')prime(file);else for(const child of plugin.app.vault.getMarkdownFiles().filter(child=>child.path.startsWith(file.path+'/')))prime(child);}));
  for(const file of plugin.app.vault.getMarkdownFiles())prime(file);
  const source = task => task._gtdSourceTask || task;
  const inGtd = task => task?.path?.startsWith('00 GTD/');
  function hook(name, handler) {
    const previous = calendar[name];
    calendar[name] = handler;
    restores.push(() => {
      if (calendar[name] !== handler) return;
      if (previous === undefined) delete calendar[name];
      else calendar[name] = previous;
    });
  }
  const filterModel=(model,gridRef)=>{
    if(!gridRef.current?.closest('.gtd-dashboard'))return model;
    const done = new Map();
    const visibleTask = task => {
      if (!isProject(task)) return true;
      if (!done.has(task.path)) done.set(task.path, projectStatus(task) === 'done');
      return !done.get(task.path);
    };
    let tasksByDate = model.tasksByDate, removed = 0;
    for (const [date, tasks] of model.tasksByDate) {
      const remaining = tasks.filter(visibleTask);
      if (remaining.length === tasks.length) continue;
      if (tasksByDate === model.tasksByDate) tasksByDate = new Map(tasksByDate);
      if (remaining.length) tasksByDate.set(date, remaining);
      else tasksByDate.delete(date);
      removed += tasks.length - remaining.length;
    }
    const dayKey=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
    const visible=model.days.flatMap(date=>tasksByDate.get(dayKey(date))||[]);
    return {
      ...model, ...(removed ? { tasksByDate, visibleTasks: model.visibleTasks - removed } : {}),
      overdueTasks: logic.calendarOverdueTasks(model.overdueTasks.filter(visibleTask), visible)
    };
  };
  hook('_gtdCalendarModel', filterModel);
  hook('_gtdTaskError', (task, error, fallback) => inGtd(source(task)) ? plugin.showTaskActionError(error) : new Notice(fallback));
  hook('_gtdLocateTask', async (task, anchor) => {
    const canonical = source(task);
    if (isProject(canonical) && anchor.closest('.gtd-dashboard')) {
      try { if (await plugin.locateCalendarTask?.(canonical)) return; } catch (_) {}
    }
    return calendar.openTask(canonical);
  });
  function originalDeadline(task, today) {
    const canonical = source(task);
    if (!inGtd(canonical) || task.completed || canonical.completed || !canonical.due) return;
    const days = (Date.parse(today) - Date.parse(canonical.due)) / 86400000;
    if (days > 0) return '原截止 ' + canonical.due + ' · 已逾期 ' + days + ' 天';
  }
  hook('_gtdOriginalDeadline', originalDeadline);
  function startable(task, canonical) {
    if (!isProject(canonical) || task.completed || !canonical._gtdReference || (projectStatus(canonical) || 'active') !== 'active') return false;
    const text = snapshots.get(canonical.path);
    if (text === undefined) return false;
    try {
      const reference = logic.calendarTaskReference(text, canonical);
      const matches = node => node.line === reference.line
        ? node.children.length === 0 && !node.completed && !node.cancelled && node.status !== '_'
        : node.children.some(matches);
      return logic.projectTaskTree(text).roots.some(matches);
    } catch (_) { return false; }
  }
  hook('_gtdAddTaskMenuItems', (menu, task, today) => {
    const canonical = source(task), deadline = originalDeadline(task, today);
    if (typeof plugin.startCalendarFocusTask === 'function' && startable(task, canonical)) {
      menu.addItem(item => item.setTitle('开始这件').setIcon('play').onClick(async () => {
        try { await plugin.startCalendarFocusTask(canonical); }
        catch (error) { plugin.showTaskActionError(error); }
      }));
    }
    if (deadline) menu.addItem(item => item.setTitle(deadline).setIcon('calendar-clock').setDisabled(true));
  });
  const foldedGroups=new Set();
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
      const ancestors=task._gtdAncestors||[];
      ancestors.forEach((label,index)=>{
        const key=JSON.stringify([task.path,task._gtdAncestorKeys.slice(0,index+1)]);
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
  hook('_gtdRenderDayTasks', renderDayGroups);
  function wrap(target, name, make) {
    const original = target[name];
    if (typeof original !== 'function') return;
    const wrapped = make(original);
    target[name] = wrapped;
    restores.push(() => { if (target[name] === wrapped) target[name] = original; });
  }
  wrap(store, 'getTasks', original => function () {
    const tasks=original.call(this),groups=new Map(),visible=new Map(),emitted=new Set();
    for(const task of tasks)if(inGtd(task)){if(!groups.has(task.path))groups.set(task.path,[]);groups.get(task.path).push(task);}
    for(const path of coherent.keys())if(!groups.has(path)){
      const text=snapshots.get(path);if(text!==undefined&&logic.calendarTaskReferences(text,[]))coherent.set(path,[]);
    }
    for(const [path,indexed] of groups){
      const text=snapshots.get(path),references=text===undefined?null:logic.calendarTaskReferences(text,indexed);
      if(references){
        const contexts=logic.calendarTaskContexts(text,indexed),model=logic.calendarLeafTasks(text,indexed).map(task=>({...task,...contexts.get(task.line),_gtdReference:references.get(task.line)}));
        coherent.set(path,model);visible.set(path,model);
      }else{
        // Source text and the batched native index arrive separately. Keep groups
        // intact until both describe the same revision, but block stale writes.
        visible.set(path,(coherent.get(path)||indexed).map(task=>({...task,_gtdReference:null})));
      }
    }
    return logic.calendarTaskInstances(tasks.flatMap(task=>{
      if(!inGtd(task))return [task];if(emitted.has(task.path))return [];emitted.add(task.path);return visible.get(task.path);
    }));
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
  return { calendar, store, restore() { disposed=true;window.clearTimeout(refreshTimer);events.forEach(event=>plugin.app.vault.offref(event));snapshots.clear();coherent.clear();restores.reverse().forEach(restore => restore()); calendar.refreshCalendars(); } };
};
