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
