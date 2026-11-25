const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const root = path.join(__dirname, '..');
const profile = 'browser-plugin-' + Date.now();
const live = process.argv.includes('--live');

async function main() {
  const manifest = {
    schemaVersion:1, name:'谷歌快搜', description:'使用默认浏览器打开 Google 搜索', keywords:['谷歌','Google'], sample:'天气',
    steps:[{op:'script',domains:[],browserDomains:['www.google.com'],source:'async function run(input, api) { await api.openUrl("https://www.google.com/search?q=" + encodeURIComponent(input.trim())); return "已打开谷歌搜索"; }'}]
  };
  const server = http.createServer(async (req, res) => {
    for await (const _ of req) {}
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(manifest)}]}]}));
  });
  if (!live) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  async function start() {
    app = await electron.launch({args:[root,'--smoke','--smoke-profile='+profile],env});
    page = await app.firstWindow();
    await page.locator('#query').waitFor();
    await app.evaluate(({shell})=>{
      globalThis.testBrowserUrls=[];
      shell.openExternal=async url=>{globalThis.testBrowserUrls.push(url);};
    });
  }
  const opened = () => app.evaluate(()=>globalThis.testBrowserUrls);
  async function generate() {
    await page.locator('#builder-generate').click();
    await expect(page.locator('#builder-generate')).toBeEnabled({timeout:70000});
    if (!(await page.locator('#builder-preview').isVisible())) throw Error(await page.locator('#builder-status').innerText());
  }
  try {
    await start();
    if (live) {
      const dirs=await app.evaluate(({app})=>({original:app.getPath('appData'),target:app.getPath('userData')}));
      await app.close();app=null;
      for(const file of ['settings.json','Local State'])await fs.copyFile(path.join(dirs.original,'ontime',file),path.join(dirs.target,file));
      await start();
    } else {
      await page.evaluate(port=>window.ontime.saveProvider({name:'模拟生成',baseUrl:'http://127.0.0.1:'+port+'/v1',model:'mock',protocol:'responses',key:'test-only'}),server.address().port);
    }
    await page.locator('#query').fill('我想在输入框输入内容，然后你用谷歌搜索引擎帮我搜索，使用默认浏览器打开网页。插件命名为“谷歌快搜”');
    await page.locator('[data-plugin="builder"]').click();
    await generate();
    await expect(page.locator('#draft-name')).toHaveText('谷歌快搜');
    await expect(page.locator('#draft-access')).toContainText('www.google.com');
    await expect(page.locator('#network-consent-row')).toBeHidden();
    await page.locator('#builder-sample').fill('中文 & search');
    await page.locator('#builder-trial').click();
    await expect(page.locator('#trial-status')).toContainText('请先允许插件用默认浏览器');
    assert.deepEqual(await opened(),[]);
    await page.locator('#browser-consent').check();
    await page.locator('#builder-trial').click();
    await expect(page.locator('#trial-status')).toContainText('运行完成');
    assert.deepEqual((await opened()).map(url=>[new URL(url).hostname,new URL(url).searchParams.get('q')]),[['www.google.com','中文 & search']]);
    await page.locator('#builder-install').click();
    await expect(page.locator('#trial-status')).toContainText('已安装');
    const id=await page.evaluate(()=>installedDraft.id);
    await app.close();app=null;await start();
    await page.locator('[data-plugin="'+id+'"]').click();
    await page.locator('#query').fill('重启测试');
    await page.locator('#text-plugin-run').click();
    await expect(page.locator('#text-plugin-status')).toHaveText('处理完成');
    assert.equal(new URL((await opened())[0]).searchParams.get('q'),'重启测试');
    if (!live) {
      await page.locator('#back').click();await page.locator('[data-plugin="builder"]').click();
      await page.locator('#query').fill('验证插件不能打开未授权域名');
      manifest.steps[0].source='async function run(input, api) { await api.openUrl("https://example.org/"); return "打开"; }';
      await generate();await page.locator('#browser-consent').check();await page.locator('#builder-trial').click();
      await expect(page.locator('#trial-status')).toContainText('未授权');
      await expect(page.locator('#builder-install')).toBeDisabled();
      assert.equal((await opened()).length,1);
    }
    console.log(`PASS ${live?'live':'mock'} Google search plugin generation, browser permission, installation and restart`);
  } finally {
    try { if(app)await app.close(); }
    finally {
      if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
      for(const file of ['settings.json','Local State'])await fs.unlink(path.join(root,'.test-profile',profile,file)).catch(()=>{});
    }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
