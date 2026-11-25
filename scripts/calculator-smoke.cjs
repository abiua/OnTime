const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.join(__dirname,'..');
const profile='calculator-'+Date.now();
const live=process.argv.includes('--live');
async function main(){
 if(!live)throw Error('请使用 --live，本测试会调用已配置的模型服务');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 let app;
 async function start(){app=await electron.launch({args:[root,'--smoke','--smoke-profile='+profile],env});const page=await app.firstWindow();await page.locator('#query').waitFor();return page;}
 try{
  let page=await start();
  if(live){
   const paths=await app.evaluate(({app})=>({original:app.getPath('appData'),target:app.getPath('userData')}));
   await app.close();app=null;for(const file of ['settings.json','Local State'])await fs.copyFile(path.join(paths.original,'ontime',file),path.join(paths.target,file));page=await start();
  }
  await page.locator('#query').fill('生成一个计算器插件。输入算术表达式，支持加减乘除和括号，只在本地计算，返回数值文字。');
  await page.locator('[data-plugin="builder"]').click();await page.locator('#builder-generate').click();
  await expect(page.locator('#builder-generate')).toBeEnabled({timeout:70000}); if(!(await page.locator('#builder-preview').isVisible())) throw Error(await page.locator('#builder-status').innerText());
  assert.equal(await page.evaluate(()=>pluginDraft.spec.steps[0].op),'script');
  assert.deepEqual(await page.evaluate(()=>pluginDraft.spec.steps[0].domains),[]);
  await page.locator('#builder-sample').fill('2*(3+4)');await page.locator('#builder-trial').click();
  await expect(page.locator('#trial-status')).toContainText('运行完成',{timeout:25000});
  assert.match(await page.locator('#builder-output').inputValue(),/14/);
  await page.locator('#builder-install').click();await expect(page.locator('#trial-status')).toContainText('已安装');
  const id=await page.evaluate(()=>installedDraft.id);await app.close();page=await start();
  await page.locator('#query').fill('(10-4)/2');await page.locator('[data-plugin="'+id+'"]').click();await page.locator('#text-plugin-run').click();
  await expect(page.locator('#text-plugin-status')).toHaveText('处理完成',{timeout:25000});
  assert.match(await page.locator('#text-plugin-output').inputValue(),/3/);
  console.log('PASS live AI calculator generation, local execution, install and restart');
 }finally{if(app)await app.close();for(const file of ['settings.json','Local State'])await fs.unlink(path.join(root,'.test-profile',profile,file)).catch(()=>{});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
