const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const root=path.join(__dirname,'..');
async function main(){
 const profile='management-'+Date.now();
 const directory=path.join(root,'.test-profile',profile,'files');
 await fs.mkdir(directory,{recursive:true});
 await fs.writeFile(path.join(directory,'a.txt'),'alpha');await fs.writeFile(path.join(directory,'b.txt'),'beta');
 const manifest={schemaVersion:1,name:'管理测试',description:'转为大写',keywords:['upper'],sample:'hello',steps:[{op:'upper'}]};
 const server=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);const output=body.instructions.startsWith('Convert the naming')?{renames:[{from:'a.txt',to:'001.txt'},{from:'b.txt',to:'002.txt'}]}:manifest;res.setHeader('content-type','application/json');res.end(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app;
 async function start(){app=await electron.launch({args:[root,'--smoke','--smoke-profile='+profile],env});const page=await app.firstWindow();await page.locator('#query').waitFor();return page;}
 try{
  let page=await start();await page.evaluate(port=>window.ontime.saveProvider({name:'test',baseUrl:'http://127.0.0.1:'+port,protocol:'responses',model:'mock',key:'test'}),server.address().port);
  const installed=await page.evaluate(async()=>{const draft=await window.ontime.generateTextPlugin('转大写');await window.ontime.trialTextPlugin({token:draft.token,text:'hello'});return window.ontime.installTextPlugin(draft.token);});
  await page.locator('#settings').click();await page.locator('#tab-plugins').click();
  await page.getByRole('button',{name:'停用',exact:true}).click();await expect(page.locator('#managed-plugins')).toContainText('已停用');
  await assert.rejects(page.evaluate(id=>window.ontime.runTextPlugin({id,text:'x'}),installed.id),/停用/);
  await app.close();page=await start();await expect(page.locator('[data-plugin="'+installed.id+'"]').count()).resolves.toBe(0);
  await page.locator('#settings').click();await page.locator('#tab-plugins').click();await page.getByRole('button',{name:'启用',exact:true}).click();await expect(page.locator('#managed-plugins')).toContainText('已启用');
  page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'卸载',exact:true}).click();await expect(page.locator('#managed-plugins')).toContainText('尚未安装');
  await page.locator('#back').click();await page.locator('[data-plugin="rename"]').click();
  await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},directory);
  await page.locator('#rename-choose').click();await expect(page.locator('#rename-files')).toContainText('a.txt');
  await page.locator('#query').fill('按顺序改名为三位数，保留扩展名');await page.locator('#rename-preview').click();
  await expect(page.locator('#rename-rows tr')).toHaveCount(2);await expect(page.locator('#rename-python')).toContainText('001.txt');
  await page.locator('#rename-reject').click();await expect(page.locator('#rename-status')).toContainText('已拒绝');
  await page.locator('#rename-preview').click();await expect(page.locator('#rename-accept')).toBeEnabled();
  await fs.writeFile(path.join(directory,'b.txt'),'changed');await page.locator('#rename-accept').click();await expect(page.locator('#rename-status')).toContainText('内容已变化');
  await page.locator('#rename-choose').click();await page.locator('#rename-preview').click();await expect(page.locator('#rename-accept')).toBeEnabled();await page.locator('#rename-accept').click();await expect(page.locator('#rename-status')).toContainText('已完成 2 项重命名');
  assert.deepEqual((await fs.readdir(directory)).sort(),['001.txt','002.txt']);assert.equal(await fs.readFile(path.join(directory,'001.txt'),'utf8'),'alpha');
  await app.close();page=await start();await page.locator('[data-plugin="rename"]').click();await page.getByRole('button',{name:'撤销改名',exact:true}).click();await expect(page.locator('#rename-status')).toContainText('已恢复原名称');
  assert.deepEqual((await fs.readdir(directory)).sort(),['a.txt','b.txt']);assert.equal(await fs.readFile(path.join(directory,'a.txt'),'utf8'),'alpha');
  const clipboard=await page.evaluate(async()=>{try{await window.ontime.copyText('OnTime clipboard test\nline 2');return 'verified';}catch(e){return e.message;}});console.log('Clipboard:',clipboard);
  console.log('PASS plugin disable persistence, enable, uninstall, rename preview, reject, stale-folder check, approval executes and undo survives restart');
 }finally{if(app)await app.close();server.closeAllConnections();server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
