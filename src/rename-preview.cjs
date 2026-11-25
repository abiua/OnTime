const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

async function openFolders() {
  const script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $folders=@(); $shell=New-Object -ComObject Shell.Application; foreach($w in $shell.Windows()){try {if([IO.Path]::GetFileName($w.FullName) -ieq 'explorer.exe'){$p=$w.Document.Folder.Self.Path;if([IO.Directory]::Exists($p)){$folders+=$p}}}catch{}}; ConvertTo-Json -Compress -InputObject @($folders | Select-Object -Unique)";
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  let stdout;try{({ stdout } = await exec(executable, ['-NoProfile','-NonInteractive','-Command',script], { windowsHide:true, timeout:10000, maxBuffer:1024*1024 }));}catch{throw Error('无法读取资源管理器窗口，请使用“选择文件夹”按钮');}
  const result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  return Array.isArray(result) ? result.filter(p => typeof p === 'string') : [];
}
async function snapshot(directory) {
  const resolved = await fs.realpath(directory);
  const entries = await fs.readdir(resolved, {withFileTypes:true});
  if (entries.length > 500) throw Error('首版预览最多支持当前目录的 500 个项目，请选择更小的文件夹');
  const files = [];
  for (const entry of entries) {
    const stat = await fs.lstat(path.join(resolved, entry.name));
    files.push({name:entry.name, type:stat.isFile()?'file':stat.isDirectory()?'directory':'link', size:stat.size, modified:stat.mtimeMs, ino:String(stat.ino), dev:String(stat.dev)});
  }
  files.sort((a,b)=>a.name.localeCompare(b.name));
  return {directory:resolved, files};
}
function validatePlan(snapshot, proposed) {
  if (!Array.isArray(proposed) || proposed.length > snapshot.files.length) throw Error('模型返回的重命名清单无效');
  const source = new Map(snapshot.files.map(file=>[file.name,file]));
  const mapped = new Map();
  for (const item of proposed) {
    if (!item || typeof item.from!=='string' || typeof item.to!=='string' || !source.has(item.from) || source.get(item.from).type!=='file' || mapped.has(item.from)) throw Error('清单包含重复、未知或非普通文件');
    if (!item.to || item.to.length>240 || /[<>:"/\\|?*\x00-\x1f]/.test(item.to) || /[. ]$/.test(item.to) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(item.to) || ['.','..'].includes(item.to)) throw Error('目标文件名不符合 Windows 命名规则');
    if (path.join(snapshot.directory,item.to).length>259) throw Error('目标路径过长，请缩短名称');
    mapped.set(item.from,item.to);
  }
  const destinations = new Set();
  for (const file of snapshot.files) {
    const name=(mapped.get(file.name)||file.name).toLowerCase();
    if(destinations.has(name))throw Error('新名称会与其他文件或文件夹冲突，请修改规则');
    destinations.add(name);
  }
  return proposed.filter(item=>item.from!==item.to).map(({from,to})=>({from,to}));
}
function pythonPreview(rows) {
  // A fixed Python template keeps the code's mapping identical to the checked preview.
  const literal=JSON.stringify(JSON.stringify(rows));
  return '# OnTime approved mapping preview. This script prints the plan only.\nimport json\n\nRENAMES = json.loads('+literal+')\n\ndef preview():\n    for item in RENAMES:\n        print(item["from"] + " -> " + item["to"])\n\nif __name__ == "__main__":\n    preview()\n';
}
module.exports={openFolders,snapshot,validatePlan,pythonPreview};
