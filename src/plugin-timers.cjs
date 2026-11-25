const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {timerRequest}=require('./plugin-capabilities.js');

class PluginTimers{
  constructor(filename,{deliver,canRun=()=>true,now=Date.now}={}){
    this.filename=filename;this.deliver=deliver;this.canRun=canRun;this.now=now;this.items=[];this.queue=Promise.resolve();this.interval=null;
  }
  serial(callback){const result=this.queue.then(callback);this.queue=result.catch(()=>{});return result;}
  async load(){
    let data;
    try{data=JSON.parse(await fs.readFile(this.filename,'utf8'));}catch(error){if(error.code==='ENOENT')return;throw Error('计时记录读取失败，原文件已保留');}
    if(!Array.isArray(data)||data.length>300)throw Error('计时记录格式无效');
    const ids=new Set();
    for(const task of data){
      timerRequest(task.request,['timers','notifications','sound','popup']);
      if(typeof task.id!=='string'||ids.has(task.id)||typeof task.owner!=='string'||typeof task.name!=='string'||!Number.isFinite(task.deadline)||!['pending','finished','cancelled'].includes(task.status))throw Error('计时记录格式无效');
      ids.add(task.id);
    }
    this.items=data.filter(task=>!task.trial);
  }
  async persist(next){
    const temp=this.filename+'.'+randomUUID()+'.tmp';
    await fs.mkdir(path.dirname(this.filename),{recursive:true});
    try{await fs.writeFile(temp,JSON.stringify(next.filter(task=>!task.trial),null,2),{flag:'wx'});await fs.rename(temp,this.filename);}
    finally{await fs.unlink(temp).catch(()=>{});}
    this.items=next;
  }
  start(owner,name,permissions,request,{trial=false,signal}={}){
    request=timerRequest(request,permissions);
    return this.serial(async()=>{
      signal?.throwIfAborted();
      if(!this.canRun({owner,request,trial}))throw Error('插件已停用或预览已失效');
      if(this.items.filter(task=>task.status==='pending').length>=100)throw Error('运行中的计时已达 100 个，请先取消不需要的计时');
      const task={id:randomUUID(),owner,name,request,deadline:this.now()+Math.round(request.delaySeconds*1000),status:'pending',trial};
      const next=[...this.items.filter(item=>item.status==='pending'),...this.items.filter(item=>item.status!=='pending').slice(-199),task];
      await this.persist(next);
      if(signal?.aborted){await this.persist(this.items.filter(item=>item.id!==task.id));signal.throwIfAborted();}
      return {...task};
    });
  }
  list(owner){return this.items.filter(task=>owner===undefined||task.owner===owner).map(task=>JSON.parse(JSON.stringify(task)));}
  cancel(owner,id){return this.serial(async()=>{
    const task=this.items.find(task=>task.id===id&&task.owner===owner);
    if(!task)throw Error('计时不存在');
    if(task.status!=='pending')return;
    await this.persist(this.items.map(item=>item===task?{...item,status:'cancelled'}:item));
  });}
  cancelOwner(owner){return this.serial(async()=>{
    if(this.items.some(task=>task.owner===owner&&task.status==='pending'))await this.persist(this.items.map(task=>task.owner===owner&&task.status==='pending'?{...task,status:'cancelled'}:task));
  });}
  tick(){return this.serial(async()=>{
    const due=[];
    const next=this.items.map(task=>{
      if(task.status!=='pending')return task;
      if(!this.canRun(task))return {...task,status:'cancelled'};
      if(task.deadline>this.now())return task;
      due.push(task);return {...task,status:'finished'};
    });
    if(next.every((task,i)=>task===this.items[i]))return;
    // Persist before delivery to avoid repeated alarms after restart.
    await this.persist(next);
    for(const task of due){
      try{await this.deliver(task);}catch(error){
        await this.persist(this.items.map(item=>item.id===task.id?{...item,error:String(error.message).slice(0,500)}:item));
      }
    }
  });}
  begin(onError=()=>{}){this.interval=setInterval(()=>this.tick().catch(onError),500);this.interval.unref();}
  stop(){clearInterval(this.interval);this.interval=null;}
}
module.exports={PluginTimers};
