const { contextBridge, ipcRenderer } = require('electron');
const invoke = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
contextBridge.exposeInMainWorld('ontime', {
  pluginPreview: process.argv.includes('--plugin-preview'),
  startupSettings: () => invoke('startup-settings'), setStartup: value => invoke('set-startup',value),
  renameHistory: () => invoke('rename-history'), restoreRename: id => invoke('restore-rename',id),
  managePlugin: (id,action) => invoke('manage-plugin',id,action),
  setPluginMatching: (id,value) => invoke('set-plugin-matching',id,value),
  pluginOptions:id=>invoke('plugin-options',id),
  setPluginGrants:(id,permissions)=>invoke('set-plugin-grants',id,permissions),clearPluginData:id=>invoke('clear-plugin-data',id),
  pluginFileHistory:()=>invoke('plugin-file-history'),restorePluginFiles:id=>invoke('restore-plugin-files',id),
  pluginTimers:()=>invoke('plugin-timers'),cancelPluginTimer:id=>invoke('cancel-plugin-timer',id),
  openFolders: () => invoke('open-folders'), chooseRenameFolder: () => invoke('choose-rename-folder'),
  renameSearchFolder: target => invoke('rename-search-folder',target),
  renameFolder: directory => invoke('rename-folder',directory),
  previewRename: intention => invoke('preview-rename',intention),
  discardRename: () => invoke('discard-rename'), acceptRename: token => invoke('accept-rename',token),
  textPlugins: () => invoke('text-plugins'), generateTextPlugin: text => invoke('generate-text-plugin',text),
  discardPluginDraft: () => invoke('discard-plugin-draft'), trialTextPlugin: request => invoke('trial-text-plugin',request),
  installTextPlugin: token => invoke('install-text-plugin',token), runTextPlugin: request => invoke('run-text-plugin',request),
  translationPreferences: () => invoke('translation-preferences'), saveTranslationPreferences: value => invoke('save-translation-preferences',value),
  testProvider: id => invoke('test-provider',id), translate: request => invoke('translate',request),
  cancelModel: kind => invoke('cancel-model',kind), copyText: text => invoke('copy-text',text),
  fileIcon: target => invoke('file-icon',target),
  mode: (mode, expanded) => invoke('window-mode', mode, expanded),
  chooseEverything: () => invoke('choose-everything'), autoStart: value => invoke('auto-start', value),
  providers: () => invoke('providers'), saveProvider: input => invoke('save-provider', input),
  activateProvider: id => invoke('activate-provider', id), deleteProvider: id => invoke('delete-provider', id),
  onConnection: callback => ipcRenderer.on('connection-changed', () => callback()),
  status: () => invoke('status'), chooseEs: () => invoke('choose-es'),
  startEverything: () => invoke('start-everything'),
  search: request => invoke('search', request), cancel: () => invoke('cancel-search'),
  searchApps: query => invoke('search-apps', query),
  action: (action, target) => invoke('file-action', action, target),
  hide: () => invoke('hide'), quit: () => invoke('quit'), downloads: () => invoke('downloads'),
  onFocus: callback => ipcRenderer.on('focus-search', () => callback())
});
