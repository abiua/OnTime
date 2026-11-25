const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const keyValid=key=>typeof key==='string'&&key.length>0&&key.length<=80&&!['__proto__','prototype','constructor'].includes(key);
class PluginData{
  constructor(directory){this.directory=directory;this.queue=Promise.resolve();}
  filename(owner){if(typeof owner!=='string'||!owner)throw Error('插件标识无效');return path.join(this.directory,createHash('sha256').update(owner).digest('hex')+'.json');}
  async read(owner){
    try{
      const data=await fs.readFile(this.filename(owner),'utf8');
      if(Buffer.byteLength(data)>131072)throw Error('插件数据过大');
      const value=JSON.parse(data);
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keyValid(key)))throw Error('数据格式无效');
      return value;
    }catch(error){if(error.code==='ENOENT')return {};throw Error('插件数据无法读取，原文件已保留');}
  }
  serial(callback){const result=this.queue.then(callback);this.queue=result.catch(()=>{});return result;}
  update(owner,changes,signal){return this.serial(async()=>{
    signal?.throwIfAborted();const data=await this.read(owner);
    for(const change of changes){
      if(!keyValid(change.key))throw Error('存储键名无效');
      if(change.remove)delete data[change.key];else data[change.key]=change.value;
    }
    const contents=JSON.stringify(data);if(Buffer.byteLength(contents)>131072)throw Error('插件独立数据超过 128KB');
    const filename=this.filename(owner),temp=filename+'.'+randomUUID()+'.tmp';
    await fs.mkdir(this.directory,{recursive:true});
    try{await fs.writeFile(temp,contents,{flag:'wx'});signal?.throwIfAborted();await fs.rename(temp,filename);}finally{await fs.unlink(temp).catch(()=>{});}
  });}
  clear(owner){return this.serial(()=>fs.unlink(this.filename(owner)).catch(error=>{if(error.code!=='ENOENT')throw error;}));}
}
module.exports={PluginData,keyValid};
