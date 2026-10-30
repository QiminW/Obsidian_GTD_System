const prefix = "00 GTD/00 工作区/00 功能页面/";
const order = ["收件箱", "项目属性"];
const pages = app.vault.getFiles().filter(f => f.path.startsWith(prefix) && ["md", "base"].includes(f.extension) && f.basename !== "项目总览")
  .sort((a,b) => { const ai=order.indexOf(a.basename),bi=order.indexOf(b.basename); return (ai<0?999:ai)-(bi<0?999:bi) || a.basename.localeCompare(b.basename,"zh-CN"); });
dv.paragraph(pages.map(f=>"[["+f.path+"|"+f.basename+"]]").join(" · ")+" · [[00 GTD/使用说明|使用说明]]");
const areas = dv.pages('"00 GTD/00 工作区/02 领域"').sort(p=>p.file.name);
if (areas.length) dv.paragraph("领域：" + areas.map(p=>"[["+p.file.path+"|"+(p.area || p.file.name.replace(/^领域\s*-\s*/,""))+"]]").join(" · "));
