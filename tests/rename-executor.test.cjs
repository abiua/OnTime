const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {RenameExecutor,windowsMover}=require('../src/rename-executor.cjs');
const {snapshot}=require('../src/rename-preview.cjs');
async function setup(t){
 const parent=path.resolve(__dirname,'../.test-profile');await fs.mkdir(parent,{recursive:true});
 const base=await fs.mkdtemp(path.join(parent,'rename-executor-'));
 const root=path.join(base,'files');await fs.mkdir(root);await fs.writeFile(path.join(root,'a.txt'),'alpha');await fs.writeFile(path.join(root,'b.txt'),'beta');
 t.after(async()=>{if(!base.startsWith(parent+path.sep))throw Error('Invalid test directory');await fs.rm(base,{recursive:true,force:true});});
 return {root,journal:path.join(base,'journal'),snapshot:await snapshot(root)};
}
test('rename executes swaps, preserves bytes and supports undo after restart',async t=>{
 const fixture=await setup(t),executor=new RenameExecutor(fixture.journal);
 const result=await executor.execute({snapshot:fixture.snapshot,rows:[{from:'a.txt',to:'b.txt'},{from:'b.txt',to:'a.txt'}]});
 assert.equal(await fs.readFile(path.join(fixture.root,'a.txt'),'utf8'),'beta');
 assert.equal(await fs.readFile(path.join(fixture.root,'b.txt'),'utf8'),'alpha');
 const reopened=new RenameExecutor(fixture.journal);await reopened.restore(result.id);
 assert.equal(await fs.readFile(path.join(fixture.root,'a.txt'),'utf8'),'alpha');
 assert.deepEqual((await fs.readdir(fixture.root)).sort(),['a.txt','b.txt']);
 await reopened.restore(result.id);assert.equal((await reopened.list())[0].status,'restored');
});
test('destination created during execution is never overwritten; original names recover',async t=>{
 const fixture=await setup(t);let count=0;
 const executor=new RenameExecutor(fixture.journal,()=>{
  const native=windowsMover();return {close:()=>native.close(),async move(from,to){
   if(++count===4)await fs.writeFile(to,'external',{flag:'wx'});
   return native.move(from,to);
  }};
 });
 await assert.rejects(executor.execute({snapshot:fixture.snapshot,rows:[{from:'a.txt',to:'c.txt'},{from:'b.txt',to:'d.txt'}]}),/已恢复原名称/);
 assert.equal(await fs.readFile(path.join(fixture.root,'a.txt'),'utf8'),'alpha');
 assert.equal(await fs.readFile(path.join(fixture.root,'b.txt'),'utf8'),'beta');
 assert.equal(await fs.readFile(path.join(fixture.root,'d.txt'),'utf8'),'external');
 assert.deepEqual((await fs.readdir(fixture.root)).sort(),['a.txt','b.txt','d.txt']);
});
test('modified files block undo without overwriting user changes',async t=>{
 const fixture=await setup(t),executor=new RenameExecutor(fixture.journal);
 const result=await executor.execute({snapshot:fixture.snapshot,rows:[{from:'a.txt',to:'c.txt'}]});
 await fs.writeFile(path.join(fixture.root,'c.txt'),'user changed content');
 await assert.rejects(executor.restore(result.id),/已变化/);
 assert.equal(await fs.readFile(path.join(fixture.root,'c.txt'),'utf8'),'user changed content');
});
test('case-only rename is executed and reversed',async t=>{
 const fixture=await setup(t),executor=new RenameExecutor(fixture.journal);
 const result=await executor.execute({snapshot:fixture.snapshot,rows:[{from:'a.txt',to:'A.txt'}]});
 assert.ok((await fs.readdir(fixture.root)).includes('A.txt'));
 await executor.restore(result.id);
 assert.ok((await fs.readdir(fixture.root)).includes('a.txt'));
});
test('recovery reconciles a move completed before its journal update',async t=>{
 const fixture=await setup(t),executor=new RenameExecutor(fixture.journal),id=randomUUID();
 const stat=await fs.lstat(path.join(fixture.root,'a.txt'));
 const record={id,root:fixture.root,status:'executing',completed:0,pending:{index:0,reverse:false},rows:[{from:'a.txt',to:'c.txt',identity:{size:stat.size,modified:stat.mtimeMs,ino:String(stat.ino),dev:String(stat.dev)}}]};
 await executor.save(record);
 const mover=windowsMover();try{await mover.move(path.join(fixture.root,'a.txt'),path.join(fixture.root,'.ontime-'+id+'-0.tmp'));}finally{mover.close();}
 await new RenameExecutor(fixture.journal).restore(id);
 assert.equal(await fs.readFile(path.join(fixture.root,'a.txt'),'utf8'),'alpha');
 assert.deepEqual((await fs.readdir(fixture.root)).sort(),['a.txt','b.txt']);
});
