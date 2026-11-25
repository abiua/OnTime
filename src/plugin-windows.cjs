const {execFile}=require('node:child_process');
const path=require('node:path');
function powershell(code){return new Promise((resolve,reject)=>{
 execFile(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); "+code,'utf16le').toString('base64')],{windowsHide:true,timeout:8000,maxBuffer:262144},(error,stdout)=>error?reject(Error('窗口操作失败')):resolve(stdout));
});}
function createWindows(){
 const known=new Map();
 return {
  async list(){
   const raw=await powershell("@(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Select-Object -First 100 | ForEach-Object { @{id=[string]$_.Id;handle=[string]$_.MainWindowHandle;title=$_.MainWindowTitle;app=$_.ProcessName} }) | ConvertTo-Json -Compress");
   const list=JSON.parse(raw||'[]');known.clear();for(const item of list)known.set(item.id,item);return list.map(({handle,...item})=>item);
  },
  async focus(id){
   const item=known.get(id);if(!item||!/^\d+$/.test(item.id)||!/^\d+$/.test(item.handle))throw Error('请先从窗口列表选择目标');
   const code=`$p=Get-Process -Id ${item.id} -ErrorAction Stop; if([string]$p.MainWindowHandle -ne '${item.handle}'){throw 'Window changed'}; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class OnTimeWindow { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int n); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }'; [OnTimeWindow]::ShowWindowAsync($p.MainWindowHandle,9)|Out-Null; if(-not [OnTimeWindow]::SetForegroundWindow($p.MainWindowHandle)){throw 'Focus denied'}`;
   await powershell(code);return true;
  }
 };
}
module.exports={createWindows};
