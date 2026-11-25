const { BrowserWindow, ipcMain, shell } = require('electron');
const { randomUUID } = require('node:crypto');
const https = require('node:https');
const dns = require('node:dns');
const { BlockList } = require('node:net');
const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['100.64.0.0',10],['192.0.0.0',24],['224.0.0.0',3]]) blocked.addSubnet(address,prefix);
function authorizedUrl(raw, domains) {
  if(typeof raw!=='string'||raw.length>8192)throw Error('网址无效或过长');
  let url;
  try { url = new URL(raw); } catch { throw Error('网址无效'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !domains.includes(url.hostname)) throw Error('插件请求了未授权的地址');
  return url;
}
function requestOptions(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['url','method','body','headers'].includes(key)))throw Error('网络请求参数无效');
  const method=value.method||'GET',body=value.body??'',headers=value.headers??{};
  if(!['GET','POST'].includes(method)||typeof body!=='string'||Buffer.byteLength(body)>65536||(method==='GET'&&body)||!headers||typeof headers!=='object'||Array.isArray(headers)||Object.keys(headers).length>8)throw Error('仅支持 GET/POST 和不超过 64KB 的文本请求体');
  for(const [key,text] of Object.entries(headers))if(!['accept','content-type','authorization','x-api-key'].includes(key.toLowerCase())||typeof text!=='string'||text.length>8192||/[\r\n]/.test(text))throw Error('请求头无效');
  return {method,body,headers};
}
function getText(raw, domains, signal, options={method:'GET',headers:{},body:''}) {
  const url = authorizedUrl(raw, domains);
  return new Promise((resolve,reject) => {
    const req = https.request(url, {signal, method:options.method, headers:options.headers, agent:false, family:4, ALPNProtocols:['http/1.1'], lookup(host, options, callback) {
      dns.lookup(host,{family:4},(error,address) => {
        if(error || blocked.check(address)) return callback(Error('地址无法解析或指向本地网络'));
        callback(null,options.all ? [{address,family:4}] : address,4);
      });
    }}, response => {
      if(response.statusCode < 200||response.statusCode>=300) { response.resume(); reject(Error('接口返回 HTTP '+response.statusCode)); return; }
      let size=0; const chunks=[];
      response.on('data',chunk=>{size+=chunk.length;if(size>524288)response.destroy(Error('接口响应过大'));else chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error',error=>{const failure=Error('联网请求失败（'+(error.code||'NETWORK')+'），请检查网络或接口地址');failure.code=error.code;reject(failure);});
    req.end(options.body);
  });
}
async function runScript(step,input,signal,host={}) {
  signal?.throwIfAborted();
  const channel='plugin-network-'+randomUUID();
  const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,partition:'plugin-'+randomUUID(),preload:require('node:path').join(__dirname,'script-preload.cjs'),additionalArguments:[channel]}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
  window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','file://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
  const controller=new AbortController();
  const cancel=()=>{controller.abort();if(!window.isDestroyed())window.destroy();};
  let timeout=setTimeout(cancel,20000);
  const hardTimeout=setTimeout(cancel,300000),outstanding=new Set();
  signal?.addEventListener('abort',cancel,{once:true});
  let requests=0,hostRequests=0;
  let requestFailure=null, browserUrl=null, timerRequest=null;
  ipcMain.handle(channel,async(event,action,url)=>{
    if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||controller.signal.aborted)throw Error('请求被拒绝');
    try {
      if(['clipboard-read','clipboard-write','storage-get','storage-set','storage-remove','remind','files-pick-file','files-pick-folder','files-list','files-read','files-write','files-rename','files-open','files-reveal','windows-list','windows-focus'].includes(action)){
        if(!host.invoke||++hostRequests>32)throw Error('宿主调用不可用或次数过多');
        const picking=action==='files-pick-file'||action==='files-pick-folder';if(picking)clearTimeout(timeout);
        const pending=host.invoke(action,url,controller.signal);outstanding.add(pending);
        try{return await pending;}finally{outstanding.delete(pending);if(picking)timeout=setTimeout(cancel,20000);}
      }
      if(action==='request'){
        if(++requests>8)throw Error('联网请求次数过多');const options=requestOptions(url);
        if(options.method==='POST'&&!host.permissions?.includes('networkWrite'))throw Error('插件未获得发送 POST 请求的权限');
        return await getText(url.url,step.domains,controller.signal,options);
      }
      if(action==='timer-start'){
        if(!host.startTimer)throw Error('插件未获得后台计时权限');
        if(timerRequest)throw Error('每次运行只能创建一个计时');
        timerRequest=require('./plugin-capabilities.js').timerRequest(url,host.permissions);
        return {scheduled:true};
      }
      if(action==='timer-list'){
        if(!host.listTimers)throw Error('插件未获得后台计时权限');
        return host.listTimers();
      }
      if (action==='open-url') {
        if (browserUrl) throw Error('每次运行只能打开一个网页');
        browserUrl = authorizedUrl(url, step.browserDomains || []).href;
        return true;
      }
      if(action!=='get'||++requests>8)throw Error('请求被拒绝');
      try { return await getText(url,step.domains,controller.signal); }
      catch(error) {
        if(error.code==='ECONNRESET'&&!controller.signal.aborted)return await getText(url,step.domains,controller.signal);
        throw error;
      }
    } catch(error) { requestFailure=error;throw error; }
  });
  try {
    await window.loadURL('data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src %27none%27; script-src %27none%27; connect-src %27none%27">');
    const source=`(async()=>{const api=Object.freeze({...globalThis.pluginNetwork,settings:${JSON.stringify(host.settings||{})}});${step.source}\nreturn await run(${JSON.stringify(input)},api);})()`;
    const result=await window.webContents.executeJavaScript(source);
    while(outstanding.size)await Promise.all([...outstanding]);
    if(requestFailure)throw requestFailure;
    if(typeof result!=='string'||result.length>100000)throw Error('插件须返回不超过 100000 字符的文字');
    controller.signal.throwIfAborted();
    clearTimeout(timeout);
    ipcMain.removeHandler(channel);
    if(!window.isDestroyed())window.destroy();
    if(browserUrl) {
      try { await shell.openExternal(browserUrl); }
      catch { throw Error('无法打开默认浏览器，请检查 Windows 的默认浏览器设置'); }
    }
    controller.signal.throwIfAborted();
    if(host.commit)await host.commit(controller.signal);
    if(timerRequest)await host.startTimer(timerRequest,controller.signal);
    return result;
  }catch(error){if(controller.signal.aborted)throw Error(signal?.aborted?'已取消运行':'插件运行超时');throw error;}
  finally{clearTimeout(timeout);clearTimeout(hardTimeout);signal?.removeEventListener('abort',cancel);ipcMain.removeHandler(channel);cancel();}
}
module.exports={runScript,getText,authorizedUrl,requestOptions};
