const plugin = app.plugins.plugins['gtd-quick-actions'];
if (!plugin?.readProjectTaskTree) throw new Error('请启用最新版本的 GTD 快捷操作');
const refreshGuard=plugin.protectProjectView(dv.component,dv.container);
const finishView=refreshGuard.begin();
try {
function readPages(){
  const indexed=dv.pages('"00 GTD/00 工作区/01 项目"').where(p=>!input?.activeOnly||(p.status||'active')==='active').sort(p=>p.file.name).array();
  const byPath=new Map(indexed.map(page=>[page.file.path,page]));
  return plugin.orderedProjectPaths([...byPath.keys()]).map(path=>byPath.get(path));
}
const statuses = { active:'进行中', paused:'暂缓', done:'已完成' };
const scope = dv.current().file.path;
const visibilityKey=scope+'::show-completed';
let showCompleted=plugin.projectTreeExpanded(visibilityKey,true);
const visibilityButton=document.createElement('button');
visibilityButton.className='gtd-completed-visibility';visibilityButton.type='button';
visibilityButton.dataset.gtdCompletedVisibility='true';
plugin.renderTaskVisibilityButton(visibilityButton,showCompleted);
const treeRenderers=new Map();
visibilityButton.addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();
  plugin.setProjectTreeExpanded(visibilityKey,!showCompleted);
  app.workspace.trigger('gtd-completed-visibility-changed',scope);
});
const table = dv.container.createEl('table', { cls:'gtd-project-progress' });
const keyboard=plugin.installProjectKeyboard(dv.component,table,scope);
const reconcile=(parent,elements)=>{
  const keep=new Set(elements);for(const child of [...parent.children])if(!keep.has(child))child.remove();
  let cursor=parent.firstElementChild;for(const element of elements){if(element===cursor)cursor=cursor.nextElementSibling;else parent.insertBefore(element,cursor);}
};
dv.component.registerEvent(app.workspace.on('gtd-completed-visibility-changed',changedScope=>{
  if(changedScope!==scope||!table.isConnected)return;
  showCompleted=plugin.projectTreeExpanded(visibilityKey,true);
  plugin.renderTaskVisibilityButton(visibilityButton,showCompleted);
  for(const panel of dv.container.querySelectorAll('.gtd-day-panel:popover-open'))panel.hidePopover();
  for(const key of plugin.taskDayPanels.keys())if(key.startsWith(scope+'::days:'))plugin.taskDayPanels.delete(key);
  for(const render of treeRenderers.values())render().catch(error=>dv.container.createDiv({cls:'gtd-form-error',text:error.message||String(error)}));
}));
const head = table.createEl('thead').createEl('tr');
for (const label of ['项目','领域','状态','进度','完成 / 总计','截止日期']) {
  const heading=head.createEl('th').createDiv({cls:'gtd-table-heading'});heading.createSpan({text:label});
  if(label==='截止日期')heading.append(visibilityButton);
  if(label==='项目'||label==='领域') {
    const name=label==='项目'?'新建项目':'新建领域';
    const add=heading.createEl('button',{text:'＋',cls:'gtd-task-action gtd-header-add',attr:{type:'button','aria-label':name,title:name}});
    add.dataset.gtdAction=label==='项目'?'new-project':'new-area';
    add.addEventListener('click',()=>label==='项目'?plugin.openProjectModal():plugin.openAreaModal());
  }
}
const body = table.createEl('tbody');
const projectRows=new Map();
let orderedPaths=[];
const clearDropMarks=()=>dv.container.querySelectorAll('.gtd-drop-before,.gtd-drop-after').forEach(element=>element.classList.remove('gtd-drop-before','gtd-drop-after'));
const dropSide=(event,element)=>event.clientY<element.getBoundingClientRect().top+element.getBoundingClientRect().height/2?'before':'after';
function reorderProjectRows(){reconcile(body,plugin.orderedProjectPaths(orderedPaths.filter(path=>projectRows.has(path))).flatMap(path=>{const pair=projectRows.get(path);return [pair.row,pair.detail];}));keyboard.refresh();}
dv.component.registerEvent(app.workspace.on('gtd-project-order-changed',reorderProjectRows));
function renderNameInput(parent,state,kind,unavailable=false) {
  const focusKey=kind==='project'?'projectNameFocusKey':'taskTitleFocusKey';
  const editor=parent.createDiv({cls:'gtd-task-name-editor'+(kind==='project'?' gtd-project-name-editor':'')});
  const form=editor.createEl('form');form.dataset.gtdNameEditor=state.key;
  if(kind==='task')form.dataset.gtdTaskTitleEditor=state.key;else form.dataset.gtdProjectNameEditor=state.key;
  const name=form.createEl('input',{attr:{type:'text','aria-label':kind==='project'?'修改项目名称':'修改任务名称',autocomplete:'off',placeholder:kind==='project'?'项目名称':'任务名称'}});
  name.value=state.draft;name.disabled=state.busy;name.dataset.unavailable=String(state.busy);
  if(kind==='task')name.dataset.gtdTaskNameInput='true';else name.dataset.gtdProjectNameInput='true';
  const remember=()=>{if(state.busy)return;state.draft=name.value;state.selectionStart=name.selectionStart;state.selectionEnd=name.selectionEnd;};
  const save=()=>{if(state.busy||unavailable||state.composing)return;remember();name.disabled=true;plugin.saveNameEdit(state,kind);};
  name.addEventListener('input',remember);name.addEventListener('select',remember);
  name.addEventListener('compositionstart',()=>state.composing=true);name.addEventListener('compositionend',()=>{state.composing=false;remember();});
  name.addEventListener('focus',()=>{state.ownerLeaf=app.workspace.activeLeaf?.id;plugin[focusKey]=state.key;});
  name.addEventListener('blur',()=>{
    remember();if(plugin[focusKey]===state.key)plugin[focusKey]='';
    window.setTimeout(()=>{if(form.isConnected)save();},0);
  });
  form.addEventListener('click',event=>event.stopPropagation());
  form.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();save();});
  name.addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229||state.composing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();name.blur();plugin.closeNameEdit(state.key,kind);refreshGuard.resume();}
    else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();form.requestSubmit();}
  });
  const error=unavailable?'任务位置已变化，输入内容已保留，请取消后重新编辑':state.error;
  if(error){
    form.createDiv({cls:'gtd-form-error gtd-task-name-error',text:error,attr:{role:'alert'}});
    const cancel=form.createEl('button',{text:'取消',cls:'gtd-name-cancel',attr:{type:'button'}});
    cancel.addEventListener('pointerdown',event=>event.preventDefault());
    cancel.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();name.blur();plugin.closeNameEdit(state.key,kind);refreshGuard.resume();});
  }
  window.requestAnimationFrame(()=>{
    if(!state.busy&&form.isConnected&&form.getClientRects().length&&plugin[focusKey]===state.key&&state.ownerLeaf===app.workspace.activeLeaf?.id&&app.workspace.activeLeaf?.view.file?.path===state.scope){name.focus({preventScroll:true});name.setSelectionRange(state.selectionStart??0,state.selectionEnd??name.value.length);}
  });
}
async function createProjectView(project) {
  const path = project.file.path, projectState = scope+'::project:'+path;
  const projectId=JSON.stringify([path,'project']);
  const eventRefs=[],registerProjectEvent=ref=>{eventRefs.push(ref);dv.component.registerEvent(ref);};
  let expanded = plugin.projectTreeExpanded(projectState), busy = false, rendering = 0;
  const row = body.createEl('tr'); row.dataset.projectPath = path;
  const title = row.createEl('td');
  const projectGrip=title.createSpan({text:'⋮⋮',cls:'gtd-drag-handle gtd-project-grip',attr:{draggable:'true',title:'拖动调整项目顺序','aria-label':'拖动排序项目：'+project.file.name}});projectGrip.dataset.gtdProjectDrag='true';
  projectGrip.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
  projectGrip.addEventListener('dragstart',event=>{event.stopPropagation();plugin.draggedProject=path;plugin.draggedTask=null;event.dataTransfer.setData('application/x-gtd-project',path);event.dataTransfer.effectAllowed='move';plugin.activeDayPopover?.hidePopover();});
  projectGrip.addEventListener('dragend',()=>{plugin.draggedProject=null;clearDropMarks();});
  row.addEventListener('dragover',event=>{if(!plugin.draggedProject||plugin.draggedProject===path)return;event.preventDefault();event.stopPropagation();clearDropMarks();row.classList.add('gtd-drop-'+dropSide(event,row));event.dataTransfer.dropEffect='move';});
  row.addEventListener('dragleave',event=>{if(!row.contains(event.relatedTarget))row.classList.remove('gtd-drop-before','gtd-drop-after');});
  row.addEventListener('drop',event=>{if(!plugin.draggedProject||plugin.draggedProject===path)return;event.preventDefault();event.stopPropagation();const source=plugin.draggedProject,side=dropSide(event,row);plugin.draggedProject=null;clearDropMarks();plugin.moveProjectDisplay(source,path,side).catch(error=>tree.createDiv({cls:'gtd-form-error',text:error.message||String(error)}));});
  const toggle = title.createEl('button', { cls:'gtd-project-toggle', attr:{type:'button','aria-expanded':String(expanded),'aria-label':'展开或折叠项目：'+project.file.name} });
  const arrow = toggle.createSpan({ text:expanded?'▾':'▸', cls:'gtd-project-arrow' });
  keyboard.register(row,{id:projectId,parent:null,label:'项目：'+project.file.name,expanded:()=>expanded,toggle:value=>setExpanded(value),rename:()=>projectNameSlot.querySelector('[data-gtd-project-rename]')?.click(),add:()=>add.click()});
  const projectNameSlot=title.createSpan({cls:'gtd-project-name-slot'});
  let renderedName;
  function renderProjectName(){
    const state=plugin.projectNameEdits.get(JSON.stringify([scope,path]));
    const signature=JSON.stringify([project.file.name,state?.key,state?.busy,state?.error]);
    if(signature===renderedName)return;
    if(projectNameSlot.contains(document.activeElement)&&!state?.busy&&refreshGuard.defer(path,()=>pair.update(project)))return;
    keyboard.capture();projectNameSlot.empty();renderedName=signature;
    if(state){renderNameInput(projectNameSlot,state,'project');keyboard.refresh();return;}
    const name=projectNameSlot.createEl('button',{text:project.file.name,cls:'gtd-project-name-edit',attr:{type:'button',title:'点击修改项目名称','aria-label':'修改项目名称：'+project.file.name}});
    name.dataset.gtdProjectRename='true';
    name.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();plugin.beginProjectNameEdit(scope,path,project.file.name).catch(error=>projectNameSlot.createDiv({cls:'gtd-form-error',text:error.message||String(error)}));});
    keyboard.refresh();
  }
  renderProjectName();
  registerProjectEvent(app.workspace.on('gtd-project-name-edit',changedPath=>{
    if(changedPath!==path||!row.isConnected)return;
    for(const form of projectNameSlot.querySelectorAll('form[data-gtd-project-name-editor]'))if(plugin.projectNameEdits.get(form.dataset.gtdProjectNameEditor)?.busy)form.querySelectorAll('input,button').forEach(control=>control.disabled=true);
    renderProjectName();
  }));
  const source = title.createEl('a', { text:'↗', cls:'gtd-project-source', attr:{ href:path, 'aria-label':'打开项目笔记：'+project.file.name } });
  source.addEventListener('click', e=>{ e.preventDefault();app.workspace.openLinkText(path,scope,true); });
  const add = title.createEl('button', { text:'＋', cls:'gtd-task-action gtd-project-add', attr:{ type:'button', 'aria-label':'添加项目任务：'+project.file.name, title:'添加项目任务' } });
  add.dataset.gtdProjectAdd='true';add.disabled=project.status==='done';
  add.addEventListener('click',()=>openInline());
  const areaCell=row.createEl('td', { text:String(project.area||'—') });
  const statusCell=row.createEl('td');
  const statusButton=statusCell.createEl('button',{text:(statuses[project.status]||project.status||'进行中')+' ▾',cls:'gtd-project-status',attr:{type:'button',title:'项目操作：完成、恢复或归档','aria-label':'项目操作：'+project.file.name}});
  statusButton.dataset.gtdProjectMenu='true';statusButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();plugin.showProjectMenu(path,event);});
  const progressCell = row.createEl('td', { cls:'gtd-progress-cell' });
  const bar = progressCell.createEl('progress', { attr:{ max:'100',value:'0' } });
  const percent = progressCell.createSpan();
  const count = row.createEl('td');
  const deadlineCell=row.createEl('td');
  let projectDeadline=project.deadline?dv.date(project.deadline)?.toFormat('yyyy-MM-dd')||String(project.deadline):'';
  const deadlineInput=deadlineCell.createEl('input',{cls:'gtd-project-deadline',attr:{type:'date','aria-label':'项目截止日期：'+project.file.name,title:'修改项目截止日期'}});
  deadlineInput.value=projectDeadline;deadlineInput.dataset.gtdProjectDeadline='true';
  const deadlineError=deadlineCell.createDiv({cls:'gtd-form-error gtd-project-deadline-error',attr:{role:'alert'}});
  deadlineInput.addEventListener('change',async()=>{
    if(deadlineInput.disabled)return;deadlineInput.disabled=true;deadlineError.textContent='';
    try{projectDeadline=await plugin.updateProjectDeadline(path,deadlineInput.value,projectDeadline);deadlineInput.value=projectDeadline;}
    catch(error){deadlineInput.value=projectDeadline;deadlineError.textContent=error.message||String(error);}
    finally{deadlineInput.disabled=false;}
  });
  const detail = body.createEl('tr', { cls:'gtd-project-detail' }); detail.hidden = !expanded; detail.dataset.treeFor = path;
  const tree = detail.createEl('td', { attr:{ colspan:'6' } });
  const taskCache=new Map(),entryCache=new Map(),dayCache=new Map(),orphanCache=new Map();
  const pair={row,detail,dispose(){for(const ref of eventRefs)app.workspace.offref(ref);taskCache.clear();entryCache.clear();dayCache.clear();orphanCache.clear();},update:async page=>{
    project=page;areaCell.textContent=String(project.area||'—');statusButton.textContent=(statuses[project.status]||project.status||'进行中')+' ▾';add.disabled=project.status==='done';
    const next=project.deadline?dv.date(project.deadline)?.toFormat('yyyy-MM-dd')||String(project.deadline):'';
    if(document.activeElement!==deadlineInput){projectDeadline=next;deadlineInput.value=next;}
    renderProjectName();await renderTree();
  }};
  projectRows.set(path,pair);
  async function openInline(parent=null) {
    try {
      plugin.beginInlineTaskEntry(scope,path,parent);
      expanded=true;detail.hidden=false;toggle.setAttribute('aria-expanded','true');arrow.textContent='▾';plugin.setProjectTreeExpanded(projectState,true);
      if(parent){plugin.setProjectTreeExpanded(scope+'::task:'+path+'::'+parent.key,true);const branch=taskCache.get(parent.key)?.branch;if(branch)branch.open=true;}
      await renderTree();
    } catch(error){tree.createDiv({cls:'gtd-form-error',text:error.message||String(error)});}
  }
  async function toggleDayPanel(node) {
    const key=scope+'::days:'+path+'::'+node.key;
    if(plugin.taskDayPanels.get(key)?.ownerLeaf===app.workspace.activeLeaf?.id)plugin.taskDayPanels.delete(key);
    else {
      plugin.taskDayPanels.set(key,{month:plugin.taskDayPanels.get(key)?.month||window.moment().startOf('month').format('YYYY-MM-DD'),ownerLeaf:app.workspace.activeLeaf?.id});
      plugin.setProjectTreeExpanded(scope+'::task:'+path+'::'+node.key,true);
      const branch=taskCache.get(node.key)?.branch;if(branch)branch.open=true;
    }
    await renderTree();
  }
  async function writeTask(operation) {
    if(busy)return;busy=true;
    tree.querySelectorAll('[data-gtd-task-checkbox], [data-gtd-task-action], [data-gtd-task-date], [data-gtd-task-name-input]').forEach(control=>control.disabled=true);
    try { await operation();await renderTree(); }
    catch(error) {
      try { await renderTree(); } catch (_) {}
      if(tree.isConnected)tree.createDiv({cls:'gtd-form-error',text:error.message||String(error)});
    }
    finally {
      busy=false;
      tree.querySelectorAll('[data-gtd-task-checkbox], [data-gtd-task-action], [data-gtd-task-date], [data-gtd-task-name-input]').forEach(control=>control.disabled=control.dataset.unavailable==='true');
    }
  }
  async function renderTree() {
    return refreshGuard.run(path,renderTreeNow,true);
  }
  async function renderTreeNow() {
    const ticket = ++rendering;
    const model = await plugin.readProjectTaskTree(path);
    if (ticket!==rendering||!tree.isConnected) return;
    row.dataset.done=String(model.done);row.dataset.total=String(model.total);
    bar.value=model.total?Math.round(model.done/model.total*100):0;
    bar.setAttribute('aria-label',project.file.name+' '+bar.value+'%');
    percent.textContent=model.total?bar.value+'%':'—';count.textContent=model.done+' / '+model.total;
    if (!expanded) return;
    keyboard.capture();
    const entries=plugin.inlineTaskEntriesFor(scope,path),mounted=new Set();
    const titleEdits=plugin.taskTitleEditsFor(scope,path),mountedTitles=new Set();
    let empty=tree.querySelector(':scope > .gtd-task-empty');if(!empty)empty=tree.createDiv({cls:'gtd-task-empty',text:'暂无任务'});empty.hidden=!!(model.roots.length||entries.length);
    const list = tree.querySelector(':scope > ul.gtd-task-list')||tree.createEl('ul', { cls:'gtd-task-list' });
    const seenTasks=new Set(),seenEntries=new Set(),seenDays=new Set();
    const display=model.completedDisplay;
    const visibleKeys=new Set(display.activeKeys);
    if(!showCompleted){
      const pendingTargets=new Set([...titleEdits.map(state=>state.taskKey),...entries.map(state=>state.parentKey).filter(Boolean)]);
      function retainDraftPath(node){
        const descendant=node.children.map(retainDraftPath).some(Boolean);
        if(pendingTargets.has(node.key)||descendant){visibleKeys.add(node.key);return true;}
        return false;
      }
      if(pendingTargets.size)model.roots.forEach(retainDraftPath);
    }
    const isVisible=node=>showCompleted||visibleKeys.has(node.key);
    function addDayPanel(parent,node,state,anchor) {
      seenDays.add(node.key);
      const saved=dayCache.get(node.key);
      if(saved&&saved.month===state.month&&saved.state===state){
        for(const button of saved.item.querySelectorAll('[data-gtd-arrange-date]')){const selected=node.days.includes(button.dataset.gtdArrangeDate);button.setAttribute('aria-pressed',String(selected));button.classList.toggle('is-selected',selected);button.disabled=busy;}
        return saved.item;
      }
      saved?.item.remove();
      const item=parent.createEl('li',{cls:'gtd-day-panel-item'}),panel=item.createDiv({cls:'gtd-day-panel'});
      panel.setAttribute('popover','auto');
      panel.dataset.gtdDayPanel=node.key;
      const header=panel.createDiv({cls:'gtd-day-panel-header'});
      const previous=header.createEl('button',{text:'‹',attr:{type:'button','aria-label':'上个月'}});
      header.createSpan({text:window.moment(state.month).format('YYYY年M月')});
      const next=header.createEl('button',{text:'›',attr:{type:'button','aria-label':'下个月'}});
      const close=header.createEl('button',{text:'×',cls:'gtd-task-action',attr:{type:'button','aria-label':'收起日期选择'}});
      previous.addEventListener('click',()=>{state.month=window.moment(state.month).subtract(1,'month').format('YYYY-MM-DD');renderTree();});
      next.addEventListener('click',()=>{state.month=window.moment(state.month).add(1,'month').format('YYYY-MM-DD');renderTree();});
      close.addEventListener('click',()=>toggleDayPanel(node));
      const grid=panel.createDiv({cls:'gtd-day-grid'});
      for(const label of ['一','二','三','四','五','六','日'])grid.createSpan({text:label,cls:'gtd-day-weekday'});
      const start=window.moment(state.month).startOf('month').isoWeekday(1),today=plugin.todayDateKey();
      for(let offset=0;offset<42;offset++){
        const day=start.clone().add(offset,'days'),date=day.format('YYYY-MM-DD'),selected=node.days.includes(date);
        const button=grid.createEl('button',{text:day.format('D'),attr:{type:'button','aria-label':date,'aria-pressed':String(selected)}});
        button.dataset.gtdArrangeDate=date;button.dataset.gtdTaskAction='arrange-day';button.disabled=busy;
        button.classList.toggle('is-selected',selected);button.classList.toggle('is-today',date===today);button.classList.toggle('is-outside',day.format('YYYY-MM')!==state.month.slice(0,7));
        button.addEventListener('click',()=>writeTask(()=>plugin.toggleProjectTaskDay(path,node.reference,date)));
      }
      panel.addEventListener('toggle',event=>{
        if(event.newState==='closed'&&panel.isConnected&&plugin.taskDayPanels.get(scope+'::days:'+path+'::'+node.key)===state){
          plugin.taskDayPanels.delete(scope+'::days:'+path+'::'+node.key);dayCache.delete(node.key);
          const currentAnchor=taskCache.get(node.key)?.row.querySelector('[data-gtd-task-arrange]')||anchor;
          currentAnchor.setAttribute('aria-expanded','false');currentAnchor.classList.toggle('is-active',node.days.length>0);item.remove();
        }
      });
      window.requestAnimationFrame(()=>{
        if(!panel.isConnected||!anchor.getClientRects().length||state.ownerLeaf!==app.workspace.activeLeaf?.id||!app.workspace.activeLeaf.view.containerEl.contains(anchor))return;
        panel.showPopover();plugin.activeDayPopover=panel;
        const box=anchor.getBoundingClientRect(),size=panel.getBoundingClientRect();
        panel.style.left=Math.max(8,Math.min(box.left,window.innerWidth-size.width-8))+'px';
        panel.style.top=Math.max(8,box.bottom+size.height+4<window.innerHeight?box.bottom+4:box.top-size.height-4)+'px';
      });
      dayCache.set(node.key,{item,month:state.month,state});return item;
    }
    function addEditor(parent,state,orphaned=false) {
      mounted.add(state.key);
      seenEntries.add(state.key);
      const saved=entryCache.get(state.key);
      const updateEntry=cache=>{
        const input=cache.input,wasBusy=cache.busy;cache.busy=state.busy;cache.form.dataset.gtdOrphaned=String(!!orphaned);
        if(document.activeElement!==input||wasBusy&&!state.busy){input.value=state.draft;if(wasBusy&&!state.busy)input.setSelectionRange(state.selectionStart??input.value.length,state.selectionEnd??input.value.length);}
        input.disabled=false;input.readOnly=state.busy;cache.submit.disabled=state.busy||orphaned;
        const error=orphaned?'父任务已变化，请保留输入内容并重新选择父任务':state.error;
        let notice=cache.form.querySelector('.gtd-inline-error');if(error&&!notice)notice=cache.form.createDiv({cls:'gtd-inline-error gtd-form-error',attr:{role:'alert'}});if(notice){notice.textContent=error||'';notice.hidden=!error;}
      };
      if(saved){updateEntry(saved);return saved.item;}
      const item=parent.createEl('li',{cls:'gtd-inline-task-item'});
      const entryDepth=Number(parent.closest('li[data-task-depth]')?.dataset.taskDepth??-1)+1;
      item.dataset.taskColorLevel=String(entryDepth%8);
      const form=item.createEl('form',{cls:'gtd-inline-task-entry'});form.noValidate=true;
      form.dataset.parentKey=state.parentKey;form.dataset.projectPath=path;form.dataset.gtdInlineEntryKey=state.key;
      const line=form.createDiv({cls:'gtd-inline-task-line'});
      const input=line.createEl('input',{attr:{type:'text','aria-label':state.parentKey?'子任务名称':'任务名称',placeholder:state.parentKey?'输入子任务，Enter 添加':'输入任务，Enter 添加',autocomplete:'off'}});
      input.value=state.draft;input.readOnly=state.busy;
      const submit=line.createEl('button',{text:'添加',attr:{type:'submit'}});submit.disabled=state.busy||orphaned;
      const close=line.createEl('button',{text:'×',cls:'gtd-task-action',attr:{type:'button','aria-label':'收起任务输入框',title:'收起输入框'}});
      close.dataset.gtdInlineClose='true';close.addEventListener('click',()=>plugin.closeInlineTaskEntry(state.key));
      const remember=()=>{state.draft=input.value;state.selectionStart=input.selectionStart;state.selectionEnd=input.selectionEnd;};
      input.addEventListener('input',remember);input.addEventListener('select',remember);
      input.addEventListener('focus',()=>{state.ownerLeaf=app.workspace.activeLeaf?.id;plugin.inlineTaskFocusKey=state.key;});
      input.addEventListener('blur',event=>{remember();if(event.relatedTarget&&!form.contains(event.relatedTarget)&&plugin.inlineTaskFocusKey===state.key)plugin.inlineTaskFocusKey='';});
      input.addEventListener('keydown',event=>{
        if(event.isComposing||event.keyCode===229)return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();input.blur();plugin.closeInlineTaskEntry(state.key);}
        else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(form.dataset.gtdOrphaned!=='true')form.requestSubmit();}
      });
      form.addEventListener('submit',event=>{
        event.preventDefault();if(form.dataset.gtdOrphaned==='true'||state.busy)return;
        state.draft=input.value;plugin.inlineTaskFocusKey=state.key;
        if(!state.draft.trim())return;
        input.readOnly=true;submit.disabled=true;plugin.saveInlineTaskEntry(state);
      });
      const error=orphaned?'父任务已变化，请保留输入内容并重新选择父任务':state.error;
      if(error)form.createDiv({cls:'gtd-inline-error gtd-form-error',text:error,attr:{role:'alert'}});
      window.requestAnimationFrame(()=>{
        if(!state.busy&&form.isConnected&&form.getClientRects().length&&plugin.inlineTaskFocusKey===state.key&&state.ownerLeaf===app.workspace.activeLeaf?.id&&app.workspace.activeLeaf?.view.file?.path===scope){input.focus({preventScroll:true});input.setSelectionRange(state.selectionStart??input.value.length,state.selectionEnd??input.value.length);}
      });
      const cache={item,form,input,submit,busy:state.busy};entryCache.set(state.key,cache);updateEntry(cache);return item;
    }
    function addNameEditor(parent,state,orphaned=false) {
      mountedTitles.add(state.key);
      renderNameInput(parent,state,'task',orphaned||busy);
    }
    function addNode(parent,fresh,parentId=projectId) {
      seenTasks.add(fresh.key);
      let cached=taskCache.get(fresh.key);
      const node=cached?.node||fresh;if(cached)Object.assign(node,fresh);
      const visibleChildren=showCompleted?node.children:node.children.filter(isVisible);
      const titleEdit=titleEdits.find(state=>state.taskKey===node.key);
      const panelKey=scope+'::days:'+path+'::'+node.key,panelState=plugin.taskDayPanels.get(panelKey);
      const signature=JSON.stringify([node.title,node.status,node.due,node.days,node.done,node.total,node.children.length,!!visibleChildren.length,titleEdit?.key,titleEdit?.busy,titleEdit?.error,project.status]);
      const item=cached?.item||document.createElement('li');
      item.dataset.taskKey=node.key;item.dataset.taskDepth=String(node.depth);item.dataset.taskColorLevel=String(node.depth%8);
      let taskRow=cached?.row,childContainer=cached?.children,branch=cached?.branch;
      if(childContainer&&childContainer.parentElement!==(branch||item))(branch||item).append(childContainer);
      const changingStructure=!!branch!==!!visibleChildren.length;
      const focused=document.activeElement,editing=focused?.matches?.('input,textarea,select')&&!focused.disabled;
      const deferHeader=cached&&cached.signature!==signature&&(refreshGuard.isPointerWithin(taskRow)||changingStructure&&refreshGuard.isPointerWithin(item)||editing&&((taskRow.contains(focused)&&!titleEdit?.busy)||(changingStructure&&item.contains(focused))));
      if(deferHeader)refreshGuard.defer(path,renderTreeNow);
      if(!cached||cached.signature!==signature&&!deferHeader){
        keyboard.capture();
        taskRow?.remove();
        if(changingStructure){
          if(branch){if(childContainer)item.append(childContainer);branch.remove();branch=null;}
          if(visibleChildren.length){branch=document.createElement('details');branch.className='gtd-task-branch';item.prepend(branch);if(childContainer)branch.append(childContainer);}
        }
        if(visibleChildren.length){
          if(!branch){branch=document.createElement('details');branch.className='gtd-task-branch';item.prepend(branch);}
          const foldKey=scope+'::task:'+path+'::'+node.key;
          if(!cached||changingStructure)branch.open=plugin.projectTreeExpanded(foldKey,true);
          if(!branch.dataset.gtdBound){branch.dataset.gtdBound='true';branch.addEventListener('toggle',()=>plugin.setProjectTreeExpanded(foldKey,branch.open));}
          taskRow=branch.createEl('summary',{cls:'gtd-task-row'});branch.prepend(taskRow);
          if(!childContainer)childContainer=branch.createEl('ul',{cls:'gtd-task-list'});
        }else taskRow=item.createDiv({cls:'gtd-task-row gtd-task-leaf'});
        if(!branch)item.prepend(taskRow);
      taskRow.classList.toggle('is-completed',node.completed);taskRow.classList.toggle('is-cancelled',node.cancelled);
      const grip=taskRow.createSpan({text:'⋮⋮',cls:'gtd-drag-handle',attr:{draggable:'true',title:'拖动调整同级任务顺序','aria-label':'拖动排序任务：'+node.title}});grip.dataset.gtdTaskDrag='true';
      grip.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
      grip.addEventListener('dragstart',event=>{event.stopPropagation();if(busy){event.preventDefault();return;}plugin.draggedTask={path,reference:node.reference,parentLine:node.parentLine,section:node.section,width:node.width};plugin.draggedProject=null;event.dataTransfer.setData('application/x-gtd-task',path+':'+node.line);event.dataTransfer.effectAllowed='move';plugin.activeDayPopover?.hidePopover();});
      grip.addEventListener('dragend',()=>{plugin.draggedTask=null;clearDropMarks();});
      const allowedDrop=()=>{const from=plugin.draggedTask;return !busy&&from&&from.path===path&&from.reference.line!==node.line&&from.parentLine===node.parentLine&&from.section===node.section&&from.width===node.width;};
      taskRow.addEventListener('dragover',event=>{if(!allowedDrop())return;event.preventDefault();event.stopPropagation();clearDropMarks();taskRow.classList.add('gtd-drop-'+dropSide(event,taskRow));event.dataTransfer.dropEffect='move';});
      taskRow.addEventListener('dragleave',event=>{if(!taskRow.contains(event.relatedTarget))taskRow.classList.remove('gtd-drop-before','gtd-drop-after');});
      taskRow.addEventListener('drop',event=>{if(!allowedDrop())return;event.preventDefault();event.stopPropagation();const from=plugin.draggedTask,side=dropSide(event,taskRow);plugin.draggedTask=null;clearDropMarks();writeTask(()=>plugin.reorderProjectTask(path,from.reference,node.reference,side));});
      const checkbox=taskRow.createEl('input',{attr:{type:'checkbox','aria-label':'完成：'+(node.title||'未命名任务')}});
      checkbox.dataset.gtdTaskCheckbox='true';checkbox.dataset.taskKey=node.key;checkbox.dataset.cancelled=String(node.cancelled);
      checkbox.dataset.unavailable=String(node.cancelled);
      checkbox.checked=node.completed;checkbox.disabled=busy||node.cancelled;
      checkbox.addEventListener('click',e=>e.stopPropagation());
      checkbox.addEventListener('change',()=>writeTask(()=>plugin.toggleProjectTask(path,node.reference)));
      if(titleEdit)addNameEditor(taskRow,titleEdit);
      else{
        const name=taskRow.createEl('button',{text:node.title||'未命名任务',cls:'gtd-task-title gtd-task-title-edit',attr:{type:'button',title:'点击修改任务名称','aria-label':'修改任务名称：'+(node.title||'未命名任务')}});
        name.dataset.gtdTaskAction='rename';name.dataset.gtdTaskRename='true';name.disabled=busy;
        name.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!busy)plugin.beginTaskTitleEdit(scope,path,node);});
      }
      if(node.children.length)taskRow.createSpan({text:node.done+'/'+node.total,cls:'gtd-task-count'});
      const dates=taskRow.createSpan({cls:'gtd-task-dates'});
      for(const [field,label] of [['due','截止']]) {
        const wrap=dates.createEl('label',{cls:'gtd-task-date'});wrap.createSpan({text:label});
        const input=wrap.createEl('input',{attr:{type:'date','aria-label':label+'日期：'+node.title,title:label+'日期'}});
        input.value=node[field];input.dataset.gtdTaskDate=field;input.disabled=busy;
        input.addEventListener('click',event=>event.stopPropagation());
        input.addEventListener('change',()=>writeTask(()=>plugin.updateProjectTaskDate(path,node.reference,field,input.value)));
      }
      const today=dates.createEl('button',{text:'今',cls:'gtd-task-day-button',attr:{type:'button',title:node.days.includes(plugin.todayDateKey())?'移出今天':'加入今天','aria-label':node.days.includes(plugin.todayDateKey())?'移出今天：'+node.title:'加入今天：'+node.title,'aria-pressed':String(node.days.includes(plugin.todayDateKey()))}});
      today.dataset.gtdTaskToday='true';today.dataset.gtdTaskAction='today';today.dataset.unavailable=String(node.cancelled);today.disabled=busy||node.cancelled;
      today.classList.toggle('is-active',node.days.includes(plugin.todayDateKey()));
      today.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();writeTask(()=>plugin.toggleProjectTaskToday(path,node.reference));});
      const arrange=dates.createEl('button',{text:'排',cls:'gtd-task-day-button',attr:{type:'button',title:node.days.length?'已安排 '+node.days.length+' 天':'安排多个日期','aria-label':'安排日期：'+node.title,'aria-expanded':String(!!panelState)}});
      arrange.dataset.gtdTaskArrange='true';arrange.dataset.gtdTaskAction='arrange';arrange.dataset.unavailable=String(node.cancelled);arrange.disabled=busy||node.cancelled;
      arrange.classList.toggle('is-active',!!panelState||node.days.length>0);
      arrange.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleDayPanel(node);});
      const rowActions=taskRow.createSpan({cls:'gtd-task-actions'});
      const child=rowActions.createEl('button',{text:'＋',cls:'gtd-task-action',attr:{type:'button','aria-label':'添加子任务：'+node.title,title:node.completed||node.cancelled?'已完成或取消的任务不能添加子任务':'添加子任务'}});
      child.dataset.gtdTaskAction='add';child.dataset.gtdTaskAdd='true';child.dataset.unavailable=String(node.completed||node.cancelled||project.status==='done');
      child.disabled=busy||child.dataset.unavailable==='true';
      child.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        openInline(node);
      });
      const remove=rowActions.createEl('button',{text:'×',cls:'gtd-task-action gtd-task-delete',attr:{type:'button','aria-label':'删除任务：'+node.title,title:node.children.length?'删除任务及其子任务':'删除任务'}});
      remove.dataset.gtdTaskAction='delete';remove.dataset.gtdTaskDelete='true';remove.disabled=busy;
      remove.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        writeTask(async()=>{
          const receipt=await plugin.deleteProjectTask(path,node.reference);
          plugin.showTaskDeletionUndo(receipt,async()=>{if(tree.isConnected)await renderTree();});
        });
      });
        cached={item,node,row:taskRow,branch,children:childContainer,signature};taskCache.set(node.key,cached);
      }
      if(titleEdit)mountedTitles.add(titleEdit.key);
      const rowId=JSON.stringify([path,node.key]);
      const currentArrange=taskRow.querySelector('[data-gtd-task-arrange]');if(currentArrange){currentArrange.setAttribute('aria-expanded',String(!!panelState));currentArrange.classList.toggle('is-active',!!panelState||node.days.length>0);}
      keyboard.register(taskRow,{id:rowId,parent:parentId,label:'任务：'+node.title,expanded:()=>!!cached.branch?.open,
        toggle:cached.branch?value=>{cached.branch.open=value;plugin.setProjectTreeExpanded(scope+'::task:'+path+'::'+node.key,value);keyboard.refresh();}:null,
        rename:()=>taskRow.querySelector('[data-gtd-task-rename]')?.click(),add:()=>taskRow.querySelector('[data-gtd-task-add]')?.click(),
        remove:()=>taskRow.querySelector('[data-gtd-task-delete]')?.click(),today:()=>taskRow.querySelector('[data-gtd-task-today]')?.click()});
      const wanted=visibleChildren.map(child=>addNode(childContainer,child,rowId));
      const entry=entries.find(state=>state.parentKey===node.key);
      if(entry){if(!childContainer)childContainer=item.createEl('ul',{cls:'gtd-task-list'});wanted.push(addEditor(childContainer,entry,node.completed||node.cancelled||entry.referenceStale));}
      if(panelState){if(!childContainer)childContainer=item.createEl('ul',{cls:'gtd-task-list'});wanted.push(addDayPanel(childContainer,node,panelState,taskRow.querySelector('[data-gtd-task-arrange]')));}
      if(childContainer)reconcile(childContainer,wanted);
      cached.children=childContainer;
      return item;
    }
    const wanted=model.roots.filter(isVisible).map(node=>addNode(list,node));
    for(const entry of entries)if(!mounted.has(entry.key))wanted.push(addEditor(list,entry,!!entry.parentKey));
    for(const state of titleEdits)if(!mountedTitles.has(state.key)){
      let orphan=orphanCache.get(state.key);
      if(!orphan){orphan=document.createElement('li');orphan.className='gtd-inline-task-item';addNameEditor(orphan,state,true);orphanCache.set(state.key,orphan);}
      wanted.push(orphan);
    }
    reconcile(list,wanted);
    for(const key of taskCache.keys())if(!seenTasks.has(key))taskCache.delete(key);
    for(const key of entryCache.keys())if(!seenEntries.has(key))entryCache.delete(key);
    for(const key of dayCache.keys())if(!seenDays.has(key))dayCache.delete(key);
    for(const key of orphanCache.keys())if(!titleEdits.some(state=>state.key===key))orphanCache.delete(key);
    keyboard.refresh();
  }
  registerProjectEvent(app.workspace.on('gtd-inline-task-entry',(changedPath,change)=>{
    if(changedPath!==path||!tree.isConnected)return;
    if(change?.type==='hide'){
      for(const form of tree.querySelectorAll('form.gtd-inline-task-entry'))if(form.dataset.gtdInlineEntryKey===change.key){
        const item=form.closest('li.gtd-inline-task-item'),list=item?.parentElement;item?.remove();
        if(list&&!list.children.length){
          if(list.parentElement?.matches('li[data-task-key]'))list.remove();
          else if(list.parentElement===tree&&!tree.querySelector('.gtd-task-empty'))tree.createDiv({cls:'gtd-task-empty',text:'暂无任务'});
        }
      }
      for(const [key,cache]of entryCache)if(!cache.item.isConnected)entryCache.delete(key);
      refreshGuard.resume();keyboard.refresh();return;
    }
    renderTree().catch(error=>tree.createDiv({cls:'gtd-form-error',text:error.message||String(error)}));
  }));
  registerProjectEvent(app.workspace.on('gtd-task-day-changed',()=>{if(tree.isConnected)renderTree();}));
  registerProjectEvent(app.workspace.on('gtd-task-title-edit',changedPath=>{
    if(changedPath!==path||!tree.isConnected)return;
    for(const form of tree.querySelectorAll('form[data-gtd-task-title-editor]'))if(plugin.taskTitleEdits.get(form.dataset.gtdTaskTitleEditor)?.busy)form.querySelectorAll('input,button').forEach(control=>control.disabled=true);
    renderTree().catch(error=>tree.createDiv({cls:'gtd-form-error',text:error.message||String(error)}));
  }));
  async function setExpanded(value){
    expanded=value;detail.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));arrow.textContent=expanded?'▾':'▸';
    row.setAttribute('aria-expanded',String(expanded));plugin.setProjectTreeExpanded(projectState,expanded);
    if(expanded)await renderTree();keyboard.refresh();
  }
  toggle.addEventListener('click',()=>setExpanded(!expanded).catch(error=>tree.createDiv({cls:'gtd-form-error',text:error.message||String(error)})));
  treeRenderers.set(path,renderTree);
  await renderTree();
}
let projectUpdate;
async function updateProjects(){
  if(projectUpdate)return projectUpdate;
  projectUpdate=(async()=>{
    const pages=readPages();orderedPaths=pages.map(page=>page.file.path);const paths=new Set(orderedPaths);
    for(const [path,pair]of projectRows)if(!paths.has(path)){pair.dispose();pair.row.remove();pair.detail.remove();projectRows.delete(path);treeRenderers.delete(path);}
    for(const page of pages){const pair=projectRows.get(page.file.path);if(pair)await pair.update(page);else await createProjectView(page);}
    reorderProjectRows();
    if(!pages.length&&!body.children.length){const cell=body.createEl('tr').createEl('td',{text:'暂无项目'});cell.colSpan=6;}
    keyboard.finish();
  })();
  try{await projectUpdate;}finally{projectUpdate=null;}
}
refreshGuard.setUpdate(updateProjects);
await updateProjects();
} finally { finishView(); }
