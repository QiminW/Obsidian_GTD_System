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
function replaceProjectTask(content, reference, replacement) {
  if (!reference || reference.version !== taskSourceVersion(content)) throw new Error('项目内容已变化，请在刷新后重新勾选');
  const rows = content.split(/\r?\n/);
  if (rows[reference.line] !== reference.raw) throw new Error('任务位置已变化，请刷新后重新勾选');
  const offsets = [0];
  for (const delimiter of content.matchAll(/\r?\n/g)) offsets.push(delimiter.index + delimiter[0].length);
  const offset = offsets[reference.line], suffix = content.slice(offset + reference.raw.length);
  const eol = suffix.startsWith('\r\n') ? '\r\n' : '\n';
  return content.slice(0, offset) + replacement.split(/\r?\n/).join(eol) + suffix;
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
  return replaceProjectTask(content, reference, setTaskDays(raw, [...days]));
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
  for (const path of [...(Array.isArray(order)?order:[]), ...paths]) if (available.has(path) && !seen.has(path)) { seen.add(path);result.push(path); }
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
  const pattern = new RegExp('[ \\t]+' + symbol + '[ \\t]*\\d{4}-\\d{2}-\\d{2}', 'u');
  let raw = reference.raw;
  if (pattern.test(raw)) raw = raw.replace(pattern, date ? ' ' + symbol + ' ' + date : '');
  else if (date) {
    const block = /(\s+\^[\w-]+)\s*$/.exec(raw);
    raw = block ? raw.slice(0, block.index).trimEnd() + ' ' + symbol + ' ' + date + block[1] : raw.trimEnd() + ' ' + symbol + ' ' + date;
  }
  if (/\]$/.test(raw)) raw += ' ';
  const offsets = [0];
  for (const delimiter of content.matchAll(/\r?\n/g)) offsets.push(delimiter.index + delimiter[0].length);
  const offset = offsets[reference.line];
  return content.slice(0, offset) + raw + content.slice(offset + reference.raw.length);
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
module.exports = { buildTaskLine, insertTask, validateProjectName, buildProjectNote, nextAreaFolder, buildAreaNote, listParentTasks, insertSubtask, retainedParent, projectTaskTree, partitionCompletedTasks, replaceProjectTask, editableTaskName, renameProjectTask, projectDeadlineValue, deleteProjectTask, restoreProjectTask, updateProjectTaskDate, stripTaskDays, taskDays, setTaskDays, setProjectTaskDay, migrateTaskDays, preserveTaskDays, calendarTaskReference, calendarTaskReferences, calendarTaskInstances, moveSiblingTask, orderProjectPaths, moveDisplayItem, prepareInboxMove, commitInboxMove };

return module.exports;
})();
const installTaskCalendarBridge = (() => { const module = {exports:{}};
module.exports = function installTaskCalendarBridge(plugin, logic, Notice) {
  const calendar = plugin.app.plugins.plugins['tasks-calendar'];
  if (!calendar?.taskStore) return null;
  const store = calendar.taskStore, restores = [], snapshots=new Map(), revisions=new Map(), events=[];
  let disposed=false,refreshTimer;
  const refresh=()=>{window.clearTimeout(refreshTimer);refreshTimer=window.setTimeout(()=>{if(!disposed)calendar.refreshCalendars();},25);};
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
  function wrap(target, name, make) {
    const original = target[name];
    if (typeof original !== 'function') return;
    const wrapped = make(original);
    target[name] = wrapped;
    restores.push(() => { if (target[name] === wrapped) target[name] = original; });
  }
  wrap(store, 'getTasks', original => function () {
    const tasks=original.call(this),groups=new Map(),references=new Map();
    for(const task of tasks)if(inGtd(task)){if(!groups.has(task.path))groups.set(task.path,[]);groups.get(task.path).push(task);}
    for(const [path,indexed] of groups){const text=snapshots.get(path);references.set(path,text===undefined?null:logic.calendarTaskReferences(text,indexed));}
    return logic.calendarTaskInstances(tasks.map(task=>inGtd(task)?{...task,_gtdReference:references.get(task.path)?.get(task.line)||null}:task));
  });
  wrap(store, 'replaceTask', original => async function (task, replacement) {
    const canonical = source(task);
    if (!inGtd(canonical)) return original.call(this, task, replacement);
    return plugin.mutateCalendarTask(canonical, (content, reference) =>
      logic.replaceProjectTask(content, reference, logic.preserveTaskDays(canonical.raw, replacement)));
  });
  wrap(calendar, 'toggleTask', original => function (task) {
    const canonical = source(task);
    if (!inGtd(canonical) || !logic.taskDays(canonical.raw).length) return original.call(this, canonical);
    return original.call(this, { ...canonical, raw: logic.stripTaskDays(canonical.raw), _gtdSourceTask: canonical });
  });
  wrap(calendar, 'openTask', original => function (task) { return original.call(this, source(task)); });
  wrap(calendar, 'editTask', original => function (task) {
    const canonical = source(task);
    if (!inGtd(canonical) || !logic.taskDays(canonical.raw).length) return original.call(this, canonical);
    return original.call(this, { ...canonical, raw: logic.stripTaskDays(canonical.raw), description: logic.stripTaskDays(canonical.description || ''), _gtdSourceTask: canonical });
  });
  wrap(calendar, 'rescheduleTask', original => async function (task, date) {
    const canonical = source(task);
    if (!inGtd(canonical) || !task._gtdKind) return original.call(this, canonical, date);
    if (task._gtdDay === date) return;
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
    } catch (error) { new Notice(error.message || String(error)); }
  });
  wrap(calendar, 'deleteTask', original => async function (task) {
    const canonical = source(task);
    if (!inGtd(canonical)) return original.call(this, canonical);
    try {
      const result = await plugin.mutateCalendarTask(canonical, (content, reference) => logic.deleteProjectTask(content, reference));
      plugin.showTaskDeletionUndo({ path: canonical.path, title: result.title, count: result.count, undo: result.undo });
      return true;
    } catch (error) { new Notice(error.message || String(error)); return false; }
  });
  calendar.refreshCalendars();
  return { calendar, store, restore() { disposed=true;window.clearTimeout(refreshTimer);events.forEach(event=>plugin.app.vault.offref(event));snapshots.clear();restores.reverse().forEach(restore => restore()); calendar.refreshCalendars(); } };
};

return module.exports;
})();
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
  protectProjectView(component,container) {
    if(component.gtdRefreshGuard)return component.gtdRefreshGuard;
    const doc=container.ownerDocument,original=component.render;
    let disposed=false,composing=null,pointer=false,timer,fullPending=false,rendering=false,viewRunning=false,viewReady=Promise.resolve(),viewportDepth=0,releaseViewport;
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
      if(blocked()||rendering||viewRunning){fullPending=true;return;}
      fullPending=false;pending.clear();rendering=true;
      try{return await withViewport(async()=>{const result=await original.apply(component,args);await viewReady;return result;});}
      finally{rendering=false;if(fullPending||pending.size)schedule();}
    };
    const flush=async()=>{
      if(disposed||blocked()||rendering||viewRunning)return;
      if(fullPending){await refresh();return;}
      const jobs=[...pending.values()];pending.clear();
      for(const job of jobs){if(blocked()){pending.set(job.key,job);continue;}await withViewport(job.render);}
    };
    const guard={resume:schedule,begin(){
      viewRunning=true;let finish;viewReady=new Promise(resolve=>finish=resolve);
      return ()=>{viewRunning=false;finish();if(fullPending||pending.size)schedule();};
    },defer(key,render){
      if(disposed)return true;
      if(blocked()){pending.set(key,{key,render});return true;}
      return false;
    },run(key,render){
      if(disposed)return Promise.resolve();
      if(guard.defer(key,render))return Promise.resolve();
      return withViewport(render);
    }};
    const start=event=>{composing=event.target;};
    const end=()=>{composing=null;schedule();};
    const down=()=>{pointer=true;};
    const up=()=>{pointer=false;schedule();};
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
