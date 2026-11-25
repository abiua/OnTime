const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),profile='file-live-'+Date.now(),folder=path.join(root,'.test-profile',profile+'-work');
let app,page;
async function start(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:[root,'--smoke','--smoke-profile='+profile],env});page=await app.firstWindow();await page.locator('#query').waitFor();
 await app.evaluate(({clipboard,dialog},folder)=>{clipboard.readText=async()=>'真实模型插件验收文字';dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});dialog.showMessageBox=async()=>({response:1});},folder);
}
async function main(){
 await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'notes.txt'),'原有笔记\n');
 try{
  await start();const paths=await app.evaluate(({app})=>({source:app.getPath('appData'),target:app.getPath('userData')}));await app.close();app=null;
  for(const file of ['settings.json','Local State'])await fs.copyFile(path.join(paths.source,'ontime',file),path.join(paths.target,file));await start();
  await page.locator('#query').fill('创建“剪贴板记事”插件：选择一个文件夹，将剪贴板文字追加到其中的 notes.txt，保留原内容，没有文件则新建。用插件独立存储记录正式运行次数，完成后输出次数和保存位置。运行时不调用模型。');
  await page.locator('[data-plugin="builder"]').click();await page.locator('#builder-generate').click();await expect(page.locator('#builder-generate')).toBeEnabled({timeout:90000});
  if(!await page.locator('#builder-preview').isVisible())throw Error(await page.locator('#builder-status').innerText());
  const spec=await page.evaluate(()=>pluginDraft.spec);for(const key of ['filesRead','filesWrite','clipboardRead','storage'])assert.ok(spec.permissions.includes(key),key);
  await fs.writeFile(path.join(root,'artifacts','file-live-manifest.json'),JSON.stringify(spec,null,2));
  await page.locator('#capability-consent').check();await page.locator('#builder-trial').click();await expect(page.locator('#trial-status')).toContainText('运行完成',{timeout:25000});
  let content=await fs.readFile(path.join(folder,'notes.txt'),'utf8');assert.ok(content.includes('原有笔记'));assert.ok(content.includes('真实模型插件验收文字'));
  await page.locator('#builder-install').click();await expect(page.locator('#trial-status')).toContainText('已安装');const id=await page.evaluate(()=>installedDraft.id);
  await page.locator('#builder-open').click();await page.locator('#text-plugin-run').click();await expect(page.locator('#text-plugin-status')).toHaveText('处理完成',{timeout:25000});
  await page.locator('#settings').click();await page.locator('#quit').click();await app.close();app=null;await start();
  await page.locator('#query').fill(spec.name);await page.locator('[data-plugin="'+id+'"]').click();await page.locator('#text-plugin-run').click();await expect(page.locator('#text-plugin-status')).toHaveText('处理完成',{timeout:25000});
  content=await fs.readFile(path.join(folder,'notes.txt'),'utf8');assert.ok(content.startsWith('原有笔记'));assert.equal(content.split('真实模型插件验收文字').length-1,3);
  console.log('PASS live: generated clipboard/file/private-storage plugin, trial, installation, repeat execution and restart; only isolated test data used');
 }finally{if(app)await app.close();for(const file of ['settings.json','Local State'])await fs.unlink(path.join(root,'.test-profile',profile,file)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
