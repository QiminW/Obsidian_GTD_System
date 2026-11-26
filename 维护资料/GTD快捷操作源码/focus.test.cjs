const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const logic = require('./logic.cjs');

const today = '2026-11-26';
const source = [
  '- [ ] <!-- gtd-days: 2026-11-26 --> 报告',
  '  - [ ] <!-- gtd-days: 2026-11-26,2026-11-27 --> 修改报告 #doing 📅 2026-11-26 ^report',
  '  - [x] <!-- gtd-days: 2026-11-26 --> 已完成',
  '  - [-] <!-- gtd-days: 2026-11-26 --> 已取消',
  '- [ ] 仅截止 📅 2026-11-26',
  '- [ ] 已逾期 📅 2026-11-25',
  '- [x] 已交付 📅 2026-11-26',
  '- [ ] <!-- gtd-days: 2026-11-27 --> 明天做',
  '- [ ] <!-- gtd-days: 2026-11-26 --> 有未安排的子任务',
  '  - [ ] 子任务',
  '> - [ ]资料',
  '>   - [ ]校对 ⏳ 2026-11-26',
  '```md', '- [ ] <!-- gtd-days: 2026-11-26 --> 示例代码', '```'
].join('\n');

test('today selects open leaves arranged or due today once, with their actual parent paths', () => {
  const choices = logic.focusTasksForDay(source, today);
  assert.deepEqual(choices.map(task => [task.title, task.parents]), [
    ['修改报告', ['报告']], ['仅截止', []], ['校对', ['资料']]
  ]);
});

function vaultClock() {
  let now = 100_000, saved = null;
  const notices = [], writes = [], timers = new Map();
  let id = 0;
  class Base {}
  const win = {
    setTimeout: fn => { timers.set(++id, fn); return id; },
    clearTimeout: key => timers.delete(key)
  };
  const obsidian = {Plugin: Base, Modal: Base, MarkdownRenderChild: Base,
    Notice: class { constructor(message) { notices.push(message); } }};
  const body = fs.readFileSync(__dirname + '/main-body.js', 'utf8');
  const Plugin = vm.runInNewContext('const module={exports:{}};'+body+';module.exports',
    { require: () => obsidian, window: win, document: {}, Date: {now: () => now}, logic });
  function open() {
    const p = new Plugin(), cleanup = [];
    Object.assign(p, {
      app: {loadLocalStorage: () => saved, saveLocalStorage: (_, value) => { saved=value; writes.push(value); }},
      calendarLayout: {updateFocus() {}}, registerDomEvent() {}, register: fn => cleanup.push(fn)
    });
    p.installFocusTimer();
    return {p, close: () => cleanup.forEach(fn => fn())};
  }
  return {open, writes, notices, timers, advance: ms => { now += ms; }};
}

test('a restored countdown uses the original deadline, clears once, and never writes on tick', () => {
  const clock = vaultClock();
  const a = clock.open();
  a.p.setFocusSession({title: '修改报告', endsAt: 160_000});
  clock.advance(21_500);
  a.p.tickFocusTimer();
  assert.equal(clock.writes.length, 1);
  a.close();
  assert.equal(clock.timers.size, 0);
  const b = clock.open();
  assert.equal(b.p.focusSession.endsAt, 160_000);
  clock.advance(60_000);
  b.p.tickFocusTimer();
  b.p.tickFocusTimer();
  assert.equal(b.p.focusSession, null);
  assert.deepEqual(clock.notices, ['「修改报告」的专注时间到了']);
  assert.equal(clock.writes.length, 2);
  assert.equal(clock.timers.size, 0);
  assert.equal(clock.open().p.focusSession, null);
});

test('ending early clears the saved round and its pending reminder', () => {
  const clock = vaultClock(), {p} = clock.open();
  p.setFocusSession({title:'校对', endsAt:160_000});
  p.setFocusSession(null);
  clock.advance(61_000);
  p.tickFocusTimer();
  assert.equal(clock.open().p.focusSession, null);
  assert.equal(clock.timers.size, 0);
  assert.deepEqual(clock.notices, []);
});

test('a second start cannot replace a running task, and an expiry wins over a late stop click', () => {
  const clock = vaultClock(), {p} = clock.open();
  for (const minutes of [0,-1,1.2,Infinity]) assert.throws(() => p.startFocus('校对', minutes, 100_000));
  p.startFocus('校对', 1, 100_000);
  assert.throws(() => p.startFocus('修改报告', 30, 100_000), /已有一轮/);
  assert.equal(clock.writes.length, 1);
  clock.advance(60_000);
  p.openFocus();
  assert.equal(p.focusSession, null);
  assert.deepEqual(clock.notices, ['「校对」的专注时间到了']);
});
