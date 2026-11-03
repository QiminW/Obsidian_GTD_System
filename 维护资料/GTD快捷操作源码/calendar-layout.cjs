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
  function sync() {
    if (disposed) return;
    const roots = new Set([...scope.querySelectorAll(selector)].filter(root => root.closest('.gtd-dashboard')));
    for (const [root, entry] of entries) if (!roots.has(root)) {
      restoreTooltips(entry);
      entry.button.remove(); root.classList.remove('gtd-calendar-compact'); entries.delete(root);
    }
    for (const root of roots) {
      const controls = root.querySelector('.tasks-calendar-controls');
      if (!controls) continue;
      let entry = entries.get(root);
      if (!entry) {
        const button = doc.createElement('button');
        button.className = 'gtd-calendar-height-toggle'; button.type = 'button';
        button.addEventListener('click', () => {
          plugin.data.calendarCompact = plugin.data.calendarCompact !== true;
          sync();
          Promise.resolve(plugin.saveData(plugin.data)).catch(error => console.error('GTD 日历显示设置未保存', error));
        });
        entry = { button, cardNames: new Map() }; entries.set(root, entry);
      }
      const compact = plugin.data.calendarCompact === true, button = entry.button;
      root.classList.toggle('gtd-calendar-compact', compact);
      const text = compact ? '<>' : '><', label = compact ? '恢复自适应高度' : '收缩为固定高度';
      if (button.textContent !== text) button.textContent = text;
      button.title = label;
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(compact));
      if (button.parentElement !== controls) controls.insertBefore(button, controls.querySelector('.tasks-calendar-mode-switch'));
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
      for (const [root, entry] of entries) { restoreTooltips(entry); entry.button.remove(); root.classList.remove('gtd-calendar-compact'); }
      entries.clear();
    }
  };
};
