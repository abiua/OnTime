const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('@playwright/test');

async function check() {
  const executablePath = process.env.ONTIME_INSTALLED_EXE;
  if (!executablePath) throw Error('Set ONTIME_INSTALLED_EXE to the installed OnTime.exe.');
  const appDir = path.join(path.dirname(executablePath), 'resources', 'app');
  const installed = JSON.parse(await readFile(path.join(appDir, 'package.json'), 'utf8'));
  assert.equal(installed.version, require('../package.json').version);
  const profile = await mkdtemp(path.join(os.tmpdir(), 'ontime-installed-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // Start the packaged executable normally. Attach to its renderer on loopback
  // so the check uses the same entry point as a Start menu launch.
  const child = spawn(executablePath, ['--user-data-dir=' + profile, '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1'], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const closed = once(child, 'close');
  const debuggerUrl = new Promise((resolve, reject) => {
    let buffer = '';
    child.stderr.setEncoding('utf8').on('data', data => {
      buffer = (buffer + data).slice(-8192);
      const match = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[\da-f-]+)\s/i.exec(buffer);
      if (match) resolve(match[1]);
    });
    closed.then(([code]) => reject(Error('OnTime exited with code ' + code)), reject);
  });
  let browser, timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('OnTime did not open its renderer debugger within 30 seconds')), 30000);
    });
    browser = await chromium.connectOverCDP(await Promise.race([debuggerUrl, timeout]), { timeout: 15000 });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.waitForEvent('page', { timeout: 15000 });
    page.setDefaultTimeout(15000);
    await page.waitForURL(pathToFileURL(path.join(appDir, 'src', 'index.html')).href);
    await page.locator('#query').waitFor();
    assert.equal(await page.title(), 'OnTime');
    await page.locator('#settings').dispatchEvent('click');
    await page.locator('#tab-general').waitFor();
    console.log('Verified the installed launcher and settings window.');
  } finally {
    clearTimeout(timer);
    try { await browser?.close(); }
    finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed;
      await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
    }
  }
}
check().catch(error => { console.error(error); process.exitCode = 1; });
