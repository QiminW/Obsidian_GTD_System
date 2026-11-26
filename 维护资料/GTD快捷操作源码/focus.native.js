(async () => {
  if (app.vault.getName() !== 'Obsidian-GTD-Demo') throw Error('只在演示库运行');
  const results = window.__gtdFocusTest = {running:true, checks:[]};
  const id = 'gtd-quick-actions', plugin = () => app.plugins.plugins[id];
  const path = '00 GTD/00 工作区/01 项目/00 工作/专注演示-'+Date.now()+'.md';
  const button = () => [...document.querySelectorAll('.gtd-home .gtd-calendar-focus')].find(el => el.offsetWidth);
  const dialog = () => document.querySelector('.gtd-focus-modal');
  const closePicker = () => dialog()?.closest('.modal').querySelector('.modal-close-button,.modal-header-button:has(.lucide-x)')?.click();
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (pass, label) => { if (!pass) throw Error(label); results.checks.push(label); };
  const until = async (fn, label, limit=10000) => {
    const end = Date.now()+limit;
    while (Date.now()<end) { const value=fn(); if (value) return value; await pause(60); }
    throw Error(label);
  };
  const clockMatches = (title, endsAt) => {
    const text = button()?.textContent || '', time = /(\d+):(\d{2})$/.exec(text);
    return text.startsWith(title+' · 剩余 ') && time && Math.abs(Number(time[1])*60+Number(time[2])-Math.ceil((endsAt-Date.now())/1000))<=1;
  };
  const choose = async (title, minutes) => {
    button().click();
    const selected = await until(() => [...(dialog()?.querySelectorAll('label')||[])].find(row =>
      row.querySelector('span')?.textContent===title && row.querySelector('small')?.textContent.startsWith(file.basename)), '找到演示任务');
    selected.click();
    const form = dialog().querySelector('form'), number = form.querySelector('input');
    if (minutes===30 || minutes===60) [...form.querySelectorAll('button')].find(b=>b.textContent===minutes+' 分钟').click();
    else {
      number.value='0'; form.requestSubmit();
      check(!number.validity.valid && !plugin().focusSession, '自定义零分钟不能开始');
      number.value=String(minutes); form.requestSubmit();
    }
    await until(() => plugin().focusSession && !dialog(), '计时启动');
    return plugin().focusSession.endsAt;
  };
  let file, projectLeaf, noticesObserver, restoreSearch;
  try {
    if (plugin().focusSession) throw Error('演示库已有专注计时');
    const day=plugin().todayDateKey();
    file=await app.vault.create(path, [
      '---','type: gtd-project','status: active','area: 工作','---','## 任务',
      '- [ ] 演示父任务 📅 '+day, '  - [ ] 修改报告 ^focus-now', '  - [ ] 排入今天 ^focus-plan',
      '  - [ ] 仅今天截止 📅 '+day, '  - [ ] 同时安排和截止 📅 '+day,
      '  - [x] 已完成 📅 '+day, '  - [-] 已取消 📅 '+day, '  - [ ] 未安排'
    ].join('\n')+'\n');
    const ref=async title => (await plugin().readProjectTaskTree(path)).roots[0].children.find(node=>node.title===title).reference;
    await plugin().toggleProjectTaskToday(path, await ref('修改报告'));
    for (const title of ['排入今天','同时安排和截止']) await plugin().toggleProjectTaskDay(path, await ref(title),day);
    const original=await app.vault.read(file);
    await plugin().openHome();
    (await until(button,'首页按钮')).click();
    await until(()=>dialog()?.querySelector('label'),'任务列表');
    const demoRows=[...dialog().querySelectorAll('label')].filter(row=>row.querySelector('small').textContent.startsWith(file.basename));
    check(demoRows.map(row=>row.querySelector('span').textContent).join('|')==='修改报告|排入今天|仅今天截止|同时安排和截止','今、排、仅截止均入选，重复日期、父任务及已完成或取消项筛选正确');
    check(demoRows.every(row=>row.querySelector('small').textContent===file.basename+' › 演示父任务'),'任务下显示真实项目和父任务');
    closePicker();
    const clicked=Date.now(), end30=await choose('修改报告',30);
    check(end30>=clicked+1800000 && end30<=Date.now()+1800000 && clockMatches('修改报告',end30),'30 分钟从点击时刻开始');
    await pause(1200);
    const same=button(), calendar=same.closest('.tasks-calendar'), grid=calendar.querySelector('.tasks-calendar-grid');
    const search=calendar.querySelector('input.tasks-calendar-search'), scroll=same.closest('.markdown-preview-view');
    const previousQuery=search.value;
    const setQuery=value=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,value);
      search.dispatchEvent(new Event('input',{bubbles:true}));
    };
    restoreSearch=()=>setQuery(previousQuery);
    search.focus({preventScroll:true}); setQuery('输入中');
    await pause(500);
    search.setSelectionRange(1,2);
    const lastScroll=scroll.scrollTop, ticks=[];
    const observer=new MutationObserver(records=>ticks.push(...records.map(r=>r.type)));
    observer.observe(same,{subtree:true,characterData:true,childList:true});
    await pause(2200); observer.disconnect();
    check(ticks.length>=2 && ticks.every(type=>type==='characterData') && button()===same && calendar.querySelector('.tasks-calendar-grid')===grid,'倒计时仅更新原按钮文字');
    check(document.activeElement===search && search.value==='输入中' && search.selectionStart===1 && scroll.scrollTop===lastScroll,'首页输入、光标和滚动位置保持');
    restoreSearch(); restoreSearch=null;
    projectLeaf=await plugin().openProjectPage(path);
    await until(()=>app.workspace.activeLeaf===projectLeaf,'打开项目页');
    await plugin().openHome(); await until(()=>clockMatches('修改报告',end30),'返回首页');
    check(plugin().focusSession.endsAt===end30,'切换项目页再返回仍按原结束时间计时');
    const oldButton=button();
    app.workspace.activeLeaf.view.previewMode.rerender(true);
    await until(()=>button() && button()!==oldButton && clockMatches('修改报告',end30),'刷新后重建按钮');
    check(plugin().focusSession.endsAt===end30,'阅读模式刷新后倒计时准确');
    button().click();
    check(button().textContent==='专注' && !plugin().focusSession,'点击同一按钮提前结束');
    const end60=await choose('排入今天',60);
    await app.plugins.unloadPlugin(id); await app.plugins.loadPlugin(id);
    await until(()=>clockMatches('排入今天',end60),'插件重载时恢复');
    check(plugin().focusSession.endsAt===end60,'60 分钟计时从本机存储恢复');
    button().click();
    const expiryMessage='「仅今天截止」的专注时间到了', notices=new Set();
    noticesObserver=new MutationObserver(()=>document.querySelectorAll('.notice').forEach(el=>{if(el.textContent===expiryMessage)notices.add(el);}));
    noticesObserver.observe(document.body,{childList:true,subtree:true,characterData:true});
    const end1=await choose('仅今天截止',1);
    check(clockMatches('仅今天截止',end1),'自定义 1 分钟启动');
    await until(()=>!plugin().focusSession && notices.size>0,'真实到点提醒',66000);
    await pause(4600);
    check(notices.size===1 && ![...notices][0].isConnected && button().textContent==='专注','到点只提醒一次，提示自动消失，按钮复位');
    check(await app.vault.read(file)===original,'各轮计时未修改任务或日期');
    await choose('仅今天截止',30); button().click();
    check(!plugin().focusSession,'未完成的同一项可再次开始');
  } catch (error) { results.error=error.stack || String(error); }
  finally {
    restoreSearch?.();
    noticesObserver?.disconnect();
    closePicker();
    if (file && ['修改报告','排入今天','仅今天截止'].includes(plugin()?.focusSession?.title)) plugin().setFocusSession(null);
    if (projectLeaf && projectLeaf.view.file===file) projectLeaf.detach();
    if (file && file.path===path) await app.vault.delete(file);
    results.running=false;
  }
  return results;
})()
