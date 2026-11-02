const test=require('node:test'),assert=require('node:assert/strict');
const {treeKeyAction}=require('./tree-keyboard.cjs');
const rows=[{id:'p',parent:null,branch:true,expanded:true},{id:'a',parent:'p',branch:true,expanded:true},{id:'b',parent:'a',branch:false},{id:'c',parent:'p',branch:false},{id:'q',parent:null,branch:true,expanded:false}];
test('up and down move exactly one visible row and stop at both ends',()=>{
 assert.deepEqual(treeKeyAction(rows,'a','ArrowDown'),{type:'focus',id:'b'});assert.deepEqual(treeKeyAction(rows,'b','ArrowUp'),{type:'focus',id:'a'});assert.deepEqual(treeKeyAction(rows,'p','ArrowUp'),{type:'focus',id:'p'});assert.deepEqual(treeKeyAction(rows,'q','ArrowDown'),{type:'focus',id:'q'});
});
test('collapsed descendants are absent from the visible navigation sequence',()=>{
 const visible=[{...rows[0],expanded:false},rows[4]];assert.deepEqual(treeKeyAction(visible,'p','ArrowDown'),{type:'focus',id:'q'});
});
test('enter toggles only branches and space renames the current row',()=>{
 assert.deepEqual(treeKeyAction(rows,'a','Enter'),{type:'toggle',id:'a',expanded:false});assert.deepEqual(treeKeyAction(rows,'q','Enter'),{type:'toggle',id:'q',expanded:true});assert.deepEqual(treeKeyAction(rows,'b','Enter'),{type:'none'});assert.deepEqual(treeKeyAction(rows,'b',' '),{type:'rename',id:'b'});assert.deepEqual(treeKeyAction(rows,'p',' '),{type:'rename',id:'p'});
});

test('equals and plus add beneath the selected project or task, including a leaf',()=>{
 for(const id of ['p','a','b'])for(const key of ['=','+'])assert.deepEqual(treeKeyAction(rows,id,key),{type:'add',id});
});

test('delete removes only a row with a delete action, leaving project rows alone',()=>{
 const deletable=rows.map(row=>({...row,deletable:row.id==='a'||row.id==='b'}));
 assert.deepEqual(treeKeyAction(deletable,'a','Delete'),{type:'delete',id:'a'});assert.deepEqual(treeKeyAction(deletable,'b','Delete'),{type:'delete',id:'b'});assert.deepEqual(treeKeyAction(deletable,'p','Delete'),{type:'none'});
});

test('t toggles today for task rows only, in either letter case',()=>{
 const actionable=rows.map(row=>({...row,canToday:row.id==='a'||row.id==='b'}));
 for(const key of ['t','T']){assert.deepEqual(treeKeyAction(actionable,'b',key),{type:'today',id:'b'});assert.deepEqual(treeKeyAction(actionable,'p',key),{type:'none'});}
});
test('left collapses an expanded branch or moves to its visible parent',()=>{
 assert.deepEqual(treeKeyAction(rows,'a','ArrowLeft'),{type:'toggle',id:'a',expanded:false});assert.deepEqual(treeKeyAction(rows,'b','ArrowLeft'),{type:'focus',id:'a'});assert.deepEqual(treeKeyAction(rows,'q','ArrowLeft'),{type:'none'});
});
test('right expands a closed branch then enters its first visible child',()=>{
 assert.deepEqual(treeKeyAction(rows,'q','ArrowRight'),{type:'toggle',id:'q',expanded:true});assert.deepEqual(treeKeyAction(rows,'a','ArrowRight'),{type:'focus',id:'b'});assert.deepEqual(treeKeyAction(rows,'b','ArrowRight'),{type:'none'});
});
test('home and end select first and last visible rows; unknown input does nothing',()=>{
 assert.deepEqual(treeKeyAction(rows,'b','Home'),{type:'focus',id:'p'});assert.deepEqual(treeKeyAction(rows,'b','End'),{type:'focus',id:'q'});assert.deepEqual(treeKeyAction(rows,'b','z'),{type:'none'});assert.deepEqual(treeKeyAction([],'missing','ArrowDown'),{type:'none'});
});
