module.exports = function installCalendarLayout(plugin, scope = document) {
  const doc = scope.ownerDocument || scope, selector = '.block-language-tasks-calendar.tasks-calendar';
  const entries = new Map();
  let disposed = false;
  const restoreTooltips = entry => {
    for (const [card, name] of entry.cardNames) if (card.getAttribute('aria-label') !== name) card.setAttribute('aria-label', name);
    entry.cardNames.clear();
  };
  const projectOf = card => {
    const project = card.dataset.gtdProject || card.querySelector('.tasks-calendar-task-source')?.textContent.trim();
    if (project) return project;
    // Compatibility for cards mounted before the updated calendar renderer loads.
    const key = Object.keys(card).find(key => key.startsWith('__reactProps$'));
    const children = key ? card[key]?.children : [];
    const path = (Array.isArray(children) ? children : [children]).find(child => typeof child?.props?.sourcePath === 'string')?.props.sourcePath;
    return path?.replace(/\.md$/i, '').split('/').pop();
  };
  function setCompact(compact) {
    plugin.data.calendarCompact = compact;
    sync();
    Promise.resolve(plugin.saveData(plugin.data)).catch(error => console.error('GTD 日历显示设置未保存', error));
  }
  function compactTasks(root, compact) {
    const controlled = new Set();
    for (const list of root.querySelectorAll('.tasks-calendar-grid:is(.is-day,.is-week) .tasks-calendar-task-list,.tasks-calendar-overdue-list')) {
      const tasks = [...list.children].filter(task => task.classList.contains('tasks-calendar-task'));
      tasks.forEach((task, index) => {
        controlled.add(task);
        if (compact && index >= 3) task.setAttribute('data-gtd-compact-hidden', 'true');
        else task.removeAttribute('data-gtd-compact-hidden');
      });
      const count = compact ? Math.max(0, tasks.length - 3) : 0;
      let more = list.querySelector(':scope > [data-gtd-compact-more]');
      if (count) {
        if (!more) {
          more = doc.createElement('button'); more.type = 'button';
          more.className = 'tasks-calendar-more'; more.dataset.gtdCompactMore = 'true'; list.append(more);
        }
        const text = '+' + count + ' more';
        if (more.textContent !== text) more.textContent = text;
        more.setAttribute('aria-label', '还有 ' + count + ' 项任务，展开查看');
      } else more?.remove();
    }
    for (const task of root.querySelectorAll('[data-gtd-compact-hidden]')) if (!controlled.has(task)) task.removeAttribute('data-gtd-compact-hidden');
  }
  function removeEntry(root, entry) {
    restoreTooltips(entry); entry.button.remove(); root.removeEventListener('click', entry.onMore, true);
    root.querySelectorAll('[data-gtd-compact-more]').forEach(button => button.remove());
    root.querySelectorAll('[data-gtd-compact-hidden]').forEach(task => task.removeAttribute('data-gtd-compact-hidden'));
    root.classList.remove('gtd-calendar-compact');
  }
  function sync() {
    if (disposed) return;
    const roots = new Set([...scope.querySelectorAll(selector)].filter(root => root.closest('.gtd-dashboard')));
    for (const [root, entry] of entries) if (!roots.has(root)) {
      removeEntry(root, entry); entries.delete(root);
    }
    for (const root of roots) {
      const controls = root.querySelector('.tasks-calendar-controls');
      if (!controls) continue;
      let entry = entries.get(root);
      if (!entry) {
        const button = doc.createElement('button');
        button.className = 'gtd-calendar-height-toggle'; button.type = 'button';
        button.addEventListener('click', () => setCompact(plugin.data.calendarCompact !== true));
        const onMore = event => {
          const more = event.target.closest?.('.tasks-calendar-more');
          if (!more || more.closest(selector) !== root || plugin.data.calendarCompact !== true) return;
          const dayButton = more.closest('.tasks-calendar-day')?.querySelector('.tasks-calendar-day-number');
          const custom = more.hasAttribute('data-gtd-compact-more');
          setCompact(false);
          if (custom) { event.preventDefault(); event.stopPropagation(); dayButton?.click(); }
        };
        root.addEventListener('click', onMore, true);
        entry = { button, onMore, cardNames: new Map() }; entries.set(root, entry);
      }
      const compact = plugin.data.calendarCompact === true, button = entry.button;
      root.classList.toggle('gtd-calendar-compact', compact);
      const text = compact ? '<>' : '><', label = compact ? '恢复自适应高度' : '收起部分任务';
      if (button.textContent !== text) button.textContent = text;
      button.title = label;
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(compact));
      if (button.parentElement !== controls) controls.insertBefore(button, controls.querySelector('.tasks-calendar-mode-switch'));
      compactTasks(root, compact);
      const cards = new Set(root.querySelectorAll('.tasks-calendar-task'));
      for (const card of entry.cardNames.keys()) if (!cards.has(card)) entry.cardNames.delete(card);
      for (const card of cards) {
        const project = projectOf(card);
        const name = card.querySelector('.tasks-calendar-task-title')?.textContent.trim();
        if (!project || !name) continue;
        const label = '所属项目：' + project;
        entry.cardNames.set(card, name);
        if (card.getAttribute('aria-label') !== label) card.setAttribute('aria-label', label);
      }
    }
  }
  const containsCalendar = node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector));
  const observer = new doc.defaultView.MutationObserver(records => {
    if (records.some(record => record.target.nodeType === 1 && record.target.closest(selector) && (record.type !== 'attributes' || record.target.matches('.tasks-calendar-task'))
      || [...record.addedNodes, ...record.removedNodes].some(containsCalendar))) sync();
  });
  observer.observe(scope === doc ? doc.body : scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'data-gtd-project'] });
  sync();
  return {
    refresh: sync,
    destroy() {
      disposed = true; observer.disconnect();
      for (const [root, entry] of entries) removeEntry(root, entry);
      entries.clear();
    }
  };
};
