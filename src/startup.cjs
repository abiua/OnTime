function createStartupSettings(app, { smoke = false } = {}) {
  const name = smoke ? 'OnTime.Test.' + require('node:path').basename(app.getPath('userData')) : 'OnTime';
  // Electron quotes each argument when writing the Windows command line.
  // Embedded quotes become literal path characters and break login startup.
  const args = app.isPackaged ? [] : [app.getAppPath()];
  args.push('--background');
  if (smoke) args.push('--smoke', '--smoke-profile=' + require('node:path').basename(app.getPath('userData')));
  const options = { path: process.execPath, args };
  function findEntry() {
    const result = app.getLoginItemSettings({ path: options.path });
    return result.launchItems.find(item => item.name === name && item.scope === 'user');
  }
  // Chromium exposes positional arguments separately from switches.
  const positional = values => values.filter(value => !value.startsWith('--'));
  function read() {
    if (process.platform !== 'win32') return { supported: false, enabled: false };
    const entry = findEntry();
    const matches = entry && JSON.stringify(positional(entry.args)) === JSON.stringify(positional(args));
    return { supported: true, enabled: !!(matches && entry.enabled), registered: !!entry };
  }
  function set(enabled) {
    if (typeof enabled !== 'boolean') throw Error('开机自启设置无效');
    if (process.platform !== 'win32') throw Error('当前版本仅支持 Windows 登录自启');
    app.setLoginItemSettings({ ...options, name, openAtLogin: enabled, enabled });
    const result = read();
    if (result.enabled !== enabled || (!enabled && result.registered)) throw Error('Windows 未应用自启设置，请检查系统启动应用权限');
    return result;
  }
  function repairLegacy() {
    if (process.platform !== 'win32' || app.isPackaged) return false;
    const entry = findEntry();
    // Only repair this project's already-enabled legacy entry. Do not opt users
    // into login startup or change disabled entries or other installations.
    if (!entry?.enabled) return false;
    const stored = positional(entry.args);
    if (stored.length !== 1 || stored[0] !== '"' + app.getAppPath() + '"') return false;
    set(true);
    return true;
  }
  return { read, set, repairLegacy };
}
module.exports = { createStartupSettings };
