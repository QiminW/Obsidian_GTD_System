(async () => {
  if (app.vault.getName() !== 'Obsidian-GTD-Demo') throw new Error('Run in the demonstration vault only');
  if (document.visibilityState !== 'visible') throw new Error('Show the demonstration window before running the layout checks');
  const fs = require('fs'), results = [], check = (name, pass, actual) => results.push({ name, pass, actual });
  const sourceRoot = window.__gtdCalendarSourceRoot || app.vault.adapter.getBasePath();
  const source = sourceRoot + '/维护资料/GTD快捷操作源码/calendar-layout.cjs';
  const module = { exports: {} };
  if (fs.existsSync(source)) new Function('module', 'exports', fs.readFileSync(source, 'utf8'))(module, module.exports);
  const install = module.exports;
  check('calendar layout controller is available', typeof install === 'function');
  const original = [...document.querySelectorAll('.tasks-calendar')].find(e => e.offsetHeight);
  if (!original) throw new Error('Open the demonstration homepage first');
  const card = original.querySelector('.tasks-calendar-task');
  if (!card) throw new Error('The demonstration calendar needs one task');
  const livePlugin = app.plugins.plugins['gtd-quick-actions'], hadLiveLayout = !!livePlugin.calendarLayout;
  livePlugin.calendarLayout?.destroy(); delete livePlugin.calendarLayout;
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'absolute', left: '-20000px', top: '0', width: '1200px', visibility: 'hidden' });
  document.body.append(host);
  const saved = [], plugin = { data: {}, saveData: async data => saved.push(structuredClone(data)) };
  const pause = () => new Promise(resolve => setTimeout(resolve, 50));
  let controller;
  function fixture(mode, count, width = 1200, scoped = true) {
    const wrap = document.createElement('div');
    wrap.className = scoped ? 'gtd-dashboard' : '';
    wrap.style.width = width + 'px';
    const root = original.cloneNode(true);
    root.classList.remove('gtd-calendar-compact');
    root.querySelectorAll('.gtd-calendar-height-toggle').forEach(e => e.remove());
    const content = root.querySelector('.tasks-calendar-content');
    content.className = 'tasks-calendar-content is-' + mode;
    content.style.height = '950px';
    const grid = content.querySelector('.tasks-calendar-grid');
    grid.className = 'tasks-calendar-grid is-' + mode;
    const dayTemplate = grid.querySelector('.tasks-calendar-day').cloneNode(true);
    grid.replaceChildren();
    for (let i = 0; i < (mode === 'day' ? 1 : 8); i++) {
      const header = document.createElement('div'); header.className = 'tasks-calendar-weekday'; header.textContent = i ? '星期' + i : 'Wk'; grid.append(header);
    }
    for (let i = 0; i < (mode === 'month' ? 42 : mode === 'week' ? 7 : 1); i++) {
      if (mode !== 'day' && i % 7 === 0) {
        const number = document.createElement('div'); number.className = 'tasks-calendar-week-number'; number.textContent = '45'; grid.append(number);
      }
      const day = dayTemplate.cloneNode(true), list = day.querySelector('.tasks-calendar-task-list');
      list.replaceChildren();
      for (let j = 0; j < (i === 0 ? count : 0); j++) {
        const task = card.cloneNode(true); task.hidden = false;
        task.dataset.gtdProject = '演示项目';
        task.querySelector('.tasks-calendar-task-title-content').textContent = j === 0 ? '验证任务：较长的任务名称应换行并且完整显示' : '演示任务 ' + (j + 1);
        list.append(task);
      }
      grid.append(day);
    }
    const overdue = content.querySelector('.tasks-calendar-overdue-tasks');
    if (overdue) {
      overdue.style.height = '400px'; overdue.style.maxHeight = 'max(0px, calc(100% - 80px))';
      overdue.querySelector('.tasks-calendar-overdue-list').replaceChildren(card.cloneNode(true));
    }
    wrap.append(root); host.append(wrap);
    return { wrap, root, content, grid, days: [...grid.querySelectorAll('.tasks-calendar-day')] };
  }
  try {
    if (typeof install === 'function') controller = install(plugin, host);
    for (const width of [1200, 390]) for (const mode of ['day', 'week', 'month']) {
      const sparse = fixture(mode, 0, width), dense = fixture(mode, 60, width);
      await pause();
      const minimumDayHeight = mode === 'month' ? 112 : 160;
      check(`${mode}/${width}: empty expanded dates retain a useful minimum height`, sparse.days.every(day => day.clientHeight >= minimumDayHeight - 2), sparse.days.map(day => day.clientHeight));
      sparse.root.querySelector('.gtd-calendar-height-toggle').click(); await pause();
      check(`${mode}/${width}: empty compact dates retain a useful minimum height`, sparse.days.every(day => day.clientHeight >= minimumDayHeight - 2), sparse.days.map(day => day.clientHeight));
      sparse.root.querySelector('.gtd-calendar-height-toggle').click(); await pause();
      check(`${mode}/${width}: height follows workload and overrides saved height`, dense.content.offsetHeight > sparse.content.offsetHeight + 250, { sparse: sparse.content.offsetHeight, dense: dense.content.offsetHeight });
      check(`${mode}/${width}: expanded tasks are not clipped`, dense.days.every(d => d.scrollHeight <= d.clientHeight + 1), dense.days.map(d => [d.clientHeight, d.scrollHeight]));
      const button = dense.root.querySelector('.gtd-calendar-height-toggle');
      check(`${mode}/${width}: exactly one compact toggle`, dense.root.querySelectorAll('.gtd-calendar-height-toggle').length === 1);
      if (button) {
        const task = dense.root.querySelector('.tasks-calendar-day .tasks-calendar-task');
        const expandedHeight = dense.content.offsetHeight;
        let more, hiddenTask;
        if (mode === 'month') {
          const monthTasks = [...dense.days[0].querySelectorAll('.tasks-calendar-task')];
          monthTasks.slice(1).forEach(t => { t.hidden = true; }); hiddenTask = monthTasks.at(-1);
          more = document.createElement('button'); more.className = 'tasks-calendar-more'; more.textContent = '+59 more';
          dense.days[0].querySelector('.tasks-calendar-task-list').append(more);
        }
        button.click(); await pause();
        check(`${mode}/${width}: compact reduces height and keeps a minimum day height`, dense.content.offsetHeight < expandedHeight && dense.days[0].clientHeight >= 96, dense.content.offsetHeight);
        if (mode === 'month') {
          check(`${mode}/${width}: compact restores hidden overflow and the more button`, getComputedStyle(hiddenTask).display === 'none' && getComputedStyle(more).display !== 'none');
        } else {
          const visible = [...dense.days[0].querySelectorAll('.tasks-calendar-task')].filter(t => getComputedStyle(t).display !== 'none');
          const moreButton = dense.days[0].querySelector('[data-gtd-compact-more]');
          check(`${mode}/${width}: compact shows three tasks and a more entry`, visible.length === 3 && !!moreButton && moreButton.offsetHeight > 0, visible.length);
        }
        check(`${mode}/${width}: compact has no internal scrollbar`, ![dense.content, dense.grid, ...dense.days].some(e => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1));
        check(`${mode}/${width}: compact retains at least one visible task`, [...dense.days[0].querySelectorAll('.tasks-calendar-task')].some(t => getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().bottom <= dense.days[0].getBoundingClientRect().bottom + 1));
        check(`${mode}/${width}: preference persisted without losing other settings`, saved.at(-1)?.calendarCompact === true && button.getAttribute('aria-pressed') === 'true');
        button.click(); await pause();
        check(`${mode}/${width}: expand restores content without replacing task DOM`, dense.content.offsetHeight > 600 && dense.root.querySelector('.tasks-calendar-day .tasks-calendar-task') === task);
        if (mode === 'month') check(`${mode}/${width}: expanded shows every task and hides more`, getComputedStyle(hiddenTask).display !== 'none' && getComputedStyle(more).display === 'none');
      }
      sparse.wrap.remove(); dense.wrap.remove(); await pause();
    }
    if (controller) {
      plugin.data.unrelated = 'preserve';
      const a = fixture('week', 7), b = fixture('month', 7), outside = fixture('week', 7, 1200, false);
      await pause();
      a.root.querySelector('.gtd-calendar-height-toggle').click(); await pause();
      check('compact preference applies to all GTD calendars', b.root.classList.contains('gtd-calendar-compact'));
      check('unrelated plugin data survives preference save', saved.at(-1).unrelated === 'preserve');
      check('non-GTD calendar is untouched', !outside.root.querySelector('.gtd-calendar-height-toggle') && !outside.root.classList.contains('gtd-calendar-compact'));
      const renamedCard = a.root.querySelector('.tasks-calendar-task');
      let projectLabel = renamedCard.querySelector('.tasks-calendar-task-source');
      if (!projectLabel) { projectLabel = document.createElement('button'); projectLabel.className = 'tasks-calendar-task-source'; renamedCard.append(projectLabel); }
      projectLabel.textContent = '项目改名演示';
      renamedCard.dataset.gtdProject = '项目改名演示';
      renamedCard.querySelector('.tasks-calendar-task-title-content').textContent = '任务改名演示';
      await pause();
      check('task and project renames update the hover label', renamedCard.getAttribute('aria-label') === '所属项目：项目改名演示');
      renamedCard.setAttribute('aria-label', '任务改名演示'); await pause();
      check('upstream tooltip reset retains project information', renamedCard.getAttribute('aria-label') === '所属项目：项目改名演示');
      const duplicateCards = [...b.root.querySelectorAll('.tasks-calendar-task')].slice(0, 2);
      duplicateCards.forEach((task, i) => {
        task.querySelector('.tasks-calendar-task-title-content').textContent = '同名任务';
        task.querySelector('.tasks-calendar-task-source')?.remove();
        task.dataset.gtdProject = i === 0 ? '项目甲' : '项目乙';
      });
      await pause();
      check('month cards with identical task names keep their exact projects without a source row', duplicateCards[0].getAttribute('aria-label') === '所属项目：项目甲' && duplicateCards[1].getAttribute('aria-label') === '所属项目：项目乙');
      let overdue = a.root.querySelector('.tasks-calendar-overdue-list');
      if (!overdue) {
        const section = document.createElement('section'); section.className = 'tasks-calendar-overdue-tasks';
        overdue = document.createElement('div'); overdue.className = 'tasks-calendar-task-list tasks-calendar-overdue-list';
        section.append(overdue); a.content.append(section);
      }
      const overdueCard = card.cloneNode(true); overdueCard.hidden = false; overdueCard.dataset.gtdProject = '逾期项目';
      overdueCard.querySelector('.tasks-calendar-task-title-content').textContent = '逾期任务';
      const overdueMeta = document.createElement('span'); overdueMeta.className = 'tasks-calendar-overdue-meta';
      overdueMeta.textContent = '1 day ago · 2026-11-02 · 00 GTD/项目/逾期项目'; overdueCard.append(overdueMeta); overdue.replaceChildren(overdueCard);
      await pause();
      check('overdue cards show their exact project on hover', overdueCard.getAttribute('aria-label') === '所属项目：逾期项目');
      check('overdue cards hide the second metadata line and retain their task name', getComputedStyle(overdueMeta).display === 'none' && overdueCard.querySelector('.tasks-calendar-task-title').offsetHeight > 0);
      overdueCard.dataset.gtdProject = '逾期项目改名'; await pause();
      check('overdue project renames update the tooltip', overdueCard.getAttribute('aria-label') === '所属项目：逾期项目改名');
      const controls = a.root.querySelector('.tasks-calendar-controls');
      const replacement = controls.cloneNode(true); replacement.querySelector('.gtd-calendar-height-toggle').remove(); controls.replaceWith(replacement); await pause();
      check('React toolbar replacement restores one toggle and compact state', a.root.querySelectorAll('.gtd-calendar-height-toggle').length === 1 && a.root.querySelector('.gtd-calendar-height-toggle').getAttribute('aria-pressed') === 'true');
      controller.destroy(); controller = install(plugin, host); await pause();
      check('reinstall retains saved compact preference', a.root.classList.contains('gtd-calendar-compact') && a.root.querySelectorAll('.gtd-calendar-height-toggle').length === 1);
      controller.destroy(); controller = null;
      check('unload removes controls and layout state', !host.querySelector('.gtd-calendar-height-toggle,.gtd-calendar-compact'));
      check('unload restores the original task tooltip', renamedCard.getAttribute('aria-label') === '任务改名演示');
    }
    if (typeof install === 'function') {
      const previousCompact = livePlugin.data.calendarCompact;
      const previousMode = original.querySelector('.tasks-calendar-mode-switch .is-active').textContent;
      const temporary = !livePlugin.calendarLayout;
      if (temporary) livePlugin.calendarLayout = install(livePlugin);
      try {
        for (const mode of ['Month', 'Week', 'Day']) {
          [...original.querySelectorAll('.tasks-calendar-mode-switch button')].find(b => b.textContent === mode).click();
          await pause();
          for (const compact of [false, true, false]) {
            const toggle = original.querySelector('.gtd-calendar-height-toggle');
            if ((toggle.getAttribute('aria-pressed') === 'true') !== compact) toggle.click();
            await pause();
            const tasks = [...original.querySelectorAll('.tasks-calendar-task')];
            if (compact) {
              const hidden = tasks.filter(t => getComputedStyle(t).display === 'none');
              const more = [...original.querySelectorAll('.tasks-calendar-more')].filter(b => !b.hidden && getComputedStyle(b).display !== 'none');
              check(`live compact ${mode}: overflow is summarized by more`, hidden.length === 0 || more.length > 0, { hidden: hidden.length, more: more.length });
              const occupied = [...original.querySelectorAll('.tasks-calendar-day')].filter(d => d.querySelector('.tasks-calendar-task'));
              check(`live compact ${mode}: each occupied date keeps a visible task`, occupied.every(d => [...d.querySelectorAll('.tasks-calendar-task')].some(t => getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().bottom <= d.getBoundingClientRect().bottom + 1)));
              check(`live compact ${mode}: no internal scrollbars`, ![...original.querySelectorAll('.tasks-calendar-content,.tasks-calendar-grid,.tasks-calendar-day,.tasks-calendar-overdue-list')].some(e => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1));
            } else check(`live ${mode}/${compact}: native layout does not hide task cards`, tasks.every(t => getComputedStyle(t).display !== 'none'), { rendered: tasks.length, visible: tasks.filter(t => getComputedStyle(t).display !== 'none').length });
            check(`live ${mode}/${compact}: toolbar keeps one toggle`, original.querySelectorAll('.gtd-calendar-height-toggle').length === 1);
            const sourced = tasks.filter(t => t.querySelector('.tasks-calendar-task-source'));
            check(`live ${mode}/${compact}: project is hidden on the card`, sourced.every(t => getComputedStyle(t.querySelector('.tasks-calendar-task-source')).display === 'none'));
            check(`live ${mode}/${compact}: overdue metadata is hidden`, [...original.querySelectorAll('.tasks-calendar-overdue-meta')].every(m => getComputedStyle(m).display === 'none'));
            const expected = new Map([['确认本周重点','示例项目 - 工作周报'],['完成需求沟通','示例项目 - 工作周报'],['编写周报初稿','示例项目 - 工作周报'],['整理核心概念','示例项目 - 课程学习'],['完成章节练习','示例项目 - 课程学习']]);
            const known = tasks.filter(t => expected.has(t.querySelector('.tasks-calendar-task-title').textContent.trim()));
            check(`live ${mode}/${compact}: tooltip is the exact project rather than the task name`, known.length > 0 && known.every(t => t.getAttribute('aria-label') === '所属项目：' + expected.get(t.querySelector('.tasks-calendar-task-title').textContent.trim())));
            if (mode === 'Month') {
              const days = [...original.querySelectorAll('.tasks-calendar-day')];
              check(`live month/${compact}: cells do not clip cards`, days.every(d => d.scrollHeight <= d.clientHeight + 1));
              check(`live month/${compact}: weeks do not overlap`, days.every((d, i) => i < 7 || d.getBoundingClientRect().top >= days[i - 7].getBoundingClientRect().bottom - 1));
            }
          }
        }
      } finally {
        if (previousCompact === undefined) delete livePlugin.data.calendarCompact;
        else livePlugin.data.calendarCompact = previousCompact;
        livePlugin.calendarLayout.refresh();
        [...original.querySelectorAll('.tasks-calendar-mode-switch button')].find(b => b.textContent === previousMode).click();
        await livePlugin.saveData(livePlugin.data);
        if (temporary) { livePlugin.calendarLayout.destroy(); delete livePlugin.calendarLayout; }
      }
    }
    window.__gtdCalendarLayoutTest = { pass: results.every(r => r.pass), checks: results.length, failed: results.filter(r => !r.pass), results };
    return JSON.stringify(window.__gtdCalendarLayoutTest);
  } finally {
    controller?.destroy(); host.remove();
    if (hadLiveLayout && !livePlugin.calendarLayout && typeof install === 'function') livePlugin.calendarLayout = install(livePlugin);
  }
})()
