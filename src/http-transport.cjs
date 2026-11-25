const http = require('node:http');
const https = require('node:https');
const { Readable } = require('node:stream');
function request(url, options) {
  return new Promise((resolve, reject) => {
    const transport = new URL(url).protocol === 'https:' ? https : http;
    const req = transport.request(url, {method:options.method,headers:options.headers,signal:options.signal}, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume(); reject(new TypeError('Redirect refused')); return;
      }
      resolve({ok:res.statusCode >= 200 && res.statusCode < 300,status:res.statusCode,body:Readable.toWeb(res)});
    });
    req.on('error',error=>{
      const failure = new TypeError('Network connection failed');
      failure.code = error.code;
      reject(failure);
    });
    req.end(options.body);
  });
}
module.exports = { request };
