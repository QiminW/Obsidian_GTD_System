const { Plugin, Modal, Notice, TFile, TFolder, Menu, MarkdownRenderChild, MarkdownRenderer, Component, setIcon } = require('obsidian');
const HOME = '00 GTD/首页.md';
const PROJECTS = '00 GTD/00 工作区/01 项目';
const INBOX = '00 GTD/00 工作区/00 功能页面/收件箱.md';
const AREAS = '00 GTD/00 工作区/02 领域';
const ARCHIVE = '00 GTD/00 工作区/99 归档';

class InboxView extends MarkdownRenderChild {
  constructor(plugin, element) { super(element);this.plugin=plugin; }
  onload() {
    this.disposed=false;this.rendering=0;
    const refresh=(file,oldPath)=>{if(file.path===INBOX||oldPath===INBOX)this.refresh();};
    for(const event of ['modify','create','delete','rename'])this.registerEvent(this.plugin.app.vault.on(event,refresh));
    this.refresh();
  }
  refresh() { this.render().catch(error=>{if(!this.disposed){this.containerEl.empty();this.containerEl.createDiv({cls:'gtd-form-error',text:error.message||String(error)});}}); }
  async render() {
    const ticket=++this.rendering, {app}=this.plugin;
    const file=app.vault.getAbstractFileByPath(INBOX);
    if(!(file instanceof TFile))throw new Error('找不到收件箱笔记');
    const model=logic.projectTaskTree(await app.vault.read(file));
    if(this.disposed||ticket!==this.rendering)return;
    const flat=nodes=>nodes.flatMap(node=>[node,...flat(node.children)]);
    const pending=flat(model.roots).filter(node=>!node.completed&&!node.cancelled&&node.status!=='_');
    const root=document.createElement('div');root.className='gtd-inbox';
    const component=new Component();this.addChild(component);
    const mutate=async action=>{
      if(this.busy||this.disposed)return;this.busy=true;root.querySelectorAll('button,input').forEach(control=>control.disabled=true);
      try{await action();}
      catch(error){new Notice(error.message||String(error));}
      finally{this.busy=false;if(!this.disposed)this.refresh();}
    };
    try {
      if(!pending.length)root.createDiv({cls:'gtd-task-empty',text:'暂无待整理事项'});
      for(const node of pending) {
        const row=root.createDiv({cls:'gtd-inbox-row'});row.dataset.gtdInboxRow='true';row.style.paddingLeft=(Math.min(node.depth,8)*16)+'px';
        const check=row.createEl('input',{attr:{type:'checkbox','aria-label':'完成收集项：'+node.title}});check.disabled=!!this.busy;
        const title=row.createDiv({cls:'gtd-inbox-title'});
        await MarkdownRenderer.render(app,node.title||'未命名事项',title,INBOX,component);
        if(node.due)row.createSpan({text:node.due,cls:'gtd-inbox-due',attr:{title:'截止日期'}});
        const move=row.createEl('button',{text:'移入',cls:'gtd-inbox-move',attr:{type:'button',title:node.children.length?'移入项目，包含子任务及说明':'移入项目','aria-label':'移入项目：'+node.title}});
        move.dataset.gtdInboxMove='true';move.disabled=!!this.busy;
        move.addEventListener('click',()=>this.plugin.openInboxMoveModal({reference:node.reference,title:node.title}));
        const remove=row.createEl('button',{text:'×',cls:'gtd-inbox-delete',attr:{type:'button',title:'删除收集项，包含子任务和说明','aria-label':'删除收集项：'+node.title}});
        remove.dataset.gtdInboxDelete='true';remove.disabled=!!this.busy;
        remove.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();mutate(async()=>{
          const receipt=await this.plugin.deleteProjectTask(INBOX,node.reference);
          this.plugin.showTaskDeletionUndo(receipt,()=>{if(!this.disposed)this.refresh();});
        });});
        check.addEventListener('change',()=>mutate(()=>this.plugin.toggleInboxTask(node.reference)));
      }
      if(this.disposed||ticket!==this.rendering){this.removeChild(component);return;}
      if(this.renderComponent)this.removeChild(this.renderComponent);
      this.renderComponent=component;this.containerEl.replaceChildren(root);
    } catch(error){this.removeChild(component);throw error;}
  }
  onunload() { this.disposed=true;this.rendering++; }
}

class EntryModal extends Modal {
  constructor(plugin, title, kind) {
    super(plugin.app);
    this.plugin = plugin;
    this.title = title;
    this.kind = kind;
  }
  onOpen() {
    this.entryClosed = false;
    this.contentEl.addClass('gtd-action-modal');
    this.contentEl.createEl('h2', { text: this.title });
    this.form = this.contentEl.createEl('form', { cls: 'gtd-entry-form' });
    this.form.dataset.gtdForm = this.kind;
    this.fields = {};
    this.fieldsEl = this.form.createEl('fieldset', { cls: 'gtd-form-fields' });
    this.buildFields();
    this.errorEl = this.form.createEl('div', { cls: 'gtd-form-error', attr: { role: 'alert', 'aria-live': 'polite' } });
    const actions = this.form.createEl('div', { cls: 'gtd-form-actions' });
    const cancel = actions.createEl('button', { text: '关闭', attr: { type: 'button' } });
    cancel.addEventListener('click', () => this.close());
    const labels = { task: '添加任务', project: '创建项目', capture: '收集', area: '创建领域', move:'移入' };
    const submit = actions.createEl('button', { text: labels[this.kind], cls: 'mod-cta', attr: { type: 'submit' } });
    this.form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      this.fieldsEl.disabled = true;
      this.errorEl.textContent = '';
      let saved = false;
      try {
        await this.beforeSave();
        const data = Object.fromEntries(Object.entries(this.fields).map(([key, input]) => [key, input.value]));
        await this.save(data);
        if (!this.entryClosed) { await this.afterSave(data); saved = true; }
      } catch (error) {
        this.errorEl.textContent = error.message || String(error);
      } finally {
        submit.disabled = false;
        this.fieldsEl.disabled = false;
      }
      if (saved && !this.entryClosed) (this.fields.title || this.fields.name)?.focus();
    });
    window.setTimeout(() => this.fields.title?.focus() || this.fields.name?.focus(), 0);
  }
  field(name, label, type = 'text', options = []) {
    const wrap = this.fieldsEl.createEl('label', { cls: 'gtd-form-field' });
    wrap.createEl('span', { text: label });
    const input = type === 'select' ? wrap.createEl('select') : wrap.createEl('input', { attr: { type } });
    input.name = name;
    input.setAttribute('aria-label', label);
    for (const option of options) input.createEl('option', { text: option.label, attr: { value: option.value } });
    this.fields[name] = input;
    return input;
  }
  async beforeSave() {}
  async afterSave() {
    const primary = this.fields.title || this.fields.name;
    if (primary) primary.value = '';
  }
  onClose() { this.entryClosed = true; this.contentEl.empty(); }
}

class QuickTaskModal extends EntryModal {
  constructor(plugin, context = {}) { super(plugin, '快速添加任务', 'task'); this.context = context; }
  buildFields() {
    this.field('title', '任务名称').required = true;
    this.buildDestinationFields();
    this.field('scheduled', '计划日期', 'date');
    this.field('due', '截止日期', 'date');
  }
  buildDestinationFields() {
    const choices = this.plugin.listProjects().map(file => ({ value: file.path, label: file.path.slice(PROJECTS.length+1).replace(/\.md$/,'').replaceAll('/',' / ') }));
    const project = this.field('project', '所属项目', 'select', choices);
    project.required = true;
    if (!choices.length) project.createEl('option', { text: '请先新建项目', attr: { value: '' } });
    const preferred = this.context.project || this.plugin.data.lastProject;
    project.value = choices.some(c => c.value === preferred) ? preferred : (choices[0]?.value || '');
    this.field('parent', '父任务', 'select', [{ value: '', label: '无（创建顶层任务）' }]);
    this.parentLoaded = this.refreshParents(project.value, this.context.parent, !!this.context.parent);
    project.addEventListener('change', () => { this.parentLoaded = this.refreshParents(project.value); });
  }
  async beforeSave() {
    await this.parentLoaded;
    if (this.parentError) throw new Error(this.parentError);
  }
  async save(data) {
    await this.parentLoaded;
    if (this.parentError) throw new Error(this.parentError);
    try {
      await this.plugin.addTask(data);
    } catch (error) {
      if (data.parent) this.parentLoaded = this.refreshParents(this.fields.project.value);
      throw error;
    }
    new Notice('任务已添加');
  }
  async afterSave(data) {
    const previous = data.parent ? JSON.parse(data.parent) : null;
    this.parentLoaded = this.refreshParents(data.project, previous);
    await this.parentLoaded;
    await super.afterSave(data);
    await this.context.onSaved?.();
  }
  async refreshParents(path, retain = null, strict = false) {
    const version = this.parentLoadVersion = (this.parentLoadVersion || 0) + 1;
    const select = this.fields.parent;
    select.empty();
    select.createEl('option', { text: '无（创建顶层任务）', attr: { value: '' } });
    select.disabled = true;
    this.parentError = '';
    if (this.errorEl) this.errorEl.textContent = '';
    try {
      const parents = path ? await this.plugin.listParentTasks(path) : [];
      if (version !== this.parentLoadVersion) return;
      for (const task of parents) {
        select.createEl('option', { text: '　'.repeat(task.depth) + task.label, attr: { value: JSON.stringify({ line: task.line, raw: task.raw, version: task.version }) } });
      }
      if (retain) {
        const selected = strict ? parents.find(task => task.line === retain.line && task.raw === retain.raw && task.version === retain.version) : logic.retainedParent(parents, retain);
        if (selected) select.value = JSON.stringify({ line: selected.line, raw: selected.raw, version: selected.version });
        else if (strict) throw new Error('父任务已变化，请刷新任务树后重新点击加号');
        else new Notice('父任务已变化，请重新选择父任务');
      }
      select.disabled = false;
    } catch (error) {
      if (version === this.parentLoadVersion) {
        this.parentError = error.message || '无法读取父任务';
        if (this.errorEl) this.errorEl.textContent = this.parentError;
      }
    }
  }
}

class InboxMoveModal extends QuickTaskModal {
  constructor(plugin, context) { super(plugin,context);this.title='移入项目';this.kind='move'; }
  buildFields() {
    this.fieldsEl.createDiv({text:this.context.title,cls:'gtd-move-summary'});
    this.buildDestinationFields();
  }
  async save(data) {
    try { await this.plugin.moveInboxTask(this.context.reference,data.project,data.parent?JSON.parse(data.parent):null); }
    catch(error) {
      if(data.parent){this.parentLoaded=this.refreshParents(data.project);await this.parentLoaded;}
      throw error;
    }
    new Notice('已移入所选项目');
  }
  async afterSave() { this.close(); }
}

class QuickCaptureModal extends EntryModal {
  constructor(plugin) { super(plugin, '快速收集', 'capture'); }
  buildFields() { this.field('title', '收集内容').required = true; }
  async save(data) {
    await this.plugin.captureTask(data);
    new Notice('已收集到收件箱');
  }
}

class QuickAreaModal extends EntryModal {
  constructor(plugin) { super(plugin, '新建领域', 'area'); }
  buildFields() { this.field('name', '领域名称').required = true; }
  async save(data) {
    const area = await this.plugin.createArea(data);
    new Notice('领域已创建：' + area.name);
  }
}

class QuickProjectModal extends EntryModal {
  constructor(plugin) { super(plugin, '新建项目', 'project'); }
  buildFields() {
    this.field('name', '项目名称').required = true;
    this.field('folder', '所属领域', 'select', this.plugin.listAreas().map(area => ({ value: area.path, label: area.label })));
    this.field('outcome', '完成标准');
    this.field('deadline', '项目截止日期', 'date');
  }
  async save(data) {
    const file = await this.plugin.createProject(data);
    new Notice('项目已创建：' + file.basename);
  }
}

module.exports = class GtdQuickActions extends Plugin {
  async onload() {
    this.data = (await this.loadData()) || {};
    this.inlineTaskEntries = new Map();
    this.inlineTaskFocusKey = '';
    this.taskTitleEdits = new Map();
    this.taskTitleFocusKey = '';
    this.projectNameEdits = new Map();
    this.projectNameFocusKey = '';
    this.nameEditRequest = 0;
    this.taskDayPanels = new Map();
    this.currentDayKey = this.todayDateKey();
    this.registerMarkdownCodeBlockProcessor('gtd-inbox',(_source,element,context)=>context.addChild(new InboxView(this,element)));
    this.registerMarkdownCodeBlockProcessor('gtd-actions', (_source, element) => {
      const actions = element.createDiv({ cls: 'gtd-quick-actions' });
      const capture = actions.createEl('button', { text: '快速收集', cls: 'mod-cta' });
      capture.dataset.gtdAction = 'capture';
      capture.addEventListener('click', () => this.openCaptureModal());
    });
    this.addCommand({ id: 'add-task', name: '快速添加任务', callback: () => this.openInlineTaskFromCommand() });
    this.addCommand({ id: 'new-project', name: '新建项目', callback: () => this.openProjectModal() });
    this.addCommand({ id: 'capture', name: '快速收集', callback: () => this.openCaptureModal() });
    this.addCommand({ id: 'new-area', name: '新建领域', callback: () => this.openAreaModal() });
    this.addCommand({ id: 'home', name: '返回首页', callback: () => this.openHome() });
    const schedule = () => {
      window.clearTimeout(this.navigationTimer);
      this.navigationTimer = window.setTimeout(() => { this.installBoardNavigation(); this.installTaskCalendarBridge(); }, 80);
    };
    this.registerEvent(this.app.workspace.on('layout-change', schedule));
    this.registerEvent(this.app.workspace.on('active-leaf-change', schedule));
    this.registerEvent(this.app.workspace.on('file-open', schedule));
    this.app.workspace.onLayoutReady(schedule);
    this.register(() => window.clearTimeout(this.navigationTimer));
    this.register(() => this.calendarBridge?.restore());
    const hideDayPopover = event => { const panel = this.activeDayPopover; if (panel?.isConnected && panel.matches(':popover-open') && !panel.contains(event?.target)) panel.hidePopover(); };
    this.registerDomEvent(document, 'scroll', hideDayPopover, true);
    this.registerDomEvent(window, 'resize', hideDayPopover);
    this.registerDomEvent(document,'click',event=>this.handleInlineEntryOutsideClick(event),true);
    this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>{
      if(!Array.isArray(this.data.projectOrder))return;
      let changed=false;
      this.data.projectOrder=this.data.projectOrder.map(path=>{if(path===oldPath||path.startsWith(oldPath+'/')){changed=true;return file.path+path.slice(oldPath.length);}return path;});
      if(changed)this.saveData(this.data);
    }));
    this.registerInterval(window.setInterval(() => {
      const day = this.todayDateKey();
      if (day !== this.currentDayKey) { this.currentDayKey = day; this.app.workspace.trigger('gtd-task-day-changed'); }
    }, 30000));
    await this.migrateLegacyPlanningDates();
    this.installTaskCalendarBridge();
  }
  todayDateKey() { return window.moment().format('YYYY-MM-DD'); }
  orderedProjectPaths(paths) { return logic.orderProjectPaths(paths,this.data.projectOrder); }
  async moveProjectDisplay(source,target,side) {
    const paths=this.app.vault.getMarkdownFiles().filter(file=>file.path.startsWith(PROJECTS+'/')).sort((a,b)=>a.basename.localeCompare(b.basename,'zh-CN')).map(file=>file.path);
    this.data.projectOrder=logic.moveDisplayItem(this.orderedProjectPaths(paths),source,target,side);
    await this.saveData(this.data);this.app.workspace.trigger('gtd-project-order-changed');
  }
  async reorderProjectTask(path,source,target,side) {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||!path.startsWith(PROJECTS+'/')||file.extension!=='md')throw new Error('找不到项目笔记');
    let failure;
    await this.app.vault.process(file,content=>{try{return logic.moveSiblingTask(content,source,target,side);}catch(error){failure=error;return content;}});
    if(failure)throw failure;
  }
  installTaskCalendarBridge() {
    const calendar = this.app.plugins.plugins['tasks-calendar'];
    if (this.calendarBridge?.calendar === calendar && this.calendarBridge?.store === calendar?.taskStore) return;
    this.calendarBridge?.restore();
    this.calendarBridge = installTaskCalendarBridge(this, logic, Notice);
  }
  async migrateLegacyPlanningDates() {
    for (const file of this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith('00 GTD/') && !file.path.includes('/99 归档/'))) {
      const text = await this.app.vault.read(file);
      if (!text.includes('⏳') && !text.includes('gtd-days:')) continue;
      let failure;
      await this.app.vault.process(file, content => {
        try { return logic.migrateTaskDays(content); } catch (error) { failure = error; return content; }
      });
      if (failure) new Notice(file.basename + '：' + (failure.message || String(failure)));
    }
  }
  async mutateCalendarTask(task, change) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile) || !file.path.startsWith('00 GTD/') || file.extension !== 'md') throw new Error('找不到任务笔记');
    let result, failure;
    await this.app.vault.process(file, content => {
      try { result = change(content, logic.calendarTaskReference(content, task)); return typeof result === 'string' ? result : result.content; }
      catch (error) { failure = error; return content; }
    });
    if (failure) throw failure;
    return result;
  }
  async toggleProjectTaskDay(path, reference, date) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !path.startsWith(PROJECTS + '/') || file.extension !== 'md') throw new Error('找不到项目笔记');
    let failure;
    await this.app.vault.process(file, content => {
      try { return logic.setProjectTaskDay(content, reference, date); }
      catch (error) { failure = error; return content; }
    });
    if (failure) throw failure;
  }
  async toggleProjectTaskToday(path, reference) { return this.toggleProjectTaskDay(path, reference, this.todayDateKey()); }
  listProjects() {
    return this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(PROJECTS + '/') && this.app.metadataCache.getFileCache(file)?.frontmatter?.status !== 'done').sort((a,b) => a.basename.localeCompare(b.basename, 'zh-CN'));
  }
  listAreas() {
    const root = this.app.vault.getAbstractFileByPath(PROJECTS);
    return (root?.children || []).filter(file => file instanceof TFolder).sort((a,b) => a.name.localeCompare(b.name)).map(folder => ({ path: folder.path, label: folder.name.replace(/^\d+\s*/, '') }));
  }
  rememberProject(path) {
    this.data.lastProject = path;
    this.saveData(this.data).catch(error => console.error('GTD 快捷操作：未能保存上次选择的项目', error));
  }
  async addTask(data) {
    const taskLine = logic.buildTaskLine(data);
    const path = data.project || INBOX;
    if (path !== INBOX && !this.listProjects().some(file => file.path === path)) throw new Error('所选项目不存在或已完成，请重新选择');
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== 'md') throw new Error('找不到任务文件');
    let parent = null;
    if (data.parent) {
      try { parent = typeof data.parent === 'string' ? JSON.parse(data.parent) : data.parent; }
      catch { throw new Error('请重新选择父任务'); }
    }
    await this.app.vault.process(file, content => parent ? logic.insertSubtask(content, taskLine, parent) : logic.insertTask(content, taskLine, path === INBOX ? 'inbox' : 'project'));
    if (path !== INBOX) this.rememberProject(path);
    return file;
  }
  async captureTask(data) { return this.addTask({ title: data.title, project: INBOX }); }
  async toggleInboxTask(reference) {
    const file=this.app.vault.getAbstractFileByPath(INBOX),api=this.app.plugins.plugins['obsidian-tasks-plugin']?.apiV1;
    if(!(file instanceof TFile))throw new Error('找不到收件箱笔记');
    if(!api?.executeToggleTaskDoneCommand)throw new Error('请先启用 Tasks 插件');
    let failure;
    await this.app.vault.process(file,content=>{try{return logic.replaceProjectTask(content,reference,logic.preserveTaskDays(reference.raw,api.executeToggleTaskDoneCommand(logic.stripTaskDays(reference.raw),INBOX)));}catch(error){failure=error;return content;}});
    if(failure)throw failure;
  }
  openInboxMoveModal(context) { const modal=new InboxMoveModal(this,context);modal.open();return modal; }
  async moveInboxTask(reference,path,parent=null) {
    if(this.movingInboxTask)throw new Error('正在移入，请稍候');
    if(!this.listProjects().some(file=>file.path===path))throw new Error('所选项目不可用，请重新选择');
    const source=this.app.vault.getAbstractFileByPath(INBOX),target=this.app.vault.getAbstractFileByPath(path);
    if(!(source instanceof TFile)||!(target instanceof TFile))throw new Error('找不到收件箱或项目笔记');
    this.movingInboxTask=true;
    try {
      const [beforeSource,beforeTarget]=await Promise.all([this.app.vault.read(source),this.app.vault.read(target)]);
      const plan=logic.prepareInboxMove(beforeSource,reference,beforeTarget,parent);
      const compareWrite=async(file,expected,next,isSource=false)=>{
        if(isSource&&(source.path!==INBOX||target.path!==path||!this.listProjects().some(item=>item.path===path)))throw new Error('目标项目已变化，收集项仍保留');
        let failure;
        await this.app.vault.process(file,current=>{if(current!==expected){failure=new Error('笔记内容已变化，请重新选择后移入');return current;}return next;});
        if(failure)throw failure;
      };
      await logic.commitInboxMove(plan,(expected,next)=>compareWrite(source,expected,next,true),(expected,next)=>compareWrite(target,expected,next));
      this.rememberProject(path);
    } finally {this.movingInboxTask=false;}
  }
  showProjectMenu(path,event) {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||!path.startsWith(PROJECTS+'/')){new Notice('找不到项目笔记');return;}
    const done=this.app.metadataCache.getFileCache(file)?.frontmatter?.status==='done';
    const menu=new Menu();
    menu.addItem(item=>item.setTitle(done?'恢复进行中':'完成项目').setIcon(done?'rotate-ccw':'check').onClick(()=>this.setProjectStatus(path,done?'active':'done').catch(error=>new Notice(error.message||String(error)))));
    menu.addItem(item=>item.setTitle('归档项目').setIcon('archive').onClick(()=>this.archiveProject(path).catch(error=>new Notice(error.message||String(error)))));
    menu.showAtMouseEvent(event);
  }
  async setProjectStatus(path,status) {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||!path.startsWith(PROJECTS+'/')||file.extension!=='md')throw new Error('找不到项目笔记');
    if(!['active','done'].includes(status))throw new Error('未知项目状态');
    await this.app.fileManager.processFrontMatter(file,frontmatter=>{frontmatter.status=status;});
    new Notice(status==='done'?'项目已完成，可在项目总览中恢复或归档':'项目已恢复进行中');
  }
  async updateProjectDeadline(path,value,expected) {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||!path.startsWith(PROJECTS+'/')||file.extension!=='md')throw new Error('找不到项目笔记');
    const deadline=logic.projectDeadlineValue(value);
    await this.app.fileManager.processFrontMatter(file,frontmatter=>{
      if(file.path!==path)throw new Error('项目位置已变化，请刷新后重试');
      if(expected!==undefined&&String(frontmatter.deadline??'')!==expected)throw new Error('项目截止日期已变化，请刷新后重新选择');
      if(deadline)frontmatter.deadline=deadline;else delete frontmatter.deadline;
    });
    return deadline;
  }
  async archiveProject(path) {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||!path.startsWith(PROJECTS+'/')||file.extension!=='md')throw new Error('找不到项目笔记');
    const destination=ARCHIVE+'/'+path.slice(PROJECTS.length+1);
    if(this.app.vault.getAbstractFileByPath(destination))throw new Error('归档中已存在同名项目，请先更改项目名称');
    const segments=destination.split('/').slice(0,-1);let folder='';
    for(const part of segments){folder+=(folder?'/':'')+part;const existing=this.app.vault.getAbstractFileByPath(folder);if(existing&&!(existing instanceof TFolder))throw new Error('归档路径被同名文件占用');if(!existing)await this.app.vault.createFolder(folder);}
    if(file.path!==path)throw new Error('项目位置已变化，请刷新后归档');
    await this.app.fileManager.renameFile(file,destination);
    new Notice('项目已归档，任务和记录均已保留');
    return file;
  }
  async listParentTasks(path) {
    if (!this.listProjects().some(file => file.path === path)) throw new Error('所选项目不可用，请重新选择');
    const file = this.app.vault.getAbstractFileByPath(path);
    return logic.listParentTasks(await this.app.vault.read(file));
  }
  beginInlineTaskEntry(scope, path, parent = null) {
    if (!this.listProjects().some(file => file.path === path)) throw new Error('所选项目不可用，请刷新后重试');
    const key = JSON.stringify([scope, path, parent?.key || '']);
    const state = this.inlineTaskEntries.get(key) || { key, scope, project: path, parentKey: parent?.key || '', draft: '', busy: false };
    if (!state.busy) { state.reference = parent?.reference || null; state.error = ''; }
    state.hidden=false;
    this.inlineTaskEntries.set(key, state); this.inlineTaskFocusKey = key;
    return state;
  }
  inlineTaskEntriesFor(scope, path) {
    return [...this.inlineTaskEntries.values()].filter(state => state.scope === scope && state.project === path && !state.hidden);
  }
  handleInlineEntryOutsideClick(event) {
    const form=event.target?.closest?.('form.gtd-inline-task-entry');
    for(const state of [...this.inlineTaskEntries.values()]){
      if(state.hidden||form?.dataset.gtdInlineEntryKey===state.key)continue;
      if(form&&!form.dataset.gtdInlineEntryKey&&form.dataset.projectPath===state.project&&form.dataset.parentKey===state.parentKey)continue;
      this.hideInlineTaskEntry(state.key);
    }
  }
  hideInlineTaskEntry(key) {
    const state=this.inlineTaskEntries.get(key);if(!state)return;
    state.hidden=true;
    if(!state.busy&&!state.draft.trim())this.inlineTaskEntries.delete(key);
    if(this.inlineTaskFocusKey===key)this.inlineTaskFocusKey='';
    this.app.workspace.trigger('gtd-inline-task-entry',state.project,{type:'hide',key});
  }
  closeInlineTaskEntry(key) {
    const state = this.inlineTaskEntries.get(key);
    this.inlineTaskEntries.delete(key);
    if (this.inlineTaskFocusKey === key) this.inlineTaskFocusKey = '';
    if (state) this.app.workspace.trigger('gtd-inline-task-entry', state.project);
  }
  async saveInlineTaskEntry(state) {
    if (state.busy || !state.draft.trim() || this.inlineTaskEntries.get(state.key) !== state) return;
    state.busy = true; state.error = '';
    const previous = state.reference, draft = state.draft;
    this.app.workspace.trigger('gtd-inline-task-entry', state.project);
    try {
      if (state.parentKey && !previous) throw new Error('父任务已变化，请重新点击加号');
      await this.addTask({ title: draft, project: state.project, parent: previous });
      if (state.draft === draft) state.draft = '';
      if (previous) {
        const selected = logic.retainedParent(await this.listParentTasks(state.project), previous);
        if (selected) state.reference = { line: selected.line, raw: selected.raw, version: selected.version };
        else state.error = '任务已添加，父任务已变化，请重新点击加号';
      }
    } catch (error) { state.error = error.message || String(error); }
    finally {
      state.busy=false;
      if(state.hidden&&!state.draft.trim())this.inlineTaskEntries.delete(state.key);
      if(state.hidden&&state.error)new Notice(state.error);
      this.app.workspace.trigger('gtd-inline-task-entry',state.project);
    }
  }
  async openInlineTaskFromCommand() {
    await this.openHome();
    const leaf = this.app.workspace.activeLeaf;
    if (leaf.view.getViewType() === 'markdown' && leaf.view.getMode() !== 'preview') await leaf.setViewState({ type: 'markdown', state: { file: HOME, mode: 'preview' } });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const rows = [...leaf.view.containerEl.querySelectorAll('.markdown-preview-view tr[data-project-path]')].filter(item => item.querySelector('[data-gtd-project-add]') && !item.querySelector('[data-gtd-project-add]').disabled);
      const row = rows.find(item => item.dataset.projectPath === this.data.lastProject) || rows[0];
      if (row) { row.querySelector('[data-gtd-project-add]').click(); return; }
      if (leaf.view.containerEl.querySelector('.markdown-preview-view .gtd-project-progress')) break;
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    new Notice('请先新建一个项目');
  }
  async readProjectTaskTree(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !path.startsWith(PROJECTS + '/') || file.extension !== 'md') throw new Error('找不到项目笔记');
    const model=logic.projectTaskTree(await this.app.vault.read(file));
    return {...model,completedDisplay:logic.partitionCompletedTasks(model.roots)};
  }
  renderTaskVisibilityButton(button,showCompleted) {
    setIcon(button,showCompleted?'eye':'eye-off');
    const label=showCompleted?'隐藏已完成任务':'显示已完成任务';
    button.setAttribute('aria-label',label);button.setAttribute('title',label);
    button.setAttribute('aria-pressed',String(showCompleted));
  }
  async prepareNameEdit(kind,key) {
    const request=++this.nameEditRequest,changes=[];
    for(const [otherKind,states] of [['task',this.taskTitleEdits],['project',this.projectNameEdits]])for(const state of [...states.values()]){
      if(otherKind===kind&&state.key===key)continue;
      if(!await this.saveNameEdit(state,otherKind)||request!==this.nameEditRequest)return false;
      if(state.savedChange)changes.push(state.savedChange);
    }
    return request===this.nameEditRequest?{changes}:false;
  }
  saveNameEdit(state,kind) { return kind==='project'?this.saveProjectNameEdit(state):this.saveTaskTitleEdit(state); }
  closeNameEdit(key,kind) { return kind==='project'?this.closeProjectNameEdit(key):this.closeTaskTitleEdit(key); }
  async beginTaskTitleEdit(scope,path,node) {
    const prepared=await this.prepareNameEdit('task',JSON.stringify([scope,path,node.key]));if(!prepared)return;
    for(const change of prepared.changes)if(change.path===path&&(!change.file||this.app.vault.getAbstractFileByPath(change.newPath||path)===change.file)){
      const flatten=nodes=>nodes.flatMap(item=>[item,...flatten(item.children)]);
      const before=flatten(change.before.roots).find(item=>item.line===node.reference.line&&item.reference.raw===node.reference.raw&&item.reference.version===node.reference.version);
      if(before){node=flatten(change.after.roots).find(item=>item.line===before.line)||node;path=change.newPath||path;}
    }
    const key=JSON.stringify([scope,path,node.key]);
    let state=this.taskTitleEdits.get(key);
    if(!state){
      const draft=logic.editableTaskName(node.reference.raw);
      state={key,scope,project:path,taskKey:node.key,reference:node.reference,draft,original:draft,busy:false,error:'',selectionStart:0,selectionEnd:draft.length};
      this.taskTitleEdits.set(key,state);
    }
    state.ownerLeaf=this.app.workspace.activeLeaf?.id;this.taskTitleFocusKey=key;
    this.app.workspace.trigger('gtd-task-title-edit',path);
    return state;
  }
  taskTitleEditsFor(scope,path) { return [...this.taskTitleEdits.values()].filter(state=>state.scope===scope&&state.project===path); }
  closeTaskTitleEdit(key) {
    const state=this.taskTitleEdits.get(key);if(!state||state.busy)return;
    this.taskTitleEdits.delete(key);if(this.taskTitleFocusKey===key)this.taskTitleFocusKey='';
    this.app.workspace.trigger('gtd-task-title-edit',state.project);
  }
  saveTaskTitleEdit(state) {
    if(state.savePromise)return state.savePromise;
    if(this.taskTitleEdits.get(state.key)!==state)return Promise.resolve(true);
    if(!state.draft.trim()||state.draft.trim()===(state.original??logic.editableTaskName(state.reference.raw))){this.closeTaskTitleEdit(state.key);return Promise.resolve(true);}
    state.busy=true;state.error='';this.app.workspace.trigger('gtd-task-title-edit',state.project);
    state.savePromise=(async()=>{
      try{
        state.savedChange=await this.renameProjectTask(state.project,state.reference,state.draft);
        this.taskTitleEdits.delete(state.key);if(this.taskTitleFocusKey===state.key)this.taskTitleFocusKey='';return true;
      }catch(error){state.error=error.message||String(error);this.taskTitleFocusKey=state.key;return false;}
      finally{state.busy=false;state.savePromise=null;this.app.workspace.trigger('gtd-task-title-edit',state.project);}
    })();
    return state.savePromise;
  }
  async beginProjectNameEdit(scope,path,name) {
    const prepared=await this.prepareNameEdit('project',JSON.stringify([scope,path]));if(!prepared)return;
    for(const change of prepared.changes)if(change.path===path&&change.newPath&&this.app.vault.getAbstractFileByPath(change.newPath)===change.file)path=change.newPath;
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||!path.startsWith(PROJECTS+'/'))throw new Error('项目位置已变化，请刷新后重试');
    const key=JSON.stringify([scope,path]),draft=file.basename;
    const state=this.projectNameEdits.get(key)||{key,scope,project:path,draft,original:draft,busy:false,error:'',selectionStart:0,selectionEnd:draft.length};
    state.ownerLeaf=this.app.workspace.activeLeaf?.id;this.projectNameEdits.set(key,state);this.projectNameFocusKey=key;
    this.app.workspace.trigger('gtd-project-name-edit',path);return state;
  }
  closeProjectNameEdit(key) {
    const state=this.projectNameEdits.get(key);if(!state||state.busy)return;
    this.projectNameEdits.delete(key);if(this.projectNameFocusKey===key)this.projectNameFocusKey='';
    this.app.workspace.trigger('gtd-project-name-edit',state.project);
  }
  saveProjectNameEdit(state) {
    if(state.savePromise)return state.savePromise;
    if(this.projectNameEdits.get(state.key)!==state)return Promise.resolve(true);
    if(!state.draft.trim()||state.draft.trim()===state.original){this.closeProjectNameEdit(state.key);return Promise.resolve(true);}
    state.busy=true;state.error='';this.app.workspace.trigger('gtd-project-name-edit',state.project);
    state.savePromise=(async()=>{
      try{
        state.savedChange=await this.renameProject(state.project,state.draft);
        this.projectNameEdits.delete(state.key);if(this.projectNameFocusKey===state.key)this.projectNameFocusKey='';return true;
      }catch(error){state.error=error.message||String(error);this.projectNameFocusKey=state.key;return false;}
      finally{state.busy=false;state.savePromise=null;this.app.workspace.trigger('gtd-project-name-edit',state.project);}
    })();return state.savePromise;
  }
  async renameProject(path,value) {
    const name=logic.validateProjectName(value),file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||!path.startsWith(PROJECTS+'/')||file.extension!=='md')throw new Error('找不到项目笔记');
    if([...this.inlineTaskEntries.values()].some(state=>state.project===path&&state.busy))throw new Error('该项目正在保存任务，请稍后再改名');
    const destination=path.slice(0,path.lastIndexOf('/')+1)+name+'.md',existing=this.app.vault.getAbstractFileByPath(destination);
    if(existing&&existing!==file)throw new Error('同一文件夹中已有这个项目名称');
    const content=await this.app.vault.read(file),before=logic.projectTaskTree(content);
    if(file.path!==path)throw new Error('项目位置已变化，请刷新后重试');
    if(destination!==path)await this.app.fileManager.renameFile(file,destination);
    const remap=value=>value===path?destination:value;
    const remapKey=key=>key.split('::').map((part,index)=>index===0?remap(part):part.replace(/^(project|task|days):(.*)$/,(_,kind,value)=>kind+':'+remap(value))).join('::');
    this.data.treeExpanded=Object.fromEntries(Object.entries(this.data.treeExpanded||{}).map(([key,value])=>[remapKey(key),value]));
    this.taskDayPanels=new Map([...this.taskDayPanels].map(([key,value])=>[remapKey(key),value]));
    for(const state of [...this.inlineTaskEntries.values()])if(state.project===path){const oldKey=state.key;this.inlineTaskEntries.delete(oldKey);state.project=destination;state.key=JSON.stringify([state.scope,destination,state.parentKey]);this.inlineTaskEntries.set(state.key,state);if(this.inlineTaskFocusKey===oldKey)this.inlineTaskFocusKey=state.key;}
    if(this.data.lastProject===path)this.data.lastProject=destination;
    this.saveData(this.data).catch(error=>console.error('GTD：无法保存项目显示状态',error));
    let after={roots:[]};
    try{if(await this.app.vault.read(file)===content)after=before;}catch(_){}
    return {path,newPath:destination,file,before,after};
  }
  async renameProjectTask(path,reference,title) {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||!path.startsWith(PROJECTS+'/')||file.extension!=='md')throw new Error('找不到项目笔记');
    let failure,before,after;
    await this.app.vault.process(file,content=>{
      try{
        if(file.path!==path)throw new Error('项目位置已变化，请刷新后重试');
        const changed=logic.renameProjectTask(content,reference,title);
        before=logic.projectTaskTree(content);after=logic.projectTaskTree(changed);
        return changed;
      }catch(error){failure=error;return content;}
    });
    if(failure)throw failure;
    const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children)]),oldNodes=flatten(before.roots),nextByLine=new Map(flatten(after.roots).map(node=>[node.line,node]));
    const keyMap=new Map(oldNodes.map(node=>[node.key,nextByLine.get(node.line).key]));
    const marker='::task:'+path+'::',snapshot=Object.entries(this.data.treeExpanded||{}),remapped={...this.data.treeExpanded};
    for(const [key] of snapshot){const at=key.lastIndexOf(marker);if(at>=0&&keyMap.has(key.slice(at+marker.length)))delete remapped[key];}
    for(const [key,value] of snapshot){const at=key.lastIndexOf(marker),next=at>=0?keyMap.get(key.slice(at+marker.length)):undefined;if(next!==undefined)remapped[key.slice(0,at+marker.length)+next]=value;}
    this.data.treeExpanded=remapped;
    const pending=[...this.inlineTaskEntries.values()].filter(state=>state.project===path&&!state.busy&&state.reference?.version===reference.version);
    for(const state of pending)this.inlineTaskEntries.delete(state.key);
    for(const state of pending){
      const next=nextByLine.get(state.reference.line),oldKey=state.key;
      state.parentKey=next.key;state.reference=next.reference;state.key=JSON.stringify([state.scope,path,next.key]);
      this.inlineTaskEntries.set(state.key,state);if(this.inlineTaskFocusKey===oldKey)this.inlineTaskFocusKey=state.key;
    }
    this.saveData(this.data).catch(error=>console.error('GTD：无法保存折叠状态',error));
    return {path,file,before,after};
  }
  async toggleProjectTask(path, reference) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !path.startsWith(PROJECTS + '/') || file.extension !== 'md') throw new Error('找不到项目笔记');
    const api = this.app.plugins.plugins['obsidian-tasks-plugin']?.apiV1;
    if (!api?.executeToggleTaskDoneCommand) throw new Error('请先启用 Tasks 插件');
    let failure = null;
    await this.app.vault.process(file, content => {
      try {
        return logic.replaceProjectTask(content, reference, logic.preserveTaskDays(reference.raw, api.executeToggleTaskDoneCommand(logic.stripTaskDays(reference.raw), path)));
      } catch (error) { failure = error; return content; }
    });
    if (failure) throw failure;
  }
  async updateProjectTaskDate(path, reference, field, value) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !path.startsWith(PROJECTS + '/') || file.extension !== 'md') throw new Error('找不到项目笔记');
    let failure;
    await this.app.vault.process(file, content => {
      try { return logic.updateProjectTaskDate(content, reference, field, value); }
      catch (error) { failure = error; return content; }
    });
    if (failure) throw failure;
  }
  async deleteProjectTask(path, reference) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || (path!==INBOX&&!path.startsWith(PROJECTS + '/')) || file.extension !== 'md') throw new Error('找不到任务笔记');
    let result, failure;
    await this.app.vault.process(file, content => {
      try { if(file.path!==path)throw new Error('任务笔记位置已变化，请刷新后重试');result = logic.deleteProjectTask(content, reference); return result.content; }
      catch (error) { failure = error; return content; }
    });
    if (failure) {if(path===INBOX)failure.message=failure.message.replace(/^项目内容/,'收件箱内容');throw failure;}
    return { path, title: result.title, count: result.count, undo: result.undo };
  }
  async restoreProjectTaskDeletion(path, undo) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !path.startsWith('00 GTD/') || file.extension !== 'md') throw new Error('找不到任务笔记');
    let failure;
    await this.app.vault.process(file, content => {
      try { return logic.restoreProjectTask(content, undo); }
      catch (error) { failure = error; return content; }
    });
    if (failure) {if(path===INBOX)failure.message=failure.message.replace(/^项目内容/,'收件箱内容');throw failure;}
  }
  showTaskDeletionUndo(receipt, onRestored) {
    const fragment = document.createDocumentFragment();
    const text = document.createElement('span');
    text.textContent = '已删除「' + receipt.title + '」' + (receipt.count > 1 ? '及 ' + (receipt.count - 1) + ' 个子任务' : '') + ' ';
    fragment.append(text);
    const button = document.createElement('button');
    button.textContent = '撤销'; button.dataset.gtdTaskUndo = 'true';
    fragment.append(button);
    const notice = new Notice(fragment, 15000);
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        await this.restoreProjectTaskDeletion(receipt.path, receipt.undo);
        notice.hide();
        await onRestored?.();
      } catch (error) { button.disabled = false; new Notice(error.message || String(error)); }
    });
  }
  projectTreeExpanded(key, fallback = false) {
    const states = this.data.treeExpanded || {};
    return Object.prototype.hasOwnProperty.call(states, key) ? states[key] : fallback;
  }
  setProjectTreeExpanded(key, expanded) {
    this.data.treeExpanded ||= {};
    if (this.data.treeExpanded[key] === expanded) return;
    this.data.treeExpanded[key] = expanded;
    window.clearTimeout(this.treeStateSaveTimer);
    this.treeStateSaveTimer = window.setTimeout(() => {
      this.treeStateSaveTimer = null;
      this.saveData(this.data).catch(error => console.error('GTD：无法保存折叠状态', error));
    }, 200);
  }
  async createProject(data) {
    const area = this.listAreas().find(item => item.path === data.folder);
    if (!area) throw new Error('请选择项目领域');
    const name = logic.validateProjectName(data.name);
    const path = area.path + '/' + name + '.md';
    if (this.app.vault.getAbstractFileByPath(path)) throw new Error('已存在同名项目，请更换名称');
    const content = logic.buildProjectNote({ ...data, name, area: area.label });
    const file = await this.app.vault.create(path, content);
    this.rememberProject(path);
    return file;
  }
  openTaskModal(context = {}) {
    if (context.project && !this.listProjects().some(file => file.path === context.project)) throw new Error('所选项目不可用，请刷新后重试');
    const modal = new QuickTaskModal(this, context); modal.open(); return modal;
  }
  openProjectModal() { const modal = new QuickProjectModal(this); modal.open(); return modal; }
  openCaptureModal() { const modal = new QuickCaptureModal(this); modal.open(); return modal; }
  openAreaModal() { const modal = new QuickAreaModal(this); modal.open(); return modal; }
  async createArea(data) {
    if (this.creatingArea) throw new Error('正在创建领域，请稍候');
    const name = logic.validateProjectName(data.name);
    const root = this.app.vault.getAbstractFileByPath(PROJECTS);
    const names = (root?.children || []).filter(file => file instanceof TFolder).map(file => file.name);
    const folderName = logic.nextAreaFolder(name, names);
    const folderPath = PROJECTS + '/' + folderName;
    const notePath = AREAS + '/领域 - ' + name + '.md';
    if (this.app.vault.getAbstractFileByPath(notePath)) throw new Error('已存在同名领域笔记');
    this.creatingArea = true;
    let folder;
    try {
      folder = await this.app.vault.createFolder(folderPath);
      const file = await this.app.vault.create(notePath, logic.buildAreaNote({ name, folder: folderPath }));
      return { name, folder: folderPath, file };
    } catch (error) {
      if (folder && folder.children.length === 0) await this.app.vault.delete(folder, true);
      throw error;
    } finally { this.creatingArea = false; }
  }
  async openHome() {
    const file = this.app.vault.getAbstractFileByPath(HOME);
    if (!(file instanceof TFile)) { new Notice('找不到 GTD 首页'); return; }
    const existing = this.app.workspace.getLeavesOfType('markdown').find(leaf => leaf.view.file?.path === HOME);
    if (existing) {
      this.app.workspace.setActiveLeaf(existing, { focus: true });
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    await this.app.workspace.getLeaf('tab').openFile(file, { state: { mode: 'preview' } });
  }
  installBoardNavigation() {
    for (const leaf of this.app.workspace.getLeavesOfType('bases')) {
      const view = leaf.view;
      if (!view.file?.path.startsWith('00 GTD/') || view.containerEl.querySelector('[data-gtd-home]')) continue;
      const button = view.addAction('house', '返回首页', () => this.openHome());
      button.dataset.gtdHome = 'true';
      button.addClass('gtd-board-home');
      button.createSpan({ text: '首页' });
    }
  }
  onunload() {
    if(this.activeDayPopover?.isConnected&&this.activeDayPopover.matches(':popover-open'))this.activeDayPopover.hidePopover();
    if (this.treeStateSaveTimer) {
      window.clearTimeout(this.treeStateSaveTimer);
      this.saveData(this.data);
    }
    document.querySelectorAll('[data-gtd-home], .gtd-quick-actions').forEach(element => element.remove());
  }
};
