const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {PluginTimers}=require('../src/plugin-timers.cjs');
const request={delaySeconds:25,title:'计时',message:'结束',channels:['sound']};
const permissions=['timers','sound'];
async function fixture(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ontime-timers-'));
 t.after(async()=>{if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()))throw Error('Unexpected directory');await fs.rm(directory,{recursive:true,force:true});});
 return path.join(directory,'timers.json');
}
test('timers survive restart, handle overdue deadlines, and deliver only once',async t=>{
 const filename=await fixture(t),delivered=[];let now=100000;
 const options={now:()=>now,deliver:async task=>delivered.push(task)};
 const timers=new PluginTimers(filename,options);await timers.load();
 const task=await timers.start('plugin-a','倒计时',permissions,request);
 assert.equal(task.deadline,125000);await timers.tick();assert.equal(delivered.length,0);
 const restarted=new PluginTimers(filename,options);await restarted.load();
 now=130000;await restarted.tick();await restarted.tick();assert.equal(delivered.length,1);
 const again=new PluginTimers(filename,options);await again.load();await again.tick();assert.equal(delivered.length,1);
});
test('cancellation is owner scoped, trials do not persist, disabled plugins cannot deliver',async t=>{
 const filename=await fixture(t);let enabled=true,now=1000;const delivered=[];
 const timers=new PluginTimers(filename,{now:()=>now,deliver:async task=>delivered.push(task),canRun:()=>enabled});
 const a=await timers.start('a','A',permissions,request);
 await assert.rejects(timers.cancel('b',a.id),/不存在/);await timers.cancel('a',a.id);
 const trial=await timers.start('draft:1','试验',permissions,request,{trial:true});
 assert.ok(!JSON.stringify(JSON.parse(await fs.readFile(filename,'utf8'))).includes(trial.id));
 await timers.start('b','B',permissions,request);
 enabled=false;now+=30000;await timers.tick();assert.equal(delivered.length,0);assert.ok(timers.list().every(task=>task.status==='cancelled'));
 await assert.rejects(timers.start('b','B',permissions,request),/停用/);
});
test('concurrent timer writes serialize, errors are visible and cancellation aborts starts',async t=>{
 const filename=await fixture(t);let now=1000;
 const timers=new PluginTimers(filename,{now:()=>now,deliver:async()=>{throw Error('提醒失败');}});
 await Promise.all(Array.from({length:8},(_,i)=>timers.start('p'+i,'P',permissions,request)));
 assert.equal(JSON.parse(await fs.readFile(filename,'utf8')).length,8);
 const job=new AbortController();job.abort();await assert.rejects(timers.start('z','Z',permissions,request,{signal:job.signal}));
 now+=30000;await timers.tick();assert.ok(timers.list().every(task=>task.error==='提醒失败'));
});
test('invalid persisted timer records are preserved rather than replaced',async t=>{
 const filename=await fixture(t);await fs.writeFile(filename,'broken');
 const timers=new PluginTimers(filename,{deliver:async()=>{}});
 await assert.rejects(timers.load(),/读取失败/);assert.equal(await fs.readFile(filename,'utf8'),'broken');
});
