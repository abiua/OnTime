const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/text-plugins.cjs');
const { authorizedUrl } = require('../src/script-runtime.cjs');

test('browser capability requires a declared exact HTTPS host', () => {
  const step={op:'script',source:'async function run() { return "test"; }',domains:[],browserDomains:['www.google.com']};
  const spec={schemaVersion:1,name:'谷歌快搜',description:'打开搜索结果',keywords:['谷歌'],steps:[step],sample:'测试'};
  assert.deepEqual(validate(spec),{...spec,matching:require('../src/plugin-intents.js').inferMatching(spec)});
  assert.throws(()=>validate({...spec,steps:[{...step,browserDomains:['*.google.com']}]}),/范围无效/);
  assert.throws(()=>validate({...spec,steps:[{...step,browserDomains:['https://www.google.com']}]}),/范围无效/);
  assert.equal(authorizedUrl('https://www.google.com/search?q=a%26b',step.browserDomains).searchParams.get('q'),'a&b');
  for(const url of ['http://www.google.com/','https://google.com/','https://www.google.com.example.org/', 'https://user@www.google.com/', 'https://www.google.com:8443/','file:///C:/Windows','javascript:alert(1)'])assert.throws(()=>authorizedUrl(url,step.browserDomains),/未授权/);
  assert.throws(()=>authorizedUrl('https://www.google.com/',step.domains),/未授权/);
});
