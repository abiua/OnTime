const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const root=path.join(__dirname,'..'),profile='timer-plugin-'+Date.now();
const live=process.argv.includes('--live');
const requirement='我想要一个倒计时插件，里面设置时间，然后开始计时，结束后可以选择用系统通知、铃声、弹窗等方式来通知我。';
const manifest={schemaVersion:1,name:'倒计时',description:'设置时间与提醒方式，后台计时',keywords:['倒计时'],sample:'',matching:{version:1,category:'other',accepts:[],minLength:1,maxLength:12000},
 permissions:['timers','notifications','sound','popup'],settings:[
  {key:'seconds',label:'倒计时（秒）',type:'number',min:1,max:2592000,default:26},
  {key:'notify',label:'系统通知',type:'checkbox',default:true},
  {key:'sound',label:'提示音',type:'checkbox',default:true},
  {key:'popup',label:'弹窗',type:'checkbox',default:true}],
 steps:[{op:'script',domains:[],source:'async function run(input,api){const s=api.settings,channels=[];if(s.notify)channels.push("notification");if(s.sound)channels.push("sound");if(s.popup)channels.push("popup");await api.timers.start({delaySeconds:s.seconds,title:"倒计时结束",message:"设定的时间已到",channels});return "倒计时已启动，可返回首页或隐藏窗口。";}'}]};
let app,page,server;const errors=[];
async function start(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:[root,'--smoke','--smoke-profile='+profile],env});
 page=await app.firstWindow();await page.locator('#query').waitFor();page.on('pageerror',error=>errors.push(error.message));
 await app.evaluate(({app})=>{globalThis.timerDeliveries=[];const {createRequire}=process.getBuiltinModule('module');const load=createRequire(app.getAppPath()+'/src/main.cjs');load('./plugin-reminders.cjs').deliver=async task=>{globalThis.timerDeliveries.push(task);};});
}
const tasks=()=>page.evaluate(()=>window.ontime.pluginTimers());
async function generate(){
 await page.locator('#builder-generate').click();await expect(page.locator('#builder-generate')).toBeEnabled({timeout:90000});
 if(!await page.locator('#builder-preview').isVisible())throw Error(await page.locator('#builder-status').innerText());
}
async function main(){
 try{
  await start();
  if(live){
   const paths=await app.evaluate(({app})=>({source:app.getPath('appData'),target:app.getPath('userData')}));
   await app.close();app=null;
   for(const file of ['settings.json','Local State'])await fs.copyFile(path.join(paths.source,'ontime',file),path.join(paths.target,file));
   await start();
  }else{
   server=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);assert.match(body.instructions,/api\.timers\.start/);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(manifest)}]}]}));});
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   await page.evaluate(port=>window.ontime.saveProvider({name:'计时测试',baseUrl:'http://127.0.0.1:'+port+'/v1',protocol:'responses',model:'mock',key:'test-only'}),server.address().port);
  }
  await page.locator('#query').fill(requirement);await page.locator('[data-plugin="builder"]').click();await generate();
  const generated=await page.evaluate(()=>pluginDraft.spec);
  assert.ok(generated.settings?.length);for(const permission of ['timers','notifications','sound','popup'])assert.ok(generated.permissions.includes(permission),permission);
  await fs.writeFile(path.join(root,'artifacts',live?'countdown-live-manifest.json':'countdown-test-manifest.json'),JSON.stringify(generated,null,2));
  await page.locator('#builder-trial').click();await expect(page.locator('#trial-status')).toContainText('请先确认');
  assert.equal((await tasks()).items.length,0);await page.locator('#capability-consent').check();
  if(live){
   // Shorten numeric controls for the live trial; the host still validates their declared bounds.
   for(const field of generated.settings.filter(field=>field.type==='number'))await page.locator('#builder-plugin-settings [data-setting="'+field.key+'"]').fill(String(Math.max(1,field.min)));
  }
  await page.locator('#builder-trial').click();await expect(page.locator('#trial-status')).toContainText('运行完成',{timeout:25000});
  await expect(page.locator('#builder-install')).toBeEnabled();
  let pending=(await tasks()).items.find(task=>task.status==='pending');assert.ok(pending);
  assert.ok(pending.request.channels.length);
  if(!live){
   assert.deepEqual(pending.request.channels,['notification','sound','popup']);
   await page.evaluate(()=>window.ontime.hide());
   await expect.poll(()=>app.evaluate(()=>globalThis.timerDeliveries.length),{timeout:32000,intervals:[500]}).toBe(1);
   assert.equal((await tasks()).items[0].status,'finished');
   await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].show();BrowserWindow.getAllWindows()[0].focus();});
  }
  await page.locator('#builder-install').click();await expect(page.locator('#trial-status')).toContainText('已安装');
  assert.ok(!(await tasks()).items.some(task=>task.trial&&task.status==='pending'));
  const id=await page.evaluate(()=>installedDraft.id);await page.locator('#builder-open').click();await expect(page.locator('#text-plugin-run')).toBeEnabled();
  if(!live)await page.locator('#plugin-settings [data-setting="seconds"]').fill('8');
  await page.locator('#query').fill('');await page.locator('#text-plugin-run').click();await expect(page.locator('#text-plugin-status')).toHaveText('处理完成',{timeout:25000});
  await expect(page.locator('#plugin-timers .timer-row')).toHaveCount(1);
  await page.screenshot({path:path.join(root,'artifacts',live?'countdown-live.png':'countdown-ui.png')});
  const started=(await tasks()).items.find(task=>task.owner===id&&task.status==='pending');assert.ok(started);
  await page.locator('#settings').click();await page.locator('#quit').click();await app.close();app=null;await start();
  await page.locator('#query').fill(generated.name);await page.locator('[data-plugin="'+id+'"]').click();await expect(page.locator('#text-plugin-run')).toBeEnabled();
  if(!live){
   await expect(page.locator('#plugin-settings [data-setting="seconds"]')).toHaveValue('8');
   await expect.poll(()=>app.evaluate(()=>globalThis.timerDeliveries.length),{timeout:13000,intervals:[500]}).toBe(1);
   await page.locator('#plugin-settings [data-setting="seconds"]').fill('20');await page.locator('#text-plugin-run').click();await expect(page.locator('#text-plugin-status')).toHaveText('处理完成');
   const current=(await tasks()).items.find(task=>task.owner===id&&task.status==='pending');
   await page.locator('[data-timer="'+current.id+'"] button').click();await expect.poll(async()=>(await tasks()).items.find(task=>task.id===current.id).status).toBe('cancelled');
   // A failing script must never leave a queued timer behind.
   await page.locator('#back').click();await page.locator('#query').fill('生成插件');await page.locator('[data-plugin="builder"]').click();
   manifest.steps[0].source=manifest.steps[0].source.replace('return "倒计时已启动，可返回首页或隐藏窗口。";','throw Error("故意失败");');
   await generate();await page.locator('#capability-consent').check();await page.locator('#builder-trial').click();await expect(page.locator('#trial-status')).toContainText('故意失败');
   assert.ok(!(await tasks()).items.some(task=>task.status==='pending'));
  }else{
   assert.ok((await tasks()).items.some(task=>task.id===started.id));
   await page.evaluate(id=>window.ontime.cancelPluginTimer(id),started.id);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS '+(live?'live':'mock')+': countdown generation, rendered settings, permission enforcement, trial, install, background scheduling, restart, cancellation; reminder delivery intercepted');
 }finally{
  if(app)await app.close();
  if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  for(const file of ['settings.json','Local State'])await fs.unlink(path.join(root,'.test-profile',profile,file)).catch(()=>{});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
