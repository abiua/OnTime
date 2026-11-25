// Build a per-user MSI using the Windows cabinet and installer tools.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { downloadArtifact } = require('@electron/get');
const app = require('../package.json');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const name = 'OnTime-' + app.version + '-windows-x64.msi';
const run = (exe, args, cwd) => execFileSync(exe, args, { cwd, stdio: 'inherit', windowsHide: true });
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
const guid = (key) => '{' + hash('OnTime:windows-x64:' + key).slice(0, 32)
  .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5').toUpperCase() + '}';
const sourceFiles = [
  'appearance.css', 'application-search.cjs', 'clipboard-service.cjs', 'everything.cjs',
  'http-transport.cjs', 'icons.js', 'index.html', 'main.cjs', 'model-service.cjs',
  'plugin-capabilities.js', 'plugin-data.cjs', 'plugin-files.cjs', 'plugin-host.cjs',
  'plugin-intents.js', 'plugin-reminders.cjs', 'plugin-timers.cjs', 'plugin-windows.cjs',
  'preload.cjs', 'rename-executor.cjs', 'rename-preview.cjs', 'renderer.js',
  'script-preload.cjs', 'script-runtime.cjs', 'startup.cjs', 'style.css',
  'text-plugins.cjs', 'translation-preferences.js', 'icons/ontime-mark.svg',
  'icons/ontime.ico', 'icons/ontime.png'
];

async function stageRuntime(work) {
  const version = app.devDependencies.electron;
  const archiveName = 'electron-v' + version + '-win32-x64.zip';
  const checksums = require('electron/checksums.json');
  const zip = process.env.ONTIME_ELECTRON_ZIP || await downloadArtifact({
    version, artifactName: 'electron', platform: 'win32', arch: 'x64', checksums
  });
  if (hash(fs.readFileSync(zip)) !== checksums[archiveName]) throw Error('Electron archive checksum mismatch');
  const stage = path.join(work, 'payload');
  fs.mkdirSync(stage);
  run('tar.exe', ['-xf', path.resolve(zip), '-C', stage], work);
  fs.renameSync(path.join(stage, 'electron.exe'), path.join(stage, 'OnTime.exe'));
  fs.unlinkSync(path.join(stage, 'resources', 'default_app.asar'));
  const target = path.join(stage, 'resources', 'app');
  fs.mkdirSync(path.join(target, 'src', 'icons'), { recursive: true });
  for (const file of sourceFiles) fs.copyFileSync(path.join(root, 'src', file), path.join(target, 'src', file));
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md'])
    fs.copyFileSync(path.join(root, file), path.join(target, file));
  const { name, version: appVersion, license, main } = app;
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name, version: appVersion, license, main }));
  return stage;
}

function makeInstaller(work, stage) {
  // IDT tables are Windows Installer's tab-delimited interchange format.
  function table(name, columns, types, keys, rows) {
    const lines = [columns, types, name + '\t' + keys].map(line => line.replaceAll(' ', '\t'));
    for (const row of rows) lines.push(row.join('\t'));
    fs.writeFileSync(path.join(work, name + '.idt'), lines.join('\r\n') + '\r\n', 'ascii');
  }
  const directories = [
    ['TARGETDIR', '', 'SourceDir'], ['LocalAppDataFolder', 'TARGETDIR', '.'],
    ['Programs', 'LocalAppDataFolder', 'Programs'], ['INSTALLDIR', 'Programs', 'OnTime'],
    ['ProgramMenuFolder', 'TARGETDIR', '.']
  ];
  const files = [], components = [], cabinets = [];
  const id = (prefix, key) => prefix + hash(key).slice(0, 22);
  function walk(relative, directory) {
    for (const entry of fs.readdirSync(path.join(stage, relative), { withFileTypes: true })) {
      const key = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        const subdir = id('D', key);
        directories.push([subdir, directory, entry.name]);
        walk(key, subdir);
      } else {
        const file = id('F', key), component = id('C', key);
        const size = fs.statSync(path.join(stage, key)).size;
        components.push([component, guid('file/' + key), directory, 256, '', file]);
        files.push([file, component, entry.name, size, '', '', 512, files.length + 1]);
        cabinets.push('"payload\\' + key.replaceAll('/', '\\') + '" ' + file);
      }
    }
  }
  walk('', 'INSTALLDIR');
  components.push(['StartShortcut', guid('shortcut'), 'ProgramMenuFolder', 260, '', 'ShortcutMarker']);
  table('Directory', 'Directory Directory_Parent DefaultDir', 's72 S72 l255', 'Directory', directories);
  table('Component', 'Component ComponentId Directory_ Attributes Condition KeyPath',
    's72 S38 s72 i2 S255 S72', 'Component', components);
  table('File', 'File Component_ FileName FileSize Version Language Attributes Sequence',
    's72 s72 l255 i4 S72 S20 I2 i2', 'File', files);
  table('Feature', 'Feature Feature_Parent Title Description Display Level Directory_ Attributes',
    's38 S38 L64 L255 I2 i2 S72 i2', 'Feature', [['Main', '', 'OnTime', '', 1, 1, 'INSTALLDIR', 0]]);
  table('FeatureComponents', 'Feature_ Component_', 's38 s72', 'Feature_ Component_', components.map(([c]) => ['Main', c]));
  table('Registry', 'Registry Root Key Name Value Component_', 's72 i2 l255 L255 L0 s72', 'Registry',
    [['ShortcutMarker', 1, 'Software\\OnTime\\Installer', 'Installed', '#1', 'StartShortcut']]);
  table('Shortcut', 'Shortcut Directory_ Name Component_ Target Arguments Description Hotkey Icon_ IconIndex ShowCmd WkDir',
    's72 s72 l128 s72 s72 S255 L255 I2 S72 I2 I2 S72', 'Shortcut',
    [['OnTimeShortcut', 'ProgramMenuFolder', 'OnTime', 'StartShortcut', '[#' + id('F', 'OnTime.exe') + ']', '',
      'OnTime desktop launcher', '', 'AppIcon', 0, 1, 'INSTALLDIR']]);
  table('Property', 'Property Value', 's72 l0', 'Property', [
    ['ProductName', 'OnTime'], ['ProductVersion', app.version], ['Manufacturer', 'OnTime contributors'],
    ['ProductLanguage', '1033'], ['ProductCode', guid('product/' + app.version)], ['UpgradeCode', guid('upgrade')],
    ['INSTALLLEVEL', '1'], ['ARPPRODUCTICON', 'AppIcon'], ['SecureCustomProperties', 'OLDERPRODUCT;NEWERPRODUCT']
  ]);
  table('Upgrade', 'UpgradeCode VersionMin VersionMax Language Attributes Remove ActionProperty',
    's38 S20 S20 S255 i4 S255 s72', 'UpgradeCode VersionMin VersionMax Language Attributes', [
      [guid('upgrade'), '', app.version, '', 0, '', 'OLDERPRODUCT'],
      [guid('upgrade'), app.version, '', '', 2, '', 'NEWERPRODUCT']
    ]);
  table('LaunchCondition', 'Condition Description', 's255 l255', 'Condition', [
    ['VersionNT64', 'OnTime requires 64-bit Windows.'],
    ['Installed OR NOT NEWERPRODUCT', 'A newer version of OnTime is already installed.']
  ]);
  table('Media', 'DiskId LastSequence DiskPrompt Cabinet VolumeLabel Source',
    'i2 i4 L64 S255 S32 S72', 'DiskId', [[1, files.length, '', '#payload.cab', '', '']]);
  const sequence = [
    ['FindRelatedProducts', '', 25], ['LaunchConditions', '', 100], ['ValidateProductID', '', 700],
    ['CostInitialize', '', 800], ['FileCost', '', 900], ['CostFinalize', '', 1000],
    ['InstallValidate', '', 1400], ['InstallInitialize', '', 1500], ['RemoveExistingProducts', 'OLDERPRODUCT', 1510],
    ['ProcessComponents', '', 1600], ['UnpublishFeatures', '', 1800], ['RemoveShortcuts', '', 3200],
    ['RemoveRegistryValues', '', 3300], ['RemoveFiles', '', 3500], ['InstallFiles', '', 4000],
    ['CreateShortcuts', '', 4500], ['WriteRegistryValues', '', 5000], ['RegisterUser', '', 6000],
    ['RegisterProduct', '', 6100], ['PublishFeatures', '', 6300], ['PublishProduct', '', 6400], ['InstallFinalize', '', 6600]
  ];
  table('InstallExecuteSequence', 'Action Condition Sequence', 's72 S255 I2', 'Action', sequence);
  table('AdminExecuteSequence', 'Action Condition Sequence', 's72 S255 I2', 'Action',
    sequence.filter(([action]) => ['CostInitialize','FileCost','CostFinalize','InstallValidate','InstallInitialize','InstallFiles','InstallFinalize'].includes(action))
      .concat([['InstallAdminPackage', '', 3900]]));
  fs.writeFileSync(path.join(work, 'payload.ddf'), [
    '.OPTION EXPLICIT', '.Set CabinetNameTemplate=payload.cab', '.Set DiskDirectoryTemplate=.',
    '.Set CompressionType=MSZIP', '.Set Cabinet=on', '.Set Compress=on', '.Set MaxDiskSize=0', ...cabinets
  ].join('\r\n'), 'ascii');
  execFileSync('makecab.exe', ['/V0', '/F', 'payload.ddf'], { cwd: work, stdio: ['ignore', 'ignore', 'inherit'] });
  fs.copyFileSync(path.join(root, 'src/icons/ontime.ico'), path.join(work, 'AppIcon.ico'));
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(__dirname, 'write-msi.ps1')], work);
}

async function build() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Build on Windows using x64 Node.js.');
  fs.mkdirSync(output, { recursive: true });
  const work = fs.mkdtempSync(path.join(output, 'build-'));
  try {
    const stage = await stageRuntime(work);
    makeInstaller(work, stage);
    const msi = path.join(output, name);
    fs.copyFileSync(path.join(work, 'OnTime.msi'), msi);
    fs.writeFileSync(msi + '.sha256', hash(fs.readFileSync(msi)) + '  ' + name + '\n');
    console.log('Built dist/' + name);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });
