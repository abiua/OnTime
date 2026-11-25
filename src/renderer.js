const $ = id => document.getElementById(id);
let mode = 'home', filter = 'all', rows = [], selected = 0, sequence = 0, timer, loading = false;
let formSerial=0,formLoading=false;
let appRows = [], fileRows = [], fileOffset = 0;
const plugins = [
 {id:'files',name:'文件搜索',icon:'search',keys:['文件','搜索','find','file'],hint:'搜索电脑中的文件和文件夹…',matching:window.pluginIntents.preset('file-search')},
 {id:'translate',name:'翻译',icon:'translate',keys:['翻译','translate','fy'],hint:'输入要翻译的文字…',matching:window.pluginIntents.preset('translate')},
 {id:'rename',name:'重命名',icon:'rename',keys:['重命名','rename','命名'],hint:'输入命名规则…',matching:window.pluginIntents.preset('rename')},
 {id:'builder',name:'生成插件',icon:'sparkle',keys:['生成插件','插件','create','plugin'],hint:'描述你想要的插件…',matching:window.pluginIntents.preset('other',[])}
];
const state = {home:'',files:'',translate:'',rename:'',builder:'',settings:''};
let homeRows=[], providerData={items:[],active:''}, editing='';
const isSearch=()=>mode==='home'||mode==='files';
const api = window.ontime;
const matchingRules=window.pluginIntents;
let rankingPrefs={enabled:true,history:{},favorites:[]};
try {
 const saved=JSON.parse(localStorage.getItem('ontime-plugin-ranking') || 'null');
 if(saved && typeof saved.history==='object' && saved.history && !Array.isArray(saved.history) && Array.isArray(saved.favorites))rankingPrefs={enabled:saved.enabled!==false,history:saved.history,favorites:saved.favorites.filter(id=>typeof id==='string')};
} catch {}
function saveRanking(){try{localStorage.setItem('ontime-plugin-ranking',JSON.stringify(rankingPrefs));}catch{notice('推荐偏好暂时无法保存，重启后可能恢复默认。');}}
function rankedPlugins(){return matchingRules.rankPlugins(plugins,$('query').value,{history:rankingPrefs.enabled?rankingPrefs.history:{},favorites:rankingPrefs.favorites});}
if (api.pluginPreview) document.querySelector('.launch-key').textContent = '演示模式';
const previewPlugins = api.pluginPreview ? [
 ['剪贴板历史','copy'], ['快速笔记','document'], ['截图工具','image'], ['颜色拾取','image'],
 ['计算器','grid'], ['单位换算','refresh'], ['时间戳转换','refresh'], ['二维码生成','grid'],
 ['文本去重','document'], ['格式化 JSON','document'], ['Markdown 预览','document'], ['密码生成','model'],
 ['批量压缩','folder'], ['图片缩放','image'], ['文件校验','check'], ['下载管理','download'],
 ['番茄时钟','pulse'], ['日历速览','grid'], ['待办清单','check'], ['天气查询','search'],
 ['链接提取','copy'], ['网页收藏','open'], ['英文字典','translate'], ['语音转文字','pulse'],
 ['表格整理','grid'], ['正则测试','search'], ['路径转换','folder'], ['编码解码','refresh'],
 ['快捷指令','play'], ['智能摘要','sparkle']
].map(([name, icon], index) => ({ id: 'preview-' + (index + 1), name, icon, preview: true })) : [];
const pluginLibrary = $('plugin-library');
const pluginsPerPage = 12;
let pluginPage = 0;
let translating=false, translationSerial=0;
const languageRules=window.translationPreferences;
let translationPrefs={...languageRules.defaults};
const prefsReady=api.translationPreferences().then(p=>{translationPrefs=p;}).catch(()=>{});
function detectLanguages(){
 const source=languageRules.detect($('query').value);
 $('source-language').value=source;
 $('target-language').value=languageRules.chooseTarget(source,translationPrefs);
 $('detected-language').textContent=source==='自动检测'?'未明确识别，翻译时由模型识别；可手动调整。':'本地初步识别：'+(source==='简体中文'?'中文':source)+'；可手动调整。';
}

const iconCache=new Map();
const imageExtensions = new Set(['PNG','JPG','JPEG','GIF','BMP','WEBP','ICO','SVG','AVIF','TIFF']);
const resultActionIcons = { open: 'open', reveal: 'folder', copy: 'copy', attach: 'rename' };
function invalidateTranslation(){translationSerial++;if(translating){api.cancelModel('translation').catch(()=>{});translating=false;$('translate-run').disabled=false;$('translate-cancel').hidden=true;} $('translation-output').value='';$('translation-copy').disabled=true;$('translation-status').textContent='';}
async function translationProvider(){const d=await api.providers(),p=d.items.find(p=>p.id===d.active);$('translation-provider').textContent=p?'发送至 '+p.name+' · '+p.model+' · '+new URL(p.baseUrl).host:'尚未配置模型，请先添加并启用服务商';}
function notice(text = '') { $('notice').textContent = text; }
async function safe(fn) { try { await fn(); } catch (e) { notice(e.message); } }
function drawPlugins(){
 const ranked=rankedPlugins();
 $('plugins').replaceChildren();
 const hasOverflow = previewPlugins.length > 0 || plugins.length > 5;
 const visible = hasOverflow ? ranked.slice(0, 4) : ranked;
 for(const {plugin:p,score} of visible){
  const button = pluginButton(p);
  button.dataset.plugin = p.id;
  button.classList.toggle('match', score > 0);
  button.onclick = () => setMode(p.id);
  $('plugins').append(button);
 }
 if (hasOverflow) {
  const more = pluginButton({name: '更多插件', icon: 'grid'});
  more.id = 'plugin-overflow';
  more.setAttribute('aria-haspopup', 'dialog');
  more.setAttribute('aria-controls', pluginLibrary.id);
  more.onclick = openPluginLibrary;
  $('plugins').append(more);
 }
 if (pluginLibrary.open) renderPluginLibrary();
}

function pluginButton(plugin) {
 const button = document.createElement('button');
 const label = document.createElement('span');
 label.textContent = plugin.name;
 button.title = plugin.name;
 button.append(createIcon(plugin.icon), label);
 return button;
}

function renderPluginLibrary() {
 const catalog = [...rankedPlugins(), ...previewPlugins.map(plugin=>({plugin,score:0}))];
 const totalPages = Math.ceil(catalog.length / pluginsPerPage);
 pluginPage = Math.min(pluginPage, totalPages - 1);
 const start = pluginPage * pluginsPerPage;
 const grid = $('plugin-library-grid');
 grid.replaceChildren();
 $('plugin-library-count').textContent = `共 ${catalog.length} 项` + (previewPlugins.length ? ` · 含 ${previewPlugins.length} 个演示插件` : '');
 $('plugin-page').textContent = `第 ${pluginPage + 1} / ${totalPages} 页`;
 $('plugin-prev').disabled = pluginPage === 0;
 $('plugin-next').disabled = pluginPage === totalPages - 1;
 for (const {plugin,score} of catalog.slice(start, start + pluginsPerPage)) {
  const button = pluginButton(plugin);
  button.dataset.libraryPlugin = plugin.id;
  button.classList.toggle('match', score > 0);
  if (plugin.preview) {
   const badge = document.createElement('small');
   badge.textContent = '演示';
   button.append(badge);
   button.setAttribute('aria-pressed', 'false');
   button.onclick = () => {
    grid.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-pressed', 'true');
    $('plugin-library-preview').textContent = `已选中「${plugin.name}」。演示插件只用于预览界面。`;
   };
  } else {
   button.onclick = () => { pluginLibrary.close(); setMode(plugin.id); };
  }
  grid.append(button);
 }
 $('plugin-library-preview').hidden = previewPlugins.length === 0;
 $('plugin-library-preview').textContent = previewPlugins.length ? '点击带「演示」标记的插件可预览选中状态。' : '';
}

function openPluginLibrary() {
 pluginPage = 0;
 renderPluginLibrary();
 pluginLibrary.showModal();
 safe(() => api.mode('home', true));
}

function turnPluginPage(offset) {
 pluginPage += offset;
 renderPluginLibrary();
 if (document.activeElement === document.body) {
  $(offset > 0 ? 'plugin-prev' : 'plugin-next').focus();
 }
}

$('plugin-prev').onclick = () => turnPluginPage(-1);
$('plugin-next').onclick = () => turnPluginPage(1);
$('plugin-library-close').onclick = () => pluginLibrary.close();
pluginLibrary.addEventListener('close', () => {
 if (mode !== 'home' || pluginLibrary.open) return;
 safe(() => api.mode('home', !!$('query').value.trim()));
 $('plugin-overflow')?.focus();
});
async function setMode(next, carry){
 formSerial++;formLoading=false;
 if(mode!==next){stopTextRun();if(mode==='builder'&&builderBusy)cancelBuilder();}
 if(mode==='translate'&&next!=='translate'&&translating)invalidateTranslation();
 const incoming=$('query').value;
 if(mode==='home' && plugins.some(p=>p.id===next) && rankingPrefs.enabled){rankingPrefs.history=matchingRules.recordChoice(rankingPrefs.history,next,incoming);saveRanking();}
 const carried=carry??incoming;
 state[mode]=incoming;if(mode==='home')homeRows=rows;
 if(mode!=='settings'&&plugins.some(p=>p.id===next)&&(carry!==undefined||carried.trim())){if(next==='translate'&&state.translate!==carried)invalidateTranslation();state[next]=carried;}
 sequence++;clearTimeout(timer);api.cancel().catch(()=>{});loading=false;mode=next;document.body.classList.toggle('home-view',mode==='home');document.body.classList.toggle('settings-mode',mode==='settings');
 const p=plugins.find(p=>p.id===mode);$('query').value=state[mode]||'';$('query').disabled=mode==='settings';
 $('search-icon').replaceChildren(createIcon(p?.icon || 'search'));
 $('query').placeholder=mode==='settings'?'设置':p?.hint||'搜索文件，或选择一个插件…';
 $('back').hidden=mode==='home';$('plugins').hidden=mode!=='home';$('pin').hidden=mode==='home';
 $('mode-label').textContent=p?.name||(mode==='settings'?'设置':'随时，就绪');
 $('search-view').hidden=!isSearch();$('filters').hidden=mode!=='files';
 $('plugin-view').hidden=isSearch()||mode==='settings'||mode==='builder'||mode==='rename'||!!p?.spec;$('settings-view').hidden=mode!=='settings';
 $('rename-view').hidden=mode!=='rename';if(mode==='rename'){safe(loadRenameHistory);if(!renameLoaded)safe(loadOpenFolders);}
 $('builder-view').hidden=mode!=='builder';$('text-plugin-view').hidden=!p?.spec;
 document.body.classList.toggle('text-view',mode==='builder'||!!p?.spec);
 if(mode==='builder'){if(draftRequirement!==null&&draftRequirement!==$('query').value)invalidateDraft();safe(builderProvider);}
 if(p?.spec){$('text-plugin-name').textContent=p.name;$('text-plugin-description').textContent=p.spec.description;$('text-plugin-access').textContent=accessNote(p.spec);setIconLabel($('text-plugin-run'),'play',p.spec.permissions?.includes('timers')?'开始计时 · Ctrl+Enter':'运行 · Ctrl+Enter');safe(()=>loadPluginSettings(p));}
 if(p&&!isSearch()){$('plugin-title').textContent=p.name;$('plugin-help').textContent='直接在顶部输入框编辑内容。';}
 document.body.classList.toggle('translating-view',mode==='translate');
 $('translation-controls').hidden=mode!=='translate';$('placeholder-help').hidden=mode==='translate';$('context').hidden=mode!=='rename';
 if(mode==='translate'){safe(translationProvider);detectLanguages();prefsReady.then(()=>{if(mode==='translate')detectLanguages();});}
 if(mode==='home'){rows=homeRows;render();drawPlugins();if(!state.home){$('count').textContent='';$('more').hidden=true;}}
 await safe(()=>api.mode(mode,!!$('query').value.trim()));notice();
 if(mode==='settings'){await refreshStatus();await loadProviders();}else $('query').focus();
 if(isSearch()&&$('query').value.trim())search();
}
async function refreshStatus() {
  await safe(async () => {
    const status = await api.status();
    $('connection-text').textContent = status.message;
    $('connection').classList.toggle('connected', status.connected);
    $('connection-detail').textContent = `${status.message}\n${status.es || '尚未配置 es.exe 路径'}`;
    $('auto-start').checked=status.autoStart;
    if (!status.shortcutOk && !api.pluginPreview) notice('Alt+Space 被其他应用占用。请释放快捷键后重启；也可通过托盘打开。');
  });
}
function render() {
  $('results').replaceChildren();

  rows.forEach((row, index) => {
    const el = document.createElement('div'); el.className = `row${index === selected ? ' selected' : ''}`;
    el.setAttribute('role', 'option'); el.setAttribute('aria-selected', String(index === selected));
    el.id = `result-${index}`;
    const icon = document.createElement('span');
    const filename = row.isApplication ? row.path.split(/[\\/]/).pop() : row.name;
    const ext=row.isDirectory?'FOLDER':(filename.includes('.')?filename.split('.').pop().toUpperCase():'FILE');
    const isExecutable = !row.isDirectory && ['EXE','LNK'].includes(ext);
    const glyph = row.isDirectory ? 'folder' : row.isApplication || isExecutable ? 'grid' : imageExtensions.has(ext) ? 'image' : 'document';
    icon.className = 'file-icon file-icon-' + glyph;
    icon.setAttribute('aria-hidden', 'true');
    icon.append(createIcon(glyph));
    if (glyph === 'document' || glyph === 'image') {
      const extension = document.createElement('span');
      extension.className = 'file-extension';
      extension.textContent = ext.slice(0, 5);
      icon.append(extension);
    }
    if(isExecutable){
      const showIcon=data=>{if(!data||!icon.isConnected)return;icon.replaceChildren();const img=document.createElement('img');img.src=data;img.alt='';icon.append(img);icon.classList.add('native-icon');};
      if(iconCache.has(row.path))queueMicrotask(()=>showIcon(iconCache.get(row.path)));
      else api.fileIcon(row.path).then(data=>{if(iconCache.size>200)iconCache.clear();iconCache.set(row.path,data);showIcon(data);}).catch(()=>{});
    }
    const info = document.createElement('div'); info.className = 'file-info';
    const name = document.createElement('div'); name.className = 'file-name'; name.textContent = row.name;
    const location = document.createElement('div'); location.className = 'file-path'; location.textContent = row.isApplication ? (row.source === 'desktop' ? '桌面快捷方式' : '开始菜单') + ' · ' + row.path : row.path; location.title = row.path;
    info.append(name, location); const actions = document.createElement('div'); actions.className = 'row-actions';
    const commands = [['open',row.isApplication?'启动':'打开'],['reveal','定位'],['copy','路径']];
    if (!row.isApplication) commands.push(['attach','重命名']);
    for (const [action, label] of commands) {
      const button = document.createElement('button');
      setIconLabel(button, resultActionIcons[action], label);
      if (action === 'copy') button.title = '复制路径';
      button.addEventListener('click', e => { e.stopPropagation(); perform(action, row); });
      actions.append(button);
    }
    el.append(icon, info, actions); el.addEventListener('click', () => { selected = index; render(); }); el.addEventListener('dblclick', () => perform('open', row)); $('results').append(el);
  });
}
async function perform(action, row = rows[selected]) {
  if (!row) return;
  if (action === 'attach') {
    await safe(async()=>{
      const directory=await api.renameSearchFolder(row.path);
      renameLoaded=true;
      await setMode('rename');
      $('rename-folders').append(new Option(directory,directory));
      $('rename-folders').value=directory;
      await readRenameFolder(directory);
    });
    return;
  }
  await safe(async () => { await api.action(action, row.path); notice(action === 'copy' ? '路径已复制' : ''); });
}
async function search(more = false) {
  if(!isSearch())return;
  const query = $('query').value.trim(); const current = ++sequence;
  api.mode(mode,!!query || pluginLibrary.open).catch(()=>{});
  if (!query) { rows = []; appRows = []; fileRows = []; fileOffset = 0; loading = false; render(); $('count').textContent = ''; $('more').hidden = true; return; }
  loading = true; notice(); $('count').textContent = '正在查找…'; $('more').hidden = true;
  if (!more) { rows = []; appRows = []; fileRows = []; fileOffset = 0; selected = 0; render(); }
  const files = api.search({ query, filter, offset: fileOffset }).then(result => ({ result }), error => ({ error }));
  function renderCombined() {
    const seen = new Set();
    rows = appRows.concat(fileRows).filter(row => {
      const key = row.path.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    render();
  }
  try {
    if (!more && filter === 'all') {
      const applications = await api.searchApps(query).catch(() => []);
      if (current !== sequence) return;
      appRows = applications;
      if (appRows.length) {
        renderCombined();
        $('count').textContent = `${appRows.length} 个应用 · 正在查找文件…`;
      }
    }
    const { result, error } = await files;
    if (current !== sequence) return;
    if (error) throw error;
    fileOffset += result.length;
    fileRows = fileRows.concat(result);
    renderCombined();
    $('count').textContent = rows.length ? `${rows.length} 个结果` : '没有匹配的文件';
    $('more').hidden = result.length < 50 || fileOffset >= 10000;
  } catch (e) { if (current === sequence) { notice(e.message); $('count').textContent = appRows.length ? `${appRows.length} 个应用 · 文件搜索未完成` : '搜索未完成'; } }
  finally { if (current === sequence) loading = false; }
}

$('query').addEventListener('input',event=>{
 state[mode]=$('query').value;
 if(!isSearch()){if(mode==='translate'){invalidateTranslation();detectLanguages();}if(mode==='builder')invalidateDraft();if(mode==='rename')invalidateRename();if(plugins.find(p=>p.id===mode)?.spec)stopTextRun();return;}
 sequence++;clearTimeout(timer);api.cancel().catch(()=>{});rows=[];render();$('more').hidden=true;
 if(mode==='home'&&!event.isComposing)drawPlugins();timer=setTimeout(()=>search(),180);
});
$('query').addEventListener('compositionend',()=>{if(mode==='home')drawPlugins();});

$('clear').onclick=()=>{$('query').value='';$('query').dispatchEvent(new Event('input'));$('query').focus();};
$('back').onclick=()=>setMode('home');
$('settings').onclick=()=>{setMode('settings');settingsTab('general');};
$('connection').onclick=()=>{setMode('settings');settingsTab('everything');};
function settingsTab(name){$('general-panel').hidden=name!=='general';$('tab-general').classList.toggle('active',name==='general');if(name==='general')safe(loadStartupSettings);$('plugins-panel').hidden=name!=='plugins';$('tab-plugins').classList.toggle('active',name==='plugins');if(name==='plugins')safe(loadManagedPlugins);$('api-panel').hidden=name!=='api';$('everything-panel').hidden=name!=='everything';$('tab-api').classList.toggle('active',name==='api');$('tab-everything').classList.toggle('active',name==='everything');}
$('tab-api').onclick=()=>settingsTab('api');$('tab-everything').onclick=()=>settingsTab('everything');
$('hide').onclick=()=>safe(()=>api.hide());$('quit').onclick=()=>safe(()=>api.quit());
$('more').onclick=()=>{if(!loading)search(true);};
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(c=>c.classList.toggle('active',c===b));search();});
$('choose').onclick=()=>safe(async()=>{await api.chooseEs();await refreshStatus();});
$('choose-everything').onclick=()=>safe(async()=>{await api.chooseEverything();await refreshStatus();});
$('retry').onclick=refreshStatus;
$('download').onclick=()=>safe(()=>api.downloads());
$('auto-start').onchange=()=>safe(()=>api.autoStart($('auto-start').checked));
$('start-everything').onclick=()=>safe(async()=>{$('start-everything').disabled=true;notice('正在启动并等待索引…');try{await api.startEverything();await refreshStatus();notice();}finally{$('start-everything').disabled=false;}});
function resetForm(){editing='';$('provider-form').reset();$('api-key').placeholder='输入密钥';$('api-key').type='password';setIconLabel($('show-key'),'eye','显示');$('save-state').textContent='';}
function renderProviders(){
 $('providers').replaceChildren();
 for(const p of providerData.items){const row=document.createElement('div');row.className='provider-row';const name=document.createElement('span');name.textContent=p.name+' · '+p.model+(providerData.active===p.id?' · 使用中':'');row.append(name);
 for(const [label,glyph,action] of [['编辑','rename',()=>{editing=p.id;$('provider-name').value=p.name;$('base-url').value=p.baseUrl;$('model').value=p.model;$('protocol').value=p.protocol;$('preset').value='custom';$('api-key').value='';$('api-key').placeholder='已加密保存，留空保留';}],['启用','check',async()=>{providerData=await api.activateProvider(p.id);renderProviders();}],['删除','trash',async()=>{if(!confirm('删除这份配置和保存的密钥？'))return;providerData=await api.deleteProvider(p.id);if(editing===p.id)resetForm();renderProviders();}]]){const b=document.createElement('button');b.type='button';setIconLabel(b,glyph,label);b.onclick=()=>safe(action);row.append(b);}$('providers').append(row);}
}
async function loadProviders(){await safe(async()=>{providerData=await api.providers();renderProviders();});}
$('new-provider').onclick=resetForm;
$('preset').onchange=()=>{const presets={openai:['OpenAI','https://api.openai.com/v1','responses'],'openai-chat':['OpenAI Chat','https://api.openai.com/v1','chat-completions'],anthropic:['Anthropic','https://api.anthropic.com','anthropic'],local:['本机服务','http://localhost:11434/v1','chat-completions'],custom:['','','chat-completions']};const p=presets[$('preset').value];editing='';$('provider-name').value=p[0];$('base-url').value=p[1];$('protocol').value=p[2];$('model').value='';$('api-key').value='';$('api-key').placeholder='输入密钥';};
$('show-key').onclick=()=>{const show=$('api-key').type==='password';$('api-key').type=show?'text':'password';setIconLabel($('show-key'),show?'eyeOff':'eye',show?'隐藏':'显示');};
$('provider-form').onsubmit=e=>{e.preventDefault();safe(async()=>{providerData=await api.saveProvider({id:editing,name:$('provider-name').value,baseUrl:$('base-url').value,protocol:$('protocol').value,model:$('model').value,key:$('api-key').value});editing=providerData.active;$('api-key').value='';$('api-key').type='password';setIconLabel($('show-key'),'eye','显示');$('api-key').placeholder='已加密保存，留空保留';$('save-state').textContent='已保存并启用';renderProviders();});};
document.addEventListener('keydown',e=>{
 if(pluginLibrary.open)return;
 if(e.ctrlKey&&e.key==='Enter'&&mode==='builder'){e.preventDefault();$(e.target.id==='builder-sample'?'builder-trial':'builder-generate').click();return;}
 if(e.ctrlKey&&e.key==='Enter'&&plugins.find(p=>p.id===mode)?.spec){e.preventDefault();$('text-plugin-run').click();return;}
 if(mode==='translate'&&e.ctrlKey&&e.key==='Enter'){e.preventDefault();$('translate-run').click();return;}
 if(e.key==='Escape'){safe(()=>api.hide());return;}
 if(e.target.closest('#plugins')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const buttons=[...$('plugins').children];buttons[(buttons.indexOf(e.target)+(e.key==='ArrowRight'?1:buttons.length-1))%buttons.length].focus();return;}
 if(!isSearch()||e.target.tagName==='BUTTON')return;
 if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();selected=Math.max(0,Math.min(rows.length-1,selected+(e.key==='ArrowDown'?1:-1)));render();$('result-'+selected)?.scrollIntoView({block:'nearest'});}
 if(e.key==='Enter'){e.preventDefault();perform(e.ctrlKey?'reveal':'open');}
});
api.onFocus(()=>{if(mode!=='settings'&&!pluginLibrary.open)$('query').focus();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.body.animate([{opacity:0.6,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:130,easing:'ease-out'});if(mode==='settings'&&!$('general-panel').hidden)safe(loadStartupSettings);});
api.onConnection(refreshStatus);
setInterval(()=>{if(mode==='settings'&&!$('everything-panel').hidden)refreshStatus();},4000);
drawPlugins();refreshStatus();

$('source-language').onchange=()=>{invalidateTranslation();$('target-language').value=languageRules.chooseTarget($('source-language').value,translationPrefs);$('detected-language').textContent='使用手动选择的源语言';};
$('target-language').onchange=invalidateTranslation;
for(const id of ['preferred-language','fallback-language'])for(const language of languageRules.languages){const option=document.createElement('option');option.value=language;option.textContent=language;$(id).append(option);}
prefsReady.then(()=>{$('preferred-language').value=translationPrefs.preferred;$('fallback-language').value=translationPrefs.fallback;});
$('save-translation-options').onclick=()=>safe(async()=>{translationPrefs=await api.saveTranslationPreferences({preferred:$('preferred-language').value,fallback:$('fallback-language').value});invalidateTranslation();detectLanguages();$('translation-options-state').textContent='已保存';});
$('translation-settings').onclick=()=>{setMode('settings');settingsTab('api');};
$('translate-run').onclick=async()=>{
 if(translating)return;const text=$('query').value;
 if(!text.trim()){notice('请输入待翻译文字');return;}
 const token=++translationSerial;translating=true;$('translate-run').disabled=true;$('translate-cancel').hidden=false;$('translation-output').value='';$('translation-copy').disabled=true;$('translation-status').textContent='正在翻译…';
 try{const r=await api.translate({text,source:$('source-language').value,target:$('target-language').value});if(token!==translationSerial)return;$('translation-output').value=r.text;$('translation-copy').disabled=false;$('translation-status').textContent=r.provider+' · '+r.model+' · '+(r.elapsedMs/1000).toFixed(1)+' 秒'+(r.truncated?' · 输出达到长度限制，译文可能不完整':'');}
 catch(e){if(token===translationSerial)$('translation-status').textContent=e.message;}
 finally{if(token===translationSerial){translating=false;$('translate-run').disabled=false;$('translate-cancel').hidden=true;}}
};
$('translate-cancel').onclick=()=>{invalidateTranslation();$('translation-status').textContent='已取消';};
$('translation-copy').onclick=()=>safe(async()=>{await copyOutput('translation-output');notice('译文已复制');});
$('test-provider').onclick=async()=>{
 $('test-provider').disabled=true;$('test-cancel').hidden=false;$('test-state').textContent='正在测试已保存的配置…';
 try{const r=await api.testProvider(editing||providerData.active);$('test-state').textContent='连接成功 · '+r.provider+' / '+r.model+' · '+r.elapsedMs+' ms';}
 catch(e){$('test-state').textContent=e.message;}
 finally{$('test-provider').disabled=false;$('test-cancel').hidden=true;}
};
$('test-cancel').onclick=()=>safe(()=>api.cancelModel('test'));

let pluginDraft=null, draftRequirement=null, builderBusy='', builderSerial=0, installedDraft=null;
let textRunSerial=0;
const stepNames={trim:'去掉全文首尾空白',trimLines:'去掉每行首尾空白',removeEmptyLines:'删除空白行',uniqueLines:'按整行去重，保留首次出现',sortLines:'按字符编码升序排列各行',upper:'转换为大写',lower:'转换为小写'};
function accessNote(spec){
 const step=spec.steps[0];
 if(step?.op==='script'){
  const permissions=[];
  if(step.domains.length)permissions.push('联网域名：'+step.domains.join('、'));
  if(step.browserDomains?.length)permissions.push('浏览器可打开：'+step.browserDomains.join('、'));
  const network=permissions.length?permissions.join('。')+'。输入可能发送至这些网站。':'JavaScript 插件 · 本机运行。';
  const capabilities=(spec.permissions||[]).map(key=>window.pluginCapabilities.permissions[key]);
  return network+(capabilities.length?' 已声明：'+capabilities.join('、')+'。':'')+(spec.permissions?.includes('timers')?' 隐藏窗口后继续计时；完全退出或电脑休眠期间不会提醒，重新运行或唤醒后检查到期任务。':'');
 }
 return spec.steps.some(s=>s.op==='ai')?'运行时将文本发送至当前启用的模型服务，可能产生费用。仅处理文字，无文件操作权限。':'在本机处理文字，无需联网，不读取或修改电脑文件。';
}
function renderPluginFields(container,spec,values={},changed=()=>{}){
 container.replaceChildren();
 for(const field of spec.settings||[]){
  const label=document.createElement('label'),caption=document.createElement('span');caption.textContent=field.label;
  const input=document.createElement(field.type==='select'?'select':'input');input.dataset.setting=field.key;input.setAttribute('aria-label',field.label);
  if(field.type==='select')field.options.forEach(value=>input.add(new Option(value,value)));
  else input.type=field.type==='checkbox'?'checkbox':field.type==='number'?'number':'text';
  if(field.type==='number'){input.min=field.min;input.max=field.max;input.step='any';}
  if(field.type==='text')input.maxLength=1000;
  const value=Object.hasOwn(values,field.key)?values[field.key]:field.default;
  if(field.type==='checkbox'){input.checked=value;label.className='plugin-option-toggle';label.append(input,caption);}
  else{input.value=value;label.append(caption,input);}
  input.oninput=changed;container.append(label);
 }
}
function readPluginFields(container,spec){
 const values={};
 for(const field of spec.settings||[]){const input=container.querySelector('[data-setting="'+field.key+'"]');
  values[field.key]=field.type==='checkbox'?input.checked:field.type==='number'?(input.value.trim()?Number(input.value):NaN):input.value;
 }
 return window.pluginCapabilities.values(spec.settings,values);
}
async function loadPluginSettings(plugin){
 const serial=++formSerial;formLoading=true;$('text-plugin-run').disabled=true;$('plugin-settings').replaceChildren();$('plugin-timers').replaceChildren();
 try{
  const values=plugin.spec.settings?.length?await api.pluginOptions(plugin.id):{};
  if(mode!==plugin.id||serial!==formSerial)return;
  renderPluginFields($('plugin-settings'),plugin.spec,values,()=>stopTextRun());
  await refreshPluginTimers();
 }finally{if(mode===plugin.id&&serial===formSerial){formLoading=false;$('text-plugin-run').disabled=false;}}
}
function renderTimerList(container,tasks){
 container.replaceChildren();if(!tasks.length)return;
 const heading=document.createElement('h3');heading.textContent='计时与提醒';container.append(heading);
 const visible=[...tasks.filter(task=>task.status==='pending').sort((a,b)=>a.deadline-b.deadline),...tasks.filter(task=>task.status!=='pending').slice(-5).reverse()];
 for(const task of visible){
  const row=document.createElement('div');row.className='timer-row';row.dataset.timer=task.id;
  const text=document.createElement('span'),seconds=Math.max(0,Math.ceil((task.deadline-Date.now())/1000));
  const duration=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
  text.textContent=task.name+' · '+task.request.title+' · '+(task.status==='pending'?duration:task.status==='cancelled'?'已取消':'已到时')+(task.error?' · '+task.error:'');row.append(text);
  if(task.status==='pending'){const cancel=document.createElement('button');cancel.textContent='取消计时';cancel.onclick=()=>safe(async()=>{await api.cancelPluginTimer(task.id);await refreshPluginTimers();});row.append(cancel);}
  container.append(row);
 }
}
async function refreshPluginTimers(){
 const current=mode,token=pluginDraft?.token;
 if(current!=='settings'&&current!=='builder'&&!plugins.find(p=>p.id===current)?.spec?.permissions?.includes('timers'))return;
 const data=await api.pluginTimers();if(current!==mode)return;
 if(current==='settings'){
  let container=$('all-plugin-timers');if(!container){container=document.createElement('div');container.id='all-plugin-timers';$('general-panel').append(container);}
  renderTimerList(container,data.items);
 }else if(current==='builder'&&token===pluginDraft?.token)renderTimerList($('trial-timers'),data.items.filter(task=>task.owner==='draft:'+token));
 else renderTimerList($('plugin-timers'),data.items.filter(task=>task.owner===current));
 if(data.error)notice(data.error);
}
setInterval(()=>{if(!document.hidden)refreshPluginTimers().catch(()=>{});},1000);
function addTextPlugin(item){
 if(item.enabled===false)return;
 if(plugins.some(p=>p.id===item.id))return;
 plugins.push({id:item.id,name:item.name,icon:'plugin',keys:item.keywords.map(k=>k.trim().toLowerCase()),hint:item.settings?.length?'可填写补充内容，或直接使用下方设置…':'输入要处理的文字…',spec:item});
 state[item.id]??='';
}
async function builderProvider(){const data=await api.providers(),p=data.items.find(p=>p.id===data.active);$('builder-provider').textContent=p?'点击生成后，将需求发送至 '+p.name+' · '+p.model+'，可能产生 API 费用。':'请先在设置中保存并启用模型服务。';}
function builderControls(){
 $('builder-generate').disabled=!!builderBusy;
 $('builder-trial').disabled=!!builderBusy||!pluginDraft;
 $('builder-install').disabled=!!builderBusy||!pluginDraft?.tested||!!installedDraft;
 $('builder-sample').disabled=builderBusy==='install';
 $('builder-cancel').hidden=!builderBusy||builderBusy==='install';
 $('builder-plugin-settings').querySelectorAll('input,select').forEach(input=>input.disabled=!!builderBusy);
}
function invalidateDraft(){
 if(builderBusy==='install')return;
 builderSerial++;builderBusy='';pluginDraft=null;installedDraft=null;draftRequirement=null;
 $('builder-preview').hidden=true;$('builder-open').hidden=true;$('builder-output').value='';
 $('builder-status').textContent='';$('trial-status').textContent='';
 api.discardPluginDraft().catch(e=>notice(e.message));builderControls();
}
function cancelBuilder(){
 if(builderBusy==='install')return;
 if(builderBusy==='generate'){invalidateDraft();$('builder-status').textContent='已取消生成';}
 else if(builderBusy==='trial'){
  builderSerial++;builderBusy='';if(pluginDraft)pluginDraft.tested=false;
  api.cancelModel('plugin').catch(()=>{});$('trial-status').textContent='已取消试运行';builderControls();
 }
}
function showDraft(){
 const spec=pluginDraft.spec;
 $('network-consent').checked=false;$('network-consent-row').hidden=!spec.steps[0]?.domains?.length;
 $('browser-consent').checked=false;$('browser-consent-row').hidden=!spec.steps[0]?.browserDomains?.length;
 $('capability-consent').checked=false;$('capability-consent-row').hidden=!spec.permissions?.length;
 $('capability-consent-label').textContent='允许此插件使用：'+(spec.permissions||[]).map(key=>window.pluginCapabilities.permissions[key]).join('、')+'。试运行会实际生效，安装后沿用授权。';
 renderPluginFields($('builder-plugin-settings'),spec,{},()=>{if(pluginDraft)pluginDraft.tested=false;builderControls();});$('trial-timers').replaceChildren();
 $('builder-preview').hidden=false;$('draft-name').textContent=spec.name;
 $('draft-description').textContent=spec.description;$('draft-keywords').textContent='关键词：'+spec.keywords.join(' · ')+'。'+matchingRules.matchingSummary(spec);
 $('draft-access').textContent=accessNote(spec);$('draft-steps').replaceChildren();
 for(const step of spec.steps){
  const li=document.createElement('li');
  li.textContent=step.op==='script'?'运行 AI 编写的 JavaScript，可展开下方配置查看完整代码':stepNames[step.op]||(step.op==='replace'?'将 '+JSON.stringify(step.find)+' 全部替换为 '+JSON.stringify(step.replacement):step.op==='ai'?'调用模型：'+step.prompt:(step.op==='prefix'?'全文开头添加：':'全文结尾添加：')+JSON.stringify(step.text));
  $('draft-steps').append(li);
 }
 $('draft-json').textContent=JSON.stringify(spec,null,2);$('builder-sample').value=spec.sample;
 $('builder-output').value='';$('trial-status').textContent='检查步骤后，使用样例试运行。';
}
$('builder-generate').onclick=async()=>{
 if(builderBusy)return;
 const requirement=$('query').value;
 if(!requirement.trim()){notice('请在顶部描述想要的文本插件');return;}
 invalidateDraft();draftRequirement=requirement;
 const token=++builderSerial;builderBusy='generate';builderControls();$('builder-status').textContent='正在生成插件预览…';
 try{
  const result=await api.generateTextPlugin(requirement);
  if(token!==builderSerial)return;
  pluginDraft={...result,tested:false};showDraft();$('builder-status').textContent='预览已就绪，试运行通过后即可安装。';
 }catch(e){if(token===builderSerial)$('builder-status').textContent=e.message;}
 finally{if(token===builderSerial){builderBusy='';builderControls();}}
};
$('builder-cancel').onclick=cancelBuilder;
$('builder-settings').onclick=()=>{setMode('settings');settingsTab('api');};
$('builder-sample').oninput=()=>{
 if(builderBusy==='trial')cancelBuilder();
 if(pluginDraft)pluginDraft.tested=false;
 $('builder-output').value='';$('trial-status').textContent='样例已修改，请重新试运行。';builderControls();
};
$('builder-trial').onclick=async()=>{
 if(builderBusy||!pluginDraft)return;
 const token=++builderSerial;builderBusy='trial';pluginDraft.tested=false;builderControls();
 $('builder-output').value='';$('trial-status').textContent='正在试运行…';
 try{
  const result=await api.trialTextPlugin({token:pluginDraft.token,text:$('builder-sample').value,options:readPluginFields($('builder-plugin-settings'),pluginDraft.spec),allowNetwork:$('network-consent').checked,allowBrowser:$('browser-consent').checked,allowCapabilities:$('capability-consent').checked});
  if(token!==builderSerial)return;
  $('builder-output').value=result;pluginDraft.tested=true;await refreshPluginTimers();
  $('trial-status').textContent=result?'运行完成，请检查结果是否符合预期，然后点击安装。':'运行完成，结果为空。请确认符合预期后再安装。';
 }catch(e){if(token===builderSerial)$('trial-status').textContent=e.message;}
 finally{if(token===builderSerial){builderBusy='';builderControls();}}
};
$('builder-install').onclick=async()=>{
 if(builderBusy||!pluginDraft?.tested||installedDraft)return;
 builderBusy='install';builderControls();$('query').disabled=true;
 try{
  const item=await api.installTextPlugin(pluginDraft.token);
  installedDraft=item;addTextPlugin(item);drawPlugins();$('builder-open').hidden=false;
  $('trial-status').textContent='已安装到插件栏，重启后仍可使用。';
 }catch(e){$('trial-status').textContent=e.message;}
 finally{builderBusy='';$('query').disabled=mode==='settings';builderControls();}
};
$('builder-open').onclick=()=>{
 if(!installedDraft)return;
 // Opening from the builder carries the tested text, rather than the plugin requirement.
 setMode(installedDraft.id,$('builder-sample').value);
};
function stopTextRun(){
 textRunSerial++;api.cancelModel('plugin').catch(()=>{});
 $('text-plugin-run').disabled=formLoading;$('text-plugin-cancel').hidden=true;
 $('text-plugin-output').value='';$('text-plugin-status').textContent='';$('text-plugin-copy').disabled=true;
}
$('text-plugin-run').onclick=async()=>{
 const item=plugins.find(p=>p.id===mode);if(!item?.spec||$('text-plugin-run').disabled)return;
 const token=++textRunSerial;$('text-plugin-run').disabled=true;$('text-plugin-cancel').hidden=false;
 $('text-plugin-output').value='';$('text-plugin-copy').disabled=true;$('text-plugin-status').textContent='正在运行…';
 try{
  const output=await api.runTextPlugin({id:item.id,text:$('query').value,options:readPluginFields($('plugin-settings'),item.spec)});
  if(token!==textRunSerial)return;
  $('text-plugin-output').value=output;$('text-plugin-copy').disabled=!output;$('text-plugin-status').textContent=output?'处理完成':'处理完成，结果为空。';await refreshPluginTimers();
 }catch(e){if(token===textRunSerial)$('text-plugin-status').textContent=e.message;}
 finally{if(token===textRunSerial){$('text-plugin-run').disabled=false;$('text-plugin-cancel').hidden=true;}}
};
$('text-plugin-cancel').onclick=()=>{stopTextRun();$('text-plugin-status').textContent='已取消运行';};
$('text-plugin-copy').onclick=()=>safe(async()=>{await copyOutput('text-plugin-output');notice('结果已复制');});
api.textPlugins().then(data=>{data.items.forEach(addTextPlugin);drawPlugins();if(data.warnings.length)notice(data.warnings.join(' '));}).catch(e=>notice(e.message));

for(const id of ['network-consent','browser-consent','capability-consent'])$(id).onchange=()=>{
 if(builderBusy==='trial')cancelBuilder();
 if(pluginDraft)pluginDraft.tested=false;
 builderControls();
};

async function copyOutput(id){
 try{return await api.copyText($(id).value);}catch(error){$(id).focus();$(id).select();throw error;}
}
function syncPlugins(data){
 for(let i=plugins.length-1;i>=0;i--)if(plugins[i].spec)plugins.splice(i,1);
 data.items.forEach(addTextPlugin);drawPlugins();
}
async function loadManagedPlugins(){
 const data=await api.textPlugins();syncPlugins(data);$('managed-plugins').replaceChildren();
 if(!$('ranking-controls')){
  const controls=document.createElement('div');controls.id='ranking-controls';controls.className='card';
  const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.id='learn-plugin-ranking';toggle.checked=rankingPrefs.enabled;
  label.append(toggle,' 根据我的选择调整同等匹配的插件排序');
  const hint=document.createElement('p');hint.textContent='只在本机记录插件选择次数和输入类型，不保存输入内容。匹配只影响推荐，点击后才进入插件。';
  const reset=document.createElement('button');reset.id='reset-plugin-ranking';reset.textContent='清除排序习惯';
  toggle.onchange=()=>{rankingPrefs.enabled=toggle.checked;saveRanking();drawPlugins();};
  reset.onclick=()=>{rankingPrefs.history={};saveRanking();drawPlugins();notice('已清除排序习惯，优先推荐设置保留。');};
  controls.append(label,hint,reset);$('managed-plugins').before(controls);
 }
 if(!data.items.length)$('managed-plugins').textContent='尚未安装自定义插件。';
 for(const item of data.items){
  const card=document.createElement('div');card.className='card';
  const title=document.createElement('h3');setIconLabel(title,'plugin',item.name+(item.enabled?' · 已启用':' · 已停用'));card.append(title);
  const description=document.createElement('p');description.textContent=item.description;card.append(description);
  if(item.permissions?.length){
   const section=document.createElement('details'),title=document.createElement('summary');section.className='matching-editor';title.textContent='管理能力授权';section.append(title);
   const controls=[];
   for(const permission of item.permissions){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.value=permission;check.checked=(item.grantedPermissions||item.permissions).includes(permission);controls.push(check);label.append(check,window.pluginCapabilities.permissions[permission]);section.append(label);}
   const save=document.createElement('button');save.textContent='保存授权';save.onclick=()=>safe(async()=>{save.disabled=true;try{await api.setPluginGrants(item.id,controls.filter(c=>c.checked).map(c=>c.value));await loadManagedPlugins();notice('授权已更新');}finally{save.disabled=false;}});section.append(save);card.append(section);
   if(item.permissions.includes('storage')){const clear=document.createElement('button');clear.textContent='清空插件数据';clear.onclick=()=>safe(async()=>{if(confirm('清空「'+item.name+'」保存的数据？此操作不可撤销，插件本身保留。')){await api.clearPluginData(item.id);notice('插件数据已清空');}});card.append(clear);}
  }
  const matchInfo=document.createElement('p');matchInfo.textContent=matchingRules.matchingSummary(item);card.append(matchInfo);
  const favorite=document.createElement('button');favorite.textContent=rankingPrefs.favorites.includes(item.id)?'取消优先推荐':'优先推荐';
  favorite.onclick=()=>{rankingPrefs.favorites=rankingPrefs.favorites.includes(item.id)?rankingPrefs.favorites.filter(id=>id!==item.id):[...rankingPrefs.favorites,item.id];saveRanking();safe(loadManagedPlugins);};card.append(favorite);
  const matchingEditor=document.createElement('details'),matchingTitle=document.createElement('summary');matchingEditor.className='matching-editor';matchingTitle.textContent='调整匹配方式';matchingEditor.append(matchingTitle);
  const category=document.createElement('select');category.setAttribute('aria-label','功能类别');
  for(const [value,label] of Object.entries(matchingRules.categories))category.add(new Option(label,value));category.value=item.matching.category;
  const checks=[];matchingEditor.append(category);
  for(const [value,label] of Object.entries(matchingRules.formats)){
   const wrapper=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.value=value;check.checked=item.matching.accepts.includes(value);checks.push(check);wrapper.append(check,label);matchingEditor.append(wrapper);
  }
  const saveMatch=document.createElement('button');saveMatch.textContent='保存匹配方式';
  saveMatch.onclick=()=>safe(async()=>{saveMatch.disabled=true;try{await api.setPluginMatching(item.id,{...item.matching,category:category.value,accepts:checks.filter(check=>check.checked).map(check=>check.value)});await loadManagedPlugins();notice('匹配方式已保存');}finally{saveMatch.disabled=false;}});
  const hint=document.createElement('p');hint.textContent='不勾选输入类型时，仅通过关键词或明确指令推荐。普通文字也包括网址、数字等文本；如需专用匹配，请只勾选对应类型。';matchingEditor.append(hint,saveMatch);card.append(matchingEditor);
  for(const [label,action] of [[item.enabled?'停用':'启用',item.enabled?'disable':'enable'],['卸载','delete']]){
   const button=document.createElement('button');
   setIconLabel(button, { disable: 'pause', enable: 'check', delete: 'trash' }[action], label);
   button.onclick=()=>safe(async()=>{if(action==='delete'&&!confirm('卸载「'+item.name+'」？此操作删除插件配置。'))return;button.disabled=true;try{await api.managePlugin(item.id,action);if(action==='delete'&&installedDraft?.id===item.id)invalidateDraft();await loadManagedPlugins();}finally{button.disabled=false;}});card.append(button);
  }
  const details=document.createElement('details'),summary=document.createElement('summary'),code=document.createElement('pre');summary.textContent='查看代码与联网范围';code.textContent=JSON.stringify(item,null,2);details.append(summary,code);card.append(details);$('managed-plugins').append(card);
 }
}
$('tab-plugins').onclick=()=>settingsTab('plugins');
let renameLoaded=false,renameToken=null,renameSerial=0,folderSerial=0,renameReading=false,renameApplying=false;
function invalidateRename(){
 if(renameApplying)return;
 renameSerial++;renameToken=null;$('rename-accept').disabled=true;$('rename-reject').disabled=true;$('rename-rows').replaceChildren();$('rename-python').textContent='';$('rename-status').textContent='';$('rename-preview').disabled=renameReading;api.discardRename().catch(()=>{});
}
async function readRenameFolder(directory){
 const serial=++folderSerial;renameReading=true;invalidateRename();let data;
 try{data=await api.renameFolder(directory);}finally{if(serial===folderSerial){renameReading=false;$('rename-preview').disabled=false;}}
 if(serial!==folderSerial)return;renameLoaded=true;
 $('rename-path').textContent=data.directory;$('rename-files').textContent=data.files.map(f=>(f.type==='file'?'文件  ':'目录/链接  ')+f.name).join('\n');
 $('rename-status').textContent='已读取 '+data.files.length+' 个项目，仅预览当前层级的普通文件。';
}
async function loadOpenFolders(){
 renameLoaded=false;$('rename-path').textContent='';$('rename-files').textContent='';const serial=++folderSerial;const directories=await api.openFolders();if(serial!==folderSerial)return;$('rename-folders').replaceChildren(new Option('请选择文件夹',''));
 directories.forEach(directory=>$('rename-folders').append(new Option(directory,directory)));
 if(directories.length===1){$('rename-folders').value=directories[0];await readRenameFolder(directories[0]);}
 else $('rename-status').textContent=directories.length?'检测到多个文件夹，请选择目标。':'未检测到可读取的资源管理器目录，可使用“选择文件夹”。';
}
$('rename-detect').onclick=()=>safe(async()=>{invalidateRename();await loadOpenFolders();});
$('rename-choose').onclick=()=>safe(async()=>{folderSerial++;const directory=await api.chooseRenameFolder();if(!directory)return;$('rename-folders').append(new Option(directory,directory));$('rename-folders').value=directory;await readRenameFolder(directory);});
$('rename-folders').onchange=()=>safe(()=>readRenameFolder($('rename-folders').value));
$('rename-preview').onclick=async()=>{
 invalidateRename();const serial=renameSerial;$('rename-preview').disabled=true;$('rename-status').textContent='正在理解命名要求并检查…';
 try{const plan=await api.previewRename($('query').value);if(serial!==renameSerial)return;renameToken=plan.token;
  for(const row of plan.rows){const tr=document.createElement('tr');for(const value of [row.from,row.to]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('rename-rows').append(tr);}
  $('rename-python').textContent=plan.python;$('rename-status').textContent=plan.rows.length+' 项改名，名称与冲突检查通过。Python 代码只输出同一份映射，尚未执行。';$('rename-accept').disabled=!plan.rows.length;$('rename-reject').disabled=false;
 }catch(error){if(serial===renameSerial)$('rename-status').textContent=error.message;}finally{if(serial===renameSerial)$('rename-preview').disabled=false;}
};
$('rename-cancel').onclick=()=>{invalidateRename();$('rename-status').textContent='已取消';};
$('rename-reject').onclick=()=>{invalidateRename();$('rename-status').textContent='已拒绝方案，文件未修改。';};
function lockRename(value){
 renameApplying=value;
 if(value){folderSerial++;renameReading=false;}
 for(const id of ['rename-accept','rename-reject','rename-preview','rename-cancel','rename-choose','rename-detect','rename-refresh','rename-folders'])$(id).disabled=value;
 $('query').disabled=value||mode==='settings';
 if(!value){$('rename-accept').disabled=true;$('rename-reject').disabled=true;}
}
async function loadRenameHistory(){
 const records=await api.renameHistory();$('rename-history').replaceChildren();
 for(const record of records){
  const card=document.createElement('div');card.className='card';
  const label=document.createElement('p');label.textContent=record.root+' · '+record.count+' 个文件 · '+({completed:'已完成',restored:'已恢复',executing:'执行中断',restoring:'恢复中断','needs-recovery':'需要恢复'}[record.status]||record.status);card.append(label);
  if(record.status!=='restored'){
   const button=document.createElement('button');
   setIconLabel(button, 'undo', record.status==='completed'?'撤销改名':'恢复原名称');
   button.disabled=renameApplying;
   button.onclick=()=>safe(async()=>{if(renameApplying)return;button.disabled=true;lockRename(true);$('rename-status').textContent='正在恢复原名称…';try{await api.restoreRename(record.id);$('rename-status').textContent='已恢复原名称。';}catch(error){$('rename-status').textContent=error.message;}finally{renameLoaded=false;renameToken=null;lockRename(false);await loadRenameHistory();}});card.append(button);
  }
  $('rename-history').append(card);
 }
}
$('rename-history-refresh').onclick=()=>safe(loadRenameHistory);
$('rename-refresh').onclick=()=>safe(()=>readRenameFolder($('rename-folders').value));
$('rename-accept').onclick=async()=>{
 if(renameApplying||!renameToken)return;
 const token=renameToken;renameToken=null;lockRename(true);$('rename-status').textContent='正在检查并执行改名…';
 try{const result=await api.acceptRename(token);$('rename-status').textContent='已完成 '+result.count+' 项重命名，可在下方撤销。';}
 catch(error){$('rename-status').textContent=error.message;}
 finally{renameLoaded=false;$('rename-files').textContent='请刷新当前目录以查看最新文件名。';lockRename(false);safe(loadRenameHistory);}
};

async function loadStartupSettings(){
 const result=await api.startupSettings();
 $('launch-at-login').checked=result.enabled;$('launch-at-login').disabled=!result.supported;
 $('startup-state').textContent=!result.supported?'此功能目前支持 Windows。':result.registered&&!result.enabled?'此启动项已被 Windows 停用，可重新打开开关启用。':'';
 await loadPluginFileHistory();
}
async function loadPluginFileHistory(){
 let section=$('plugin-file-history');if(!section){section=document.createElement('div');section.id='plugin-file-history';$('general-panel').append(section);}
 const records=await api.pluginFileHistory();section.replaceChildren();if(!records.length)return;
 const title=document.createElement('h3');title.textContent='插件文件修改与恢复';section.append(title);
 for(const record of records){const row=document.createElement('div');row.className='timer-row';const text=document.createElement('span');text.textContent=record.name+' · '+record.count+' 个文件 · '+({completed:'已修改',restored:'已恢复',executing:'执行中断','needs-recovery':'需要检查'}[record.status]||record.status);row.append(text);
  if(record.status!=='restored'){const restore=document.createElement('button');restore.textContent='恢复原文件';restore.onclick=()=>safe(async()=>{restore.disabled=true;try{await api.restorePluginFiles(record.id);await loadPluginFileHistory();notice('原文件已恢复');}finally{restore.disabled=false;}});row.append(restore);}section.append(row);
 }
}
$('tab-general').onclick=()=>settingsTab('general');
$('launch-at-login').onchange=async()=>{
 const checkbox=$('launch-at-login');checkbox.disabled=true;$('startup-state').textContent='正在更新…';
 try{const result=await api.setStartup(checkbox.checked);checkbox.checked=result.enabled;$('startup-state').textContent=result.enabled?'已开启，下次登录时自动运行。':'已关闭开机自启。';}
 catch(error){try{checkbox.checked=(await api.startupSettings()).enabled;}catch{}$('startup-state').textContent=error.message;}
 finally{checkbox.disabled=false;}
};
