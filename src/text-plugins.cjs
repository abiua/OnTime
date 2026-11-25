const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const matching = require('./plugin-intents.js');
const capabilities = require('./plugin-capabilities.js');

const MAX_TEXT = 12000;
const MAX_OUTPUT = 100000;
const MAX_FILE = 64000;
const ID = /^text-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const operations = {
  trim: [], trimLines: [], removeEmptyLines: [], uniqueLines: [],
  sortLines: [], upper: [], lower: [],
  replace: ['find', 'replacement'], prefix: ['text'], suffix: ['text'], ai: ['prompt'], script: ['source','domains']
};
const validDomains = domains => Array.isArray(domains) && domains.length <= 8 && domains.every(domain =>
  typeof domain === 'string' && domain.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain));
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !fields.includes(k)) || fields.some(k => !Object.hasOwn(value, k))) {
    throw Error('插件格式不正确或含有不支持的字段，请重新生成');
  }
}
function string(value, min, max, label, allowWhitespace = false) {
  if (typeof value !== 'string' || value.length < min || value.length > max || (min && !allowWhitespace && !value.trim())) {
    throw Error(label + '长度或格式无效');
  }
}
function validate(spec) {
  object(spec, ['schemaVersion', 'name', 'description', 'keywords', 'steps', 'sample', ...['matching','permissions','settings'].filter(key=>spec&&Object.hasOwn(spec,key))]);
  if (spec.schemaVersion !== 1) throw Error('不支持此插件版本');
  string(spec.name, 1, 32, '名称');
  string(spec.description, 1, 300, '说明');
  string(spec.sample, 0, 2000, '示例');
  if (!Array.isArray(spec.keywords) || !spec.keywords.length || spec.keywords.length > 6) throw Error('关键词须为 1 至 6 个');
  spec.keywords.forEach(k => string(k, 1, 24, '关键词'));
  if(Object.hasOwn(spec,'matching') && !matching.validMatching(spec.matching))throw Error('插件匹配声明无效，请检查输入类型与长度范围');
  capabilities.validatePermissions(spec.permissions);
  capabilities.validateFields(spec.settings);
  if (!Array.isArray(spec.steps) || !spec.steps.length || spec.steps.length > 12) throw Error('处理步骤须为 1 至 12 步');
  let aiCount = 0;
  for (const step of spec.steps) {
    if (typeof step?.op !== 'string' || !Object.hasOwn(operations, step.op)) throw Error('插件包含不支持的操作');
    const optional = step.op === 'script' && Object.hasOwn(step, 'browserDomains') ? ['browserDomains'] : [];
    object(step, ['op', ...operations[step.op], ...optional]);
    if(step.op==='script') {
      string(step.source,1,20000,'JavaScript');
      if(spec.steps.length!==1||!validDomains(step.domains))throw Error('脚本联网范围无效');
      if(optional.length&&!validDomains(step.browserDomains))throw Error('浏览器打开范围无效');
      continue;
    }
    for (const field of operations[step.op]) {
      string(step[field], ['find', 'prompt'].includes(field) ? 1 : 0, field === 'prompt' ? 4000 : 1000, '步骤参数', field === 'find');
    }
    if (step.op === 'ai' && ++aiCount > 1) throw Error('首版每次运行最多调用一次模型');
  }
  if((spec.permissions?.length||spec.settings?.length)&&spec.steps[0].op!=='script')throw Error('设置界面和宿主能力须由 JavaScript 插件使用');
  const normalized={...spec,matching:spec.matching || matching.inferMatching(spec)};
  if (Buffer.byteLength(JSON.stringify(normalized, null, 2), 'utf8') > MAX_FILE) throw Error('插件配置过大，请简化需求');
  return JSON.parse(JSON.stringify(normalized));
}
function parseGenerated(text) {
  string(text, 1, MAX_FILE, '模型响应');
  const raw = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  let spec;
  try { spec = JSON.parse(raw); } catch { throw Error('模型没有返回有效的插件配置，请重新生成'); }
  if (typeof spec?.unsupported === 'string') {
    object(spec, ['unsupported']);
    const reason = spec.unsupported.trim().replace(/\s+/g, ' ').slice(0, 240);
    throw Error(['模型判断此需求暂不支持。', reason, '插件支持设置界面、文件读写与改名、剪贴板、独立存储、联网、窗口切换、计时和提醒；暂不执行任意脚本或修改系统。'].filter(Boolean).join('\n'));
  }
  return validate(spec);
}
function limited(text) {
  if (typeof text !== 'string' || text.length > MAX_OUTPUT) throw Error('结果超过 100000 字符，已停止处理');
  return text;
}
async function execute(spec, input, ai) {
  spec = validate(spec);
  string(input, 1, MAX_TEXT, '输入（1 至 12000 字符）', true);
  let text = input;
  for (const step of spec.steps) {
    const lines = () => text.split(/\r\n|\r|\n/);
    switch (step.op) {
      case 'script': throw Error('JavaScript 插件需要独立运行环境');
      case 'trim': text = text.trim(); break;
      case 'trimLines': text = lines().map(s => s.trim()).join('\n'); break;
      case 'removeEmptyLines': text = lines().filter(s => s.trim()).join('\n'); break;
      case 'uniqueLines': text = [...new Set(lines())].join('\n'); break;
      case 'sortLines': text = lines().sort().join('\n'); break;
      case 'upper': text = text.toUpperCase(); break;
      case 'lower': text = text.toLowerCase(); break;
      case 'replace': {
        const parts = text.split(step.find);
        if (text.length + (parts.length - 1) * (step.replacement.length - step.find.length) > MAX_OUTPUT) throw Error('替换结果过长，已停止处理');
        text = parts.join(step.replacement); break;
      }
      case 'prefix': text = step.text + text; break;
      case 'suffix': text += step.text; break;
      case 'ai':
        if (!ai) throw Error('请先配置模型服务');
        if (text.length > MAX_TEXT) throw Error('模型输入超过 12000 字符，请减少内容');
        text = await ai(step.prompt, text); break;
    }
    limited(text);
  }
  return text;
}

class PluginStore {
  constructor(directory) { this.directory = directory; this.items = new Map(); this.warnings = []; this.saving = false; }
  async load() {
    await fs.mkdir(this.directory, { recursive: true });
    this.items.clear(); this.warnings = [];
    const files = await fs.readdir(this.directory, { withFileTypes: true });
    for (const file of files) {
      if (!file.name.endsWith('.json')) continue;
      try {
        const id = file.name.slice(0, -5);
        if (!file.isFile() || !ID.test(id) || this.items.size >= 100) throw Error('文件不受支持');
        const filename = path.join(this.directory, file.name);
        if ((await fs.stat(filename)).size > MAX_FILE) throw Error('文件过大');
        const original = await fs.readFile(filename, 'utf8');
        const raw = JSON.parse(original), spec = validate(raw);
        if(!Object.hasOwn(raw,'matching')) {
          try {
            // Keep the original bytes for recovery. Never overwrite an earlier backup.
            await fs.writeFile(filename+'.pre-matching',original,{encoding:'utf8',flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
            await this.write(id,spec);
          } catch { this.warnings.push('「'+spec.name+'」已临时补齐匹配方式，但无法保存；原插件仍可使用，下次启动会重试。'); }
        }
        this.items.set(id, { id, ...spec });
      } catch { this.warnings.push('一个插件无法加载，可能损坏或版本不兼容；原文件已保留。'); }
    }
    return this.list();
  }
  list() { return { items: [...this.items.values()], warnings: this.warnings }; }
  get(id) {
    const item = this.items.get(id);
    if (!item) throw Error('插件不存在，请返回首页重新选择');
    const { id: _id, ...spec } = item;
    return spec;
  }
  async remove(id) {
    this.get(id);
    await fs.unlink(path.join(this.directory,id+'.json'));
    this.items.delete(id);
    await fs.unlink(path.join(this.directory,id+'.json.pre-matching')).catch(()=>{});
  }
  async write(id, spec) {
    const filename=path.join(this.directory,id+'.json'), temp=filename+'.'+randomUUID()+'.tmp';
    try {
      await fs.writeFile(temp,JSON.stringify(spec,null,2),{encoding:'utf8',flag:'wx'});
      await fs.rename(temp,filename);
    } finally { await fs.unlink(temp).catch(()=>{}); }
  }
  async updateMatching(id, value) {
    const spec=validate({...this.get(id),matching:value});
    await this.write(id,spec);
    const item={id,...spec};this.items.set(id,item);return item;
  }
  async install(spec) {
    spec = validate(spec);
    if (this.saving) throw Error('正在安装，请稍候');
    if (this.items.size >= 100) throw Error('首版最多安装 100 个插件');
    if ([...this.items.values()].some(p => p.name.trim().toLowerCase() === spec.name.trim().toLowerCase())) throw Error('已有同名插件，请在需求中指定其他名称后重新生成');
    this.saving = true;
    const id = 'text-' + randomUUID();
    const filename = path.join(this.directory, id + '.json');
    const temp = filename + '.tmp';
    try {
      await fs.mkdir(this.directory, { recursive: true });
      // Samples and user inputs are not stored with installed plugins.
      const installed = { ...spec, sample: '' };
      await fs.writeFile(temp, JSON.stringify(installed, null, 2), { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temp, filename);
      const item = { id, ...installed };
      this.items.set(id, item);
      return item;
    } finally { await fs.unlink(temp).catch(() => {}); this.saving = false; }
  }
}

const scriptPrompt = `Create a reusable OnTime JavaScript plugin implementing the user's request. Return ONLY JSON with schemaVersion:1, name (32 chars), description (300 chars, explain input), keywords (1-6), sample (synthetic input), steps:[{op:"script",source:"async function run(input, api) { ... }",domains:[],browserDomains:[]}]. Implement arbitrary JavaScript logic in source, maximum 20000 characters. run returns a string. The host runs this in an isolated browser renderer. api.get(httpsUrl) returns response TEXT, so use JSON.parse when needed. List exact lowercase hostnames in domains, user approves these before trial and installation. Up to 8 GET requests, response 512KB, run deadline 20 seconds. api.openUrl(httpsUrl) requests opening one HTTPS page in the Windows default browser after the script succeeds. Declare its exact hostname in browserDomains. This permission is separate from domains for api.get. For Google search, implement async function run(input, api) { const query = input.trim(); if (!query) throw Error("请输入搜索内容"); await api.openUrl("https://www.google.com/search?q=" + encodeURIComponent(query)); return "已在默认浏览器打开 Google 搜索"; }. Use browserDomains:["www.google.com"], domains:[], a synthetic sample, and honor a requested name such as 谷歌快搜. A request to search with a search engine and open the results in the default browser is supported. Use the named search engine and never fetch its results in place of opening the browser. No direct fetch, Node, process, file access, modules or external script imports. Use built-in JavaScript to calculate, parse, transform and format. Do not reject a task merely because it needs custom logic or public network data. Describe missing capabilities precisely only if genuinely necessary. Never invent live data. For weather, use https://geocoding-api.open-meteo.com/v1/search?name=...&count=1&language=zh then https://api.open-meteo.com/v1/forecast with latitude, longitude, daily=weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=3. Input is a city name, sample 北京. Handle missing results. Show resolved city, dates, temperatures and precipitation and attribute Open-Meteo https://open-meteo.com/ and GeoNames. Near-future weather means three days including today unless requested otherwise. Weather MUST be JavaScript via api.get, never a weather op. For purely semantic text tasks the existing single ai step with prompt is also supported. Unsupported output shape is {"unsupported":"specific explanation in user's language"}.`;
const matchingPrompt = ` Also include matching:{version:1,category,accepts,minLength:1,maxLength:12000}. category must be one of file-search, web-search, calculator, translate, rename, weather, text-transform, other. accepts is an array of zero or more supported input formats: text (any nonempty text), expression (arithmetic), url (HTTP/HTTPS URL), json (JSON object or array), multiline, number. Use calculator/expression for a calculator, web-search/text for a web search plugin, translate/text for translation, weather/text for city weather, text-transform/json for JSON formatting. For generic text tasks use text-transform/text. Use [] when only explicit plugin keywords should recommend the plugin. Do not add JavaScript or regular expressions to matching. This declaration only recommends a plugin; it never executes it.`;
const capabilityPrompt = ` HOST CAPABILITIES: The 20-second deadline limits JavaScript computation only, NOT host background timers. Countdown, Pomodoro and reminder plugins ARE supported; never reject them for needing background timing, form controls, notifications, sound or popup. Declare top-level permissions:["timers","notifications","sound","popup"] as needed. Declare optional top-level settings:[{key:"seconds",label:"倒计时（秒）",type:"number",min:1,max:2592000,default:300},{key:"notify",label:"系统通知",type:"checkbox",default:true},{key:"sound",label:"提示音",type:"checkbox",default:false},{key:"popup",label:"弹窗",type:"checkbox",default:false}]. Supported field types: number (requires min/max), checkbox, text (default string), select (options array of strings, default one of them). Up to 12 fields, each key unique ASCII identifier, each label in the user's language. The host renders controls and remembers installed plugin settings. api.settings contains validated field values. input may be empty for plugins with settings. For countdown: async function run(input,api){ const s=api.settings; const channels=[]; if(s.notify)channels.push("notification"); if(s.sound)channels.push("sound"); if(s.popup)channels.push("popup"); if(!channels.length)throw Error("请选择至少一种提醒方式"); await api.timers.start({delaySeconds:s.seconds,title:"倒计时结束",message:"设定的时间已到",channels}); return "倒计时已启动，可返回首页或隐藏窗口。"; }. Timer start supports 1 second to 30 days, one new timer per run. It is committed after successful script completion, so never await a timeout or busy-wait. api.timers.list() returns this plugin's timers. Host UI shows remaining time and cancel buttons. Timer records survive app restart; while the app is fully closed or the PC asleep alerts cannot fire until resumed. Notifications may be suppressed by OS settings; sound is the system alert tone. Preview must use the rendered settings, and it really starts a trial timer after consent. Installing or discarding a preview cancels its trial timers. Permissions are confirmed together before trial and retained on install. Use matching category other and accepts:[] for timer plugins. Do not claim unrestricted filesystem, Python, shell, arbitrary background JS or arbitrary HTML interfaces are supported. Use these host capabilities whenever they satisfy the request.`;
const commonCapabilities = ` ADDITIONAL HOST APIs (use these instead of rejecting local-file/clipboard/window/storage tasks; still no direct Node/Python/shell):
api.clipboard.readText() requires clipboardRead; api.clipboard.writeText(text) requires clipboardWrite. Text limit 200000 characters. Writes commit only after script success.
api.storage.get(key), set(key,JSONvalue), remove(key) require storage. Keys up to 80 chars, get returns null when absent, each value <=64KB, total <=128KB. Namespace is private to each installed plugin and persists across restarts. Trial storage is isolated to the current run. set/remove commit after success, and get sees staged writes within the run. Never use this for credentials.
api.remind({title,message,channels}) sends an immediate reminder after success; channels notification/sound/popup require notifications/sound/popup respectively (no timers permission needed).
api.files.pickFile() and pickFolder() require filesRead and open a native chooser once per run. They return an absolute path or null on cancel. Await the picker and handle cancellation. api.files.list(directory) returns up to 500 direct children {name,path,isDirectory,isLink}; api.files.readText(path) reads UTF-8 ordinary files <=1MB. Both require filesRead and must stay within the chosen scope. Construct child paths with folder + '/' + filename; no path module is available. api.files.writeText(path,text) requires filesWrite plus a selected file/folder and stages creation/overwrite of <=1MB UTF-8 text, max 10 different files per run. It does NOT immediately write: after script success the host shows an explicit preview; only acceptance applies the writes, preserving recoverable originals. Settings > General offers recovery. Do not read a staged write back from disk. api.files.renameBatch(directory,[{from:'old.txt',to:'new.txt'}]) stages a batch rename, requires filesWrite and a chosen folder; host previews, validates conflicts and preserves recovery. Do not combine renameBatch and writeText in one run. api.files.open(path)/reveal(path) require filesRead and a chosen scope, run after success.
api.windows.list() requires windows and returns [{id,title,app}]. api.windows.focus(id) accepts an id from that list and focuses it after success. This does not provide screen capture, keyboard/mouse injection or arbitrary system modification.
api.request({url,method:'GET'|'POST',body:'optional text',headers:{'Content-Type':'application/json'}}) returns response TEXT, use JSON.parse for JSON. Exact HTTPS hostnames must appear in step.domains. POST additionally requires networkWrite; total network calls <=8, request body <=64KB. Allowed headers: Accept, Content-Type, Authorization, X-API-Key; no host API keys or credentials are exposed. No redirects, local network or raw binary downloads. Remote POST effects cannot be rolled back and occur during script execution; explain the intended data transmission in description.
All these APIs are async: await them. Text input may be empty for clipboard/file/window tools. The 20-second execution deadline pauses for the one native file picker; user interaction and commit confirmation have a total five-minute ceiling. Declare only permissions actually used. Installation approval is followed by optional per-capability revocation in plugin management. Prefer capability combinations to task-specific refusals. Arbitrary executables, Python, command lines, software installation and system settings are explicitly out of scope.`;
module.exports = { validate, parseGenerated, execute, PluginStore, generationPrompt:scriptPrompt+matchingPrompt+capabilityPrompt+commonCapabilities };
