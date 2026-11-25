const {contextBridge,ipcRenderer}=require('electron');
const channel=process.argv.find(value=>value.startsWith('plugin-network-'));
contextBridge.exposeInMainWorld('pluginNetwork',{
  get:url=>ipcRenderer.invoke(channel,'get',url),
  openUrl:url=>ipcRenderer.invoke(channel,'open-url',url),
  timers:{start:request=>ipcRenderer.invoke(channel,'timer-start',request),list:()=>ipcRenderer.invoke(channel,'timer-list')},
  clipboard:{readText:()=>ipcRenderer.invoke(channel,'clipboard-read'),writeText:text=>ipcRenderer.invoke(channel,'clipboard-write',text)},
  storage:{get:key=>ipcRenderer.invoke(channel,'storage-get',{key}),set:(key,value)=>ipcRenderer.invoke(channel,'storage-set',{key,value}),remove:key=>ipcRenderer.invoke(channel,'storage-remove',{key})},
  remind:request=>ipcRenderer.invoke(channel,'remind',request),
  files:{pickFile:()=>ipcRenderer.invoke(channel,'files-pick-file'),pickFolder:()=>ipcRenderer.invoke(channel,'files-pick-folder'),list:directory=>ipcRenderer.invoke(channel,'files-list',directory),readText:path=>ipcRenderer.invoke(channel,'files-read',path),writeText:(path,text)=>ipcRenderer.invoke(channel,'files-write',{path,text}),renameBatch:(directory,renames)=>ipcRenderer.invoke(channel,'files-rename',{directory,renames}),open:path=>ipcRenderer.invoke(channel,'files-open',path),reveal:path=>ipcRenderer.invoke(channel,'files-reveal',path)},
  windows:{list:()=>ipcRenderer.invoke(channel,'windows-list'),focus:id=>ipcRenderer.invoke(channel,'windows-focus',id)},
  request:request=>ipcRenderer.invoke(channel,'request',request)
});
