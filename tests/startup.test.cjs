const test = require('node:test');
const assert = require('node:assert/strict');
const { createStartupSettings } = require('../src/startup.cjs');

test('startup uses the named entry, persists absolute development path and respects Windows disable', () => {
  const entries = [];
  let written;
  const app = {
    isPackaged: false,
    getAppPath: () => 'D:\\OnTime App',
    getPath: () => 'D:\\test-profile',
    getLoginItemSettings: () => ({openAtLogin:false,launchItems:entries}),
    setLoginItemSettings(settings) {
      written = settings;
      entries.length = 0;
      if(settings.openAtLogin) entries.push({name:settings.name,scope:'user',enabled:settings.enabled,args:settings.args.filter(arg=>!arg.startsWith('--'))});
    }
  };
  const startup = createStartupSettings(app);
  assert.equal(startup.set(true).enabled,true);
  assert.deepEqual(written.args,['D:\\OnTime App','--background']);
  entries[0].enabled=false;
  assert.deepEqual(startup.read(),{supported:true,enabled:false,registered:true});
  assert.equal(startup.set(false).registered,false);
  entries.push({name:'AnotherApp',scope:'user',enabled:true,args:['"D:\\OnTime App"']});
  assert.equal(startup.read().enabled,false);
  assert.throws(()=>startup.set('yes'),/无效/);
});

test('packaged startup registers the executable with background mode', () => {
  let written;
  const startup=createStartupSettings({isPackaged:true,getLoginItemSettings:()=>({launchItems:[]}),setLoginItemSettings:value=>{written=value;}});
  startup.set(false);
  assert.deepEqual(written.args,['--background']);
  assert.equal(written.path,process.execPath);
});

function legacyFixture(entry, { isPackaged = false, ignoreWrite = false } = {}) {
  let entries = entry ? [entry] : [];
  const writes = [];
  const startup = createStartupSettings({
    isPackaged,
    getAppPath: () => 'D:\\OnTime App',
    getLoginItemSettings: () => ({ launchItems: entries }),
    setLoginItemSettings(settings) {
      writes.push(settings);
      if (!ignoreWrite) entries = [{ name: settings.name, scope: 'user', enabled: settings.enabled, args: settings.args }];
    }
  });
  return { startup, writes };
}

const legacyEntry = { name: 'OnTime', scope: 'user', enabled: true, args: ['"D:\\OnTime App"', '--background'] };

test('legacy literal quotes are detected and repaired once with readback', () => {
  const { startup, writes } = legacyFixture(legacyEntry);
  assert.equal(startup.read().enabled, false);
  assert.equal(startup.repairLegacy(), true);
  assert.deepEqual(writes[0].args, ['D:\\OnTime App', '--background']);
  assert.equal(startup.read().enabled, true);
  assert.equal(startup.repairLegacy(), false);
  assert.equal(writes.length, 1);
});

test('legacy repair preserves disabled, missing, valid and unrelated startup entries', () => {
  for (const entry of [
    null,
    { ...legacyEntry, enabled: false },
    { ...legacyEntry, name: 'AnotherApp' },
    { ...legacyEntry, scope: 'machine' },
    { ...legacyEntry, args: ['"D:\\Another Project"'] },
    { ...legacyEntry, args: ['D:\\OnTime App', '--background'] },
    { ...legacyEntry, args: ['"D:\\OnTime App"', 'extra'] }
  ]) {
    const { startup, writes } = legacyFixture(entry);
    assert.equal(startup.repairLegacy(), false);
    assert.equal(writes.length, 0);
  }
  const packaged = legacyFixture(legacyEntry, { isPackaged: true });
  assert.equal(packaged.startup.repairLegacy(), false);
  assert.equal(packaged.writes.length, 0);
});

test('legacy repair reports a write that leaves the broken command unchanged', () => {
  const { startup } = legacyFixture(legacyEntry, { ignoreWrite: true });
  assert.throws(() => startup.repairLegacy(), /Windows/);
});
