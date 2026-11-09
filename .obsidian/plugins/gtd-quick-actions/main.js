const logic = (() => { const module = {exports:{}};
function dateValue(value, label) {
  if (!value) return '';
  const text = String(value);
  const parsed = new Date(text + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== text) {
    throw new Error(label + '无效');
  }
  return text;
}
function buildTaskLine(data) {
  const title = String(data.title || '').trim();
  if (!title) throw new Error('请输入任务名称');
  if (/[\r\n]/.test(title)) throw new Error('任务名称请写在一行内');
  const scheduled = dateValue(data.scheduled, '计划日期');
  const due = dateValue(data.due, '截止日期');
  return '- [ ] ' + title + (scheduled ? ' ⏳ ' + scheduled : '') + (due ? ' 📅 ' + due : '');
}
function insertTask(content, taskLine, kind) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const rows = content.split(/\r?\n/);
  const heading = kind === 'inbox' ? /^##\s+待整理\s*$/ : /^##\s+(?:任务|多层任务|任务拆解)\s*$/;
  const start = rows.findIndex(row => heading.test(row));
  if (start === -1) return content.trimEnd() + eol + eol + (kind === 'inbox' ? '## 待整理' : '## 任务') + eol + eol + taskLine + eol;
  let end = rows.findIndex((row, index) => index > start && /^#{1,2}\s/.test(row));
  if (end === -1) end = rows.length;
  const before = rows.slice(0, end);
  while (before.length && before[before.length-1].trim() === '') before.pop();
  const after = rows.slice(end);
  return [...before, taskLine, ...(after.length ? ['', ...after] : [''])].join(eol);
}
function validateProjectName(value) {
  const name = String(value || '').trim();
  if (!name) throw new Error('请输入项目名称');
  if (/[\\/:*?"<>|\r\n]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error('项目名称不能包含路径符号或系统保留名称');
  }
  return name;
}
function buildProjectNote(data) {
  const name = validateProjectName(data.name);
  const deadline = dateValue(data.deadline, '项目截止日期');
  return '---\ntype: gtd-project\narea: ' + JSON.stringify(String(data.area || '工作')) + '\nstatus: active\noutcome: ' + JSON.stringify(String(data.outcome || '').trim()) + '\ndeadline:' + (deadline ? ' ' + deadline : '') + '\n---\n# ' + name + '\n\n## 任务\n\n## 相关资料\n\n## 记录\n';
}
function taskTree(content) {
  const rows = content.split(/\r?\n/);
  const tasks = [], stack = [];
  let frontmatter = rows[0]?.replace(/^\uFEFF/, '') === '---';
  let fence = null;
  let section = -1;
  for (let line = 0; line < rows.length; line++) {
    const raw = rows[line];
    if (frontmatter) {
      if (line > 0 && /^(?:---|\.\.\.)\s*$/.test(raw)) frontmatter = false;
      continue;
    }
    if (fence) {
      const closing = /^\s*(`+|~+)\s*$/.exec(raw);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = null;
      continue;
    }
    const opening = /^\s*(`{3,}|~{3,})/.exec(raw);
    if (opening) { fence = opening[1]; continue; }
    if (/^#{1,6}\s/.test(raw)) { stack.length = 0; section = line; }
    const match = /^([ \t]*)(?:[-*+]|\d+[.)])\s+\[([^\]])\][ \t]+(.*)$/.exec(raw);
    if (!match) continue;
    const indent = match[1], width = indent.replace(/\t/g, '    ').length;
    while (stack.length && stack[stack.length-1].width >= width) stack.pop();
    const title = stripTaskDays(match[3]).replace(/(?:^|\s)#gtd\/group(?=\s|$)/g, '').replace(/[⏳📅🛫✅➕❌]\s*\d{4}-\d{2}-\d{2}/gu, '').replace(/🕒\s*\d{1,2}:\d{2}(?::\d{2})?/gu, '').replace(/\s+\^[\w-]+\s*$/, '').replace(/\s+/g, ' ').trim();
    const item = { line, raw, indent, width, status: match[2], title, depth: stack.length, parentIndent: stack[stack.length-1]?.indent ?? null, parentLine: stack[stack.length-1]?.line ?? null, section };
    item.label = [...stack.map(parent => parent.title), title].join(' › ');
    tasks.push(item);
    stack.push(item);
  }
  return tasks;
}
function taskSourceVersion(content) {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index++) hash = Math.imul(hash ^ content.charCodeAt(index), 16777619);
  return content.length + ':' + (hash >>> 0).toString(16);
}
function listParentTasks(content) {
  const version = taskSourceVersion(content);
  return taskTree(content).filter(task => !['x', 'X', '-', '_'].includes(task.status)).map(task => ({ ...task, version }));
}
function insertSubtask(content, taskLine, reference) {
  if (reference?.version && reference.version !== taskSourceVersion(content)) throw new Error('项目内容已变化，父任务列表已刷新，请重新选择父任务');
  const rows = content.split(/\r?\n/);
  const all = taskTree(content);
  const parent = all.find(task => task.line === reference?.line && task.raw === reference?.raw);
  if (!parent || ['x', 'X', '-', '_'].includes(parent.status)) throw new Error('父任务已变化，请重新选择父任务');
  taskLine = fillTaskDateRows(taskLine, taskTree(taskLine), ancestorTaskDates(content, all, parent));
  let end = parent.line + 1;
  while (end < rows.length) {
    if (rows[end].trim()) {
      const indentation = /^[ \t]*/.exec(rows[end])[0].replace(/\t/g, '    ').length;
      if (indentation <= parent.width) break;
    }
    end++;
  }
  const existingChild = all.find(task => task.line > parent.line && task.line < end && task.width > parent.width);
  const example = all.find(task => task.parentIndent !== null && task.indent.length > task.parentIndent.length);
  const unit = parent.parentIndent !== null ? parent.indent.slice(parent.parentIndent.length) : (example ? example.indent.slice(example.parentIndent.length) : '  ');
  const childIndent = existingChild ? existingChild.indent : parent.indent + (unit || '  ');
  while (end > parent.line + 1 && !rows[end-1].trim()) end--;
  rows.splice(end, 0, childIndent + taskLine);
  return rows.join(content.includes('\r\n') ? '\r\n' : '\n');
}
function retainedParent(parents, previous) {
  if (!previous) return null;
  const normalize = raw => raw.replace(/(?:^|\s)#gtd\/group(?=\s|$)/g, '').trimEnd();
  return parents.find(task => task.line === previous.line && normalize(task.raw) === normalize(previous.raw)) || null;
}
function projectTaskTree(content) {
  const version = taskSourceVersion(content), roots = [], stack = [], occurrences = new Map();
  for (const task of taskTree(content)) {
    while (stack.length > task.depth) stack.pop();
    const parent = stack[stack.length - 1];
    const title = task.title.replace(/(?:^|\s)#(?:doing|gtd\/(?:doing|waiting|someday))(?=\s|$)/g, '').trim();
    const base = (parent ? parent.key : '') + '/' + encodeURIComponent(title);
    const occurrence = occurrences.get(base) || 0;
    occurrences.set(base, occurrence + 1);
    const block = /\s\^([\w-]+)\s*$/.exec(task.raw);
    const node = {
      ...task, title, key: block ? 'block:' + block[1] : base + ':' + occurrence,
      reference: { line: task.line, raw: task.raw, version }, children: [],
      completed: ['x', 'X'].includes(task.status), cancelled: task.status === '-',
      scheduled: /⏳\s*(\d{4}-\d{2}-\d{2})/.exec(task.raw)?.[1] || '',
      due: /📅\s*(\d{4}-\d{2}-\d{2})/.exec(task.raw)?.[1] || ''
      ,days: taskDays(task.raw)
    };
    (parent ? parent.children : roots).push(node);
    stack.push(node);
  }
  function count(node) {
    node.children.forEach(count);
    node.total = node.children.length ? node.children.reduce((sum, n) => sum + n.total, 0) : (node.cancelled ? 0 : 1);
    node.done = node.children.length ? node.children.reduce((sum, n) => sum + n.done, 0) : (node.total && node.completed ? 1 : 0);
  }
  roots.forEach(count);
  return { roots, total: roots.reduce((sum, n) => sum + n.total, 0), done: roots.reduce((sum, n) => sum + n.done, 0) };
}
function partitionCompletedTasks(roots) {
  const summaries = new Map(), activeKeys = new Set(), groups = [];
  let count = 0;
  function summarize(node) {
    const children = node.children.map(summarize);
    const result = { full: node.completed && !node.cancelled && children.every(child => child.full), size: 1 + children.reduce((sum, child) => sum + child.size, 0) };
    summaries.set(node, result);
    return result;
  }
  function collect(node, ancestors) {
    const summary = summaries.get(node);
    if (summary.full) {
      groups.push({ node, ancestors });
      count += summary.size;
      return;
    }
    activeKeys.add(node.key);
    const next = [...ancestors, { key: node.key, title: node.title }];
    node.children.forEach(child => collect(child, next));
  }
  roots.forEach(summarize);
  roots.forEach(node => collect(node, []));
  return { activeKeys, groups, count };
}
function quoteTaskRow(raw) {
  let depth = 0, match;
  while ((match = /^[ \t]*>[ \t]?/.exec(raw))) { depth++; raw = raw.slice(match[0].length); }
  return { depth, raw };
}
function operationTaskTree(content, raw) {
  const depth = quoteTaskRow(raw).depth;
  if (!depth) return taskTree(content);
  const rows = content.split(/\r?\n/);
  const normalized = rows.map(row => {
    const quote = quoteTaskRow(row);
    return quote.depth === depth ? quote.raw : row.trim() ? '# Quote boundary' : '';
  }).join('\n');
  return taskTree(normalized).map(task => ({ ...task, raw: rows[task.line] }));
}
function taskBlockEnd(rows, task) {
  const depth = quoteTaskRow(task.raw).depth;
  let end = task.line + 1;
  for (; end < rows.length; end++) {
    let raw = rows[end];
    if (!raw.trim()) continue;
    if (depth) {
      const quote = quoteTaskRow(raw);
      if (quote.depth !== depth) break;
      raw = quote.raw;
    }
    if (raw.trim() && /^[ \t]*/.exec(raw)[0].replace(/\t/g, '    ').length <= task.width) break;
  }
  return end;
}
function replaceProjectTask(content, reference, replacement, inheritFields = []) {
  if (!reference || reference.version !== taskSourceVersion(content)) throw new Error('项目内容已变化，请在刷新后重新勾选');
  const rows = content.split(/\r?\n/);
  if (rows[reference.line] !== reference.raw) throw new Error('任务位置已变化，请刷新后重新勾选');
  const status = raw => /^[ \t>]*(?:[-*+]|\d+[.)])\s+\[([^\]])\]/.exec(raw)?.[1];
  if (['x','X'].includes(status(replacement)) && !['x','X'].includes(status(reference.raw))) {
    const tasks = operationTaskTree(content, reference.raw), index = tasks.findIndex(task => task.line === reference.line && task.raw === reference.raw);
    let unfinished = 0;
    const end = index >= 0 ? taskBlockEnd(rows, tasks[index]) : reference.line + 1;
    if (index >= 0) for (let next = index + 1; next < tasks.length && tasks[next].line < end; next++) {
      if (!['x','X'].includes(tasks[next].status)) unfinished++;
    }
    if (unfinished) throw new Error('还有 ' + unfinished + ' 项子任务未完成，请先完成子任务');
  }
  const offsets = [0];
  for (const delimiter of content.matchAll(/\r?\n/g)) offsets.push(delimiter.index + delimiter[0].length);
  const offset = offsets[reference.line], suffix = content.slice(offset + reference.raw.length);
  const eol = suffix.startsWith('\r\n') ? '\r\n' : '\n';
  let result = content.slice(0, offset) + replacement.split(/\r?\n/).join(eol) + suffix;
  const before = rawTaskDates(reference.raw), after = rawTaskDates(replacement.split(/\r?\n/)[0]);
  const fields = new Set(inheritFields);
  if (before.due !== after.due) fields.add('due');
  if (JSON.stringify(before.days) !== JSON.stringify(after.days)) fields.add('days');
  const active = [...fields].filter(field => field === 'due' ? !!after.due : after.days.length > 0);
  if (active.length) {
    const tasks = operationTaskTree(result, replacement.split(/\r?\n/)[0]), index = tasks.findIndex(task => task.line === reference.line);
    const children = [];
    const end = index >= 0 ? taskBlockEnd(result.split(/\r?\n/), tasks[index]) : reference.line + 1;
    if (index >= 0) for (let next = index + 1; next < tasks.length && tasks[next].line < end; next++) children.push(tasks[next]);
    result = fillTaskDateRows(result, children, after, active);
  }
  if (['x','X'].includes(status(reference.raw)) && status(replacement) !== undefined && !['x','X'].includes(status(replacement))) {
    const tasks = operationTaskTree(content, reference.raw), target = tasks.find(task => task.line === reference.line);
    // Use the source block boundaries: ordinary list siblings are not task ancestors.
    const ancestors = target ? tasks.filter(task => task.line < target.line && task.width < target.width && target.line < taskBlockEnd(rows, task) && ['x','X'].includes(task.status)) : [];
    for (const task of ancestors.reverse()) {
      const raw = writeTaskRawDate(task.raw.replace(/^([ \t>]*(?:[-*+]|\d+[.)])\s+\[)[xX](\])/, '$1 $2'), '✅', '');
      const start = offsets[task.line];
      result = result.slice(0, start) + raw + result.slice(start + task.raw.length);
    }
  }
  return result;
}
function rawTaskDates(raw) {
  return { due: /📅\s*(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1] || '', days: taskDays(raw) };
}
function ancestorTaskDates(content, tasks, task) {
  const byLine = new Map(tasks.map(node => [node.line, node])), chain = [], rows = content.split(/\r?\n/);
  for (let node = task; node; node = byLine.get(node.parentLine)) if (node === task || task.line < taskBlockEnd(rows, node)) chain.unshift(node);
  const dates = { due: '', days: [] };
  for (const node of chain) {
    const own = rawTaskDates(node.raw);
    if (own.due) dates.due = own.due;
    if (own.days.length) dates.days = own.days;
  }
  return dates;
}
function writeTaskRawDate(raw, symbol, date) {
  const pattern = new RegExp('[ \\t]+' + symbol + '[ \\t]*\\d{4}-\\d{2}-\\d{2}', 'u');
  if (pattern.test(raw)) raw = raw.replace(pattern, date ? ' ' + symbol + ' ' + date : '');
  else if (date) {
    const block = /(\s+\^[\w-]+)\s*$/.exec(raw);
    raw = block ? raw.slice(0, block.index).trimEnd() + ' ' + symbol + ' ' + date + block[1] : raw.trimEnd() + ' ' + symbol + ' ' + date;
  }
  return /\]$/.test(raw) ? raw + ' ' : raw;
}
function fillTaskDateRows(content, tasks, inherited, fields = ['due','days']) {
  if (!tasks.length) return content;
  const stack = [{ depth: -1, end: Infinity, ...inherited }], changes = [], offsets = [0], rows = content.split(/\r?\n/);
  for (const delimiter of content.matchAll(/\r?\n/g)) offsets.push(delimiter.index + delimiter[0].length);
  for (const task of tasks) {
    while (stack.length > 1 && (stack.at(-1).depth >= task.depth || stack.at(-1).end <= task.line)) stack.pop();
    const parent = stack.at(-1), own = rawTaskDates(task.raw);
    let raw = task.raw;
    if (fields.includes('due') && !own.due && parent.due) {
      own.due = dateValue(parent.due, '截止日期'); raw = writeTaskRawDate(raw, '📅', own.due);
    }
    if (fields.includes('days') && !own.days.length && parent.days.length) {
      own.days = parent.days; raw = setTaskDays(raw, own.days);
    }
    stack.push({ depth: task.depth, end: taskBlockEnd(rows, task), ...own });
    if (raw !== task.raw) changes.push({ offset: offsets[task.line], before: task.raw, raw });
  }
  for (const change of changes.reverse()) content = content.slice(0, change.offset) + change.raw + content.slice(change.offset + change.before.length);
  return content;
}
function taskNameParts(raw) {
  const prefix=/^([ \t]*(?:[-*+]|\d+[.)])\s+\[[^\]]\][ \t]+)(.*)$/.exec(raw);
  if(!prefix)throw new Error('找不到任务行');
  const body=prefix[2];
  const metadata=/<!--[\s\S]*?-->|[⏳📅🛫✅➕❌][ \t]*\d{4}-\d{2}-\d{2}|🕒[ \t]*\d{1,2}:\d{2}(?::\d{2})?|🔁[ \t]*.*?(?=[ \t]*(?:[⏳📅🛫✅➕❌🏁🆔⛔🔺⏫🔼🔽⏬])|[ \t]+\^[\w-]+[ \t]*$|$)|🏁[ \t]*(?:delete|keep)|[🔺⏫🔼🔽⏬]|🆔[ \t]*[\w-]+|⛔[ \t]*[\w-]+(?:[ \t]*,[ \t]*[\w-]+)*|(?<!\S)#[\p{L}\p{N}_/-]+|(?<=\s)\^[\w-]+[ \t]*$/gu;
  const ranges=[...body.matchAll(metadata)].map(match=>({start:match.index,end:match.index+match[0].length,text:match[0]}));
  const visible=body.split('');
  for(const range of ranges)for(let i=range.start;i<range.end;i++)visible[i]=' ';
  const plain=visible.join(''),name=plain.replace(/\s+/g,' ').trim();
  return {prefix:prefix[1],body,ranges,plain,name};
}
function editableTaskName(raw) { return taskNameParts(raw).name; }
function renameProjectTask(content,reference,value) {
  const title=String(value??'').trim();
  if(!title)throw new Error('请输入任务名称');
  if(/[\r\n]/.test(title))throw new Error('任务名称请写在一行内');
  if(/<!--\s*gtd-days:|[⏳📅🛫✅➕❌]\s*\d{4}-\d{2}-\d{2}|[🔁🆔⛔🏁🔺⏫🔼🔽⏬]|🕒\s*\d{1,2}:\d{2}|(?:^|\s)\^[\w-]+\s*$/u.test(title))throw new Error('任务名称中请勿填写日期或任务标记');
  // Validate the exact source snapshot before replacing any title characters.
  replaceProjectTask(content,reference,reference?.raw||'');
  const parts=taskNameParts(reference.raw);
  if(title===parts.name)return content;
  const start=parts.plain.search(/\S/),end=parts.plain.trimEnd().length;
  const middle=parts.ranges.filter(range=>range.start>=start&&range.end<=end).map(range=>range.text);
  const leading=/^(?:[ \t]*<!--[\s\S]*?-->[ \t]*)*/.exec(parts.body)[0];
  const body=start<0?leading+title+(parts.body.slice(leading.length)?' '+parts.body.slice(leading.length):''):parts.body.slice(0,start)+title+(middle.length?' '+middle.join(' '):'')+parts.body.slice(end);
  return replaceProjectTask(content,reference,parts.prefix+body);
}
function projectDeadlineValue(value) { return dateValue(value,'项目截止日期'); }
function stripTaskDays(raw) {
  return raw.replace(/[ \t]*<!--\s*gtd-days:\s*[\s\S]*?-->/g, '');
}
function taskDays(raw) {
  const days = [];
  const comments = [...raw.matchAll(/<!--\s*gtd-days:\s*([\s\S]*?)-->/g)];
  if (/<!--\s*gtd-days:/.test(raw) && !comments.length) throw new Error('任务安排记录格式有误');
  for (const comment of comments) for (const date of comment[1].split(/[\s,]+/).filter(Boolean)) days.push(dateValue(date, '安排日期'));
  for (const match of raw.matchAll(/⏳\s*(\d{4}-\d{2}-\d{2})/gu)) days.push(dateValue(match[1], '安排日期'));
  return [...new Set(days)].sort();
}
function setTaskDays(raw, dates) {
  const days = [...new Set(dates.map(date => dateValue(date, '安排日期')).filter(Boolean))].sort();
  let result = stripTaskDays(raw);
  if (!days.length) return result;
  const marker = '<!-- gtd-days: ' + days.join(',') + ' -->';
  const prefix = /^([\s\t>]*(?:[-*+]|\d+[.)])\s+\[[^\]]\][ \t]+)/.exec(result);
  if (!prefix) throw new Error('找不到任务行');
  return prefix[0] + marker + (result.slice(prefix[0].length) ? ' ' + result.slice(prefix[0].length) : '');
}
function setProjectTaskDay(content, reference, date, enabled) {
  if (!reference || reference.version !== taskSourceVersion(content)) throw new Error('项目内容已变化，请刷新后重新安排');
  dateValue(date, '安排日期');
  if (!date) throw new Error('请选择安排日期');
  if (!taskTree(content).some(task => task.line === reference.line && task.raw === reference.raw)) throw new Error('任务位置已变化，请刷新后重新安排');
  const days = new Set(taskDays(reference.raw));
  const add = enabled === undefined ? !days.has(date) : enabled;
  if (add) days.add(date); else days.delete(date);
  const raw = reference.raw.replace(/[ \t]+⏳[ \t]*\d{4}-\d{2}-\d{2}/gu, '');
  return replaceProjectTask(content, reference, setTaskDays(raw, [...days]), ['days']);
}
function migrateTaskDays(content) {
  const offsets = [0];
  for (const delimiter of content.matchAll(/\r?\n/g)) offsets.push(delimiter.index + delimiter[0].length);
  let result = content;
  for (const task of taskTree(content).reverse()) {
    if (!/⏳\s*\d{4}-\d{2}-\d{2}|<!--\s*gtd-days:/u.test(task.raw)) continue;
    const raw = setTaskDays(task.raw.replace(/[ \t]+⏳[ \t]*\d{4}-\d{2}-\d{2}/gu, ''), taskDays(task.raw));
    result = result.slice(0, offsets[task.line]) + raw + result.slice(offsets[task.line] + task.raw.length);
  }
  return result;
}
function preserveTaskDays(original, replacement) {
  const days = taskDays(original), lines = replacement.split(/\r?\n/);
  if (!days.length) return replacement;
  const taskIndexes = lines.map((line, index) => /^\s*(?:[-*+]|\d+[.)])\s+\[[^\]]\]\s/.test(line) ? index : -1).filter(index => index >= 0);
  const recurring = original.includes('🔁') && taskIndexes.length > 1;
  for (const index of taskIndexes) {
    const keep = recurring ? /^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/.test(lines[index]) : index === taskIndexes[0];
    lines[index] = setTaskDays(lines[index], keep ? days : []);
  }
  return lines.join(replacement.includes('\r\n') ? '\r\n' : '\n');
}
function calendarTaskReference(content, source) {
  const reference=source._gtdReference;
  if(!reference)throw new Error('日历正在同步任务，请稍后重试');
  if(reference.version!==taskSourceVersion(content)||reference.raw!==source.raw||reference.line!==source.line||content.split(/\r?\n/)[reference.line]!==reference.raw)throw new Error('任务内容已变化，请刷新日历后重试');
  return reference;
}
function calendarTaskReferences(content, indexed) {
  const tasks=content.split(/\r?\n/).map((raw,line)=>({raw,line})).filter(task=>/^[\s\t>]*(?:[-*+]|\d+[.)])\s+\[(.)\]\s*(.*)$/u.test(task.raw)),byLine=new Map(indexed.map(task=>[task.line,task.raw]));
  if(tasks.length!==indexed.length||tasks.some(task=>byLine.get(task.line)!==task.raw))return null;
  const version=taskSourceVersion(content);
  return new Map(tasks.map(task=>[task.line,{line:task.line,raw:task.raw,version,nativeCalendar:true}]));
}
function calendarLeafTasks(content, indexed) {
  const rows = content.split(/\r?\n/), quotes = new Map(), parents = new Set();
  // Calendar also accepts "- [ ]Task"; normalize only the parsing copy.
  const parseable = rows.map(raw => raw.replace(/^([ \t>]*(?:[-*+]|\d+[.)])\s+\[[^\]]\])(?=\S|$)/, '$1 ')).join('\n');
  for (const task of indexed) quotes.set(quoteTaskRow(task.raw).depth, task.raw);
  for (const raw of quotes.values()) {
    const tasks = operationTaskTree(parseable, raw);
    for (let index = 0; index < tasks.length - 1; index++) {
      const task = tasks[index], next = tasks[index + 1];
      if (next.width > task.width && next.line < taskBlockEnd(rows, task)) parents.add(task.line);
    }
  }
  return indexed.filter(task => !parents.has(task.line));
}
function calendarTaskContexts(content, indexed) {
  const rows=content.split(/\r?\n/),byLine=new Map(indexed.map(task=>[task.line,task])),quotes=new Map(),contexts=new Map();
  const parseable=rows.map(raw=>raw.replace(/^([ \t>]*(?:[-*+]|\d+[.)])\s+\[[^\]]\])(?=\S|$)/,'$1 ')).join('\n');
  for(const task of indexed)quotes.set(quoteTaskRow(task.raw).depth,task.raw);
  const title=node=>node.title.replace(/(?:^|\s)#(?:doing|gtd\/(?:doing|waiting|someday))(?=\s|$)/g,'').trim();
  for(const raw of quotes.values()){
    const stack=[];
    for(const node of operationTaskTree(parseable,raw)){
      while(stack.length&&(stack.at(-1).width>=node.width||stack.at(-1).end<=node.line))stack.pop();
      const task=byLine.get(node.line),parent=stack.at(-1);
      if(task&&task.raw===rows[node.line]){
        const ancestors=stack.map(title),ancestorKeys=stack.map(ancestor=>{const block=/\s\^([\w-]+)\s*$/.exec(ancestor.raw);return block?'block:'+block[1]:'line:'+ancestor.line;});
        contexts.set(node.line,{_gtdAncestors:ancestors,_gtdAncestorKeys:ancestorKeys,_gtdParentTitle:ancestors.at(-1)||'',_gtdGroupKey:JSON.stringify([task.path,parent?ancestorKeys.at(-1):null])});
      }
      stack.push({...node,end:taskBlockEnd(rows,node)});
    }
  }
  return contexts;
}
function calendarTaskInstances(tasks) {
  return tasks.flatMap(task => {
    if (!task.path.startsWith('00 GTD/')) return [task];
    let days;
    try { days = taskDays(task.raw); } catch (_) { return [task]; }
    const dates = new Set(days);
    if (task.due) dates.add(task.due);
    if (!dates.size && task.start) dates.add(task.start);
    if (!dates.size) return [task];
    return [...dates].sort().map(date => ({
      ...task, id: task.id + '::gtd-day:' + date,
      description: stripTaskDays(task.description || '').replace(/\s+\^[\w-]+\s*$/, '').trim(),
      scheduled: date, due: date, start: date, _gtdSourceTask: task, _gtdDay: date,
      _gtdDeadline: task.due === date,
      _gtdKind: days.includes(date) ? 'arrangement' : task.due === date ? 'deadline' : 'start'
    }));
  });
}
function moveSiblingTask(content, from, to, side = 'before') {
  if (!from || !to || from.version !== taskSourceVersion(content) || to.version !== taskSourceVersion(content)) throw new Error('项目内容已变化，请重新拖动');
  if (!['before','after'].includes(side)) throw new Error('未知排序位置');
  const all = taskTree(content), rows = content.split(/\r?\n/);
  const source = all.find(task => task.line === from.line && task.raw === from.raw), target = all.find(task => task.line === to.line && task.raw === to.raw);
  if (!source || !target) throw new Error('任务位置已变化，请重新拖动');
  if (source.line === target.line) return content;
  if (source.parentLine !== target.parentLine || source.section !== target.section || source.width !== target.width) throw new Error('只能调整同级任务的顺序');
  const endOf = task => {
    let end = task.line + 1;
    while (end < rows.length) {
      if (rows[end].trim() && /^[ \t]*/.exec(rows[end])[0].replace(/\t/g,'    ').length <= task.width) break;
      end++;
    }
    while (end > task.line + 1 && !rows[end-1].trim()) end--;
    return end;
  };
  const sourceEnd = endOf(source), targetEnd = endOf(target);
  const records = [...content.matchAll(/[^\r\n]*(?:\r\n|\n|$)/g)].map(match => match[0]).filter(Boolean).map(raw => ({ text:raw.replace(/\r?\n$/,''), eol:/(\r\n|\n)$/.exec(raw)?.[1] || '' }));
  const eol = records[target.line]?.eol || records[source.line]?.eol || records.find(record => record.eol)?.eol || '\n';
  const moved = records.splice(source.line, sourceEnd-source.line);
  let position = side === 'before' ? target.line : targetEnd;
  if (position > source.line) position -= moved.length;
  records.splice(position,0,...moved);
  const finalNewline = /\r?\n$/.test(content);
  return records.map((record,index) => record.text + (index < records.length-1 ? record.eol || eol : finalNewline ? record.eol || eol : '')).join('');
}
function orderProjectPaths(paths, order) {
  const available = new Set(paths), seen = new Set(), result = [];
  const name=path=>path.replace(/\.md$/i,'').split('/').pop();
  const fallback=[...available].sort((a,b)=>name(a).localeCompare(name(b))||a.localeCompare(b));
  for (const path of [...(Array.isArray(order)?order:[]), ...fallback]) if (available.has(path) && !seen.has(path)) { seen.add(path);result.push(path); }
  return result;
}
function moveDisplayItem(paths, source, target, side = 'before') {
  if (!paths.includes(source) || !paths.includes(target) || !['before','after'].includes(side)) throw new Error('排序项目已变化，请重试');
  if (source === target) return [...paths];
  const result = paths.filter(path => path !== source), position = result.indexOf(target) + (side === 'after' ? 1 : 0);
  result.splice(position,0,source);return result;
}
function deleteProjectTask(content, reference) {
  if (!reference || reference.version !== taskSourceVersion(content)) throw new Error('项目内容已变化，请刷新后重新删除');
  const rows = content.split(/\r?\n/), all = taskTree(content);
  let task = all.find(item => item.line === reference.line && item.raw === reference.raw),nativeOnly=false;
  if(!task&&reference.nativeCalendar&&rows[reference.line]===reference.raw){const match=/^([\s\t>]*)(?:[-*+]|\d+[.)])\s+\[(.)\]\s*(.*)$/u.exec(reference.raw);if(match){nativeOnly=true;task={line:reference.line,raw:reference.raw,width:0,title:stripTaskDays(match[3]).replace(/[⏳📅🛫✅➕❌]\s*\d{4}-\d{2}-\d{2}/gu,'').trim()};}}
  if (!task) throw new Error('任务位置已变化，请刷新后重新删除');
  let end = task.line + 1;
  while (!nativeOnly && end < rows.length) {
    if (rows[end].trim() && /^[ \t]*/.exec(rows[end])[0].replace(/\t/g, '    ').length <= task.width) break;
    end++;
  }
  while (end > task.line + 1 && !rows[end - 1].trim()) end--;
  const offsets = [0];
  for (const delimiter of content.matchAll(/\r?\n/g)) offsets.push(delimiter.index + delimiter[0].length);
  const atLine = line => offsets[line] ?? content.length;
  const offset = atLine(task.line), finish = atLine(end);
  const next = content.slice(0, offset) + content.slice(finish);
  return {
    content: next, title: task.title, count: Math.max(1,all.filter(item => item.line >= task.line && item.line < end).length),
    undo: { offset, text: content.slice(offset, finish), version: taskSourceVersion(next) }
  };
}
function restoreProjectTask(content, undo) {
  if (!undo || undo.version !== taskSourceVersion(content)) throw new Error('项目内容已变化，无法直接撤销此次删除');
  if (!Number.isInteger(undo.offset) || undo.offset < 0 || undo.offset > content.length || typeof undo.text !== 'string') throw new Error('撤销内容无效');
  return content.slice(0, undo.offset) + undo.text + content.slice(undo.offset);
}
function markdownStructure(rows) {
  const headings=[],writable=[];
  let frontmatter=rows[0]?.replace(/^\uFEFF/,'')==='---',fence=null;
  for(let line=0;line<=rows.length;line++) {
    writable[line]=!frontmatter&&!fence;
    if(line===rows.length)break;
    const raw=rows[line];
    if(frontmatter){if(line>0&&/^(?:---|\.\.\.)\s*$/.test(raw))frontmatter=false;continue;}
    if(fence){const closing=/^\s*(`+|~+)\s*$/.exec(raw);if(closing&&closing[1][0]===fence[0]&&closing[1].length>=fence.length)fence=null;continue;}
    const opening=/^\s*(`{3,}|~{3,})/.exec(raw);if(opening){fence=opening[1];continue;}
    const heading=/^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    if(heading)headings.push({line,level:heading[1].length,title:heading[2]});
  }
  return {headings,writable};
}
function prepareInboxMove(source, reference, target, parent = null) {
  if (!reference || reference.version !== taskSourceVersion(source)) throw new Error('收集箱内容已变化，请重新选择移入项');
  const task = taskTree(source).find(item => item.line === reference.line && item.raw === reference.raw);
  if (!task) throw new Error('收集项位置已变化，请刷新后重试');
  if (['x','X','-','_'].includes(task.status)) throw new Error('已完成或取消的收集项不能移入项目');
  const removed = deleteProjectTask(source, reference);
  const block = removed.undo.text.replace(/(?:\r?\n)+$/, '').split(/\r?\n/).map(line => line.startsWith(task.indent) ? line.slice(task.indent.length) : line);
  const rows = target.split(/\r?\n/), all = taskTree(target), structure=markdownStructure(rows);
  const offsets = [0];for (const delimiter of target.matchAll(/\r?\n/g)) offsets.push(delimiter.index + delimiter[0].length);
  let end, indent = '';
  if (parent) {
    if (parent.version !== taskSourceVersion(target)) throw new Error('项目内容已变化，请重新选择父任务');
    const node = all.find(item => item.line === parent.line && item.raw === parent.raw);
    if (!node || ['x','X','-','_'].includes(node.status)) throw new Error('父任务已变化或已完成，请重新选择');
    const captured = block.join('\n');
    block.splice(0, block.length, ...fillTaskDateRows(captured, taskTree(captured), ancestorTaskDates(target, all, node)).split('\n'));
    end = node.line + 1;
    while (end < rows.length && (!rows[end].trim() || /^[ \t]*/.exec(rows[end])[0].replace(/\t/g,'    ').length > node.width)) end++;
    const child = all.find(item => item.parentLine === node.line);
    const example = all.find(item => item.parentIndent !== null);
    const unit = node.parentIndent !== null ? node.indent.slice(node.parentIndent.length) : example ? example.indent.slice(example.parentIndent.length) : '  ';
    indent = child?.indent || node.indent + (unit || '  ');
    while (end > node.line + 1 && !rows[end - 1].trim()) end--;
  } else {
    const start = structure.headings.find(heading=>heading.level===2&&/^(?:任务|多层任务|任务拆解)$/.test(heading.title))?.line ?? -1;
    if (start < 0) {
      if(!structure.writable[rows.length])throw new Error('项目笔记存在未关闭的属性或代码块，请先修正');
      const eol = /\r?\n/.exec(target)?.[0] || '\n';
      const separator = !target ? '' : target.endsWith(eol + eol) ? '' : /\r?\n$/.test(target) ? eol : eol + eol;
      return { source: removed.content, target: target + separator + '## 任务' + eol + eol + block.join(eol) + eol, sourceBefore: source, targetBefore: target };
    }
    end = structure.headings.find(heading=>heading.line>start&&heading.level<=2)?.line ?? -1;
    if (end < 0) end = rows.length;
    while (end > start + 1 && !rows[end - 1].trim()) end--;
  }
  if(!structure.writable[end])throw new Error('目标位置位于代码块或属性中，请先修正项目笔记');
  const offset = offsets[end] ?? target.length;
  const eol = end > 0 ? /(?:\r\n|\n)$/.exec(target.slice(0, offset))?.[0] || /\r?\n/.exec(target)?.[0] || '\n' : '\n';
  const prefix = target.slice(0, offset), suffix = target.slice(offset);
  const inserted = (prefix && !/\r?\n$/.test(prefix) ? eol : '') + block.map(line => line ? indent + line : '').join(eol) + (suffix || /\r?\n$/.test(target) ? eol : '');
  return { source: removed.content, target: prefix + inserted + suffix, sourceBefore: source, targetBefore: target };
}
async function commitInboxMove(plan, writeSource, writeTarget) {
  await writeTarget(plan.targetBefore, plan.target);
  try { await writeSource(plan.sourceBefore, plan.source); }
  catch (error) {
    try { await writeTarget(plan.target, plan.targetBefore); }
    catch (_) { throw new Error('收集项仍保留在收集箱；目标项目已有新修改，请检查其中的重复项'); }
    throw error;
  }
}
function updateProjectTaskDate(content, reference, field, value) {
  if (!reference || reference.version !== taskSourceVersion(content)) throw new Error('项目内容已变化，请刷新后重新设置日期');
  const symbol = { scheduled: '⏳', due: '📅' }[field];
  if (!symbol) throw new Error('未知日期字段');
  const date = dateValue(value, field === 'scheduled' ? '计划日期' : '截止日期');
  if (!taskTree(content).some(task => task.line === reference.line && task.raw === reference.raw)&&!(reference.nativeCalendar&&content.split(/\r?\n/)[reference.line]===reference.raw&&/^[\s\t>]*(?:[-*+]|\d+[.)])\s+\[(.)\]\s*(.*)$/u.test(reference.raw))) throw new Error('任务位置已变化，请刷新后重新设置日期');
  return replaceProjectTask(content, reference, writeTaskRawDate(reference.raw, symbol, date), [field === 'due' ? 'due' : 'days']);
}
function nextAreaFolder(value, folders) {
  const name = validateProjectName(value);
  if (folders.some(folder => folder.replace(/^\d+\s*/, '').toLowerCase() === name.toLowerCase())) throw new Error('已存在同名领域');
  const maximum = folders.reduce((max, folder) => {
    const match = /^(\d+)\s/.exec(folder);
    return match ? Math.max(max, Number(match[1])) : max;
  }, -1);
  return String(maximum + 1).padStart(2, '0') + ' ' + name;
}
function buildAreaNote(data) {
  const name = validateProjectName(data.name);
  return '---\ntype: gtd-area\narea: ' + JSON.stringify(name) + '\nstatus: active\n---\n# ' + name + '\n\n[[00 GTD/首页|首页]] · [[00 GTD/00 工作区/00 功能页面/项目总览|项目]]\n\n## 项目\n\n```dataview\nLIST FROM ' + JSON.stringify(data.folder) + '\nSORT file.name ASC\n```\n';
}
module.exports = { buildTaskLine, insertTask, validateProjectName, buildProjectNote, nextAreaFolder, buildAreaNote, listParentTasks, insertSubtask, retainedParent, projectTaskTree, partitionCompletedTasks, replaceProjectTask, editableTaskName, renameProjectTask, projectDeadlineValue, deleteProjectTask, restoreProjectTask, updateProjectTaskDate, stripTaskDays, taskDays, setTaskDays, setProjectTaskDay, migrateTaskDays, preserveTaskDays, calendarTaskReference, calendarTaskReferences, calendarLeafTasks, calendarTaskContexts, calendarTaskInstances, moveSiblingTask, orderProjectPaths, moveDisplayItem, prepareInboxMove, commitInboxMove };

return module.exports;
})();
const installTaskCalendarBridge = (() => { const module = {exports:{}};
module.exports = function installTaskCalendarBridge(plugin, logic, Notice) {
  const calendar = plugin.app.plugins.plugins['tasks-calendar'];
  if (!calendar?.taskStore) return null;
  const store = calendar.taskStore, restores = [], snapshots=new Map(), revisions=new Map(), events=[];
  let disposed=false,refreshTimer;
  const refresh=()=>{window.clearTimeout(refreshTimer);refreshTimer=window.setTimeout(()=>{if(!disposed)calendar.refreshCalendars();},25);};
  const workspace=plugin.app.workspace,orderEvent=workspace?.on('gtd-project-order-changed',refresh);
  if(orderEvent)restores.push(()=>workspace.offref(orderEvent));
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
  const previousFeedback = calendar._gtdTaskError;
  const feedback = (task, error, fallback) => inGtd(source(task)) ? plugin.showTaskActionError(error) : new Notice(fallback);
  calendar._gtdTaskError = feedback;
  restores.push(() => { if (calendar._gtdTaskError === feedback) { if (previousFeedback === undefined) delete calendar._gtdTaskError; else calendar._gtdTaskError = previousFeedback; } });
  const foldedGroups=new Set(),previousDayRenderer=calendar._gtdRenderDayTasks;
  const renderDayGroups=options=>{
    const {mode,gridRef,date,active,completed,jsx,sortable,strategy,renderTask}=options;
    if(mode!=='day'||plugin.data?.calendarDayLayout!=='group'||!gridRef.current?.closest('.gtd-dashboard'))return null;
    const groups=new Map();
    const tasks=[...active,...completed],paths=[...new Set(tasks.map(task=>task.path))];
    const ranks=new Map(logic.orderProjectPaths(paths,plugin.data.projectOrder).map((path,index)=>[path,index]));
    tasks.sort((a,b)=>ranks.get(a.path)-ranks.get(b.path)||(source(a).line??Infinity)-(source(b).line??Infinity));
    const makeGroup=(key,label,full)=>({key,label,full,tasks:[],entries:[],children:new Map(),done:0,total:0});
    const count=(group,task)=>{group.total++;if(task.completed)group.done++;};
    for(const task of tasks){
      const project=task.path.replace(/\.md$/i,'').split('/').pop(),projectKey=JSON.stringify([task.path,null]);
      if(!groups.has(projectKey))groups.set(projectKey,makeGroup(projectKey,project,project));
      let group=groups.get(projectKey);count(group,task);
      const ancestors=task._gtdAncestors||(task._gtdParentTitle?[task._gtdParentTitle]:[]),keys=[];
      ancestors.forEach((label,index)=>{
        keys.push(task._gtdAncestorKeys?.[index]||(index===ancestors.length-1&&task._gtdGroupKey)||'name:'+label);
        const key=JSON.stringify([task.path,keys]);
        if(!group.children.has(key)){const child=makeGroup(key,label,[project,...ancestors.slice(0,index+1)].join(' › '));group.children.set(key,child);group.entries.push({group:child});}
        group=group.children.get(key);count(group,task);
      });
      group.tasks.push(task);group.entries.push({task});
    }
    const renderGroup=group=>{
      const key=date+'::'+group.key;
      return jsx.jsxs('details',{className:'gtd-calendar-task-group',open:!foldedGroups.has(key),onToggle:event=>{if(event.currentTarget.open)foldedGroups.delete(key);else foldedGroups.add(key);},children:[
        jsx.jsxs('summary',{className:'gtd-calendar-group-heading','aria-label':group.full,onClick:event=>event.stopPropagation(),onDoubleClick:event=>event.stopPropagation(),children:[jsx.jsx('span',{className:'gtd-calendar-group-title',children:group.label}),jsx.jsx('span',{className:'gtd-calendar-group-count',children:group.done+'/'+group.total})]}),
        jsx.jsx('div',{className:'gtd-calendar-group-list',children:jsx.jsx(sortable,{id:`tasks:${date}:group:${group.key}:source`,items:group.tasks.map(task=>task.id),strategy,children:group.entries.map(entry=>entry.task?renderTask(entry.task):renderGroup(entry.group))})})
      ]},key);
    };
    return [...groups.values()].map(renderGroup);
  };
  calendar._gtdRenderDayTasks=renderDayGroups;
  restores.push(()=>{if(calendar._gtdRenderDayTasks===renderDayGroups){if(previousDayRenderer===undefined)delete calendar._gtdRenderDayTasks;else calendar._gtdRenderDayTasks=previousDayRenderer;}});
  function wrap(target, name, make) {
    const original = target[name];
    if (typeof original !== 'function') return;
    const wrapped = make(original);
    target[name] = wrapped;
    restores.push(() => { if (target[name] === wrapped) target[name] = original; });
  }
  wrap(store, 'getTasks', original => function () {
    const tasks=original.call(this),groups=new Map(),references=new Map(),leaves=new Map(),contexts=new Map();
    for(const task of tasks)if(inGtd(task)){if(!groups.has(task.path))groups.set(task.path,[]);groups.get(task.path).push(task);}
    for(const [path,indexed] of groups){const text=snapshots.get(path);references.set(path,text===undefined?null:logic.calendarTaskReferences(text,indexed));if(text!==undefined)leaves.set(path,new Set(logic.calendarLeafTasks(text,indexed).map(task=>task.line)));if(references.get(path))contexts.set(path,logic.calendarTaskContexts(text,indexed));}
    return logic.calendarTaskInstances(tasks.filter(task=>!inGtd(task)||!leaves.has(task.path)||leaves.get(task.path).has(task.line)).map(task=>inGtd(task)?{...task,...contexts.get(task.path)?.get(task.line),_gtdReference:references.get(task.path)?.get(task.line)||null}:task));
  });
  wrap(store, 'replaceTask', original => async function (task, replacement) {
    const canonical = source(task);
    if (!inGtd(canonical)) return original.call(this, task, replacement);
    plugin.clearTaskActionNotice();
    return plugin.mutateCalendarTask(canonical, (content, reference) =>
      logic.replaceProjectTask(content, reference, logic.preserveTaskDays(canonical.raw, replacement)));
  });
  wrap(calendar, 'toggleTask', original => function (task) {
    const canonical = source(task);
    if (inGtd(canonical)) plugin.clearTaskActionNotice();
    if (!inGtd(canonical) || !logic.taskDays(canonical.raw).length) return original.call(this, canonical);
    return original.call(this, { ...canonical, raw: logic.stripTaskDays(canonical.raw), _gtdSourceTask: canonical });
  });
  wrap(calendar, 'openTask', original => function (task) { const canonical=source(task);if(inGtd(canonical))plugin.clearTaskActionNotice();return original.call(this, canonical); });
  wrap(calendar, 'createTask', original => function (date) { if(this.settings?.newTaskFile?.trim().startsWith('00 GTD/'))plugin.clearTaskActionNotice();return original.call(this,date); });
  wrap(calendar, 'editTask', original => function (task) {
    const canonical = source(task);
    if (inGtd(canonical)) plugin.clearTaskActionNotice();
    if (!inGtd(canonical) || !logic.taskDays(canonical.raw).length) return original.call(this, canonical);
    return original.call(this, { ...canonical, raw: logic.stripTaskDays(canonical.raw), description: logic.stripTaskDays(canonical.description || ''), _gtdSourceTask: canonical });
  });
  wrap(calendar, 'rescheduleTask', original => async function (task, date) {
    const canonical = source(task);
    if (!inGtd(canonical) || !task._gtdKind) return original.call(this, canonical, date);
    if (task._gtdDay === date) return;
    plugin.clearTaskActionNotice();
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
    } catch (error) { plugin.showTaskActionError(error); }
  });
  wrap(calendar, 'deleteTask', original => async function (task) {
    const canonical = source(task);
    if (!inGtd(canonical)) return original.call(this, canonical);
    plugin.clearTaskActionNotice();
    try {
      const result = await plugin.mutateCalendarTask(canonical, (content, reference) => logic.deleteProjectTask(content, reference));
      plugin.showTaskDeletionUndo({ path: canonical.path, title: result.title, count: result.count, undo: result.undo });
      return true;
    } catch (error) { plugin.showTaskActionError(error); return false; }
  });
  calendar.refreshCalendars();
  return { calendar, store, restore() { disposed=true;window.clearTimeout(refreshTimer);events.forEach(event=>plugin.app.vault.offref(event));snapshots.clear();restores.reverse().forEach(restore => restore()); calendar.refreshCalendars(); } };
};

return module.exports;
})();
const installCalendarLayout = (() => { const module = {exports:{}};
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
  const refreshCalendar=()=>plugin.app?.plugins?.plugins?.['tasks-calendar']?.refreshCalendars();
  function setDayLayout(layout){
    plugin.data.calendarDayLayout=layout;
    sync();refreshCalendar();
    Promise.resolve(plugin.saveData(plugin.data)).catch(error=>console.error('GTD 日历显示设置未保存',error));
  }
  function compactTasks(root, compact) {
    const controlled = new Set();
    for (const list of root.querySelectorAll('.tasks-calendar-grid:is(.is-day,.is-week) .tasks-calendar-task-list,.tasks-calendar-overdue-list')) {
      const tasks = [...list.querySelectorAll(':scope > .tasks-calendar-task,:scope > .gtd-calendar-task-group .tasks-calendar-task')];
      tasks.forEach((task, index) => {
        controlled.add(task);
        if (compact && index >= 3) task.setAttribute('data-gtd-compact-hidden', 'true');
        else task.removeAttribute('data-gtd-compact-hidden');
      });
      for(const group of list.querySelectorAll('.gtd-calendar-task-group')){
        const hidden=compact&&[...group.querySelectorAll('.tasks-calendar-task')].every(task=>task.hasAttribute('data-gtd-compact-hidden'));
        if(hidden)group.setAttribute('data-gtd-compact-group-hidden','true');else group.removeAttribute('data-gtd-compact-group-hidden');
      }
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
    restoreTooltips(entry); entry.button.remove(); entry.contextSwitch.remove(); root.removeEventListener('click', entry.onMore, true);
    root.querySelectorAll('[data-gtd-compact-more]').forEach(button => button.remove());
    root.querySelectorAll('[data-gtd-compact-hidden]').forEach(task => task.removeAttribute('data-gtd-compact-hidden'));
    root.querySelectorAll('[data-gtd-compact-group-hidden]').forEach(group=>group.removeAttribute('data-gtd-compact-group-hidden'));
    root.classList.remove('gtd-calendar-compact','gtd-calendar-day-path');
  }
  function sync() {
    if (disposed) return;
    let newGroupedCalendar=false;
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
        const contextSwitch=doc.createElement('div');contextSwitch.className='gtd-calendar-context-switch';contextSwitch.setAttribute('role','group');contextSwitch.setAttribute('aria-label','日视图任务显示方式');
        for(const [layout,text] of [['path','路径'],['group','分组']]){
          const choice=doc.createElement('button');choice.type='button';choice.textContent=text;choice.dataset.gtdCalendarLayout=layout;choice.setAttribute('aria-label',layout==='path'?'单行归属路径':'按父任务分组');
          choice.addEventListener('click',()=>setDayLayout(layout));contextSwitch.append(choice);
        }
        const onMore = event => {
          const more = event.target.closest?.('.tasks-calendar-more');
          if (!more || more.closest(selector) !== root || plugin.data.calendarCompact !== true) return;
          const dayButton = more.closest('.tasks-calendar-day')?.querySelector('.tasks-calendar-day-number');
          const custom = more.hasAttribute('data-gtd-compact-more');
          setCompact(false);
          if (custom) { event.preventDefault(); event.stopPropagation(); dayButton?.click(); }
        };
        root.addEventListener('click', onMore, true);
        entry = { button, contextSwitch, onMore, cardNames: new Map() }; entries.set(root, entry);
        if(plugin.data.calendarDayLayout==='group')newGroupedCalendar=true;
      }
      const compact = plugin.data.calendarCompact === true, button = entry.button;
      root.classList.toggle('gtd-calendar-compact', compact);
      const text = compact ? '<>' : '><', label = compact ? '恢复自适应高度' : '收起部分任务';
      if (button.textContent !== text) button.textContent = text;
      button.title = label;
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(compact));
      if (button.parentElement !== controls) controls.insertBefore(button, controls.querySelector('.tasks-calendar-mode-switch'));
      const day=!!root.querySelector('.tasks-calendar-grid.is-day'),layout=plugin.data.calendarDayLayout==='group'?'group':'path';
      entry.contextSwitch.hidden=!day;root.classList.toggle('gtd-calendar-day-path',day&&layout==='path');
      if(entry.contextSwitch.parentElement!==controls)controls.insertBefore(entry.contextSwitch,button);
      for(const choice of entry.contextSwitch.children)if(choice.getAttribute('aria-pressed')!==String(choice.dataset.gtdCalendarLayout===layout))choice.setAttribute('aria-pressed',String(choice.dataset.gtdCalendarLayout===layout));
      compactTasks(root, compact);
      const cards = new Set(root.querySelectorAll('.tasks-calendar-task'));
      for (const card of entry.cardNames.keys()) if (!cards.has(card)) entry.cardNames.delete(card);
      for (const card of cards) {
        const project = projectOf(card);
        const name = card.querySelector('.tasks-calendar-task-title')?.textContent.trim();
        if (!project || !name) continue;
        const parents=card.dataset.gtdParentPath;
        const label = parents ? '所属位置：'+project+' › '+parents : '所属项目：' + project;
        entry.cardNames.set(card, name);
        if (card.getAttribute('aria-label') !== label) card.setAttribute('aria-label', label);
      }
    }
    if(newGroupedCalendar)refreshCalendar();
  }
  const containsCalendar = node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector));
  const observer = new doc.defaultView.MutationObserver(records => {
    if (records.some(record => record.target.nodeType === 1 && record.target.closest(selector) && (record.type !== 'attributes' || record.target.matches('.tasks-calendar-task,.tasks-calendar-grid'))
      || [...record.addedNodes, ...record.removedNodes].some(containsCalendar))) sync();
  });
  observer.observe(scope === doc ? doc.body : scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'data-gtd-project','data-gtd-parent-path','class'] });
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

return module.exports;
})();
const UndoHistory = (() => { const module = {exports:{}};
module.exports=class UndoHistory {
 constructor(){this.entries=[];this.tail=Promise.resolve();this.current=null;this.restoring=false;this.pending=0;}
 enqueue(action){
  this.pending++;
  const result=this.tail.then(action);this.tail=result.catch(()=>{});
  return result.finally(()=>this.pending--);
 }
 run(label,action){return this.enqueue(async()=>{
  const entry={label,steps:[]};this.current=entry;
  try{return await action();}
  finally{this.current=null;if(entry.steps.length){this.entries.push(entry);if(this.entries.length>30)this.entries.shift();}}
 });}
 record(step){if(this.current&&!this.restoring)this.current.steps.push(step);}
 undo(){return this.enqueue(async()=>{
  const entry=this.entries.at(-1);if(!entry)return null;
  for(const step of entry.steps)await step.check();
  this.restoring=true;const restored=[];
  try{
   for(const step of [...entry.steps].reverse()){await step.undo();restored.push(step);}
   this.entries.pop();return entry.label;
  }catch(error){
   try{for(const step of restored.reverse())await step.redo();}
   catch(rollback){throw new Error('撤销未完成，请检查相关笔记：'+(rollback.message||String(rollback)));}
   throw error;
  }finally{this.restoring=false;}
 });}
 clear(){return this.enqueue(async()=>{this.entries.length=0;});}
};

return module.exports;
})();
const TreeKeyboard = (() => { const module = {exports:{}};
function treeKeyAction(rows,id,key){
 const index=rows.findIndex(row=>row.id===id),row=rows[index],none={type:'none'};
 if(!row)return none;
 const focus=next=>({type:'focus',id:next.id}),toggle=expanded=>({type:'toggle',id,expanded});
 if(key==='ArrowUp')return focus(rows[Math.max(0,index-1)]);
 if(key==='ArrowDown')return focus(rows[Math.min(rows.length-1,index+1)]);
 if(key==='Home')return focus(rows[0]);
 if(key==='End')return focus(rows.at(-1));
 if(key===' '||key==='Spacebar')return {type:'rename',id};
 if(key==='='||key==='+')return {type:'add',id};
 if(key==='Delete')return row.deletable?{type:'delete',id}:none;
 if(key==='t'||key==='T')return row.canToday?{type:'today',id}:none;
 if(key==='Enter')return row.branch?toggle(!row.expanded):none;
 if(key==='ArrowLeft')return row.branch&&row.expanded?toggle(false):row.parent&&rows.some(item=>item.id===row.parent)?focus(rows.find(item=>item.id===row.parent)):none;
 if(key==='ArrowRight')return row.branch&&!row.expanded?toggle(true):row.branch&&rows[index+1]?.parent===id?focus(rows[index+1]):none;
 return none;
}

function installTreeKeyboard(table,{state={},isActive=()=>true,onError=console.error}={}){
 const doc=table.ownerDocument,win=doc.defaultView,bindings=new WeakMap();let disposed=false,initializing=true,frame;
 const all=()=>[...table.querySelectorAll('[data-gtd-tree-row]')].map(element=>bindings.get(element)).filter(Boolean);
 const visible=()=>all().filter(row=>{
  if(!row.element.isConnected||!row.element.getClientRects().length)return false;
  for(let parent=row.element.parentElement;parent&&parent!==table;parent=parent.parentElement){
   if(parent.hidden)return false;
   if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(row.element))return false;
  }
  return true;
 });
 const model=row=>({id:row.id,parent:row.parent,branch:!!row.toggle,expanded:!!row.expanded?.(),deletable:!!row.remove,canToday:!!row.today});
 const rowFor=target=>bindings.get(target?.closest?.('[data-gtd-tree-row]'));
 const remember=row=>{if(!row)return;state.active=row.id;state.index=Math.max(0,visible().findIndex(item=>item.id===row.id));};
 function selected(rows){
  let row=all().find(item=>item.id===state.active);const visited=new Set();
  while(row&&!rows.includes(row)&&!visited.has(row.id)){visited.add(row.id);row=all().find(item=>item.id===row.parent);}
  return row&&rows.includes(row)?row:rows[Math.min(state.index||0,Math.max(0,rows.length-1))];
 }
 function paint(){
  const rows=visible(),active=selected(rows);if(active)state.active=active.id;
  for(const row of all())row.element.tabIndex=row===active?0:-1;
  return active;
 }
 function focus(row,scroll=false){
  if(!row)return;remember(row);state.restore=true;paint();row.element.focus({preventScroll:true});
  if(scroll)row.element.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 function refresh(){
  if(disposed||initializing)return;win.cancelAnimationFrame(frame);
  frame=win.requestAnimationFrame(()=>{
   if(disposed||!table.isConnected)return;
   const active=paint(),focused=doc.activeElement;
   if(active&&state.restore&&isActive()&&!active.element.querySelector('form[data-gtd-name-editor]')&&(focused===doc.body||focused===table))focus(active);
  });
 }
 const capture=()=>{const row=rowFor(doc.activeElement);if(row&&table.contains(doc.activeElement)){remember(row);state.restore=true;}};
 const focusin=event=>{
  if(table.contains(event.target)){remember(rowFor(event.target));state.restore=true;}
  else if(isActive()&&event.target!==doc.body)state.restore=false;
 };
 const pointer=event=>{
  if(!table.contains(event.target)){if(isActive())state.restore=false;return;}
  const row=rowFor(event.target);remember(row);
  if(row&&!event.target.closest('button,input,textarea,select,a,summary,[contenteditable="true"]'))focus(row);
 };
 const keydown=event=>{
  const addKey=event.key==='='||event.key==='+'||event.code==='Equal';
  const todayKey=event.key==='t'||event.key==='T';
  if(!isActive()||event.defaultPrevented||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey&&!addKey&&!todayKey)return;
  const target=event.target,row=rowFor(target);if(!row||target.isContentEditable||target.closest('input,textarea,select,[data-gtd-name-editor],.gtd-inline-task-entry'))return;
  const navigation=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key);
  if(target!==row.element&&!navigation)return;
  const action=treeKeyAction(visible().map(model),row.id,addKey?'=':event.key);
  if(action.type==='none'&&!['Enter','ArrowLeft','ArrowRight','Delete','t','T'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();remember(row);state.restore=true;
  if(event.repeat&&['delete','today'].includes(action.type))return;
  if(action.type==='focus')focus(visible().find(item=>item.id===action.id),true);
  else if(action.type==='toggle')Promise.resolve(row.toggle(action.expanded)).then(refresh).catch(onError);
  else if(action.type==='rename')Promise.resolve(row.rename()).catch(onError);
  else if(action.type==='add')Promise.resolve(row.add?.()).catch(onError);
  else if(action.type==='delete')Promise.resolve(row.remove()).catch(onError);
  else if(action.type==='today')Promise.resolve(row.today()).catch(onError);
 };
 table.addEventListener('keydown',keydown);doc.addEventListener('focusin',focusin,true);doc.addEventListener('pointerdown',pointer,true);
 return {
  register(element,options){
   const row={...options,element};bindings.set(element,row);element.dataset.gtdTreeRow=row.id;element.tabIndex=-1;
   if(options.label)element.setAttribute('aria-label',options.label);
   element.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown Space Enter = Shift+='+(options.remove?' Delete':'')+(options.today?' t':'')+' ArrowLeft ArrowRight Home End');
  },capture,refresh,finish(){initializing=false;refresh();},
  dispose(){if(disposed)return;disposed=true;win.cancelAnimationFrame(frame);table.removeEventListener('keydown',keydown);doc.removeEventListener('focusin',focusin,true);doc.removeEventListener('pointerdown',pointer,true);}
 };
}
module.exports={treeKeyAction,installTreeKeyboard};

return module.exports;
})();
const { Plugin, Modal, Notice, TFile, TFolder, Menu, MarkdownRenderChild, MarkdownRenderer, Component, setIcon, parseYaml, stringifyYaml } = require('obsidian');
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
    this.calendarLayout = installCalendarLayout(this);
    this.register(() => this.calendarLayout?.destroy());
    this.inlineTaskEntries = new Map();
    this.inlineTaskFocusKey = '';
    this.taskTitleEdits = new Map();
    this.taskTitleFocusKey = '';
    this.projectNameEdits = new Map();
    this.projectNameFocusKey = '';
    this.nameEditRequest = 0;
    this.taskDayPanels = new Map();
    this.register(() => this.clearTaskActionNotice());
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
      this.navigationTimer = window.setTimeout(() => { this.installBoardNavigation(); this.installTaskCalendarBridge();for(const controller of this.projectKeyboardControllers?.values()||[])controller.refresh(); }, 80);
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
    this.installUndoHistory();
    this.registerDomEvent(document,'keydown',event=>this.handleUndoShortcut(event),true);
    this.installTaskCalendarBridge();
  }
  installUndoHistory() {
    if(this.undoHistory)return;
    const history=this.undoHistory=new UndoHistory();this.undoOriginals={};
    const actions={addTask:'添加任务',mutateCalendarTask:'修改日历任务',toggleProjectTaskDay:'安排日期',toggleInboxTask:'完成收集项',moveInboxTask:'移入项目',setProjectStatus:'修改项目状态',updateProjectDeadline:'修改项目截止日期',archiveProject:'归档项目',renameProject:'修改项目名称',renameProjectTask:'修改任务名称',toggleProjectTask:'完成任务',updateProjectTaskDate:'修改任务截止日期',deleteProjectTask:'删除任务',restoreProjectTaskDeletion:'恢复删除任务',reorderProjectTask:'调整任务顺序',moveProjectDisplay:'调整项目顺序'};
    for(const [name,label]of Object.entries(actions)){
      const original=this[name];this.undoOriginals[name]=original;
      this[name]=(...args)=>history.run(label,()=>original.apply(this,args));
    }
    for(const name of ['createProject','createArea']){
      const original=this[name];
      this[name]=(...args)=>history.run('新建项目或领域',async()=>{const result=await original.apply(this,args);history.entries.length=0;return result;});
    }
  }
  async assertUndoFile(file,path,expected) {
    if(this.app.vault.getAbstractFileByPath(path)!==file||file.path!==path||await this.app.vault.read(file)!==expected||file.path!==path)throw new Error('笔记内容或位置已变化，未撤销，以保留现有内容');
  }
  recordUndoContent(file,path,before,after,remapName=false) {
    if(before===after)return;
    const write=async(expected,next)=>{
      await this.assertUndoFile(file,path,expected);
      await this.app.vault.process(file,current=>{
        if(file.path!==path||this.app.vault.getAbstractFileByPath(path)!==file||current!==expected)throw new Error('笔记内容已变化，未撤销');
        return next;
      });
      if(remapName)this.remapTaskNameState(path,logic.projectTaskTree(expected),logic.projectTaskTree(next));
      else this.rebaseInlineTaskReferences(path,expected,next);
      this.publishProjectTaskTree(path,next);
    };
    this.undoHistory?.record({check:()=>this.assertUndoFile(file,path,after),undo:()=>write(after,before),redo:()=>write(before,after)});
  }
  async processGtdChange(file,transform,remapName=false) {
    const path=file.path;let before,after;
    await this.app.vault.process(file,current=>{before=current;after=transform(current);return after;});
    this.recordUndoContent(file,path,before,after,remapName);
    if(!remapName&&before!==after)this.rebaseInlineTaskReferences(path,before,after);
    if(before!==after)this.publishProjectTaskTree(path,after);
  }
  publishProjectTaskTree(path,content) {
    if(!path.startsWith(PROJECTS+'/'))return;
    try{
      const model=logic.projectTaskTree(content);
      this.app.workspace.trigger('gtd-project-tasks-changed',path,{...model,completedDisplay:logic.partitionCompletedTasks(model.roots)});
    }catch(error){console.error('GTD：同步已保存任务视图失败',error);}
  }
  rebaseInlineTaskReferences(path,before,after) {
    const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children)]),oldNodes=flatten(logic.projectTaskTree(before).roots),next=flatten(logic.projectTaskTree(after).roots);
    const unambiguous=(nodes,node)=>{
      while(node&&!/^block:[^/]+$/.test(node.key)){
        if(nodes.filter(item=>item.parentLine===node.parentLine&&item.title===node.title).length!==1)return false;
        node=nodes.find(item=>item.line===node.parentLine);
      }
      return true;
    };
    for(const state of this.inlineTaskEntries.values()){
      const target=next.find(node=>node.key===state.parentKey);
      if(state.project===path&&state.referenceStale&&target&&state.reference?.version===target.reference.version&&state.reference.line===target.line&&state.reference.raw===target.reference.raw){state.referenceStale=false;state.error='';}
      if(state.project!==path||state.busy||state.reference?.version!==oldNodes[0]?.reference.version)continue;
      const old=oldNodes.find(node=>node.key===state.parentKey&&node.line===state.reference.line&&node.reference.raw===state.reference.raw);
      if(!old||!target)continue;
      if(!unambiguous(oldNodes,old)||!unambiguous(next,target)){state.referenceStale=true;state.error='父任务层级已变化，请保留草稿，关闭输入框后重新选择';continue;}
      state.reference=target.reference;
    }
  }
  async processGtdFrontmatter(file,update) {
    return this.processGtdChange(file,content=>{
      const match=/^(\uFEFF?)---\r?\n((?:[\s\S]*?\r?\n)?)---(?:\r?\n|$)/.exec(content),newline=match?.[0].includes('\r\n')?'\r\n':'\n';
      const data=match?(parseYaml(match[2])||{}):{};
      if(typeof data!=='object'||Array.isArray(data))throw new Error('项目属性格式不正确');
      update(data);
      const yaml=stringifyYaml(data).replace(/\r?\n/g,newline),bom=content.startsWith('\uFEFF')?'\uFEFF':'';
      return bom+'---'+newline+yaml+(yaml.endsWith(newline)?'':newline)+'---'+newline+content.slice(match?.[0].length||bom.length);
    });
  }
  recordUndoProjectOrder(before,after) {
    if(JSON.stringify(before)===JSON.stringify(after))return;
    const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
    before=clone(before);after=clone(after);
    const check=expected=>{if(JSON.stringify(this.data.projectOrder)!==JSON.stringify(expected))throw new Error('项目顺序已变化，未撤销');};
    const write=async(expected,next)=>{
      check(expected);this.data.projectOrder=clone(next);
      try{await this.saveData(this.data);}catch(error){this.data.projectOrder=clone(expected);throw error;}
      this.app.workspace.trigger('gtd-project-order-changed');
    };
    this.undoHistory?.record({check:async()=>check(after),undo:()=>write(after,before),redo:()=>write(before,after)});
  }
  async renameGtdFile(file,destination,projectName=false) {
    const before=file.path;if(before===destination)return;
    await this.app.fileManager.renameFile(file,destination);
    if(!this.undoHistory?.current||this.undoHistory.restoring)return;
    let content;try{content=await this.app.vault.read(file);}catch(_){return;}
    const check=async(from,to)=>{
      await this.assertUndoFile(file,from,content);
      if(this.app.vault.getAbstractFileByPath(to))throw new Error('原位置已被占用，未撤销');
    };
    const move=async(from,to)=>{
      await check(from,to);
      if(projectName)await this.undoOriginals.renameProject.call(this,from,to.slice(to.lastIndexOf('/')+1,-3));
      else await this.app.fileManager.renameFile(file,to);
    };
    this.undoHistory?.record({check:()=>check(destination,before),undo:()=>move(destination,before),redo:()=>move(before,destination)});
  }
  handleUndoShortcut(event,doc=document) {
    if(event.defaultPrevented||!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey||event.key?.toLowerCase()!=='z'||event.isComposing||event.keyCode===229)return;
    const target=event.target?.nodeType===3?event.target.parentElement:event.target,field=target?.closest?.('input,textarea,select');
    if(target?.isContentEditable||field&&!(field.tagName==='INPUT'&&['checkbox','button','submit'].includes(field.type))||doc.querySelector('.modal'))return;
    const view=this.app.workspace.activeLeaf?.view;
    if(!view?.file?.path.startsWith('00 GTD/')||view.getViewType?.()!=='markdown'||!view.containerEl.querySelector('.gtd-project-progress,.gtd-inbox'))return;
    if(view.getMode?.()==='source'&&!target?.closest?.('.gtd-project-progress,.gtd-inbox'))return;
    event.preventDefault();event.stopPropagation();
    if(this.undoShortcutBusy)return;
    if([...this.inlineTaskEntries.values(),...this.taskTitleEdits.values(),...this.projectNameEdits.values()].some(state=>state.busy)){new Notice('正在保存，请稍后撤销');return;}
    this.undoShortcutBusy=true;
    this.undoHistory.undo().then(label=>{
      if(label){this.taskDayPanels.clear();this.activeDayPopover?.hidePopover();this.app.workspace.trigger('gtd-task-day-changed');this.app.commands.executeCommandById('dataview:dataview-force-refresh-views');}
      new Notice(label?'已撤销：'+label:'当前没有可撤销的首页操作',2500);
    }).catch(error=>new Notice(error.message||String(error))).finally(()=>this.undoShortcutBusy=false);
  }
  todayDateKey() { return window.moment().format('YYYY-MM-DD'); }
  installProjectKeyboard(component,table,scope) {
    this.projectKeyboardStates||=new Map();this.projectKeyboardControllers||=new Map();
    if(this.projectKeyboardControllers.has(table))return this.projectKeyboardControllers.get(table);
    const leaf=this.app.workspace.getLeavesOfType('markdown').find(item=>item.view.containerEl.contains(table))||this.app.workspace.activeLeaf;
    const key=JSON.stringify([scope,leaf?.id]);
    const state=this.projectKeyboardStates.get(key)||{};this.projectKeyboardStates.set(key,state);
    const controller=TreeKeyboard.installTreeKeyboard(table,{state,isActive:()=>this.app.workspace.activeLeaf===leaf&&leaf?.view.file?.path===scope&&!!table.getClientRects().length,onError:error=>new Notice(error.message||String(error))});
    this.projectKeyboardControllers.set(table,controller);
    component.register(()=>{controller.dispose();if(this.projectKeyboardControllers.get(table)===controller)this.projectKeyboardControllers.delete(table);});
    this.register(()=>controller.dispose());return controller;
  }
  protectProjectView(component,container) {
    if(component.gtdRefreshGuard)return component.gtdRefreshGuard;
    const doc=container.ownerDocument,original=component.render;
    let disposed=false,composing=null,pointer=false,pointerTarget=null,timer,fullPending=false,rendering=false,viewRunning=false,viewReady=Promise.resolve(),viewportDepth=0,releaseViewport,update;
    const pending=new Map();
    const blocked=()=>!!composing||pointer||(container.contains(doc.activeElement)&&doc.activeElement.matches('input:not([type="checkbox"]):not(:disabled),textarea:not(:disabled),[contenteditable="true"]'));
    const withViewport=async render=>{
      if(viewportDepth++===0){
        const minimum=container.style.minHeight,scrollers=[];
        for(let node=container.parentElement;node;node=node.parentElement)if(node.scrollHeight>node.clientHeight&&node.clientHeight)scrollers.push([node,node.scrollTop,node.scrollLeft]);
        container.style.minHeight=Math.max(container.getBoundingClientRect().height,parseFloat(minimum)||0)+'px';
        let interacted=false;
        const interact=()=>interacted=true;
        for(const event of ['wheel','touchmove','pointerdown','keydown'])doc.addEventListener(event,interact,true);
        releaseViewport=()=>{
          container.style.minHeight=minimum;
          for(const event of ['wheel','touchmove','pointerdown','keydown'])doc.removeEventListener(event,interact,true);
          if(!interacted)for(const [node,top,left]of scrollers)if(node.isConnected){node.scrollTop=top;node.scrollLeft=left;}
        };
      }
      try{return await render();}
      finally{if(--viewportDepth===0){releaseViewport();releaseViewport=null;}}
    };
    const schedule=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>flush().catch(error=>console.error('GTD：刷新项目视图失败',error)),0);};
    const refresh=async(...args)=>{
      if(disposed)return;
      if((!update&&blocked())||rendering||viewRunning){fullPending=true;return;}
      fullPending=false;if(!update)pending.clear();rendering=true;
      try{return await withViewport(async()=>{if(update)return update();const result=await original.apply(component,args);await viewReady;return result;});}
      finally{rendering=false;if(fullPending||pending.size)schedule();}
    };
    const flush=async()=>{
      if(disposed||rendering||viewRunning)return;
      if(fullPending){await refresh();return;}
      if(blocked())return;
      const jobs=[...pending.values()];pending.clear();
      for(const job of jobs){if(blocked()){pending.set(job.key,job);continue;}await withViewport(job.render);}
    };
    const guard={resume:schedule,isPointerWithin(element){return pointer&&!!pointerTarget&&element.contains(pointerTarget);},setUpdate(callback){update=callback;},begin(){
      viewRunning=true;let finish;viewReady=new Promise(resolve=>finish=resolve);
      return ()=>{viewRunning=false;finish();if(fullPending||pending.size)schedule();};
    },defer(key,render){
      if(disposed)return true;
      if(blocked()){pending.set(key,{key,render});return true;}
      return false;
    },run(key,render,incremental=false){
      if(disposed)return Promise.resolve();
      if(!incremental&&guard.defer(key,render))return Promise.resolve();
      return withViewport(render);
    }};
    const start=event=>{composing=event.target;};
    const end=()=>{composing=null;schedule();};
    const down=event=>{pointer=true;pointerTarget=event.target;};
    const up=()=>{pointer=false;pointerTarget=null;schedule();};
    container.addEventListener('compositionstart',start,true);container.addEventListener('compositionend',end,true);
    container.addEventListener('focusout',schedule,true);container.addEventListener('pointerdown',down,true);
    doc.addEventListener('pointerup',up,true);doc.addEventListener('pointercancel',up,true);
    if(typeof original==='function')component.render=refresh;
    component.gtdRefreshGuard=guard;
    const dispose=()=>{
      if(disposed)return;disposed=true;window.clearTimeout(timer);pending.clear();
      releaseViewport?.();
      container.removeEventListener('compositionstart',start,true);container.removeEventListener('compositionend',end,true);
      container.removeEventListener('focusout',schedule,true);container.removeEventListener('pointerdown',down,true);
      doc.removeEventListener('pointerup',up,true);doc.removeEventListener('pointercancel',up,true);
      if(component.render===refresh)component.render=original;
      if(component.gtdRefreshGuard===guard)delete component.gtdRefreshGuard;
    };
    component.register(dispose);this.register(dispose);
    return guard;
  }
  orderedProjectPaths(paths) { return logic.orderProjectPaths(paths,this.data.projectOrder); }
  async moveProjectDisplay(source,target,side) {
    const before=this.data.projectOrder;
    const paths=this.app.vault.getMarkdownFiles().filter(file=>file.path.startsWith(PROJECTS+'/')).sort((a,b)=>a.basename.localeCompare(b.basename,'zh-CN')).map(file=>file.path);
    this.data.projectOrder=logic.moveDisplayItem(this.orderedProjectPaths(paths),source,target,side);
    this.recordUndoProjectOrder(before,this.data.projectOrder);
    await this.saveData(this.data);this.app.workspace.trigger('gtd-project-order-changed');
  }
  async reorderProjectTask(path,source,target,side) {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||!path.startsWith(PROJECTS+'/')||file.extension!=='md')throw new Error('找不到项目笔记');
    let failure;
    await this.processGtdChange(file,content=>{try{return logic.moveSiblingTask(content,source,target,side);}catch(error){failure=error;return content;}});
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
    await this.processGtdChange(file, content => {
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
    await this.processGtdChange(file, content => {
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
    await this.processGtdChange(file, content => parent ? logic.insertSubtask(content, taskLine, parent) : logic.insertTask(content, taskLine, path === INBOX ? 'inbox' : 'project'));
    if (path !== INBOX) this.rememberProject(path);
    return file;
  }
  async captureTask(data) { return this.addTask({ title: data.title, project: INBOX }); }
  async toggleInboxTask(reference) {
    const file=this.app.vault.getAbstractFileByPath(INBOX),api=this.app.plugins.plugins['obsidian-tasks-plugin']?.apiV1;
    if(!(file instanceof TFile))throw new Error('找不到收件箱笔记');
    if(!api?.executeToggleTaskDoneCommand)throw new Error('请先启用 Tasks 插件');
    let failure;
    await this.processGtdChange(file,content=>{try{return logic.replaceProjectTask(content,reference,logic.preserveTaskDays(reference.raw,api.executeToggleTaskDoneCommand(logic.stripTaskDays(reference.raw),INBOX)));}catch(error){failure=error;return content;}});
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
      this.recordUndoContent(target,path,plan.targetBefore,plan.target);
      this.recordUndoContent(source,INBOX,plan.sourceBefore,plan.source);
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
    await this.processGtdFrontmatter(file,frontmatter=>{frontmatter.status=status;});
    new Notice(status==='done'?'项目已完成，可在项目总览中恢复或归档':'项目已恢复进行中');
  }
  async updateProjectDeadline(path,value,expected) {
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||!path.startsWith(PROJECTS+'/')||file.extension!=='md')throw new Error('找不到项目笔记');
    const deadline=logic.projectDeadlineValue(value);
    await this.processGtdFrontmatter(file,frontmatter=>{
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
    await this.renameGtdFile(file,destination);
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
    if (!state.busy&&!state.referenceStale) { state.reference = parent?.reference || null; state.error = ''; }
    state.hidden=false;
    state.ownerLeaf=this.app.workspace.activeLeaf?.id;
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
    if (state) this.app.workspace.trigger('gtd-inline-task-entry', state.project,{type:'hide',key});
  }
  async saveInlineTaskEntry(state) {
    if (state.busy || !state.draft.trim() || this.inlineTaskEntries.get(state.key) !== state) return;
    state.busy = true; state.error = '';
    const previous = state.reference, draft = state.draft;
    this.app.workspace.trigger('gtd-inline-task-entry', state.project);
    try {
      if(state.referenceStale)throw new Error('父任务层级已变化，请保留草稿，关闭输入框后重新选择');
      if (state.parentKey && !previous) throw new Error('父任务已变化，请重新点击加号');
      await this.addTask({ title: draft, project: state.project, parent: previous });
      if (state.draft === draft) {state.draft = '';state.selectionStart=state.selectionEnd=0;}
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
  clearTaskActionNotice() {
    if(this.taskActionNotice){
      // Dismiss immediately so rapid retries cannot overlap fading notices.
      this.taskActionNotice.hide();
      this.taskActionNotice.containerEl.remove();
    }
    this.taskActionNotice=null;
  }
  showTaskActionError(error) {
    this.clearTaskActionNotice();
    this.taskActionNotice=new Notice(error.message||String(error),4000);
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
    if(destination!==path)await this.renameGtdFile(file,destination,true);
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
    await this.processGtdChange(file,content=>{
      try{
        if(file.path!==path)throw new Error('项目位置已变化，请刷新后重试');
        const changed=logic.renameProjectTask(content,reference,title);
        before=logic.projectTaskTree(content);after=logic.projectTaskTree(changed);
        return changed;
      }catch(error){failure=error;return content;}
    },true);
    if(failure)throw failure;
    this.remapTaskNameState(path,before,after);
    return {path,file,before,after};
  }
  remapTaskNameState(path,before,after) {
    const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children)]),oldNodes=flatten(before.roots),nextByLine=new Map(flatten(after.roots).map(node=>[node.line,node]));
    const keyMap=new Map(oldNodes.map(node=>[node.key,nextByLine.get(node.line).key]));
    const marker='::task:'+path+'::',snapshot=Object.entries(this.data.treeExpanded||{}),remapped={...this.data.treeExpanded};
    for(const [key] of snapshot){const at=key.lastIndexOf(marker);if(at>=0&&keyMap.has(key.slice(at+marker.length)))delete remapped[key];}
    for(const [key,value] of snapshot){const at=key.lastIndexOf(marker),next=at>=0?keyMap.get(key.slice(at+marker.length)):undefined;if(next!==undefined)remapped[key.slice(0,at+marker.length)+next]=value;}
    this.data.treeExpanded=remapped;
    const pending=[...this.inlineTaskEntries.values()].filter(state=>state.project===path&&!state.busy&&state.reference?.version===oldNodes[0]?.reference.version);
    for(const state of pending)this.inlineTaskEntries.delete(state.key);
    for(const state of pending){
      const next=nextByLine.get(state.reference.line),oldKey=state.key;
      state.parentKey=next.key;state.reference=next.reference;state.key=JSON.stringify([state.scope,path,next.key]);
      this.inlineTaskEntries.set(state.key,state);if(this.inlineTaskFocusKey===oldKey)this.inlineTaskFocusKey=state.key;
    }
    this.saveData(this.data).catch(error=>console.error('GTD：无法保存折叠状态',error));
  }
  async toggleProjectTask(path, reference) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !path.startsWith(PROJECTS + '/') || file.extension !== 'md') throw new Error('找不到项目笔记');
    const api = this.app.plugins.plugins['obsidian-tasks-plugin']?.apiV1;
    if (!api?.executeToggleTaskDoneCommand) throw new Error('请先启用 Tasks 插件');
    let failure = null;
    await this.processGtdChange(file, content => {
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
    await this.processGtdChange(file, content => {
      try { return logic.updateProjectTaskDate(content, reference, field, value); }
      catch (error) { failure = error; return content; }
    });
    if (failure) throw failure;
  }
  async deleteProjectTask(path, reference) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || (path!==INBOX&&!path.startsWith(PROJECTS + '/')) || file.extension !== 'md') throw new Error('找不到任务笔记');
    let result, failure;
    await this.processGtdChange(file, content => {
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
    await this.processGtdChange(file, content => {
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
