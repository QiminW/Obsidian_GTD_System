(()=>{
 window.__realRefreshTest={running:true,checks:{}};
 (async()=>{
  const p=app.plugins.plugins['gtd-quick-actions'],leaf=app.workspace.activeLeaf,scope=leaf.view.file.path;
  const path='00 GTD/00 工作区/01 项目/__真实刷新演示_'+Date.now()+'.md';
  const preview=leaf.view.containerEl.querySelector('.markdown-preview-view'),top=preview.scrollTop;
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(fn,label)=>{for(let i=0;i<160;i++){if(await fn())return;await pause(40);}throw Error(label);};
  const check=(ok,label)=>{if(!ok)throw Error(label);window.__realRefreshTest.checks[label]=true;};
  const row=()=>[...preview.querySelectorAll('tr[data-project-path]')].find(e=>e.dataset.projectPath===path);
  const form=()=>row()?.nextElementSibling.querySelector('form.gtd-inline-task-entry');
  let file,button;
  try{
   if([...p.inlineTaskEntries.values()].some(s=>!s.hidden)||p.taskTitleEdits.size||p.projectNameEdits.size)throw Error('Existing edit left untouched');
   file=await app.vault.create(path,'---\ntype: gtd-project\nstatus: active\narea: 工作\n---\n## 任务\n- [ ] 示例父任务 ^real-parent\n  - [ ] 示例子任务 ^real-child\n'+Array.from({length:20},(_,i)=>'- [ ] 示例事项 '+i+' ^real-'+i).join('\n')+'\n');
   await until(()=>row(),'fixture visible');row().querySelector('[data-gtd-project-add]').click();await until(()=>form(),'form');
   const original=form().querySelector('input');original.focus({preventScroll:true});original.value='正在输入中文示例';original.dispatchEvent(new Event('input',{bubbles:true}));
   original.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));form().scrollIntoView({block:'center'});await pause(80);const before=preview.scrollTop;
   app.commands.executeCommandById('dataview:dataview-force-refresh-views');await pause(400);
   check(original.isConnected&&document.activeElement===original,'RealDataviewRefreshKeepsCompositionInput');
   check(Math.abs(preview.scrollTop-before)<2,'RealDataviewRefreshKeepsScroll');
   original.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
   button=document.body.createEl('button',{text:'演示测试离开输入',attr:{type:'button'}});button.style.cssText='position:fixed;top:0;left:-10000px';button.focus({preventScroll:true});
   if(!document.hasFocus()){original.dispatchEvent(new FocusEvent('blur',{relatedTarget:button}));original.dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:button}));}
   await pause(200);check(form()?.querySelector('input')===original,'RealDataviewUpdateKeepsExistingInputAfterBlur');
   await until(()=>!form().closest('.block-language-dataviewjs').style.minHeight,'height released');await pause(200);
   check(form().querySelector('input').value==='正在输入中文示例','RealDataviewRefreshKeepsDraft');
   check(Math.abs(preview.scrollTop-before)<2,'RealDeferredRefreshKeepsScroll');
   check(!form().closest('.block-language-dataviewjs').style.minHeight,'ReadingModeLeavesNoCalendarGap');
  }catch(error){window.__realRefreshTest.error=error.message;}
  finally{
   button?.remove();for(const [key,state]of p.inlineTaskEntries)if(state.project===path){p.inlineTaskEntries.delete(key);if(p.inlineTaskFocusKey===key)p.inlineTaskFocusKey='';}
   for(const key of Object.keys(p.data.treeExpanded||{}))if(key.includes(path))delete p.data.treeExpanded[key];await p.saveData(p.data);
   if(file&&app.vault.getAbstractFileByPath(path)===file)await app.vault.delete(file);
   await pause(600);preview.scrollTop=top;window.__realRefreshTest.running=false;window.__realRefreshTest.cleanedUp=!app.vault.getAbstractFileByPath(path);
  }
 })();return 'Real Dataview refresh verification started';
})()
