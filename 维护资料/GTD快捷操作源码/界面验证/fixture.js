// A separate hidden Chromium window: no access to the user's notes or focused input.
const payload=window.testPayload;
for(const proto of [HTMLElement.prototype,DocumentFragment.prototype]){
 proto.createEl=function(tag,options={}){const element=document.createElement(tag);if(typeof options==='string')options={cls:options};if(options.cls)element.className=options.cls;if(options.text!==undefined)element.textContent=options.text;for(const [key,value]of Object.entries(options.attr||{}))element.setAttribute(key,value);this.append(element);return element;};
 proto.createDiv=function(options){return this.createEl('div',options);};proto.createSpan=function(options){return this.createEl('span',options);};proto.empty=function(){this.replaceChildren();};
}
window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),8);window.cancelAnimationFrame=clearTimeout;
window.moment=function(value){let d=value?new Date(value+'T00:00:00'):new Date(2026,10,2);const api={format(pattern){const y=d.getFullYear(),m=d.getMonth()+1,day=d.getDate();if(pattern==='YYYY年M月')return y+'年'+m+'月';if(pattern==='YYYY-MM')return y+'-'+String(m).padStart(2,'0');if(pattern==='D')return String(day);return y+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0');},startOf(unit){if(unit==='month')d.setDate(1);return api;},isoWeekday(day){const current=d.getDay()||7;d.setDate(d.getDate()+day-current);return api;},clone(){return moment(api.format('YYYY-MM-DD'));},add(n,unit){if(unit==='month')d.setMonth(d.getMonth()+n);else d.setDate(d.getDate()+n);return api;},subtract(n,unit){return api.add(-n,unit);}};return api;};
class Base{
 constructor(){this.cleanups=[];}
 register(fn){this.cleanups.push(fn);}
 registerDomEvent(target,name,listener,capture){target.addEventListener(name,listener,capture);this.register(()=>target.removeEventListener(name,listener,capture));}
 async saveData(){}async loadData(){return {};}
}
class File{constructor(path,text){this.path=path;this.text=text;this.extension='md';}get basename(){return this.path.split('/').at(-1).replace(/\.md$/,'');}}
class Folder{constructor(path){this.path=path;this.children=[];}get name(){return this.path.split('/').at(-1);}}
const namespace={Plugin:Base,Modal:Base,Notice:class{},TFile:File,TFolder:Folder,Menu:Base,MarkdownRenderChild:Base,MarkdownRenderer:{},Component:Base,setIcon(){},parseYaml:()=>({}),stringifyYaml:()=> '{}\n'};
const files=new Map(),listeners=new Map();let directoryExists=true;
const workspace={activeLeaf:{id:'test-leaf',view:{file:{path:'00 GTD/首页.md'},containerEl:document.body,getMode:()=> 'preview',getViewType:()=> 'markdown'}},getLeavesOfType(){return [this.activeLeaf];},on(name,callback){const ref={name,callback};if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(ref);return ref;},offref(ref){listeners.get(ref.name)?.delete(ref);},trigger(name,...args){for(const ref of listeners.get(name)||[])ref.callback(...args);}};
const vault={adapter:{getBasePath:()=>'/test-vault'},getAbstractFileByPath:path=>files.get(path),getMarkdownFiles:()=>[...files.values()].filter(file=>file instanceof File),async createFolder(path){const folder=new Folder(path);files.set(path,folder);const parent=files.get(path.slice(0,path.lastIndexOf('/')));parent?.children.push(folder);return folder;},async create(path,text){const file=new File(path,text);files.set(path,file);files.get(path.slice(0,path.lastIndexOf('/')))?.children.push(file);return file;},read:async file=>file.text,async modify(file,text){file.text=text;},async process(file,transform){file.text=transform(file.text);},async delete(file){for(const path of files.keys())if(path===file.path||path.startsWith(file.path+'/'))files.delete(path);}};
window.app={workspace,vault,metadataCache:{getFileCache:()=>({frontmatter:{}})},commands:{executeCommandById:()=>true},fileManager:{async renameFile(file,to){files.delete(file.path);file.path=to;files.set(to,file);}},plugins:{plugins:{},manifests:{}}};
vault.getFiles=()=>[...files.values()];
const fakeFs={readFileSync(path){if(path.endsWith('/项目进度.js'))return payload.view;if(path.endsWith('/manifest.json'))return JSON.stringify({id:'gtd-keyboard-demo-20261102',version:'1.10.0'});throw Error('Unknown test file '+path);},existsSync:path=>directoryExists&&!path.endsWith('data.json'),unlinkSync(){},rmdirSync(){directoryExists=false;}};
window.require=name=>{if(name==='obsidian')return namespace;if(name==='fs')return fakeFs;throw Error(name);};
app.plugins.loadPlugin=async id=>{const module={exports:{}};new Function('require','module',payload.bundle)(require,module);const Plugin=module.exports;const p=new Plugin();p.app=app;p.manifest={id};app.plugins.plugins[id]=p;await p.onload();};
app.plugins.unloadPlugin=async id=>{const plugin=app.plugins.plugins[id];for(const fn of plugin.cleanups)fn();delete app.plugins.plugins[id];};
eval(payload.verify);
