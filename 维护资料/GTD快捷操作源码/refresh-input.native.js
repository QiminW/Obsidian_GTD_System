// Run with Obsidian CLI eval; uses generated example tasks only and removes them afterwards.
(()=>{
 window.__gtdRefreshInputTest={running:true,checks:{}};
 (async()=>{
  const p=app.plugins.plugins['gtd-quick-actions'],scope='__refresh_native__'+Date.now();
  const path='00 GTD/00 工作区/01 项目/__刷新输入回归_'+Date.now()+'.md';
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(ok,label)=>{if(!ok)throw Error(label);window.__gtdRefreshInputTest.checks[label]=true;};
  const until=async(fn,label)=>{for(let i=0;i<120;i++){if(await fn())return;await pause(25);}throw Error('Timed out: '+label);};
  const host=document.body.createDiv({cls:'gtd-dashboard'});
  host.style.cssText='position:fixed;inset:45px 15px 25px 245px;z-index:2147482000;background:#f7f2e8;color:#26251f;overflow:auto;padding:18px';
  const outside=host.createEl('button',{text:'演示：离开输入框',attr:{type:'button'}});
  const root=host.createDiv(),events=[],cleanups=[];
  const focus=element=>{
   const previous=document.activeElement;element.focus({preventScroll:true});
   // Electron can keep the window in the background during CLI checks.
   if(!document.hasFocus()&&previous!==element){
    previous.dispatchEvent(new FocusEvent('blur',{relatedTarget:element}));previous.dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:element}));
    element.dispatchEvent(new FocusEvent('focus',{relatedTarget:previous}));element.dispatchEvent(new FocusEvent('focusin',{bubbles:true,relatedTarget:previous}));
   }
  };
  const fixture={file:{path,name:'刷新输入演示'},status:'active',area:'工作'};
  const query={where(){return this;},sort(){return this;},array(){return [fixture];}};
  const source=await app.vault.read(app.vault.getAbstractFileByPath('00 GTD/00 工作区/05 系统视图/项目进度.js'));
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  let renders=0,file,earlyReturn=false;
  const originalRead=p.readProjectTaskTree;
  const component={registerEvent(ref){events.push(ref);},register(fn){cleanups.push(fn);},async render(){
   renders++;for(const ref of events.splice(0))app.workspace.offref(ref);root.empty();
   const work=new AsyncFunction('dv','input',source)({container:root,component,current:()=>({file:{path:scope}}),pages:()=>query},{activeOnly:true});
   if(!earlyReturn)await work;
  }};
  const form=()=>root.querySelector('form.gtd-inline-task-entry');
  const input=()=>form()?.querySelector('input');
  const type=value=>{input().value=value;input().dispatchEvent(new Event('input',{bubbles:true}));};
  try{
   if(document.querySelector('.modal')||[...p.inlineTaskEntries.values()].some(s=>!s.hidden)||p.taskTitleEdits.size||p.projectNameEdits.size)throw Error('Existing editing left untouched');
   file=await app.vault.create(path,'---\ntype: gtd-project\nstatus: active\narea: 工作\n---\n## 任务\n- [ ] 示例父任务 ^refresh-parent\n  - [ ] 示例子任务 ^refresh-child\n'+Array.from({length:45},(_,i)=>'- [ ] 示例任务 '+i+' ^refresh-'+i).join('\n')+'\n');
   p.data.treeExpanded[scope+'::project:'+path]=true;await component.render();earlyReturn=true;
   root.querySelector('[data-task-key="block:refresh-parent"] [data-gtd-task-add]').click();await until(()=>input(),'child editor');
   focus(input());type('正在连续输入的草稿');input().setSelectionRange(2,4);
   const original=input();original.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'zhong'}));
   host.scrollTop=200;const top=host.scrollTop,initialRenders=renders;
   await component.render();await component.render();await pause(80);
   check(input()===original&&document.activeElement===original,'RefreshKeepsSameFocusedInputDuringComposition');
   check(input().value==='正在连续输入的草稿'&&input().selectionStart===2&&input().selectionEnd===4,'RefreshPreservesDraftAndCaret');
   check(Math.abs(host.scrollTop-top)<2,'RefreshDoesNotScrollWhileTyping');
   app.workspace.trigger('gtd-task-day-changed');await pause(80);
   check(input()===original,'LocalTaskRefreshAlsoKeepsCompositionInput');
   original.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));
   await pause(80);check(input()===original&&renders===initialRenders,'CompositionEndDoesNotInterruptContinuedTyping');
   focus(outside);await until(()=>renders===initialRenders+1&&input()!==original,'deferred refresh');await pause(100);
   check(input().value==='正在连续输入的草稿'&&renders===initialRenders+1,'DeferredRefreshCoalescesAndKeepsDraft');
   check(Math.abs(host.scrollTop-top)<2,'DeferredRefreshPreservesScroll');
   check(document.activeElement===outside,'DeferredRefreshDoesNotStealFocus');
   check(root.style.minHeight==='','EarlyDataviewReturnStillReleasesHeightAfterViewFinishes');
   const guard=component.gtdRefreshGuard,minimum=root.style.minHeight;
   let releaseA,releaseB;
   const a=guard.run('parallel-a',()=>new Promise(resolve=>releaseA=resolve));
   const b=guard.run('parallel-b',()=>new Promise(resolve=>releaseB=resolve));
   releaseA();await a;releaseB();await b;
   check(root.style.minHeight===minimum,'ConcurrentRefreshReleasesHeightProtection');
   let releaseRead,started=false;
   p.readProjectTaskTree=async function(target){const model=await originalRead.call(this,target);if(target===path){started=true;await new Promise(resolve=>releaseRead=resolve);}return model;};
   app.workspace.trigger('gtd-task-day-changed');await until(()=>started,'read starts before typing');
   const duringRead=input();focus(duringRead);duringRead.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
   p.readProjectTaskTree=originalRead;releaseRead();await pause(80);
   check(input()===duringRead&&document.activeElement===duringRead,'TypingStartedDuringAsyncReadIsNotInterrupted');
   duringRead.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));focus(outside);await pause(80);
   const target=root.querySelector('[data-task-key="block:refresh-child"] [data-gtd-task-rename]');
   target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));const beforePointer=renders;
   await component.render();check(target.isConnected&&renders===beforePointer,'PointerActionIsNotDetachedMidClick');
   target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));await until(()=>renders===beforePointer+1,'pointer released');
   await until(()=>input()&&!input().disabled,'pointer refresh completed');focus(input());type('连续新增一');input().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   await until(async()=>/  - \[ \] 连续新增一/m.test(await app.vault.read(file))&&input()&&!input().disabled&&input().value==='','first add');
   type('连续新增二');input().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   await until(async()=>/  - \[ \] 连续新增二/m.test(await app.vault.read(file))&&input()&&!input().disabled&&input().value==='','second add');
   const saved=await app.vault.read(file);check((saved.match(/连续新增一/g)||[]).length===1&&(saved.match(/连续新增二/g)||[]).length===1,'ContinuousEnterAddsEachChildOnce');
   type('保留草稿');outside.click();check(!form(),'OutsideClickStillHidesInput');
   root.querySelector('[data-task-key="block:refresh-parent"] [data-gtd-task-add]').click();await until(()=>input(),'reopen');check(input().value==='保留草稿','ReopeningRestoresHiddenDraft');
   focus(input());const cancelledKey=form().dataset.gtdInlineEntryKey;
   const beforeEscape=renders;await component.render();
   input().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   await pause(60);check(!form()&&!p.inlineTaskEntries.has(cancelledKey),'EscapeImmediatelyClosesAndDiscardsDraft');
   await until(()=>renders===beforeEscape+1,'escape releases pending refresh');check(true,'EscapeAlsoReleasesDeferredRefresh');
  }catch(error){window.__gtdRefreshInputTest.error=error.message;window.__gtdRefreshInputTest.diagnostic={renders,focused:document.activeElement?.outerHTML.slice(0,180),form:!!form(),entryCount:p.inlineTaskEntriesFor(scope,path).length};window.__gtdRefreshInputTest.stack=error.stack?.split('\n').slice(0,3);}
  finally{
   p.readProjectTaskTree=originalRead;
   for(const fn of cleanups)fn();for(const ref of events)app.workspace.offref(ref);host.remove();
   for(const [key,state]of p.inlineTaskEntries)if(state.project===path){p.inlineTaskEntries.delete(key);if(p.inlineTaskFocusKey===key)p.inlineTaskFocusKey='';}
   for(const key of Object.keys(p.data.treeExpanded||{}))if(key.includes(path))delete p.data.treeExpanded[key];await p.saveData(p.data);
   if(file&&app.vault.getAbstractFileByPath(path)===file)await app.vault.delete(file);
   window.__gtdRefreshInputTest.running=false;window.__gtdRefreshInputTest.cleanedUp=!app.vault.getAbstractFileByPath(path);
  }
 })();return 'Example-only input refresh regression started';
})()
