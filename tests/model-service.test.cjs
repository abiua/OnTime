const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { generate, endpoint } = require('../src/model-service.cjs');

test('连接关闭后在原线路重连，取消停止重连', async () => {
  const options={provider:{baseUrl:'https://example.com/v1',protocol:'responses',model:'test'},key:'test',system:'test',input:'test'};
  let attempts=0;
  const result=await generate({...options,transport:async()=>{
    if(++attempts===1)throw Error('net::ERR_CONNECTION_CLOSED');
    return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'OK'}]}]}));
  }});
  assert.equal(result.text,'OK');assert.equal(attempts,2);
  const controller=new AbortController();attempts=0;
  await assert.rejects(generate({...options,signal:controller.signal,transport:async()=>{attempts++;controller.abort();throw Error('net::ERR_CONNECTION_RESET');}}),/已取消/);
  assert.equal(attempts,1);
});
test('初始请求和前四次重试用原线路，第五次重试用代理', async () => {
  const routes=[];
  const options={provider:{baseUrl:'https://example.com/v1',protocol:'responses',model:'test'},key:'test',system:'test',input:'test'};
  const transport=async()=>{routes.push('normal');throw Error('net::ERR_CONNECTION_CLOSED');};
  const result=await generate({...options,transport,proxyTransport:async(url,request)=>{
    routes.push('proxy');
    assert.equal(url,'https://example.com/v1/responses');
    assert.equal(request.headers.authorization,'Bearer test');
    return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'OK'}]}]}));
  }});
  assert.equal(result.text,'OK');
  assert.deepEqual(routes,['normal','normal','normal','normal','normal','proxy']);
  routes.length=0;
  await assert.rejects(generate({...options,transport,proxyTransport:async()=>{
    routes.push('proxy');throw Error('net::ERR_PROXY_CONNECTION_FAILED');
  }}),/重试 5 次.*7890/);
  assert.deepEqual(routes,['normal','normal','normal','normal','normal','proxy']);
});
test('基础地址和协议路由', () => {
  assert.equal(endpoint({ baseUrl:'https://api.openai.com/v1/', protocol:'responses' }), 'https://api.openai.com/v1/responses');
  assert.equal(endpoint({ baseUrl:'https://api.anthropic.com', protocol:'anthropic' }), 'https://api.anthropic.com/v1/messages');
  assert.throws(()=>endpoint({baseUrl:'http://example.com',protocol:'responses'}), /HTTPS/);
  assert.throws(()=>endpoint({baseUrl:'https://example.com/v1/responses',protocol:'responses'}), /基础地址/);
});
test('三协议通过真实 HTTP 传输；错误、取消和超时', async () => {
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    let text='';for await(const part of req)text+=part;const b=JSON.parse(text);requests.push({url:req.url,headers:req.headers,body:b});
    if(b.model==='bad'){res.writeHead(401);res.end('secret-key');return;}
    if(b.model==='slow'){setTimeout(()=>{res.end('{}');},200).unref();return;}
    if(b.model==='redirect'){res.writeHead(302,{Location:'/leak'});res.end();return;}
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url.endsWith('/responses')?{output:[{content:[{type:'output_text',text:'你好'}]}]}:req.url.endsWith('/messages')?{content:[{type:'text',text:'你好'}]}:{choices:[{message:{content:'你好'},finish_reason:'stop'}]}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const baseUrl=`http://127.0.0.1:${server.address().port}/v1`;
  const call=(protocol,model='test',extra={})=>generate({provider:{baseUrl,protocol,model,name:'test'},key:'secret-key',system:'Translate',input:'Hello',...extra});
  try {
    for(const protocol of ['responses','chat-completions','anthropic'])assert.equal((await call(protocol)).text,'你好');
    assert.equal(requests[0].body.store,false);assert.equal(requests[0].headers.authorization,'Bearer secret-key');
    assert.equal(requests[2].headers['x-api-key'],'secret-key');assert.equal(requests[2].body.system,'Translate');
    await assert.rejects(call('responses','bad'),e=>/401/.test(e.message)&&!e.message.includes('secret-key'));
    await assert.rejects(call('responses','slow',{timeout:30}),/超时/);
    const c=new AbortController();const task=call('responses','slow',{signal:c.signal});c.abort();await assert.rejects(task,/取消/);
    await assert.rejects(call('responses','redirect'),/重定向/);
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});
