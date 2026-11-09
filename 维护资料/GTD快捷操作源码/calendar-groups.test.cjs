const test=require('node:test'),assert=require('node:assert/strict'),install=require('./calendar-bridge.cjs'),logic=require('./logic.cjs');
global.window={setTimeout:()=>0,clearTimeout(){}};
const jsx={jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})};
function setup(){const calendar={taskStore:{getTasks:()=>[]},refreshCalendars(){}};const plugin={data:{calendarDayLayout:'group'},app:{plugins:{plugins:{'tasks-calendar':calendar}},vault:{on:()=>({}),offref(){},getMarkdownFiles:()=>[]}}};const bridge=install(plugin,logic,class{});return {plugin,calendar,bridge};}
const opts=(extra={})=>({mode:'day',gridRef:{current:{closest:()=>({})}},date:'2026-11-09',active:[],completed:[],jsx,sortable:'sortable',strategy:'vertical',renderTask:task=>({type:'card',props:{task}}),...extra});
const task=(id,group='p',project='Example')=>({id,path:'00 GTD/'+project+'.md',_gtdGroupKey:project+':'+group,_gtdParentTitle:group,_gtdAncestors:['Root',group]});
test('group renderer applies only to the selected day layout in GTD pages',()=>{
 const s=setup(),render=s.calendar._gtdRenderDayTasks;assert.equal(typeof render,'function');
 assert.equal(render(opts({mode:'week'})),null);assert.equal(render(opts({mode:'month'})),null);assert.equal(render(opts({gridRef:{current:{closest:()=>null}}})),null);
 s.plugin.data.calendarDayLayout='path';assert.equal(render(opts()),null);s.bridge.restore();assert.equal(s.calendar._gtdRenderDayTasks,undefined);
});
test('parent grouping retains all original cards and separates duplicate project names by source identity',()=>{
 const s=setup(),active=[task('one'),task('two'),task('three','p','Other')],completed=[{...task('four'),completed:true}];
 const groups=s.calendar._gtdRenderDayTasks(opts({active,completed}));assert.equal(groups.length,2);
 assert.equal(groups[0].type,'details');assert.equal(groups[0].props.children[0].props.children[1].props.children,'1/3');
 const lists=groups[0].props.children[1].props.children;assert.deepEqual(lists[0].props.items,['one','two']);assert.deepEqual(lists[1].props.items,['four']);assert.equal(lists[0].props.children[0].props.task,active[0]);
 groups[0].props.onToggle({currentTarget:{open:false}});assert.equal(s.calendar._gtdRenderDayTasks(opts({active,completed}))[0].props.open,false);s.bridge.restore();
});
test('root task groups show only their project name',()=>{
 const s=setup(),groups=s.calendar._gtdRenderDayTasks(opts({active:[{...task('root'),_gtdParentTitle:'',_gtdAncestors:[]}]}));
 assert.equal(groups[0].props.children[0].props.children[0].props.children,'Example');s.bridge.restore();
});
test('overdue groups use the same renderer but retain independent folding',()=>{
 const s=setup(),active=[task('one')],day=s.calendar._gtdRenderDayTasks(opts({active}));day[0].props.onToggle({currentTarget:{open:false}});
 const overdue=s.calendar._gtdRenderDayTasks(opts({date:'overdue',active}));assert.equal(overdue.length,1);assert.equal(overdue[0].props.open,true);s.bridge.restore();
});
