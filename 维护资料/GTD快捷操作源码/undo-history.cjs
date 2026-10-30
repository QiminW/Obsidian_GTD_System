module.exports=class UndoHistory {
 constructor(){this.entries=[];this.tail=Promise.resolve();this.current=null;this.restoring=false;this.pending=0;}
 enqueue(action){
  this.pending++;
  const result=this.tail.then(action);this.tail=result.catch(()=>{});
  return result.finally(()=>this.pending--);
 }
 run(label,action){return this.enqueue(async()=>{
  const entry={label,steps:[]};this.current=entry;
  try{return await action();}
  finally{this.current=null;if(entry.steps.length){this.entries.push(entry);if(this.entries.length>30)this.entries.shift();}}
 });}
 record(step){if(this.current&&!this.restoring)this.current.steps.push(step);}
 undo(){return this.enqueue(async()=>{
  const entry=this.entries.at(-1);if(!entry)return null;
  for(const step of entry.steps)await step.check();
  this.restoring=true;const restored=[];
  try{
   for(const step of [...entry.steps].reverse()){await step.undo();restored.push(step);}
   this.entries.pop();return entry.label;
  }catch(error){
   try{for(const step of restored.reverse())await step.redo();}
   catch(rollback){throw new Error('撤销未完成，请检查相关笔记：'+(rollback.message||String(rollback)));}
   throw error;
  }finally{this.restoring=false;}
 });}
 clear(){return this.enqueue(async()=>{this.entries.length=0;});}
};
