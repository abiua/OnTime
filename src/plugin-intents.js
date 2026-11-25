(function (root) {
  const normalize = text => text.normalize('NFKC').trim().toLowerCase();

  function isCalculation(query) {
    const text = query.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-');
    if (text.length > 160 || !/^[\d.()+*/\s-]+$/.test(text)) return false;
    // ISO-style dates and month/day/year are common filenames.
    if (/^(?:\d{4}([-\/])\d{1,2}\1\d{1,2}|\d{1,2}([-\/])\d{1,2}\2\d{4})$/.test(text)) return false;
    const tokens = text.match(/\d+(?:\.\d+)?|\.\d+|[^\s]/g) || [];
    let depth = 0, expectValue = true, hasOperator = false, signed = false;
    for (const token of tokens) {
      if (expectValue) {
        if (token === '(') { depth++; signed = false; }
        else if ((token === '-' || token === '+') && !signed) signed = true;
        else if (/^(?:\d|\.\d)/.test(token)) { expectValue = false; signed = false; }
        else return false;
      } else if (token === ')' && depth > 0) {
        depth--;
      } else if (['+', '-', '*', '/'].includes(token)) {
        hasOperator = true;
        expectValue = true;
      } else return false;
    }
    return hasOperator && !expectValue && depth === 0;
  }

  function inferIntent(query) {
    if (isCalculation(query)) return 'calculator';
    if (query.length > 160 || /[\\/]|\.[a-z\d]{1,8}$/i.test(query)) return '';
    if (/^(?:(?:请(?:帮我)?|帮我)\s*翻译|(?:翻译|译)[成为]|把.+翻译[成为]|please\s+translate\s)/.test(query)) return 'translate';
    if (/^(?:(?:请(?:帮我)?|帮我)\s*)?(?:批量(?:重命名|改名)|给.{1,50}(?:重命名|改名))/.test(query)) return 'rename';
    if (/^(?:(?:查(?:询|看)?|看|今天|明天|后天).{0,30}天气(?:预报)?|.{1,24}(?:今天|明天|后天)的?天气(?:预报)?|.{1,20}天气预报)$/.test(query)) return 'weather';
    return '';
  }

  const intentAliases = {
    calculator: /计算器|四则运算|算术表达式|\b(?:calculator|arithmetic)\b/i,
    translate: /翻译|\b(?:translate|translation)\b/i,
    rename: /重命名|批量改名|\brename\b/i,
    weather: /天气|\b(?:weather|forecast)\b/i
  };

  const categories = {
    'file-search':'文件搜索', 'web-search':'网页搜索', calculator:'计算', translate:'翻译',
    rename:'重命名', weather:'天气', 'text-transform':'文字处理', other:'其他功能'
  };
  const formats = {text:'普通文字',expression:'算式',url:'网址',json:'JSON',multiline:'多行文字',number:'数字'};
  function validMatching(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length === 5 && value.version === 1 && Object.hasOwn(categories,value.category) &&
      Array.isArray(value.accepts) && value.accepts.length <= 6 && new Set(value.accepts).size === value.accepts.length &&
      value.accepts.every(format=>Object.hasOwn(formats,format)) &&
      Number.isInteger(value.minLength) && Number.isInteger(value.maxLength) &&
      value.minLength >= 1 && value.maxLength >= value.minLength && value.maxLength <= 12000;
  }
  function preset(category, accepts) {
    return {version:1,category,accepts:accepts || (category==='calculator'?['expression']:category==='rename'?[]:['text']),minLength:1,maxLength:12000};
  }
  function inferMatching(plugin) {
    if(plugin.id==='builder')return preset('other',[]);
    if(plugin.id==='files')return preset('file-search');
    const spec=plugin.spec || plugin;
    const labels=[plugin.name,...(plugin.keys || spec.keywords || [])].join(' ');
    // Prefer names and keywords; descriptions can mention unrelated features.
    for(const text of [labels,spec.description || '']) {
      for(const [category,pattern] of Object.entries(intentAliases)) {
        if(plugin.id===category || pattern.test(text))return preset(category);
      }
      if(/(?:谷歌|百度|必应|网页|浏览器|互联网).{0,8}(?:搜索|快搜|搜)|\b(?:google|bing|web search)\b/i.test(text))return preset('web-search');
      if(/json/i.test(text))return preset('text-transform',['json']);
    }
    if(spec.steps?.some(step=>['trimLines','removeEmptyLines','uniqueLines','sortLines'].includes(step.op)))return preset('text-transform',['multiline','text']);
    return preset('text-transform');
  }
  function matchingFor(plugin) {
    const value=plugin.matching || plugin.spec?.matching;
    return validMatching(value)?value:inferMatching(plugin);
  }
  function matchingSummary(plugin) {
    const value=matchingFor(plugin);
    return '匹配：'+(value.accepts.length?value.accepts.map(f=>formats[f]).join('、'):'仅关键词或明确指令')+' · '+categories[value.category];
  }
  function inputFormats(input) {
    const query=normalize(input), result=[];
    if(!query || query.length>12000)return result;
    result.push('text');
    if(isCalculation(query))result.push('expression');
    if(/^https?:\/\/\S+$/i.test(query)) { try { const url=new URL(query);if(url.hostname)result.push('url'); } catch {} }
    if(/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(query))result.push('number');
    if(/[\r\n]/.test(query))result.push('multiline');
    if(/^[{[]/.test(query)) { try { JSON.parse(input);result.push('json'); } catch {} }
    return result;
  }
  function contextFor(input) {
    const found=inputFormats(input);
    return inferIntent(normalize(input)) || found.at(-1) || 'empty';
  }
  function usageScore(record, now) {
    if(!record || !Number.isFinite(record.count) || !Number.isFinite(record.at))return 0;
    return Math.min(100,Math.max(0,record.count))*Math.pow(0.5,Math.max(0,now-record.at)/(14*86400000));
  }
  function recordChoice(history, id, input, now=Date.now()) {
    const next={...history}, context=contextFor(input), key=id+':'+context;
    next[key]={count:Math.min(100,usageScore(next[key],now)+1),at:now};
    // Bound local history; it contains plugin IDs and input types, never the input itself.
    return Object.fromEntries(Object.entries(next).filter(([,v])=>Number.isFinite(v?.at)).sort((a,b)=>b[1].at-a[1].at).slice(0,1000));
  }
  function rankPlugins(plugins, input, options={}) {
    const query = normalize(input);
    const intent = inferIntent(query);
    const found=inputFormats(input), context=contextFor(input), now=options.now ?? Date.now();
    function scorePlugin(plugin, matching) {
      if (!query) return 0;
      const terms = [plugin.name, ...(plugin.keys || [])].map(normalize).filter(Boolean);
      if (terms.includes(query)) return 4;
      if (terms.some(term => query.startsWith(term) && /^[\s:]/.test(query.slice(term.length)))) return 3;
      if(query.length<matching.minLength || query.length>matching.maxLength)return 0;
      if(intent && intent!=='calculator' && matching.category===intent)return 2;
      if(matching.accepts.some(f=>f!=='text' && found.includes(f)))return 2;
      return matching.accepts.includes('text')?1:0;
    }
    const ranked=plugins.filter(p=>p.enabled!==false && p.spec?.enabled!==false && !p.preview).map(plugin=>{
      const matching=matchingFor(plugin);
      return {plugin,score:scorePlugin(plugin,matching),category:matching.category,
        preference:options.favorites?.includes(plugin.id)?1:0,usage:usageScore(options.history?.[plugin.id+':'+context],now)};
    }).sort((a,b)=>b.score-a.score || b.preference-a.preference || b.usage-a.usage);
    // Within each inferred tier, surface one choice per category before alternatives.
    const result=[];
    for(const score of [4,3,2,1,0]) {
      const tier=ranked.filter(row=>row.score===score), seen=new Set(), rest=[];
      for(const row of tier) {
        if(score>0 && score<3 && seen.has(row.category))rest.push(row);
        else {result.push(row);seen.add(row.category);}
      }
      result.push(...rest);
    }
    return result;
  }

  const api = { rankPlugins, validMatching, inferMatching, matchingFor, matchingSummary, preset, categories, formats, recordChoice };
  if (typeof module !== 'undefined') module.exports = api;
  else root.pluginIntents = api;
})(globalThis);
