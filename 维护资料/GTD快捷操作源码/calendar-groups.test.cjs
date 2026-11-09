const test=require('node:test'),assert=require('node:assert/strict'),install=require('./calendar-bridge.cjs'),logic=require('./logic.cjs');
global.window={setTimeout:()=>0,clearTimeout(){}};
const jsx={jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})};
function setup(){const calendar={taskStore:{getTasks:()=>[]},refreshCalendars(){}};const plugin={data:{calendarDayLayout:'group'},app:{plugins:{plugins:{'tasks-calendar':calendar}},vault:{on:()=>({}),offref(){},getMarkdownFiles:()=>[]}}};const bridge=install(plugin,logic,class{});return {plugin,calendar,bridge};}
const opts=(extra={})=>({mode:'day',gridRef:{current:{closest:()=>({})}},date:'2026-11-09',active:[],completed:[],jsx,sortable:'sortable',strategy:'vertical',renderTask:task=>({type:'card',props:{task}}),...extra});
const task=(id,group='p',project='Example')=>({id,path:'00 GTD/'+project+'.md',_gtdGroupKey:project+':'+group,_gtdParentTitle:group,_gtdAncestors:['Root',group],_gtdAncestorKeys:['root',group]});
const children=group=>group.props.children[1].props.children.filter(node=>node.type==='details');
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
 const parent=children(children(groups[0])[0])[0],lists=parent.props.children[1].props.children;assert.equal(label(parent),'p');assert.deepEqual(lists[0].props.items,['one','two']);assert.deepEqual(lists[1].props.items,['four']);assert.equal(lists[0].props.children[0].props.task,active[0]);
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
 assert.deepEqual(groups[0].props.children[1].props.children[0].props.items,['standalone']);s.bridge.restore();
});
test('same ancestor labels with different source identities remain distinct at every level',()=>{
 const s=setup(),one={...task('one'),_gtdAncestorKeys:['first-root','first-parent']},two={...task('two'),_gtdAncestorKeys:['second-root','second-parent']};
 const groups=s.calendar._gtdRenderDayTasks(opts({active:[one,two]}));assert.equal(groups.length,1);assert.equal(children(groups[0]).length,2);assert.deepEqual(children(groups[0]).map(label),['Root','Root']);s.bridge.restore();
});
test('overdue groups use the same renderer but retain independent folding',()=>{
 const s=setup(),active=[task('one')],day=s.calendar._gtdRenderDayTasks(opts({active}));day[0].props.onToggle({currentTarget:{open:false}});
 const overdue=s.calendar._gtdRenderDayTasks(opts({date:'overdue',active}));assert.equal(overdue.length,1);assert.equal(overdue[0].props.open,true);s.bridge.restore();
});
