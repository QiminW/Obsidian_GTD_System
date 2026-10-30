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
