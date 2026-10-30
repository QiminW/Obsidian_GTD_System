from pathlib import Path
import json,sys
sys.stdout.reconfigure(encoding='utf-8')
maintenance=Path(__file__).resolve().parent
vault=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else maintenance.parent
source=maintenance/'GTD快捷操作源码'
target=vault/'.obsidian/plugins/gtd-quick-actions'
manifest=json.loads((target/'manifest.json').read_text(encoding='utf-8'))
if manifest.get('id')!='gtd-quick-actions':raise SystemExit('目标不是 GTD 快捷操作插件目录')
logic=(source/'logic.cjs').read_text(encoding='utf-8')
bridge=(source/'calendar-bridge.cjs').read_text(encoding='utf-8')
body=(source/'main-body.js').read_text(encoding='utf-8')
bundle='const logic = (() => { const module = {exports:{}};\n'+logic+'\nreturn module.exports;\n})();\nconst installTaskCalendarBridge = (() => { const module = {exports:{}};\n'+bridge+'\nreturn module.exports;\n})();\n'+body
(target/'main.js').write_bytes(bundle.encode('utf-8'))
(target/'styles.css').write_bytes((source/'styles.css').read_bytes())
print('GTD 插件已重新组合，请在 Obsidian 中重新启用该插件。')
