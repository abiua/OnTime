const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {windowsMover}=require('./rename-executor.cjs');
const LIMIT=1048576;
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
async function fingerprint(filename){
  try{const stat=await fs.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>LIMIT)throw Error('仅支持不超过 1MB 的普通文本文件');return hash(await fs.readFile(filename));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function inside(root,target){const relative=path.relative(root,target);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
async function verifyParent(filename){if(path.relative(path.dirname(filename),await fs.realpath(path.dirname(filename)))!=='')throw Error('文件夹位置已变化，请重新选择');}
async function assertOpenable(filename){
  if((await fs.stat(filename)).isDirectory())return;
  if(!['.txt','.md','.csv','.json','.log','.pdf','.docx','.xlsx','.pptx','.png','.jpg','.jpeg','.webp','.gif','.bmp','.mp3','.wav','.mp4','.mkv','.zip'].includes(path.extname(filename).toLowerCase()))throw Error('插件暂只允许打开常见文档、媒体与文件夹；可使用“显示所在位置”查看其他文件');
}
class FileScope{
  constructor(protectedPaths=[]){this.roots=[];this.protectedPaths=protectedPaths.map(filename=>path.resolve(filename));}
  checkProtected(filename){if(this.protectedPaths.some(root=>inside(root,filename)))throw Error('插件不能访问 OnTime 的内部配置、密钥或程序文件');}
  async grant(filename,folder){const real=await fs.realpath(filename);this.checkProtected(real);const stat=await fs.stat(real);if(folder?!stat.isDirectory():!stat.isFile())throw Error('选择类型无效');this.roots.push({path:real,folder});return real;}
  async resolve(filename,creating=false){
    if(typeof filename!=='string'||!path.isAbsolute(filename)||/^\\\\[?.]\\/.test(filename))throw Error('请选择有效的文件路径');
    const name=path.basename(filename);
    if(/[<>:"|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('文件名无效');
    let real;
    try{real=await fs.realpath(filename);}catch(error){if(!creating||error.code!=='ENOENT')throw error;real=path.join(await fs.realpath(path.dirname(filename)),name);}
    this.checkProtected(real);
    if(!this.roots.some(root=>root.folder?inside(root.path,real):path.relative(root.path,real)===''))throw Error('文件不在本次选择的授权范围内');
    return real;
  }
  async list(filename){const directory=await this.resolve(filename);const entries=await fs.readdir(directory,{withFileTypes:true});return entries.slice(0,500).map(entry=>({name:entry.name,path:path.join(directory,entry.name),isDirectory:entry.isDirectory(),isLink:entry.isSymbolicLink()}));}
  async readText(filename){const target=await this.resolve(filename);await fingerprint(target);return fs.readFile(target,'utf8');}
  async planWrite(filename,text){
    if(typeof text!=='string'||Buffer.byteLength(text)>LIMIT)throw Error('文本写入最多 1MB');
    const target=await this.resolve(filename,true);return {path:target,before:await fingerprint(target),after:hash(Buffer.from(text)),text};
  }
}
class FileWrites{
  constructor(directory){this.directory=directory;this.busy=false;}
  filename(id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('恢复记录无效');return path.join(this.directory,id+'.json');}
  async save(record){await fs.mkdir(this.directory,{recursive:true});const target=this.filename(record.id),temp=target+'.tmp';const handle=await fs.open(temp,'w');try{await handle.writeFile(JSON.stringify(record,null,2));await handle.sync();}finally{await handle.close();}await fs.rename(temp,target);}
  async list(){await fs.mkdir(this.directory,{recursive:true});const result=[];for(const name of await fs.readdir(this.directory)){if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;try{const r=JSON.parse(await fs.readFile(path.join(this.directory,name),'utf8'));result.push({id:r.id,name:r.name,status:r.status,count:r.entries.length});}catch{}}return result.reverse();}
  async run(name,plans,signal){
    plans=plans.filter(plan=>plan.before!==plan.after);if(!plans.length)return null;
    if(this.busy)throw Error('正在修改文件，请稍候');
    this.busy=true;let record,mover;
    try{
      if(!plans.length||plans.length>10||new Set(plans.map(plan=>plan.path.toLowerCase())).size!==plans.length)throw Error('每次最多修改 10 个不同文件');
      signal?.throwIfAborted();
      for(const plan of plans){await verifyParent(plan.path);if(await fingerprint(plan.path)!==plan.before)throw Error('文件已变化，请重新运行并预览');}
      const id=randomUUID();record={id,name,status:'executing',entries:plans.map((plan,index)=>({path:plan.path,before:plan.before,after:plan.after,
        backup:path.join(path.dirname(plan.path),'.ontime-'+id+'-'+index+'.backup'),temp:path.join(path.dirname(plan.path),'.ontime-'+id+'-'+index+'.new'),discard:path.join(path.dirname(plan.path),'.ontime-'+id+'-'+index+'.discard')}))};
      await this.save(record);mover=windowsMover();
      for(let i=0;i<plans.length;i++){
        signal?.throwIfAborted();const entry=record.entries[i];
        await verifyParent(entry.path);
        await fs.writeFile(entry.temp,plans[i].text,{flag:'wx'});
        if(await fingerprint(entry.path)!==entry.before)throw Error('文件已变化，已停止修改');
        if(entry.before!==null){await mover.move(entry.path,entry.backup);if(await fingerprint(entry.backup)!==entry.before)throw Error('原文件发生变化');}
        await mover.move(entry.temp,entry.path);
        if(await fingerprint(entry.path)!==entry.after)throw Error('写入校验失败');
      }
      record.status='completed';await this.save(record);return record.id;
    }catch(error){
      if(record){mover?.close();mover=windowsMover();try{await this.rollback(record,mover);}catch{record.status='needs-recovery';await this.save(record).catch(()=>{});throw Error('文件修改中断，请在设置中的文件恢复记录中检查。'+error.message);}}
      throw error;
    }finally{mover?.close();this.busy=false;}
  }
  async rollback(record,mover){
    const failures=[];
    for(const entry of [...record.entries].reverse()){
      try{
        await verifyParent(entry.path);
        let current=await fingerprint(entry.path),backup=await fingerprint(entry.backup);
        if(current===entry.after){
          if(entry.before!==null&&backup!==entry.before)throw Error('原文件备份缺失或已变化');
          await mover.move(entry.path,entry.discard);
          if(await fingerprint(entry.discard)!==entry.after){await mover.move(entry.discard,entry.path);throw Error('文件已经被修改');}
          current=null;
        }
        if(entry.before!==null&&current===null&&backup===entry.before){await mover.move(entry.backup,entry.path);current=entry.before;backup=null;}
        if(current!==entry.before)throw Error('文件已变化，保留备份以免覆盖');
        for(const temporary of [entry.temp,entry.discard]){const actual=await fingerprint(temporary);if(actual===entry.after)await fs.unlink(temporary);else if(actual!==null)throw Error('临时文件已变化');}
      }catch(error){failures.push(error.message);}
    }
    record.status=failures.length?'needs-recovery':'restored';await this.save(record);if(failures.length)throw Error(failures.join('；'));
  }
  async restore(id){
    if(this.busy)throw Error('正在修改文件，请稍候');this.busy=true;let mover;
    try{
      const record=JSON.parse(await fs.readFile(this.filename(id),'utf8'));
      if(record.id!==id||!Array.isArray(record.entries)||!record.entries.length||record.entries.length>10)throw Error('恢复记录无效');
      for(let index=0;index<record.entries.length;index++){
        const entry=record.entries[index];if(!path.isAbsolute(entry.path))throw Error('恢复路径无效');
        for(const [key,extension] of [['backup','backup'],['temp','new'],['discard','discard']])if(entry[key]!==path.join(path.dirname(entry.path),'.ontime-'+id+'-'+index+'.'+extension))throw Error('恢复记录路径不一致');
      }
      mover=windowsMover();await this.rollback(record,mover);
    }finally{mover?.close();this.busy=false;}
  }
}
module.exports={FileScope,FileWrites,fingerprint,assertOpenable};
