module.exports = function installTaskCalendarBridge(plugin, logic, Notice) {
  const calendar = plugin.app.plugins.plugins['tasks-calendar'];
  if (!calendar?.taskStore) return null;
  const store = calendar.taskStore, restores = [], snapshots=new Map(), revisions=new Map(), events=[];
  let disposed=false,refreshTimer;
  const refresh=()=>{window.clearTimeout(refreshTimer);refreshTimer=window.setTimeout(()=>{if(!disposed)calendar.refreshCalendars();},25);};
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
  function wrap(target, name, make) {
    const original = target[name];
    if (typeof original !== 'function') return;
    const wrapped = make(original);
    target[name] = wrapped;
    restores.push(() => { if (target[name] === wrapped) target[name] = original; });
  }
  wrap(store, 'getTasks', original => function () {
    const tasks=original.call(this),groups=new Map(),references=new Map();
    for(const task of tasks)if(inGtd(task)){if(!groups.has(task.path))groups.set(task.path,[]);groups.get(task.path).push(task);}
    for(const [path,indexed] of groups){const text=snapshots.get(path);references.set(path,text===undefined?null:logic.calendarTaskReferences(text,indexed));}
    return logic.calendarTaskInstances(tasks.map(task=>inGtd(task)?{...task,_gtdReference:references.get(task.path)?.get(task.line)||null}:task));
  });
  wrap(store, 'replaceTask', original => async function (task, replacement) {
    const canonical = source(task);
    if (!inGtd(canonical)) return original.call(this, task, replacement);
    return plugin.mutateCalendarTask(canonical, (content, reference) =>
      logic.replaceProjectTask(content, reference, logic.preserveTaskDays(canonical.raw, replacement)));
  });
  wrap(calendar, 'toggleTask', original => function (task) {
    const canonical = source(task);
    if (!inGtd(canonical) || !logic.taskDays(canonical.raw).length) return original.call(this, canonical);
    return original.call(this, { ...canonical, raw: logic.stripTaskDays(canonical.raw), _gtdSourceTask: canonical });
  });
  wrap(calendar, 'openTask', original => function (task) { return original.call(this, source(task)); });
  wrap(calendar, 'editTask', original => function (task) {
    const canonical = source(task);
    if (!inGtd(canonical) || !logic.taskDays(canonical.raw).length) return original.call(this, canonical);
    return original.call(this, { ...canonical, raw: logic.stripTaskDays(canonical.raw), description: logic.stripTaskDays(canonical.description || ''), _gtdSourceTask: canonical });
  });
  wrap(calendar, 'rescheduleTask', original => async function (task, date) {
    const canonical = source(task);
    if (!inGtd(canonical) || !task._gtdKind) return original.call(this, canonical, date);
    if (task._gtdDay === date) return;
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
    } catch (error) { new Notice(error.message || String(error)); }
  });
  wrap(calendar, 'deleteTask', original => async function (task) {
    const canonical = source(task);
    if (!inGtd(canonical)) return original.call(this, canonical);
    try {
      const result = await plugin.mutateCalendarTask(canonical, (content, reference) => logic.deleteProjectTask(content, reference));
      plugin.showTaskDeletionUndo({ path: canonical.path, title: result.title, count: result.count, undo: result.undo });
      return true;
    } catch (error) { new Notice(error.message || String(error)); return false; }
  });
  calendar.refreshCalendars();
  return { calendar, store, restore() { disposed=true;window.clearTimeout(refreshTimer);events.forEach(event=>plugin.app.vault.offref(event));snapshots.clear();restores.reverse().forEach(restore => restore()); calendar.refreshCalendars(); } };
};
