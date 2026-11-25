const normalize = text => text.replace(/\r\n?/g,'\n');
async function copyText(clipboard, text) {
  if(typeof text!=='string'||text.length>200000)throw Error('内容无效');
  for(let attempt=0;attempt<3;attempt++) {
    try {
      await clipboard.writeText(text);
      await new Promise(resolve=>setTimeout(resolve,40));
      if(normalize(await clipboard.readText())===normalize(text))return true;
    } catch {}
  }
  throw Error('系统剪贴板未能确认写入，请按 Ctrl+C 复制已选中的结果');
}
module.exports={copyText};
