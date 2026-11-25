const test = require('node:test');
const assert = require('node:assert/strict');
const { rankPlugins, preset, recordChoice, inferMatching, validMatching } = require('../src/plugin-intents.js');

const plugins = [
  {id:'files',name:'文件搜索',keys:['文件','搜索']},
  {id:'translate',name:'翻译',keys:['translate']},
  {id:'rename',name:'重命名',keys:['rename']},
  {id:'weather',name:'近三天天气',keys:['天气']},
  {id:'my-calc',name:'极速算',keys:['数学'],spec:{description:'计算四则运算'}},
  {id:'web',name:'谷歌快搜',keys:['谷歌','google']}
];

test('complete arithmetic raises the installed calculator without evaluating input', () => {
  for (const input of ['2*(3+4)', '１２ ÷ ３', '-.5 + 7', '1-2-3', '1 / 0']) {
    assert.equal(rankPlugins(plugins,input)[0].plugin.id,'my-calc',input);
  }
  for (const input of ['', '1234', '2026-11-10', '11/10/2026', '1.2.3', 'a+b.txt', '2*(3+4', '2 +', '1 2 + 3', '微信']) {
    assert.equal(rankPlugins(plugins,input)[0].plugin.id,'files',input);
    assert.equal(rankPlugins(plugins,input).find(row=>row.plugin.id==='my-calc').score,0,input);
  }
});

test('plain text recommends applicable actions and diversifies web search alternatives',()=>{
  const extra=[1,2,3,4].map(i=>({id:'web'+i,name:'搜索'+i,keys:[],matching:preset('web-search')}));
  const ranked=rankPlugins([...extra,...plugins],'天线宝宝');
  assert.deepEqual(ranked.slice(0,3).map(row=>row.category),['web-search','file-search','translate']);
  assert.equal(ranked.find(row=>row.plugin.id==='web').score,1);
  assert.equal(ranked.find(row=>row.plugin.id==='my-calc').score,0);
  assert.equal(ranked.find(row=>row.plugin.id==='rename').score,0);
  assert.equal(rankPlugins([...plugins,{id:'disabled',name:'天线宝宝',enabled:false,keys:[]}],'天线宝宝').some(row=>row.plugin.id==='disabled'),false);
});

test('declarations support URL, JSON, multiline and lengths without executing plugin code',()=>{
  for(const [format,input] of [['url','https://example.com/'],['json','{"x":1}'],['multiline','a\nb'],['number','-12.5']]){
    const plugin={id:'special',name:'专用功能',keys:[],matching:preset('other',[format])};
    assert.equal(rankPlugins([...plugins,plugin],input)[0].plugin.id,'special');
    assert.equal(rankPlugins([plugin],'普通文字')[0].score,0);
  }
  assert.equal(rankPlugins([{id:'x',name:'专用',keys:[],matching:{...preset('other'),minLength:5,maxLength:10}}],'短')[0].score,0);
  assert.equal(rankPlugins([{id:'x',name:'专用',keys:[],matching:preset('other',['json'])}],'{broken')[0].score,0);
  for(const value of [null,{...preset('other'),accepts:['regex']},{...preset('other'),source:'evil()'},{...preset('other'),maxLength:12001}])assert.equal(validMatching(value),false);
});

test('usage is context specific, decays, stores no query and cannot override explicit intent',()=>{
  const now=1700000000000;
  const history=recordChoice({},'web','天线宝宝',now);
  assert.ok(!JSON.stringify(history).includes('天线宝宝'));
  assert.equal(rankPlugins(plugins,'天线宝宝',{history,now})[0].plugin.id,'web');
  assert.equal(rankPlugins(plugins,'2+2',{history,now})[0].plugin.id,'my-calc');
  assert.equal(rankPlugins(plugins,'translate',{history,now,favorites:['web']})[0].plugin.id,'translate');
  assert.equal(rankPlugins(plugins,'普通文字',{history:{...history,'translate:text':{count:1,at:now+30*86400000}},now:now+30*86400000})[0].plugin.id,'translate');
  assert.equal(rankPlugins(plugins,'普通文字',{favorites:['web']})[0].plugin.id,'web');
  assert.equal(rankPlugins(plugins,'普通文字')[0].plugin.id,'files');
});

test('legacy metadata migration identifies calculator and browser search, preserving declared choices',()=>{
  assert.deepEqual(inferMatching({name:'随手算数学计算器',keywords:['数学'],description:'可计算'}),preset('calculator'));
  assert.deepEqual(inferMatching({name:'谷歌快搜',keywords:['google'],description:'浏览器中搜索'}),preset('web-search'));
  assert.equal(rankPlugins([{id:'x',name:'计算器',keys:[],matching:preset('other',[])}],'2+2')[0].score,0);
});

test('explicit names and keywords rank ahead of inferred intent', () => {
  const exact = {id:'exact',name:'2+2',keys:[]};
  assert.equal(rankPlugins([...plugins,exact],'2+2')[0].plugin.id,'exact');
  assert.equal(rankPlugins(plugins,'谷歌快搜')[0].plugin.id,'web');
  assert.equal(rankPlugins(plugins,'Google：杭州')[0].plugin.id,'web');
  assert.equal(rankPlugins(plugins,'文件 2+2')[0].plugin.id,'files');
});

test('natural command prefixes rank translation, rename and weather plugins', () => {
  for (const [input, id] of [['帮我翻译这段话','translate'],['批量改名为序号','rename'],['北京明天天气','weather']]) {
    assert.equal(rankPlugins(plugins,input)[0].plugin.id,id);
  }
  assert.equal(rankPlugins(plugins,'批量改名.docx')[0].plugin.id,'files');
});
