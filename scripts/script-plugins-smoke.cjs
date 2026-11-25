const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const root=path.join(__dirname,'..');
const profile='script-'+Date.now();
const live=process.argv.includes('--live');
async function main(){
 const reuse=process.argv.find(v=>v.startsWith('--reuse='));
 const fixture=reuse?JSON.parse(await fs.readFile(reuse.slice(8),'utf8')):require('./weather-fixture.json');
 const server=http.createServer(async(req,res)=>{for await(const _ of req){}res.setHeader('content-type','application/json');res.end(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(fixture)}]}]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 let app;
 async function start(){app=await electron.launch({args:[root,'--smoke','--smoke-profile='+profile],env});const page=await app.firstWindow();await page.locator('#query').waitFor();return page;}
 try{
  let page=await start();
  if(live){
   const paths=await app.evaluate(({app})=>({original:app.getPath('appData'),target:app.getPath('userData')}));
   await app.close();app=null;for(const file of ['settings.json','Local State'])await fs.copyFile(path.join(paths.original,'ontime',file),path.join(paths.target,file));page=await start();
  }else await page.evaluate(port=>window.ontime.saveProvider({name:'模拟生成',baseUrl:'http://127.0.0.1:'+port+'/v1',model:'mock',protocol:'responses',key:'test-only'}),server.address().port);
  await page.locator('#query').fill('生成一个查询近三天天气的 JavaScript 插件。输入城市名，显示从今天开始的三天日期、最高最低温、降水概率，使用 Open-Meteo。');
  await page.locator('[data-plugin="builder"]').click();await page.locator('#builder-generate').click();
  await expect(page.locator('#builder-generate')).toBeEnabled({timeout:70000}); if(!(await page.locator('#builder-preview').isVisible())) throw Error(await page.locator('#builder-status').innerText());
  assert.equal(await page.evaluate(()=>pluginDraft.spec.steps[0].op),'script');
  await page.locator('#builder-sample').fill('北京');
  await page.locator('#builder-trial').click();await expect(page.locator('#trial-status')).toContainText('确认插件的联网范围');
  await page.locator('#network-consent').check();await page.locator('#builder-trial').click();
  await expect(page.locator('#trial-status')).toContainText('运行完成',{timeout:30000});
  const output=await page.locator('#builder-output').inputValue();assert.match(output,/\d{4}-\d{2}-\d{2}/);assert.match(output,/Open-Meteo/i);
  await page.locator('#builder-install').click();await expect(page.locator('#trial-status')).toContainText('已安装');
  const id=await page.evaluate(()=>installedDraft.id);
  await app.close();page=await start();
  await page.locator('#query').fill('上海');await page.locator('[data-plugin="'+id+'"]').click();await page.locator('#text-plugin-run').click();
  await expect(page.locator('#text-plugin-status')).toHaveText('处理完成',{timeout:30000});
  assert.match(await page.locator('#text-plugin-output').inputValue(),/\d{4}-\d{2}-\d{2}/);
  console.log('PASS '+(live?'LIVE AI':reuse?'REUSED LIVE AI OUTPUT':'MOCK AI')+' → JavaScript → network consent → live weather → install → restart → live weather');
  if(!live){
   await page.locator('#back').click();await page.locator('[data-plugin="builder"]').click();
   for(const [source,expected] of [
    ['async function run(){return typeof process+"/"+typeof require;}','undefined/undefined'],
    ['async function run(input,api){return await api.get("https://example.org/");}','未授权'],
    ['async function run(){while(true){}}','运行超时']
   ]){
    fixture.steps=[{op:'script',source,domains:[]}];
    await page.locator('#builder-generate').click();
    await expect(page.locator('#builder-generate')).toBeEnabled();
    await page.locator('#builder-sample').fill('测试');await page.locator('#builder-trial').click();
    if(expected==='undefined/undefined')await expect(page.locator('#builder-output')).toHaveValue(expected);
    else await expect(page.locator('#trial-status')).toContainText(expected,{timeout:25000});
   }
   console.log('PASS renderer isolation, unauthorized network rejection, infinite-loop termination');
  }
 }finally{if(app)await app.close();server.closeAllConnections();server.close();for(const file of ['settings.json','Local State'])await fs.unlink(path.join(root,'.test-profile',profile,file)).catch(()=>{});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
