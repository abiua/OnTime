const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {preset}=require('../src/plugin-intents.js');
const root=path.join(__dirname,'..'),profile='matching-'+randomUUID();
const directory=path.join(root,'.test-profile',profile,'plugins');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app;
async function start(){
 app=await electron.launch({args:[root,'--smoke','--smoke-profile='+profile],env});
 const page=await app.firstWindow();
 page.on('pageerror',error=>errors.push(error.message));
 await page.waitForFunction(()=>plugins.filter(p=>p.spec).length===4);
 return page;
}
const errors=[];
async function main(){
 await fs.mkdir(directory,{recursive:true});
 const manifests=[
  {name:'随手算数学计算器',keywords:['计算器'],description:'处理算式'},
  {name:'谷歌快搜',keywords:['google'],description:'浏览器搜索'},
  {name:'必应搜索',keywords:['bing'],description:'浏览器搜索'},
  {name:'网址整理',keywords:['网址'],description:'处理网址',matching:preset('other',['url'])}
 ];
 const ids=[];
 for(const manifest of manifests){
  const id='text-'+randomUUID();ids.push(id);
  await fs.writeFile(path.join(directory,id+'.json'),JSON.stringify({schemaVersion:1,...manifest,sample:'',steps:[{op:'prefix',text:'已处理：'}]}));
 }
 try{
  let page=await start();
  const q=()=>page.locator('#query');
  const home=()=>page.locator('#plugins button[data-plugin]');
  let data=await page.evaluate(()=>window.ontime.textPlugins());
  assert.deepEqual(data.warnings,[]);
  assert.deepEqual(data.items.find(p=>p.id===ids[0]).matching,preset('calculator'));
  assert.deepEqual(data.items.find(p=>p.id===ids[1]).matching,preset('web-search'));
  assert.ok(!(JSON.parse(await fs.readFile(path.join(directory,ids[1]+'.json.pre-matching'),'utf8'))).matching);
  await q().fill('天线宝宝');
  await expect(home().filter({hasText:'翻译'})).toBeVisible();
  await expect(home().filter({hasText:'文件搜索'})).toBeVisible();
  assert.equal(await page.locator('#plugins .match').count(),4); // one file, translation, then two web choices
  assert.ok(!(await home().allTextContents()).includes('随手算数学计算器'));
  await q().fill('2*(3+4)');
  await expect(home().first()).toContainText('随手算数学计算器');
  await home().first().click();await expect(q()).toHaveValue('2*(3+4)');
  await page.locator('#text-plugin-run').click();await expect(page.locator('#text-plugin-output')).toHaveValue('已处理：2*(3+4)');
  await page.locator('#back').click();
  await q().fill('天线宝宝');await page.locator('[data-plugin="'+ids[1]+'"]').click();
  await expect(q()).toHaveValue('天线宝宝');await page.locator('#back').click();
  await expect(home().first()).toHaveAttribute('data-plugin',ids[1]);
  assert.ok(!(await page.evaluate(()=>localStorage.getItem('ontime-plugin-ranking'))).includes('天线宝宝'));
  await page.locator('#settings').click();await page.locator('#tab-plugins').click();
  const card=page.locator('#managed-plugins .card').filter({has:page.locator('h3',{hasText:'网址整理'})});
  await card.locator('.matching-editor summary').click();
  await card.locator('input[value="url"]').uncheck();await card.locator('input[value="json"]').check();
  await page.screenshot({path:path.join(root,'artifacts','matching-settings.png')});
  await card.getByText('保存匹配方式',{exact:true}).click();
  await expect(page.locator('#notice')).toHaveText('匹配方式已保存');
  data=await page.evaluate(()=>window.ontime.textPlugins());
  assert.deepEqual(data.items.find(p=>p.id===ids[3]).matching.accepts,['json']);
  await page.locator('#quit').click();await app.close();app=null;
  page=await start();await q().fill('天线宝宝');
  await expect(home().first()).toHaveAttribute('data-plugin',ids[1]);
  await page.locator('#plugin-overflow').click();await expect(page.locator('#plugin-library-grid button').first()).toHaveAttribute('data-library-plugin',ids[1]);
  await page.locator('#plugin-library-close').click();
  await q().fill('{"a":1}');await expect(home().first()).toHaveAttribute('data-plugin',ids[3]);
  await page.locator('#settings').click();await page.locator('#tab-plugins').click();
  await page.locator('#reset-plugin-ranking').click();
  await page.locator('#back').click();await q().fill('天线宝宝');await expect(home().first()).toHaveAttribute('data-plugin','files');
  await page.evaluate(id=>window.ontime.managePlugin(id,'disable'),ids[1]);
  await page.evaluate(async()=>syncPlugins(await window.ontime.textPlugins()));
  await expect(page.locator('[data-plugin="'+ids[1]+'"]').first()).toHaveCount(0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(root,'artifacts','matching-smoke.png')});
  console.log('PASS: legacy migration, declarations, ambiguous text, calculator, carry, local learning, settings, restart, library, reset, disable; no model configured');
 }finally{if(app)await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
