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
      check(`${mode}/${width}: height follows workload and overrides saved height`, dense.content.offsetHeight > sparse.content.offsetHeight + 250, { sparse: sparse.content.offsetHeight, dense: dense.content.offsetHeight });
      check(`${mode}/${width}: expanded tasks are not clipped`, dense.days.every(d => d.scrollHeight <= d.clientHeight + 1), dense.days.map(d => [d.clientHeight, d.scrollHeight]));
      const button = dense.root.querySelector('.gtd-calendar-height-toggle');
      check(`${mode}/${width}: exactly one compact toggle`, dense.root.querySelectorAll('.gtd-calendar-height-toggle').length === 1);
      if (button) {
        const task = dense.root.querySelector('.tasks-calendar-day .tasks-calendar-task');
        button.click(); await pause();
        check(`${mode}/${width}: compact bounds height`, dense.content.offsetHeight <= 400 && dense.content.offsetHeight >= 180, dense.content.offsetHeight);
        const scrollable = [dense.content, dense.grid, ...dense.days].find(e => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 10);
        check(`${mode}/${width}: compact content scrolls internally`, !!scrollable);
        check(`${mode}/${width}: preference persisted without losing other settings`, saved.at(-1)?.calendarCompact === true && button.getAttribute('aria-pressed') === 'true');
        button.click(); await pause();
        check(`${mode}/${width}: expand restores content without replacing task DOM`, dense.content.offsetHeight > 600 && dense.root.querySelector('.tasks-calendar-day .tasks-calendar-task') === task);
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
      const controls = a.root.querySelector('.tasks-calendar-controls');
      const replacement = controls.cloneNode(true); replacement.querySelector('.gtd-calendar-height-toggle').remove(); controls.replaceWith(replacement); await pause();
      check('React toolbar replacement restores one toggle and compact state', a.root.querySelectorAll('.gtd-calendar-height-toggle').length === 1 && a.root.querySelector('.gtd-calendar-height-toggle').getAttribute('aria-pressed') === 'true');
      controller.destroy(); controller = install(plugin, host); await pause();
      check('reinstall retains saved compact preference', a.root.classList.contains('gtd-calendar-compact') && a.root.querySelectorAll('.gtd-calendar-height-toggle').length === 1);
      controller.destroy(); controller = null;
      check('unload removes controls and layout state', !host.querySelector('.gtd-calendar-height-toggle,.gtd-calendar-compact'));
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
            const tasks = [...original.querySelectorAll('.tasks-calendar-day .tasks-calendar-task')];
            check(`live ${mode}/${compact}: native layout does not hide task cards`, tasks.every(t => getComputedStyle(t).display !== 'none'), { rendered: tasks.length, visible: tasks.filter(t => getComputedStyle(t).display !== 'none').length });
            check(`live ${mode}/${compact}: toolbar keeps one toggle`, original.querySelectorAll('.gtd-calendar-height-toggle').length === 1);
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
