const {reminderRequest}=require('./plugin-capabilities.js');
const {keyValid}=require('./plugin-data.cjs');
function createHost({owner,name,permissions=[],data,clipboard,remind,trial=false,files,choosePath,fileWrites,confirmWrites,openPath,windows,rename}){
  const changes=[],pending={};let snapshot;
  const requirePermission=key=>{if(!permissions.includes(key))throw Error('此插件未获得能力：'+key+'，可在插件管理中查看授权');};
  async function invoke(action,payload,signal){
    signal.throwIfAborted();
    if(action==='clipboard-read'){
      requirePermission('clipboardRead');const text=await clipboard.readText();
      if(typeof text!=='string'||text.length>200000)throw Error('剪贴板内容过长');return text;
    }
    if(action==='clipboard-write'){
      requirePermission('clipboardWrite');if(typeof payload!=='string'||payload.length>200000)throw Error('剪贴板内容无效');pending.clipboard=payload;return true;
    }
    if(action==='remind'){
      if(pending.reminder)throw Error('每次运行最多发送一次即时提醒');
      pending.reminder=reminderRequest(payload,permissions);return true;
    }
    if(action.startsWith('files-')){
      const writing=['files-write','files-rename'].includes(action);requirePermission(writing?'filesWrite':'filesRead');
      if(action==='files-pick-file'||action==='files-pick-folder'){
        if(pending.picked)throw Error('每次运行只选择一次文件范围');pending.picked=true;
        const folder=action==='files-pick-folder',selected=await choosePath(folder,signal);
        return selected?files.grant(selected,folder):null;
      }
      if(action==='files-list')return files.list(payload);
      if(action==='files-read')return files.readText(payload);
      if(action==='files-open'||action==='files-reveal'){
        const filename=await files.resolve(payload);pending.open={filename,reveal:action==='files-reveal'};return true;
      }
      if(action==='files-write'){
        pending.writes||=[];if(pending.writes.length>=10)throw Error('每次最多写入 10 个文件');
        const plan=await files.planWrite(payload?.path,payload?.text);
        if(pending.writes.some(item=>item.path.toLowerCase()===plan.path.toLowerCase()))throw Error('不能重复写入同一文件');
        pending.writes.push(plan);return true;
      }
      if(action==='files-rename'){
        if(pending.rename)throw Error('每次只支持一组批量改名');
        const directory=await files.resolve(payload?.directory);
        const tools=require('./rename-preview.cjs'),snapshot=await tools.snapshot(directory),rows=tools.validatePlan(snapshot,payload?.renames);
        pending.rename={snapshot,rows};return true;
      }
      throw Error('文件操作不受支持');
    }
    if(action==='windows-list'){requirePermission('windows');return windows.list();}
    if(action==='windows-focus'){requirePermission('windows');if(typeof payload!=='string')throw Error('窗口标识无效');pending.focus=payload;return true;}
    if(['storage-get','storage-set','storage-remove'].includes(action)){
      requirePermission('storage');if(!keyValid(payload?.key))throw Error('存储键名无效');
      snapshot ||= trial?{}:await data.read(owner);
      if(action==='storage-get')return Object.hasOwn(snapshot,payload.key)?snapshot[payload.key]:null;
      if(action==='storage-remove'){delete snapshot[payload.key];changes.push({key:payload.key,remove:true});return true;}
      const encoded=JSON.stringify(payload.value);
      if(encoded===undefined||Buffer.byteLength(encoded)>65536)throw Error('单项插件数据须为不超过 64KB 的 JSON');
      const value=JSON.parse(encoded);snapshot[payload.key]=value;
      if(Buffer.byteLength(JSON.stringify(snapshot))>131072)throw Error('插件独立数据超过 128KB');
      changes.push({key:payload.key,value});return true;
    }
    throw Error('宿主不支持此操作');
  }
  async function commit(signal){
    const completed=[];
    try{
    signal.throwIfAborted();
    if(pending.writes?.length&&pending.rename)throw Error('同一次运行请分别执行文本写入和批量改名');
    if(pending.writes?.length){await confirmWrites(pending.writes.map(plan=>({path:plan.path,action:plan.before===null?'创建':'覆盖',preview:plan.text.slice(0,1200)})),signal);signal.throwIfAborted();await fileWrites.run(name,pending.writes,signal);completed.push('文件写入（可在常规设置中恢复）');}
    if(pending.rename){await confirmWrites(pending.rename.rows.map(row=>({path:pending.rename.snapshot.directory,action:row.from+' → '+row.to})),signal);signal.throwIfAborted();await rename(pending.rename);completed.push('批量改名（可在重命名插件中恢复）');}
    if(changes.length&&!trial){await data.update(owner,changes,signal);completed.push('插件数据保存');}
    signal.throwIfAborted();
    if(Object.hasOwn(pending,'clipboard')){await require('./clipboard-service.cjs').copyText(clipboard,pending.clipboard);completed.push('剪贴板写入');}
    signal.throwIfAborted();
    if(pending.reminder){await remind({name,request:pending.reminder});completed.push('提醒发送');}
    signal.throwIfAborted();
    if(pending.open){await openPath(pending.open.filename,pending.open.reveal);completed.push('文件打开');}
    if(pending.focus)await windows.focus(pending.focus);
    }catch(error){throw Error(error.message+(completed.length?'。以下操作已完成：'+completed.join('、')+'。':''));}
  }
  return {invoke,commit};
}
module.exports={createHost};
