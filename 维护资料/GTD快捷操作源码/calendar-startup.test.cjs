const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const logic = require('./logic.cjs');
const install = require('./calendar-bridge.cjs');

const projectPath = '00 GTD/00 工作区/01 项目/学习/示例项目.md';
const content = '- [ ] <!-- gtd-days: 2026-11-12 --> 学习 📅 2026-11-08\n- [x] 已完成 📅 2026-11-12\n- [-] 已取消 📅 2026-11-12\n- [_] 已略过 📅 2026-11-12\n';
const file = { path: projectPath, extension: 'md' };
const nativeTasks = content.trimEnd().split('\n').map((raw, line) => ({
  id: String(line), path: projectPath, line, raw, description: raw,
  completed: line === 1, due: line === 0 ? '2026-11-08' : '2026-11-12'
}));
const home = { closest: selector => selector === '.gtd-dashboard' ? {} : null };
const other = { closest: () => null };
const bundle = fs.readFileSync(__dirname + '/../../.obsidian/plugins/tasks-calendar/main.js', 'utf8');

async function setup() {
  const frontmatter = { status: 'active' };
  const started = [], located = [], opened = [], errors = [];
  let metadataListener, refreshes = 0;
  global.window = { setTimeout: fn => fn(), clearTimeout() {} };
  const calendar = {
    taskStore: { getTasks: () => nativeTasks },
    refreshCalendars() { refreshes++; },
    openTask(task) { opened.push(task); }
  };
  const plugin = {
    app: {
      plugins: { plugins: { 'tasks-calendar': calendar } },
      vault: { getMarkdownFiles: () => [file], on: () => ({}), offref() {}, read: async () => content, getAbstractFileByPath: path => path === projectPath ? file : null },
      metadataCache: {
        getFileCache: () => ({ frontmatter }),
        on: (event, callback) => { if (event === 'changed') metadataListener = callback; return callback; },
        offref: ref => { if (ref === metadataListener) metadataListener = undefined; }
      }
    },
    startCalendarFocusTask: async task => { started.push(task); },
    locateCalendarTask: async task => { located.push(task); return true; },
    showTaskActionError: error => errors.push(error.message),
    clearTaskActionNotice() {}
  };
  const bridge = install(plugin, logic, class {});
  await Promise.resolve();
  return { bridge, calendar, plugin, frontmatter, started, located, opened, errors,
    refreshed: () => refreshes,
    changeStatus(status) { frontmatter.status = status; metadataListener?.(file); }
  };
}

function nativeMenu(calendar, task, today = '2026-11-12') {
  class Menu {
    constructor() { this.items = new Map(); }
    setUseNativeMenu() { return this; }
    addItem(build) {
      const item = {
        setTitle: value => { this.items.set(value, item); return item; },
        setIcon: () => item,
        setDisabled: disabled => { item.disabled = disabled; return item; },
        onClick: callback => { item.click = callback; return item; }
      };
      build(item);
    }
    showAtPosition() { shown = this.items; }
  }
  let shown;
  const start = bundle.indexOf('function RM('), end = bundle.indexOf('function l4(', start);
  const open = new Function('xM', 'l4', 'ze', bundle.slice(start, end) + ';return RM')({ Menu }, () => {}, () => today);
  open(calendar, task, { x: 12, y: 24 });
  return shown;
}

test('native task menu starts only coherent unfinished tasks from active projects and keeps Open source', async () => {
  const s = await setup();
  const instance = s.calendar.taskStore.getTasks().find(task => task._gtdDay === '2026-11-12' && task.line === 0);
  const menu = nativeMenu(s.calendar, instance);
  assert.equal(menu.has('开始这件'), true);
  await menu.get('开始这件').click();
  assert.equal(s.started[0], instance._gtdSourceTask);
  await menu.get('Open source').click();
  assert.equal(s.opened[0], instance._gtdSourceTask);

  for (const task of s.calendar.taskStore.getTasks().filter(task => task.line > 0)) {
    assert.equal(nativeMenu(s.calendar, task).has('开始这件'), false);
  }
  for (const task of [
    { ...instance, completed: true },
    { ...instance._gtdSourceTask, _gtdReference: null },
    { ...instance._gtdSourceTask, path: '00 GTD/收集.md' },
    { ...instance._gtdSourceTask, path: 'Elsewhere/Example.md' }
  ]) assert.equal(nativeMenu(s.calendar, task).has('开始这件'), false);
  for (const status of ['done', 'paused']) {
    s.changeStatus(status);
    assert.equal(nativeMenu(s.calendar, instance).has('开始这件'), false);
  }
  s.changeStatus('active');
  s.plugin.startCalendarFocusTask = async () => { throw Error('不能启动'); };
  await nativeMenu(s.calendar, instance).get('开始这件').click();
  assert.deepEqual(s.errors, ['不能启动']);
  s.bridge.restore();
  assert.equal(nativeMenu(s.calendar, instance).has('开始这件'), false);
});

test('past canonical due dates appear in the native menu and hover text while only the deadline occurrence is marked', async () => {
  const s = await setup();
  const instances = s.calendar.taskStore.getTasks().filter(task => task.line === 0);
  const [due, arrangement] = instances;
  assert.equal(due._gtdDeadline, true);
  assert.equal(arrangement._gtdDeadline, false);
  assert.equal(arrangement.due, '2026-11-12');
  for (const instance of instances) {
    const label = '原截止 2026-11-08 · 已逾期 4 天';
    assert.equal(nativeMenu(s.calendar, instance).get(label)?.disabled, true);
    assert.equal(s.calendar._gtdOriginalDeadline(instance, '2026-11-12'), label);
    assert.equal(nativeMenu(s.calendar, instance, '2026-11-08').has(label), false);
    assert.equal(nativeMenu(s.calendar, { ...instance, completed: true }).has(label), false);
  }
  s.bridge.restore();
});

test('native breadcrumb locates the canonical dashboard task and falls back to its source when unavailable', async () => {
  const s = await setup();
  const instance = s.calendar.taskStore.getTasks()[1];
  const start = bundle.indexOf('onClick:A=>{', bundle.indexOf('className:"gtd-calendar-context"'));
  const end = bundle.indexOf(',children:', start);
  const click = new Function('a', 'o', 'return ' + bundle.slice(start + 'onClick:'.length, end))(s.calendar, instance);
  const event = target => ({ currentTarget: target, preventDefault() {}, stopPropagation() {} });
  await click(event(home));
  assert.deepEqual(s.located, [instance._gtdSourceTask]);
  assert.deepEqual(s.opened, []);

  await click(event(other));
  s.plugin.locateCalendarTask = async () => false;
  await click(event(home));
  s.plugin.locateCalendarTask = async () => { throw Error('任务位置已变化'); };
  await click(event(home));
  assert.deepEqual(s.opened, Array(3).fill(instance._gtdSourceTask));
  s.bridge.restore();
});

test('completed status filters only dashboard model dates and overdue cards, then refreshes on metadata changes', async () => {
  const s = await setup();
  const [due, arrangement] = s.calendar.taskStore.getTasks();
  const external = { ...due, path: 'Other/Example.md', _gtdSourceTask: null };
  const dayTasks = [arrangement, external];
  const overdueTasks = [due, external];
  const tasksByDate = new Map([['2026-11-08', overdueTasks], ['2026-11-12', dayTasks]]);
  const model = { days: [new Date(2026, 10, 12)], tasksByDate, overdueTasks, visibleTasks: 4 };
  const read = current => s.calendar._gtdCalendarModel(model, { current });
  assert.deepEqual(read(home).tasksByDate.get('2026-11-12'), dayTasks);
  const initialRefreshes = s.refreshed();
  s.changeStatus('done');
  assert.equal(s.refreshed(), initialRefreshes + 1);
  const result = read(home);
  assert.deepEqual(result.tasksByDate.get('2026-11-08'), [external]);
  assert.deepEqual(result.tasksByDate.get('2026-11-12'), [external]);
  assert.deepEqual(result.overdueTasks, [external]);
  assert.equal(result.visibleTasks, 2);
  assert.equal(model.tasksByDate, tasksByDate);
  assert.equal(read(other), model);
  s.changeStatus('active');
  assert.equal(read(home).tasksByDate.get('2026-11-12'), dayTasks);
  s.bridge.restore();
  const finalRefreshes = s.refreshed();
  s.changeStatus('done');
  assert.equal(s.refreshed(), finalRefreshes);
});
