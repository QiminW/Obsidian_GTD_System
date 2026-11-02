// Run with Obsidian.com eval in the dedicated example vault only.
(()=>{
 window.__gtdWidthCheck={running:true,checks:{},measurements:{}};
 (async()=>{
  if(app.vault.getName()!=='Obsidian-GTD-Demo')throw Error('Use the dedicated demonstration vault');
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),leaf=app.workspace.activeLeaf,win=window.electron.remote.getCurrentWindow();
  const original={state:leaf.getViewState(),readable:app.vault.getConfig('readableLineLength'),bounds:win.getBounds(),zoom:win.webContents.getZoomFactor(),sides:[app.workspace.leftSplit,app.workspace.rightSplit].map(split=>({split,collapsed:split.collapsed}))};
  const example='__GTD_WIDTH_DEMO_20261102.md';let created,touched=false,attached=false;
  const result=window.__gtdWidthCheck,visible=selector=>[...leaf.view.containerEl.querySelectorAll(selector)].find(e=>e.getClientRects().length);
  const check=(name,value)=>{result.checks[name]=!!value;};
  async function readable(value){if(app.vault.getConfig('readableLineLength')!==value)app.commands.executeCommandById('editor:toggle-readable-line-length');await pause(160);}
  async function open(path,mode){await leaf.setViewState({type:'markdown',state:{file:path,mode,source:false},active:true});await pause(320);}
  async function viewport(width,height){await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(120);}
  function measure(mode){
   const view=visible(mode==='source'?'.markdown-source-view':'.markdown-preview-view');
   const sizer=view.querySelector(mode==='source'?'.cm-sizer':'.markdown-preview-sizer');
   return {width:sizer.getBoundingClientRect().width,viewport:view.clientWidth,lineWidth:getComputedStyle(view).getPropertyValue('--file-line-width')};
  }
  try{
   if(app.vault.getAbstractFileByPath(example))throw Error('Existing example left untouched');
   if(document.querySelector('.modal')||document.activeElement.matches('input,textarea')||document.activeElement.isContentEditable)throw Error('Existing editing left untouched');
   const project=app.plugins.plugins['gtd-quick-actions'].listProjects().find(file=>file.basename.startsWith('示例项目 - '));if(!project)throw Error('Use a demonstration vault with sample projects');
   touched=true;for(const side of original.sides)side.split.collapse();
   if(win.webContents.debugger.isAttached())throw Error('Existing debugger left untouched');
   win.webContents.debugger.attach('1.3');attached=true;win.webContents.setZoomFactor(1);await viewport(2000,1250);
   for(const mode of ['source','preview']){
    await open('00 GTD/首页.md',mode);await readable(true);const on=measure(mode);await readable(false);const off=measure(mode);
    result.measurements[mode]={on,off};
    check(mode+'IgnoresSharedReadableLineLength',Math.abs(on.width-off.width)<=2&&on.width>1100&&on.width<=1362);
   }
   await open(project.path,'source');await readable(true);const projectOn=measure('source');await readable(false);const projectOff=measure('source');
   result.measurements.project={on:projectOn,off:projectOff};check('ProjectNotesWithoutCssclassesAlsoKeepWidth',Math.abs(projectOn.width-projectOff.width)<=2&&projectOn.width>1100&&projectOn.width<=1362);
   created=await app.vault.create(example,'# Normal example note\n\nThis note keeps the normal Obsidian line-width setting.\n');
   await open(example,'source');await readable(true);const on=measure('source');await readable(false);const off=measure('source');
   result.measurements.ordinary={on,off};check('OrdinaryNotesKeepObsidianSetting',on.width<900&&off.width>on.width+200);
   await viewport(430,950);
   for(const mode of ['source','preview']){
    await open('00 GTD/首页.md',mode);await readable(true);const on=measure(mode);await readable(false);const off=measure(mode);
    result.measurements['narrow-'+mode]={on,off};check(mode+'DoesNotForceDesktopWidthOnNarrowScreen',on.width<=on.viewport+2&&off.width<=off.viewport+2&&Math.abs(on.width-off.width)<=2);
   }
  }finally{
   if(touched){
    if(attached){await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');win.webContents.debugger.detach();}
    win.webContents.setZoomFactor(original.zoom);win.setBounds(original.bounds);
    for(const side of original.sides)side.collapsed?side.split.collapse():side.split.expand();
    if(app.vault.getConfig('readableLineLength')!==original.readable)app.vault.setConfig('readableLineLength',original.readable);
    await leaf.setViewState(original.state);
   }
   if(created)await app.vault.delete(created,true);
   result.restored=!app.vault.getAbstractFileByPath(example);
  }
 })().catch(error=>{window.__gtdWidthCheck.error=error.message;}).finally(()=>{window.__gtdWidthCheck.running=false;});
 return 'Testing example-vault widths with shared settings on and off';
})()
