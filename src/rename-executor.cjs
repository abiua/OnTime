const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { randomUUID } = require('node:crypto');
const { snapshot, validatePlan } = require('./rename-preview.cjs');

// File.Move is atomic and refuses an existing destination on Windows.
// Keep one helper alive for the transaction instead of starting a shell per file.
function windowsMover() {
  const script = `[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); while($null -ne ($line=[Console]::ReadLine())){try{$r=$line|ConvertFrom-Json;[IO.File]::Move([string]$r.from,[string]$r.to);[Console]::WriteLine('{"ok":true}')}catch{[Console]::WriteLine((@{error=$_.Exception.Message}|ConvertTo-Json -Compress))}}`;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const child = spawn(executable,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let pending, failure;
  const fail = error => {failure=error;if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null;}};
  child.on('error',fail);
  child.stdin.on('error',fail);
  child.stderr.resume();
  child.on('exit',()=>fail(Error('文件移动服务已退出')));
  createInterface({input:child.stdout}).on('line',line=>{
    if(!pending)return;
    const current=pending;pending=null;clearTimeout(current.timer);
    try{const result=JSON.parse(line);if(!result.ok)throw Error(result.error||'文件移动失败');current.resolve();}
    catch(error){current.reject(error);}
  });
  return {
    move(from,to){
      if(failure)return Promise.reject(failure);
      return new Promise((resolve,reject)=>{
        pending={resolve,reject,timer:setTimeout(()=>{fail(Error('文件移动超时'));child.kill();},15000)};
        child.stdin.write(JSON.stringify({from,to})+'\n');
      });
    },
    close(){child.stdin.end();child.kill();}
  };
}
async function identity(filename) {
  try {
    const stat=await fs.lstat(filename);
    if(!stat.isFile()||stat.isSymbolicLink())throw Error('文件类型已变化');
    return {size:stat.size,modified:stat.mtimeMs,ino:String(stat.ino),dev:String(stat.dev)};
  } catch(error){if(error.code==='ENOENT')return null;throw error;}
}
const same = (a,b) => a && b && ['size','modified','ino','dev'].every(key=>a[key]===b[key]);
const basename = name => typeof name==='string' && name!=='.' && name!=='..' && !/[\\/:]/.test(name) && !!name;

class RenameExecutor {
  constructor(directory, mover=windowsMover){this.directory=directory;this.mover=mover;this.busy=false;}
  filename(id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('恢复记录无效');return path.join(this.directory,id+'.json');}
  async save(record){
    await fs.mkdir(this.directory,{recursive:true});
    const filename=this.filename(record.id), temp=filename+'.tmp';
    const handle=await fs.open(temp,'w');
    try{await handle.writeFile(JSON.stringify(record,null,2));await handle.sync();}finally{await handle.close();}
    await fs.rename(temp,filename);
  }
  operations(record){
    if(!path.isAbsolute(record.root)||!Array.isArray(record.rows)||record.rows.length>500||!record.rows.every(row=>basename(row.from)&&basename(row.to)))throw Error('恢复记录损坏');
    const first=record.rows.map((row,index)=>({from:row.from,to:'.ontime-'+record.id+'-'+index+'.tmp',identity:row.identity}));
    const second=record.rows.map((row,index)=>({from:first[index].to,to:row.to,identity:row.identity}));
    return [...first,...second];
  }
  async list(){
    await fs.mkdir(this.directory,{recursive:true});
    const result=[];
    for(const name of await fs.readdir(this.directory)){
      if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;
      try{const record=JSON.parse(await fs.readFile(path.join(this.directory,name),'utf8'));this.operations(record);result.push({id:record.id,root:record.root,status:record.status,count:record.rows.length});}catch{}
    }
    return result.reverse();
  }
  async reconcile(record){
    const operations=this.operations(record);
    if(!Number.isInteger(record.completed)||record.completed<0||record.completed>operations.length)throw Error('恢复进度损坏');
    if(record.pending===null)return;
    const index=record.pending.index, reverse=record.pending.reverse;
    if(!Number.isInteger(index)||index<0||index>=operations.length||index!==(reverse?record.completed-1:record.completed))throw Error('恢复进度不一致');
    const operation=operations[index];
    const from=path.join(record.root,reverse?operation.to:operation.from),to=path.join(record.root,reverse?operation.from:operation.to);
    const source=await identity(from),target=await identity(to);
    if(!source&&same(target,operation.identity))record.completed+=reverse?-1:1;
    else if(!same(source,operation.identity))throw Error('中断后的文件状态存在冲突，请保留文件并检查恢复记录');
    record.pending=null;await this.save(record);
  }
  async step(record,index,reverse,mover){
    const operation=this.operations(record)[index];
    const from=path.join(record.root,reverse?operation.to:operation.from),to=path.join(record.root,reverse?operation.from:operation.to);
    if(!same(await identity(from),operation.identity))throw Error('文件内容或身份已变化，已停止操作');
    record.pending={index,reverse};await this.save(record);
    await mover.move(from,to);
    if(!same(await identity(to),operation.identity))throw Error('移动后文件校验失败');
    record.completed+=reverse?-1:1;record.pending=null;await this.save(record);
  }
  async rollback(record,mover){
    await this.reconcile(record);
    record.status='restoring';await this.save(record);
    while(record.completed>0)await this.step(record,record.completed-1,true,mover);
    record.status='restored';await this.save(record);
  }
  async execute(plan){
    if(this.busy)throw Error('正在执行文件操作，请稍候');
    this.busy=true;let mover,record;
    try{
      const latest=await snapshot(plan.snapshot.directory);
      if(JSON.stringify(latest)!==JSON.stringify(plan.snapshot))throw Error('文件夹内容已变化，请重新读取并预览');
      const rows=validatePlan(latest,plan.rows);
      if(!rows.length)throw Error('没有需要改名的文件');
      record={id:randomUUID(),root:latest.directory,status:'executing',completed:0,pending:null,rows:[]};
      for(const row of rows){const file=await identity(path.join(record.root,row.from));if(!file)throw Error('文件已不存在');record.rows.push({...row,identity:file});}
      await this.save(record);mover=this.mover();
      for(let index=0;index<rows.length*2;index++)await this.step(record,index,false,mover);
      record.status='completed';await this.save(record);return {id:record.id,count:rows.length};
    }catch(error){
      if(record&&mover){
        mover.close();mover=this.mover();
        try{await this.rollback(record,mover);throw Object.assign(Error('改名未完成，已恢复原名称。'+error.message),{restored:true});}
        catch(recovery){
          if(recovery.restored)throw recovery;
          record.status='needs-recovery';await this.save(record).catch(()=>{});
          throw Error('改名中断，部分文件需要恢复。请使用下方恢复记录。'+error.message);
        }
      }
      throw error;
    }finally{mover?.close();this.busy=false;}
  }
  async restore(id){
    if(this.busy)throw Error('正在执行文件操作，请稍候');
    this.busy=true;let mover,record;
    try{
      record=JSON.parse(await fs.readFile(this.filename(id),'utf8'));
      if(record.id!==id)throw Error('记录无效');
      if(record.status==='restored')return true;
      if(await fs.realpath(record.root)!==record.root)throw Error('文件夹路径已变化');
      mover=this.mover();await this.rollback(record,mover);return true;
    }catch(error){if(record){record.status='needs-recovery';await this.save(record).catch(()=>{});}throw error;}
    finally{mover?.close();this.busy=false;}
  }
}
module.exports={RenameExecutor,windowsMover};
