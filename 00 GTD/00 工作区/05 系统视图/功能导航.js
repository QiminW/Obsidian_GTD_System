const plugin=app.plugins.plugins['gtd-quick-actions'];
const guard=plugin.protectProjectView(dv.component,dv.container),finish=guard.begin();
try{
  const scope=dv.current().file.path,prefix='00 GTD/00 工作区/00 功能页面/',order=['收件箱','项目属性'];
  const navigation=dv.container.createEl('p'),areaLine=dv.container.createEl('p');
  function links(line,items,label=''){
    const signature=JSON.stringify([label,items]);if(line.dataset.gtdLinks===signature)return;
    line.dataset.gtdLinks=signature;line.replaceChildren();
    if(label)line.append(document.createTextNode(label));
    items.forEach((item,index)=>{
      if(index)line.append(document.createTextNode(' · '));
      const link=line.createEl('a',{text:item.label,cls:'internal-link',attr:{href:item.path,'data-href':item.path}});
      link.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();app.workspace.openLinkText(item.path,scope,event.ctrlKey||event.metaKey);});
    });
  }
  function update(){
    const pages=app.vault.getFiles().filter(file=>file.path.startsWith(prefix)&&['md','base'].includes(file.extension)&&file.basename!=='项目总览').sort((a,b)=>{
      const left=order.indexOf(a.basename),right=order.indexOf(b.basename);return (left<0?999:left)-(right<0?999:right)||a.basename.localeCompare(b.basename,'zh-CN');
    });
    links(navigation,[...pages.map(file=>({path:file.path,label:file.basename})),{path:'00 GTD/使用说明',label:'使用说明'}]);
    const areas=dv.pages('"00 GTD/00 工作区/02 领域"').sort(page=>page.file.name).map(page=>({path:page.file.path,label:String(page.area||page.file.name.replace(/^领域\s*-\s*/,''))})).array();
    areaLine.hidden=!areas.length;if(areas.length)links(areaLine,areas,'领域：');
  }
  guard.setUpdate(update);update();
}finally{finish();}
