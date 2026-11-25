const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron } = require('@playwright/test');

async function check() {
  const executablePath = process.env.ONTIME_INSTALLED_EXE;
  if (!executablePath) throw Error('Set ONTIME_INSTALLED_EXE to the installed OnTime.exe.');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'ontime-installed-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let instance;
  try {
    instance = await _electron.launch({ executablePath, args: ['--user-data-dir=' + profile], env });
    const window = await instance.firstWindow();
    await window.locator('#query').waitFor();
    assert.equal(await window.title(), 'OnTime');
    assert.equal(await instance.evaluate(({ app }) => app.isPackaged), true);
    assert.equal(await instance.evaluate(({ app }) => app.getVersion()), require('../package.json').version);
    await window.locator('#settings').click();
    await window.locator('#tab-general').waitFor();
  } finally {
    try { await instance?.close(); }
    finally { await rm(profile, { recursive: true, force: true, maxRetries: 4 }); }
  }
}
check().catch(error => { console.error(error); process.exitCode = 1; });
