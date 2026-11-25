const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {PluginData}=require('../src/plugin-data.cjs');
const {FileScope,FileWrites,assertOpenable}=require('../src/plugin-files.cjs');
const {createHost}=require('../src/plugin-host.cjs');
const {requestOptions}=require('../src/script-runtime.cjs');
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ontime-common-'));t.after(async()=>{if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()))throw Error('Unexpected path');await fs.rm(directory,{recursive:true,force:true});});return directory;}
const signal=()=>new AbortController().signal;
test('private plugin data persists, isolates owners and never writes on failed/uncommitted runs',async t=>{
 const data=new PluginData(await fixture(t));
 const host=createHost({owner:'a',name:'A',permissions:['storage'],data});
 await host.invoke('storage-set',{key:'counter',value:3},signal());
 assert.equal(await host.invoke('storage-get',{key:'counter'},signal()),3);assert.deepEqual(await data.read('a'),{});
 await host.commit(signal());assert.equal((await data.read('a')).counter,3);assert.deepEqual(await data.read('b'),{});
 await assert.rejects(host.invoke('storage-set',{key:'__proto__',value:1},signal()));
 const trial=createHost({owner:'a',name:'A',permissions:['storage'],data,trial:true});
 assert.equal(await trial.invoke('storage-get',{key:'counter'},signal()),null);
 await trial.invoke('storage-set',{key:'counter',value:10},signal());await trial.commit(signal());assert.equal((await data.read('a')).counter,3);
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(data.update('a',[{key:'x',value:1}],cancelled.signal));
 await data.clear('a');assert.deepEqual(await data.read('a'),{});
});
test('clipboard and reminder permissions are independent and writes are staged',async()=>{
 let text='source',reminders=0;const clipboard={readText:async()=>text,writeText:async value=>{text=value;}};
 const denied=createHost({owner:'a',name:'A',permissions:[],clipboard});
 await assert.rejects(denied.invoke('clipboard-read',null,signal()),/未获得/);
 const host=createHost({owner:'a',name:'A',permissions:['clipboardRead','clipboardWrite','popup'],clipboard,remind:async()=>{reminders++;}});
 assert.equal(await host.invoke('clipboard-read',null,signal()),'source');await host.invoke('clipboard-write','changed',signal());
 await host.invoke('remind',{title:'Done',message:'OK',channels:['popup']},signal());assert.equal(text,'source');assert.equal(reminders,0);
 await host.commit(signal());assert.equal(text,'changed');assert.equal(reminders,1);
});
test('file access stays within chosen scope and refuses traversal and junction escape',async t=>{
 const directory=await fixture(t),allowed=path.join(directory,'allowed'),outside=path.join(directory,'outside');await fs.mkdir(allowed);await fs.mkdir(outside);
 await fs.writeFile(path.join(allowed,'a.txt'),'a');await fs.writeFile(path.join(outside,'secret.txt'),'private');
 const scope=new FileScope();await scope.grant(allowed,true);assert.equal(await scope.readText(path.join(allowed,'a.txt')),'a');
 await assert.rejects(scope.readText(path.join(allowed,'../outside/secret.txt')),/授权范围/);
 await fs.symlink(outside,path.join(allowed,'junction'),'junction');await assert.rejects(scope.readText(path.join(allowed,'junction/secret.txt')),/授权范围/);
 await assert.rejects(scope.planWrite(path.join(allowed,'bad.txt:stream'),'x'),/文件名/);
 const guarded=new FileScope([outside]);await guarded.grant(directory,true);await assert.rejects(guarded.readText(path.join(outside,'secret.txt')),/内部配置/);
 const script=path.join(allowed,'test.cmd');await fs.writeFile(script,'echo test');await assert.rejects(assertOpenable(script),/暂只允许/);await assertOpenable(path.join(allowed,'a.txt'));
});
test('file writes preserve originals and can be restored after restart including newly created files',async t=>{
 const directory=await fixture(t),file=path.join(directory,'old.txt'),created=path.join(directory,'new.txt');await fs.writeFile(file,'original');
 const scope=new FileScope();await scope.grant(directory,true);const journal=path.join(directory,'journal'),writes=new FileWrites(journal);
 const id=await writes.run('Test',[await scope.planWrite(file,'updated'),await scope.planWrite(created,'new')],signal());
 assert.equal(await fs.readFile(file,'utf8'),'updated');assert.equal(await fs.readFile(created,'utf8'),'new');
 await new FileWrites(journal).restore(id);assert.equal(await fs.readFile(file,'utf8'),'original');await assert.rejects(fs.stat(created),{code:'ENOENT'});
 assert.equal(await writes.run('Unchanged',[await scope.planWrite(file,'original')],signal()),null);
});
test('file modification races and later edits block overwrite or restore',async t=>{
 const directory=await fixture(t),file=path.join(directory,'a.txt');await fs.writeFile(file,'before');const scope=new FileScope();await scope.grant(directory,true);
 const writes=new FileWrites(path.join(directory,'journal')),plan=await scope.planWrite(file,'generated');await fs.writeFile(file,'user change');
 await assert.rejects(writes.run('Test',[plan],signal()),/变化/);assert.equal(await fs.readFile(file,'utf8'),'user change');
 const id=await writes.run('Test',[await scope.planWrite(file,'generated')],signal());await fs.writeFile(file,'later edit');
 await assert.rejects(writes.restore(id),/变化/);assert.equal(await fs.readFile(file,'utf8'),'later edit');
});
test('rejecting file preview has no effects',async t=>{
 const directory=await fixture(t),file=path.join(directory,'a.txt');await fs.writeFile(file,'before');const scope=new FileScope();await scope.grant(directory,true);
 const host=createHost({owner:'a',name:'A',permissions:['filesWrite'],files:scope,confirmWrites:async()=>{throw Error('拒绝');},fileWrites:new FileWrites(path.join(directory,'journal'))});
 await host.invoke('files-write',{path:file,text:'after'},signal());await assert.rejects(host.commit(signal()),/拒绝/);assert.equal(await fs.readFile(file,'utf8'),'before');
});
test('network request options reject control headers, unsupported methods and oversized bodies',()=>{
 assert.deepEqual(requestOptions({url:'https://example.com',method:'POST',body:'{}',headers:{'Content-Type':'application/json'}}),{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});
 for(const options of [{method:'DELETE'},{method:'GET',body:'x'},{headers:{Host:'127.0.0.1'}},{headers:{Authorization:'a\r\nb'}},{method:'POST',body:'a'.repeat(65537)}])assert.throws(()=>requestOptions(options));
});
