const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { validate, parseGenerated, execute, PluginStore } = require('../src/text-plugins.cjs');
const spec = (steps = [{op:'trimLines'}, {op:'removeEmptyLines'}, {op:'uniqueLines'}]) => ({schemaVersion:1,name:'整理文字',description:'整理并去重',keywords:['整理','clean'],steps,sample:' 苹果 \r\n\r\n香蕉\r\n苹果 '});

test('text plugins: validate schema, reject code, paths, unknown fields and versions', () => {
  assert.deepEqual(validate(spec()), {...spec(),matching:require('../src/plugin-intents.js').inferMatching(spec())});
  for (const bad of [null, {...spec(),schemaVersion:2}, {...spec(),code:'alert(1)'}, {...spec(),path:'../x'}, spec([{op:'exec',command:'x'}]), spec([{op:'constructor'}]), spec([{op:'trim',code:'x'}]), spec([{op:'replace',find:'',replacement:'x'}]), spec([{op:'ai',prompt:'x'}, {op:'ai',prompt:'y'}])]) assert.throws(()=>validate(bad));
  assert.deepEqual(parseGenerated('```json\n'+JSON.stringify(spec())+'\n```'),validate(spec()));
  assert.throws(()=>parseGenerated('Here is the code'),/有效/);
  assert.throws(()=>parseGenerated('{"unsupported":"rename files"}'),/暂不支持/);
});
test('text plugins: ordered steps, line endings, Unicode and literal replacement', async () => {
  assert.equal(await execute(spec(),spec().sample),'苹果\n香蕉');
  assert.equal(await execute(spec([{op:'replace',find:'.*',replacement:'$&'}, {op:'prefix',text:'['}, {op:'suffix',text:']'}]),'a.*b.*'),'[a$&b$&]');
  assert.equal(await execute(spec([{op:'replace',find:' ',replacement:''}]),'a b'),'ab');
  assert.equal(await execute(spec([{op:'trim'}]),' \t '),'');
  assert.equal(await execute(spec([{op:'trim'}, {op:'lower'}, {op:'sortLines'}, {op:'upper'}]),' B\ra\nA '),'A\nA\nB');
});
test('text plugins: bounded input and output prevent expansion', async () => {
  await assert.rejects(execute(spec(),''));
  await assert.rejects(execute(spec(),'a'.repeat(12001)));
  await assert.rejects(execute(spec([{op:'replace',find:'a',replacement:'x'.repeat(1000)}]),'a'.repeat(12000)),/过长/);
  await assert.rejects(execute(spec([{op:'ai',prompt:'summary'}]),'x',async()=> 'x'.repeat(100001)),/超过/);
});
test('text plugins: AI receives only reusable instruction and step input', async () => {
  const calls=[], manifest=spec([{op:'trim'}, {op:'ai',prompt:'提炼要点'}, {op:'prefix',text:'摘要：'}]);
  assert.equal(await execute(manifest,' 用户材料 ',async (...args)=>{calls.push(args);return '要点';}),'摘要：要点');
  assert.deepEqual(calls,[['提炼要点','用户材料']]);
  await assert.rejects(execute(manifest,'用户材料'),/配置模型/);
});
test('text plugins: atomic install, duplicate protection, reload and corrupt-file isolation', async t => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ontime-plugins-'));
  t.after(async()=>{
    if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()))throw Error('Unexpected test directory');
    await fs.rm(directory,{recursive:true,force:true});
  });
  const store=new PluginStore(directory);await store.load();
  const item=await store.install(spec());assert.match(item.id,/^text-/);
  const saved=JSON.parse(await fs.readFile(path.join(directory,item.id+'.json'),'utf8'));
  assert.equal(saved.sample,'');assert.equal('id' in saved,false);
  await assert.rejects(store.install(spec()),/同名/);
  const broken='text-00000000-0000-0000-0000-000000000000.json';
  await fs.writeFile(path.join(directory,broken),'{incomplete');
  await fs.writeFile(path.join(directory,'orphan.tmp'),'interrupted install');
  const reopened=new PluginStore(directory);const result=await reopened.load();
  assert.equal(result.items.length,1);assert.equal(result.warnings.length,1);
  assert.equal(await execute(reopened.get(item.id),' 一\r\n二\r\n一 '),'一\n二');
  assert.equal(await fs.readFile(path.join(directory,broken),'utf8'),'{incomplete');
  assert.throws(()=>reopened.get('../settings'),/不存在/);
});

test('legacy plugin declarations are backed up, migrated once and remain editable across restarts',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ontime-matching-'));
  t.after(async()=>{if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()))throw Error('Unexpected directory');await fs.rm(directory,{recursive:true,force:true});});
  const id='text-11111111-1111-1111-1111-111111111111',filename=path.join(directory,id+'.json');
  const legacy={...spec(),name:'谷歌快搜',keywords:['google'],steps:[{op:'script',source:'async function run(input) { return input; }',domains:[],browserDomains:['www.google.com']}],sample:''};
  const original=JSON.stringify(legacy);await fs.writeFile(filename,original);
  const store=new PluginStore(directory);await store.load();
  assert.equal(store.warnings.length,0);
  assert.equal(store.get(id).matching.category,'web-search');
  assert.deepEqual(store.get(id).steps,legacy.steps);
  assert.equal(await fs.readFile(filename+'.pre-matching','utf8'),original);
  const {preset}=require('../src/plugin-intents.js');
  await store.updateMatching(id,preset('other',['url']));
  await store.load();assert.deepEqual(store.get(id).matching,preset('other',['url']));
  assert.equal(await fs.readFile(filename+'.pre-matching','utf8'),original);
  await assert.rejects(store.updateMatching(id,{...preset('other'),accepts:['script']}),/匹配声明/);
  assert.deepEqual(JSON.parse(await fs.readFile(filename,'utf8')).matching,preset('other',['url']));
});
