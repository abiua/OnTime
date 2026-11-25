const test = require('node:test');
const assert = require('node:assert/strict');
const { rankLaunchers } = require('../src/application-search.cjs');

test('exact desktop app name wins over related names and duplicate menu shortcuts', () => {
  const desktop = {name:'微信',source:'desktop',path:'C:\\Users\\Public\\Desktop\\微信.lnk',target:'D:\\Weixin\\Weixin.exe'};
  const menu = {...desktop, source:'start-menu',path:'C:\\Programs\\微信.lnk'};
  const utility = {name:'微信文件工具',source:'desktop',path:'C:\\Desktop\\微信文件工具.lnk',target:'D:\\Utils\\tool.exe'};
  assert.deepEqual(rankLaunchers([utility,menu,desktop],'微信'),[desktop,utility]);
  assert.deepEqual(rankLaunchers([utility,menu,desktop],'Weixin.exe'),[desktop]);
  assert.deepEqual(rankLaunchers([desktop],'微信 ext:pdf'),[]);
});
