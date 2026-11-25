// Shared text-generation transport. Credentials never cross the preload bridge.
function endpoint(provider) {
  const url = new URL(provider.baseUrl);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw Error('API 地址必须为 HTTPS 或本机 HTTP');
  const suffix = { responses: 'responses', 'chat-completions': 'chat/completions', anthropic: 'messages' }[provider.protocol];
  if (!suffix) throw Error('不支持的接口协议');
  let base = url.pathname.replace(/\/+$/, '');
  if (/\/(responses|chat\/completions|messages)$/.test(base)) throw Error('请填写 API 基础地址，不要包含 responses、messages 或 chat/completions');
  if (!base) base = '/v1';
  url.pathname = `${base}/${suffix}`;
  return url.href;
}
function requestBody(p, system, input) {
  if (p.protocol === 'responses') return { model: p.model, instructions: system, input, store: false, max_output_tokens: 4096 };
  if (p.protocol === 'anthropic') return { model: p.model, system, messages: [{ role: 'user', content: input }], max_tokens: 4096 };
  return { model: p.model, messages: [{ role: 'system', content: system }, { role: 'user', content: input }] };
}
function extract(p, data) {
  let text, truncated = false;
  if (p.protocol === 'responses') {
    text = (data.output || []).flatMap(i => i.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n');
    truncated = data.status === 'incomplete';
  } else if (p.protocol === 'anthropic') {
    text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    truncated = data.stop_reason === 'max_tokens';
  } else {
    text = data.choices?.[0]?.message?.content;
    truncated = data.choices?.[0]?.finish_reason === 'length';
  }
  if (typeof text !== 'string' || !text.trim()) throw Error('服务未返回文本，请检查模型是否支持所选协议');
  return { text: text.trim(), truncated };
}
const MAX_RETRIES = 5;
const PROXY_RULE = 'http://127.0.0.1:7890';
const temporaryFailures = new Set([
  'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH',
  'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_RESET', 'ERR_CONNECTION_ABORTED', 'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_TIMED_OUT',
  'ERR_EMPTY_RESPONSE',
  'ERR_TIMED_OUT', 'ERR_NETWORK_CHANGED', 'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED',
  'ERR_PROXY_CONNECTION_FAILED', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INCOMPLETE_CHUNKED_ENCODING'
]);
function transientConnection(error) {
  return temporaryFailures.has(error?.code) || temporaryFailures.has(error?.message?.replace(/^net::/, ''));
}
let proxySession;
async function proxyRequest(url, options) {
  if (!proxySession) {
    const network = require('electron').session;
    if (!network) throw Error('当前环境无法连接本机 7890 代理');
    const isolated = network.fromPartition('ontime-model-proxy-7890', {cache:false});
    proxySession = isolated.setProxy({mode:'fixed_servers', proxyRules:PROXY_RULE})
      .then(() => isolated).catch(error => { proxySession = null; throw error; });
  }
  const isolated = await proxySession;
  options.signal.throwIfAborted();
  return isolated.fetch(url, {...options, credentials:'omit'});
}
async function requestWithReconnect(request, fallback, url, options) {
  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    options.signal.throwIfAborted();
    try {
      return await (retry === MAX_RETRIES ? fallback : request)(url, options);
    } catch (error) {
      if (options.signal.aborted) throw error;
      if (retry === MAX_RETRIES) throw Error('模型连接失败，已重试 5 次。最后一次尝试使用本机 127.0.0.1:7890 HTTP 代理，请检查该端口。');
      if (!transientConnection(error)) throw error;
      await require('node:timers/promises').setTimeout(350, undefined, {signal:options.signal});
    }
  }
}
async function generate({ provider, key, system, input, signal, timeout = 60000, transport, proxyTransport = proxyRequest }) {
  const url = endpoint(provider);
  const headers = { 'content-type': 'application/json' };
  if (provider.protocol === 'anthropic') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
  else headers.authorization = `Bearer ${key}`;
  const deadline = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const start = Date.now();
  try {
    const request = transport || require('electron').net?.fetch || require('./http-transport.cjs').request;
    const res = await requestWithReconnect(request, proxyTransport, url, { method: 'POST', headers, body: JSON.stringify(requestBody(provider, system, input)), signal: combined, redirect: 'error' });
    if (!res.ok) {
      await res.body?.cancel();
      const hints = { 401: '密钥无效或已过期', 403: '服务拒绝访问，请检查权限', 404: '模型或接口地址不存在', 429: '请求限流或额度不足', 400: '请求不兼容，请检查模型和接口协议' };
      throw Error(`HTTP ${res.status}：${hints[res.status] || '服务暂时不可用，请稍后重试'}`);
    }
    const reader = res.body.getReader(); const chunks = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw Error('响应过大，已停止读取'); } chunks.push(Buffer.from(value)); }
    let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Error('服务返回的不是有效 JSON，请检查 API 地址'); }
    return { ...extract(provider, data), elapsedMs: Date.now() - start, provider: provider.name, model: provider.model };
  } catch (e) {
    if (signal?.aborted) throw Error('已取消请求');
    if (deadline.aborted) throw Error('请求超时，请重试或更换模型');
    if (transientConnection(e)) throw Error('模型连接中途断开，请检查网络后重试');
    if (/^net::ERR_/.test(e.message)) throw Error('模型服务连接失败，请检查网络、代理和证书后重试');
    // Do not echo server bodies, request headers, or fetch causes (may contain secrets).
    if (e instanceof TypeError) throw Error('网络连接失败，请检查地址、代理和证书；不跟随重定向');
    throw e;
  }
}
module.exports = { endpoint, requestBody, extract, generate };
