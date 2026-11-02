"""Build a standalone browser check using example-only data and the actual view/bundle."""
from pathlib import Path
import json,re,sys,tempfile
sys.stdout.reconfigure(encoding='utf-8')
source=Path(__file__).resolve().parent
root=source.parents[2]
bundle=(root/'.obsidian/plugins/gtd-quick-actions/main.js').read_text(encoding='utf-8')
base='00 GTD/00 工作区/05 系统视图/__KEYBOARD_DEMO_20261102'
for name,value in {'HOME':base+'/首页.md','PROJECTS':base+'/01 项目','INBOX':base+'/收件箱.md','AREAS':base+'/02 领域','ARCHIVE':base+'/99 归档'}.items():
    bundle=re.sub(r"const "+name+r" = '[^']*';",'const '+name+' = '+json.dumps(value,ensure_ascii=False)+';',bundle,count=1)
bundle+='''\nmodule.exports.prototype.onload=async function(){this.data={treeExpanded:{}};this.nameEditRequest=0;this.inlineTaskEntries=new Map();this.inlineTaskFocusKey='';this.taskTitleEdits=new Map();this.taskTitleFocusKey='';this.projectNameEdits=new Map();this.projectNameFocusKey='';this.taskDayPanels=new Map();this.installUndoHistory();this.demoLogic=logic;};'''
payload={'bundle':bundle,'view':(root/'00 GTD/00 工作区/05 系统视图/项目进度.js').read_text(encoding='utf-8'),'nav':(root/'00 GTD/00 工作区/05 系统视图/功能导航.js').read_text(encoding='utf-8'),'verify':(source/'check.js').read_text(encoding='utf-8')}
css='*,*::before,*::after{box-sizing:border-box;}'+(root/'.obsidian/plugins/gtd-quick-actions/styles.css').read_text(encoding='utf-8')+(root/'.obsidian/snippets/gtd-dashboard.css').read_text(encoding='utf-8')
serialized=json.dumps(payload,ensure_ascii=False).replace('</','<\\/')
report="const report=document.createElement('pre');document.body.append(report);const reporter=setInterval(()=>{report.textContent=JSON.stringify(window.__keyboardNative||{running:true},null,2);if(window.__keyboardNative&&!window.__keyboardNative.running)clearInterval(reporter);},100);"
html='<!doctype html><html><head><meta charset="utf-8"><title>GTD 界面验证</title><style>'+css+'</style></head><body><script>window.testPayload='+serialized+';</script><script>'+(source/'fixture.js').read_text(encoding='utf-8')+'\n'+report+'</script></body></html>'
output=Path(sys.argv[1]) if len(sys.argv)>1 else Path(tempfile.gettempdir())/'Obsidian-GTD-界面验证.html'
output.write_text(html,encoding='utf-8',newline='\n')
print(output.resolve())
