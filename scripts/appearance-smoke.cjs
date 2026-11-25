const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const profile = 'appearance-' + Date.now();
const root = path.join(__dirname, '..');

async function main() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  async function start(background = false) {
    app = await electron.launch({ args: [root, '--smoke', '--smoke-profile=' + profile, ...(background ? ['--background'] : [])], env });
    page = await app.firstWindow();
    await page.locator('#query').waitFor({ state: 'attached' });
  }
  try {
    await start();
    await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
    await expect(page.locator('body')).toHaveClass(/home-view/);
    await expect(page.locator('#plugins')).toBeVisible();
    await page.screenshot({animations:'disabled',path:path.join(root,'artifacts/ontime-light-launcher.png')});
    const bounds = await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].getBounds());
    assert.ok(bounds.height >= 176 && bounds.height <= 190);
    await page.locator('#settings').click();
    await page.locator('#tab-general').click();
    await expect(page.locator('#launch-at-login')).not.toBeChecked();
    await page.locator('#launch-at-login').click();
    await expect(page.locator('#startup-state')).toContainText('已开启');
    assert.equal((await page.evaluate(()=>window.ontime.startupSettings())).enabled,true);
    const {stdout}=await require('node:util').promisify(require('node:child_process').execFile)('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','/v','OnTime.Test.'+profile],{windowsHide:true});
    assert.ok(stdout.includes('--background'));assert.ok(stdout.includes(profile));
    await page.screenshot({animations:'disabled',path:path.join(root,'artifacts/ontime-general-settings.png')});
    await app.close();
    await start(true);
    assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isVisible()),false);
    await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.show();window.focus();});
    await page.locator('#settings').click();await page.locator('#tab-general').click();
    await expect(page.locator('#launch-at-login')).toBeChecked();
    await page.locator('#launch-at-login').uncheck();
    await expect(page.locator('#startup-state')).toContainText('已关闭');
    assert.equal((await page.evaluate(()=>window.ontime.startupSettings())).registered,false);
    await page.locator('#back').click();await page.locator('#query').fill('Hello world');
    await page.locator('[data-plugin="translate"]').click();
    await expect(page.locator('#query')).toHaveValue('Hello world');
    assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),true);
    await page.screenshot({animations:'disabled',path:path.join(root,'artifacts/ontime-light-translation.png')});
    console.log('PASS real isolated login entry enable/readback/restart/disable, background launch, compact UI and pinned plugin');
  } finally {
    if(app){
      try { await app.evaluate(({app},name)=>app.setLoginItemSettings({name,openAtLogin:false}), 'OnTime.Test.'+profile); }
      finally { await app.close(); }
    }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

