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
 'data-gtd-project':[f'"data-gtd-project":{v}.path.replace(/\\.md$/i,"").split("/").pop(),'.encode() for v in ['r','o']]
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
if patched==content:
 print('已完成日历卡片适配，无需重复处理。');sys.exit(0)
path.write_bytes(patched)
print('日历卡片适配完成，请重新启用 Tasks Calendar 和 GTD 快捷操作。')
