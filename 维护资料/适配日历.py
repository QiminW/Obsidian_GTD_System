from pathlib import Path
import json,sys
sys.stdout.reconfigure(encoding='utf-8')
vault=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent.parent
target=vault/'.obsidian/plugins/tasks-calendar'
manifest=json.loads((target/'manifest.json').read_text(encoding='utf-8'))
if manifest.get('id')!='tasks-calendar' or manifest.get('version')!='1.5.4':raise SystemExit('此适配脚本仅支持 Tasks Calendar 1.5.4')
path=target/'main.js';content=path.read_bytes()
attributes={
 'data-gtd-deadline':[f'"data-gtd-deadline":{v}._gtdDeadline===!0?"true":void 0,'.encode() for v in ['r','o']],
 'data-gtd-project':[f'"data-gtd-project":{v}.path.replace(/\\.md$/i,"").split("/").pop(),'.encode() for v in ['r','o']],
 'data-gtd-parent':[f'"data-gtd-parent":{v}._gtdParentTitle||"",'.encode() for v in ['r','o']],
 'data-gtd-parent-path':[f'"data-gtd-parent-path":({v}._gtdAncestors||[]).join(" › "),'.encode() for v in ['r','o']],
 'data-gtd-source-path':[f'"data-gtd-source-path":{v}.path,'.encode() for v in ['r','o']]
}
for name,values in attributes.items():
 if name.encode() in content and not all(content.count(a)==1 for a in values):raise SystemExit('检测到不同的适配结构，未写入文件')
patched=content
for index,variable in enumerate(['r','o']):
 before=f'"data-priority":{variable}.priority,'.encode()
 if patched.count(before)!=1:raise SystemExit('卡片结构与配套版本不符，未写入文件')
 for values in attributes.values():
  attribute=values[index]
  if attribute not in patched:patched=patched.replace(before,before+attribute,1)
for action,variable,task in [('update','r','n'),('edit','r','n'),('delete','r','n'),('reschedule','i','n'),('create','a','{path:r}'),('open','a','n')]:
 before=f'new ke.Notice(`Could not {action} task: ${{No({variable})}}`)'.encode()
 after=f'(this._gtdTaskError?this._gtdTaskError({task},{variable},`Could not {action} task: ${{No({variable})}}`):'.encode()+before+b')'
 if patched.count(after)==1:continue
 if patched.count(before)!=1:raise SystemExit('任务提醒结构与配套版本不符，未写入文件')
 patched=patched.replace(before,after,1)
before=b'new ke.Notice(`Task file not found: ${n.path}`)'
after=b'(this._gtdTaskError?this._gtdTaskError(n,new Error(`Task file not found: ${n.path}`),`Task file not found: ${n.path}`):'+before+b')'
if patched.count(after)!=1:
 if patched.count(before)!=1:raise SystemExit('任务来源提醒结构与配套版本不符，未写入文件')
 patched=patched.replace(before,after,1)
before=b'children:[(0,ut.jsx)(jy,{id:`tasks:${d}:active`,items:g.map(y=>y.id),strategy:Iy,children:g.map(y=>o(y,d,l.mode!=="month"&&i.settings.showTaskSource,!y.completed&&p===1))}),(0,ut.jsx)(jy,{id:`tasks:${d}:completed`,items:b.map(y=>y.id),strategy:Iy,children:b.map(y=>o(y,d,l.mode!=="month"&&i.settings.showTaskSource))}),l.mode==="month"&&m.length>0?(0,ut.jsx)("button",{className:"tasks-calendar-more",hidden:!0,onClick:()=>u({anchor:d,mode:"day"}),type:"button"}):null]'
after=b'children:i._gtdRenderDayTasks?.({mode:l.mode,gridRef:n,date:d,active:g,completed:b,jsx:ut,sortable:jy,strategy:Iy,renderTask:y=>o(y,d,l.mode!=="month"&&i.settings.showTaskSource,!y.completed&&p===1)})??'+before[len(b'children:'):]
if patched.count(after)!=1:
 if patched.count(before)!=1:raise SystemExit('日视图任务列表结构与配套版本不符，未写入文件')
 patched=patched.replace(before,after,1)
before=b'(0,G.jsx)("span",{"aria-hidden":"true",className:"tasks-calendar-completion-overlay",ref:d})'
breadcrumb='o.path.startsWith("00 GTD/")?(0,G.jsx)("button",{className:"gtd-calendar-context",type:"button","aria-label":"所属位置："+[o.path.replace(/\\.md$/i,"").split("/").pop(),...o._gtdAncestors||[]].join(" › "),onClick:A=>{A.preventDefault(),A.stopPropagation(),a.openTask(o)},children:o.path.replace(/\\.md$/i,"").split("/").pop()+(o._gtdParentTitle?" › "+o._gtdParentTitle:"")}):null,'.encode()
after=breadcrumb+before
if patched.count(after)!=1:
 if patched.count(before)!=1:raise SystemExit('任务归属入口结构与配套版本不符，未写入文件')
 patched=patched.replace(before,after,1)
overdue=b'L=>{let B=Ga(L,a.settings,N.today),oe=B?fd(br(N.today),br(B)):0;return(0,Fe.jsx)(LM,{calendarDate:B??N.today,highlightNewRecurrence:q.has(qi(L)),meta:(0,Fe.jsxs)("span",{className:"tasks-calendar-overdue-meta",children:[B?`${oe} ${oe===1?"day":"days"} ago \\xB7 ${B}`:"No date"," \\xB7"," ",L.path.replace(/\\.md$/i,"")]}),onCompletionChange:I,onRecurringCompletion:C,onRecurrencePreview:U,plugin:a,showSource:!1,task:L,titleId:`tasks-calendar-${n}-task-${K++}`},L.id)}'
before=b'children:N.overdueTasks.map('+overdue+b')'
after=b'children:a._gtdRenderDayTasks?.({mode:s.mode,gridRef:v,date:"overdue",active:N.overdueTasks.filter(L=>!L.completed),completed:N.overdueTasks.filter(L=>L.completed),jsx:Fe,sortable:jy,strategy:Iy,renderTask:'+overdue+b'})??N.overdueTasks.map('+overdue+b')'
if patched.count(after)!=1:
 if patched.count(before)!=1:raise SystemExit('逾期任务列表结构与配套版本不符，未写入文件')
 patched=patched.replace(before,after,1)
if patched==content:
 print('已完成日历卡片适配，无需重复处理。');sys.exit(0)
path.write_bytes(patched)
print('日历卡片适配完成，请重新启用 Tasks Calendar 和 GTD 快捷操作。')
