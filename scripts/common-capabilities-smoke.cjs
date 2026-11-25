const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const root=path.join(__dirname,'..'),profile='common-'+Date.now(),folder=path.join(root,'.test-profile',profile+'-work');
const source=`async function run(input,api){
 const folder=await api.files.pickFolder();if(!folder)return '已取消';
 const text=await api.clipboard.readText(),file=folder+'/note.txt',old=await api.files.readText(file);
 const reply=JSON.parse(await api.request({url:'https://example.com/query',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})}));
 const n=(await api.storage.get('runs')||0)+1;await api.storage.set('runs',n);
 await api.files.writeText(file,old+'\\n'+text+' #'+n);
 const windows=await api.windows.list();const target=windows.find(w=>w.title.includes('OnTime'));if(target)await api.windows.focus(target.id);
 await api.clipboard.writeText('完成 '+n);await api.remind({title:'完成',message:'已保存',channels:['popup']});
 return JSON.stringify({n,reply,windows:windows.length});
}`;
const manifest={schemaVersion:1,name:'常用能力验收',description:'选择文件夹、读取剪贴板、请求接口并保存笔记，记录次数',keywords:['能力验收'],sample:'',steps:[{op:'script',domains:['example.com'],source}],permissions:['filesRead','filesWrite','clipboardRead','clipboardWrite','storage','windows','popup','networkWrite'],matching:{version:1,category:'other',accepts:[],minLength:1,maxLength:12000}};
let app,page,server;const errors=[];
async function start(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:[root,'--smoke','--smoke-profile='+profile],env});page=await app.firstWindow();await page.locator('#query').waitFor();page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({app,clipboard,dialog},folder)=>{
  const load=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/src/main.cjs');
  globalThis.commonTest={accept:false,clipboard:'测试材料',reminders:0,requests:[],previews:[]};
  clipboard.readText=async()=>globalThis.commonTest.clipboard;clipboard.writeText=async text=>{globalThis.commonTest.clipboard=text;};
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});
  dialog.showMessageBox=async(...args)=>{const options=args.at(-1);globalThis.commonTest.previews.push(options.detail);return {response:globalThis.commonTest.accept?1:0};};
  load('./plugin-reminders.cjs').deliver=async()=>{globalThis.commonTest.reminders++;};
  const {EventEmitter}=load('node:events'),{Readable}=load('node:stream');
  load('node:https').request=(url,options,callback)=>{
   const request=new EventEmitter();request.end=body=>{globalThis.commonTest.requests.push({url:url.href,method:options.method,body});const response=Readable.from([Buffer.from('{"ok":true}')]);response.statusCode=200;callback(response);};return request;
  };
 },folder);
}
async function main(){
 await fs.mkdir(folder,{recursive:true});const filename=path.join(folder,'note.txt');await fs.writeFile(filename,'原文');
 server=http.createServer(async(req,res)=>{for await(const _ of req){}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(manifest)}]}]}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await start();await page.evaluate(port=>window.ontime.saveProvider({name:'能力测试',baseUrl:'http://127.0.0.1:'+port+'/v1',model:'mock',protocol:'responses',key:'test-only'}),server.address().port);
  await page.locator('#query').fill('创建整理剪贴板到所选文件夹的工具');await page.locator('[data-plugin="builder"]').click();await page.locator('#builder-generate').click();await expect(page.locator('#draft-name')).toHaveText(manifest.name);
  await page.locator('#network-consent').check();await page.locator('#capability-consent').check();await page.locator('#builder-trial').click();await expect(page.locator('#trial-status')).toContainText('已拒绝');
  assert.equal(await fs.readFile(filename,'utf8'),'原文');assert.equal((await app.evaluate(()=>globalThis.commonTest)).clipboard,'测试材料');
  await app.evaluate(()=>{globalThis.commonTest.accept=true;});await page.locator('#builder-trial').click();await expect(page.locator('#trial-status')).toContainText('运行完成');
  assert.equal(await fs.readFile(filename,'utf8'),'原文\n测试材料 #1');
  const state=await app.evaluate(()=>globalThis.commonTest);assert.equal(state.clipboard,'完成 1');assert.equal(state.reminders,1);assert.ok(state.requests.every(request=>request.method==='POST'));assert.ok(state.previews.some(text=>text.includes('note.txt')));
  let history=await page.evaluate(()=>window.ontime.pluginFileHistory());await page.evaluate(id=>window.ontime.restorePluginFiles(id),history[0].id);assert.equal(await fs.readFile(filename,'utf8'),'原文');
  await page.locator('#builder-install').click();await expect(page.locator('#trial-status')).toContainText('已安装');const id=await page.evaluate(()=>installedDraft.id);await page.locator('#builder-open').click();await expect(page.locator('#text-plugin-run')).toBeEnabled();
  await app.evaluate(()=>{globalThis.commonTest.clipboard='正式数据';});await page.locator('#text-plugin-run').click();await expect(page.locator('#text-plugin-status')).toHaveText('处理完成');assert.equal(JSON.parse(await page.locator('#text-plugin-output').inputValue()).n,1);
  await page.locator('#settings').click();await page.locator('#quit').click();await app.close();app=null;await start();await app.evaluate(()=>{globalThis.commonTest.accept=true;});
  await page.locator('[data-plugin="'+id+'"]').click();await page.locator('#text-plugin-run').click();await expect(page.locator('#text-plugin-status')).toHaveText('处理完成');assert.equal(JSON.parse(await page.locator('#text-plugin-output').inputValue()).n,2);
  const before=await fs.readFile(filename,'utf8');await page.evaluate(({id,permissions})=>window.ontime.setPluginGrants(id,permissions),{id,permissions:manifest.permissions.filter(permission=>permission!=='windows')});
  await page.locator('#text-plugin-run').click();await expect(page.locator('#text-plugin-status')).toContainText('未获得能力：windows');assert.equal(await fs.readFile(filename,'utf8'),before);
  await page.locator('#settings').click();await page.locator('#tab-plugins').click();await expect(page.getByText('管理能力授权',{exact:true})).toBeVisible();
  await page.screenshot({path:path.join(root,'artifacts','common-permissions.png')});assert.deepEqual(errors,[]);
  console.log('PASS: generation, staged clipboard/storage/reminders, scoped file selection/read/write/preview/recovery, native window list/focus, POST bridge, install/restart, revoke; external network and reminders intercepted');
 }finally{if(app)await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
