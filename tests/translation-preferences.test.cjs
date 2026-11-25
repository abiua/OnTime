const { test }=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../src/translation-preferences.js');
test('本地识别与中英互译默认值',()=>{
  assert.equal(rules.detect('你好，世界'),'简体中文');
  assert.equal(rules.detect('Hello world!'),'English');
  assert.equal(rules.detect('こんにちは'),'日本語');
  assert.equal(rules.detect('안녕하세요'),'한국어');
  assert.equal(rules.detect('123'),'自动检测');
  assert.equal(rules.chooseTarget(rules.detect('你好')),'English');
  assert.equal(rules.chooseTarget(rules.detect('Hello')),'简体中文');
  assert.equal(rules.chooseTarget('繁體中文'),'English');
});
test('自定义首选与备用目标必须属于不同语言',()=>{
  assert.equal(rules.valid({preferred:'English',fallback:'简体中文'}),true);
  assert.equal(rules.chooseTarget('English',{preferred:'English',fallback:'日本語'}),'日本語');
  assert.equal(rules.valid({preferred:'简体中文',fallback:'繁體中文'}),false);
  assert.equal(rules.valid({preferred:'English',fallback:'English'}),false);
});
