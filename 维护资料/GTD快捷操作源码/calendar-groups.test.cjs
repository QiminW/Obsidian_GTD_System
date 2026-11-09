const test=require('node:test'),assert=require('node:assert/strict'),install=require('./calendar-bridge.cjs'),logic=require('./logic.cjs');
global.window={setTimeout:()=>0,clearTimeout(){}};
const jsx={jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})};
function setup(){const calendar={taskStore:{getTasks:()=>[]},refreshCalendars(){}};const plugin={data:{calendarDayLayout:'group'},app:{plugins:{plugins:{'tasks-calendar':calendar}},vault:{on:()=>({}),offref(){},getMarkdownFiles:()=>[]}}};const bridge=install(plugin,logic,class{});return {plugin,calendar,bridge};}
const opts=(extra={})=>({mode:'day',gridRef:{current:{closest:()=>({})}},date:'2026-11-09',active:[],completed:[],jsx,sortable:'sortable',strategy:'vertical',renderTask:task=>({type:'card',props:{task}}),...extra});
const task=(id,group='p',project='Example')=>({id,path:'00 GTD/'+project+'.md',_gtdGroupKey:project+':'+group,_gtdParentTitle:group,_gtdAncestors:['Root',group],_gtdAncestorKeys:['root',group]});
const children=group=>group.props.children[1].props.children.props.children.filter(node=>node.type==='details');
const label=group=>group.props.children[0].props.children[0].props.children;
const count=group=>group.props.children[0].props.children[1].props.children;
test('group renderer applies only to the selected day layout in GTD pages',()=>{
 const s=setup(),render=s.calendar._gtdRenderDayTasks;assert.equal(typeof render,'function');
 assert.equal(render(opts({mode:'week'})),null);assert.equal(render(opts({mode:'month'})),null);assert.equal(render(opts({gridRef:{current:{closest:()=>null}}})),null);
 s.plugin.data.calendarDayLayout='path';assert.equal(render(opts()),null);s.bridge.restore();assert.equal(s.calendar._gtdRenderDayTasks,undefined);
});
test('parent grouping retains all original cards and separates duplicate project names by source identity',()=>{
 const s=setup(),active=[task('one'),task('two'),task('three','p','Other')],completed=[{...task('four'),completed:true}];
 const groups=s.calendar._gtdRenderDayTasks(opts({active,completed}));assert.equal(groups.length,2);
 assert.equal(groups[0].type,'details');assert.equal(count(groups[0]),'1/3');assert.equal(label(groups[0]),'Example');
 const parent=children(children(groups[0])[0])[0],list=parent.props.children[1].props.children;assert.equal(label(parent),'p');assert.deepEqual(list.props.items,['one','two','four']);assert.equal(list.props.children[0].props.task,active[0]);
 groups[0].props.onToggle({currentTarget:{open:false}});assert.equal(s.calendar._gtdRenderDayTasks(opts({active,completed}))[0].props.open,false);s.bridge.restore();
});
test('root task groups show only their project name',()=>{
 const s=setup(),groups=s.calendar._gtdRenderDayTasks(opts({active:[{...task('root'),_gtdParentTitle:'',_gtdAncestors:[],_gtdAncestorKeys:[]}]}));
 assert.equal(groups[0].props.children[0].props.children[0].props.children,'Example');s.bridge.restore();
});
test('shared project and ancestor paths merge recursively while direct root tasks remain visible',()=>{
 const s=setup(),active=[task('one','p'),task('two','q'),{...task('standalone'),_gtdAncestors:[],_gtdAncestorKeys:[],_gtdParentTitle:''}],groups=s.calendar._gtdRenderDayTasks(opts({active}));
 assert.equal(groups.length,1);assert.equal(count(groups[0]),'0/3');
 const roots=children(groups[0]);assert.equal(roots.length,1);assert.equal(label(roots[0]),'Root');assert.equal(count(roots[0]),'0/2');assert.deepEqual(children(roots[0]).map(label),['p','q']);
 assert.deepEqual(groups[0].props.children[1].props.children.props.items,['standalone']);s.bridge.restore();
});
test('same ancestor labels with different source identities remain distinct at every level',()=>{
 const s=setup(),one={...task('one'),_gtdAncestorKeys:['first-root','first-parent']},two={...task('two'),_gtdAncestorKeys:['second-root','second-parent']};
 const groups=s.calendar._gtdRenderDayTasks(opts({active:[one,two]}));assert.equal(groups.length,1);assert.equal(children(groups[0]).length,2);assert.deepEqual(children(groups[0]).map(label),['Root','Root']);s.bridge.restore();
});
test('overdue groups use the same renderer but retain independent folding',()=>{
 const s=setup(),active=[task('one')],day=s.calendar._gtdRenderDayTasks(opts({active}));day[0].props.onToggle({currentTarget:{open:false}});
 const overdue=s.calendar._gtdRenderDayTasks(opts({date:'overdue',active}));assert.equal(overdue.length,1);assert.equal(overdue[0].props.open,true);s.bridge.restore();
});

test('grouped projects follow saved project order with the same alphabetical fallback as project progress',()=>{
 const s=setup();s.plugin.data.projectOrder=['00 GTD/Zebra.md','00 GTD/Missing.md','00 GTD/Beta.md'];
 const active=[task('a','p','Alpha'),task('b','p','Beta'),task('z','p','Zebra'),task('d','p','Delta')];
 for(const date of ['2026-11-09','overdue'])assert.deepEqual(s.calendar._gtdRenderDayTasks(opts({active,date})).map(label),['Zebra','Beta','Alpha','Delta']);
 s.plugin.data.projectOrder=['00 GTD/Delta.md','00 GTD/Alpha.md'];assert.deepEqual(s.calendar._gtdRenderDayTasks(opts({active})).map(label),['Delta','Alpha','Beta','Zebra']);s.bridge.restore();
});

test('same-named projects in different areas retain the shared project order regardless of calendar encounter order',()=>{
 const s=setup(),a={...task('a'),path:'00 GTD/Projects/A/Example.md'},b={...task('b'),path:'00 GTD/Projects/B/Example.md'};
 for(const active of [[b,a],[a,b]])assert.deepEqual(sequence(s.calendar._gtdRenderDayTasks(opts({active}))).filter(x=>x.startsWith('task:')),['task:a','task:b']);
 s.plugin.data.projectOrder=[b.path,a.path];assert.deepEqual(sequence(s.calendar._gtdRenderDayTasks(opts({active:[a,b]}))).filter(x=>x.startsWith('task:')),['task:b','task:a']);s.bridge.restore();
});

const sequence=node=>Array.isArray(node)?node.flatMap(sequence):node?.type==='card'?['task:'+node.props.task.id]:node?.type==='details'?['group:'+label(node),...sequence(node.props.children[1])]:sequence(node?.props?.children||[]);
test('grouped sibling branches and direct leaves retain source order including completed tasks',()=>{
 const s=setup(),root=(id,line,completed=false)=>({...task(id),line,completed,_gtdAncestors:[],_gtdAncestorKeys:[],_gtdParentTitle:''}),branch=(id,line,name)=>({...task(id,name),line,_gtdAncestors:[name],_gtdAncestorKeys:[name]});
 const active=[root('last',30),branch('b2',22,'Later branch'),root('middle',10),branch('a2',5,'First branch'),branch('b1',21,'Later branch')],completed=[{...branch('a1',4,'First branch'),completed:true},root('first',0,true)];
 for(const date of ['2026-11-09','overdue'])assert.deepEqual(sequence(s.calendar._gtdRenderDayTasks(opts({active,completed,date}))),['group:Example','task:first','group:First branch','task:a1','task:a2','task:middle','group:Later branch','task:b1','task:b2','task:last']);s.bridge.restore();
});

test('project display order changes refresh grouped calendars and detach on bridge restoration',()=>{
 const callbacks=new Map(),scheduled=[],priorWindow=global.window;let refreshes=0;
 global.window={setTimeout:fn=>(scheduled.push(fn),scheduled.length),clearTimeout(){}};
 const calendar={taskStore:{getTasks:()=>[]},refreshCalendars(){refreshes++;}},workspace={on:(name,fn)=>(callbacks.set(name,fn),{name}),offref:ref=>callbacks.delete(ref.name)};
 const plugin={data:{calendarDayLayout:'group'},app:{workspace,plugins:{plugins:{'tasks-calendar':calendar}},vault:{on:()=>({}),offref(){},getMarkdownFiles:()=>[]}}};
 try{const bridge=install(plugin,logic,class{}),before=refreshes;assert.equal(typeof callbacks.get('gtd-project-order-changed'),'function');callbacks.get('gtd-project-order-changed')();scheduled.at(-1)();assert.equal(refreshes,before+1);bridge.restore();assert.equal(callbacks.has('gtd-project-order-changed'),false);}finally{global.window=priorWindow;}
});
