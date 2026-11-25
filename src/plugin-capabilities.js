(function(root){
  const permissions={timers:'后台计时',notifications:'系统通知',sound:'提示音',popup:'弹窗提醒',clipboardRead:'读取剪贴板文字',clipboardWrite:'写入剪贴板文字',storage:'保存插件独立数据',filesRead:'读取所选文件和文件夹',filesWrite:'预览后修改所选文件',windows:'查看和切换窗口',networkWrite:'向声明的网站发送 POST 请求'};
  const types=['number','text','checkbox','select'];
  const plain=value=>value && typeof value==='object' && !Array.isArray(value);
  function validatePermissions(value=[]){
    if(!Array.isArray(value)||value.length>Object.keys(permissions).length||new Set(value).size!==value.length||value.some(key=>!Object.hasOwn(permissions,key)))throw Error('插件能力声明无效');
    return value;
  }
  function validateFields(fields=[]){
    if(!Array.isArray(fields)||fields.length>12)throw Error('插件设置最多支持 12 项');
    const keys=new Set();
    for(const field of fields){
      if(!plain(field)||Object.keys(field).some(key=>!['key','label','type','default','min','max','options'].includes(key))||
        !/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(field.key)||['constructor','prototype','__proto__'].includes(field.key)||keys.has(field.key)||
        typeof field.label!=='string'||!field.label.trim()||field.label.length>60||!types.includes(field.type)||!Object.hasOwn(field,'default'))throw Error('插件设置字段无效');
      keys.add(field.key);
      if(field.type==='number' && (!Number.isFinite(field.min)||!Number.isFinite(field.max)||field.min>field.max))throw Error('数字设置须声明有效范围');
      if(field.type==='select' && (!Array.isArray(field.options)||!field.options.length||field.options.length>12||field.options.some(v=>typeof v!=='string'||!v.trim()||v.length>80)))throw Error('选项设置无效');
      checkValue(field,field.default);
    }
    return fields;
  }
  function checkValue(field,value){
    if(field.type==='number' && (typeof value!=='number'||!Number.isFinite(value)||value<field.min||value>field.max) ||
      field.type==='checkbox' && typeof value!=='boolean' ||
      field.type==='text' && (typeof value!=='string'||value.length>1000) ||
      field.type==='select' && !field.options.includes(value))throw Error('请检查设置：'+field.label);
  }
  function values(fields=[],input={}){
    validateFields(fields);
    if(!plain(input)||Object.keys(input).some(key=>!fields.some(field=>field.key===key)))throw Error('插件设置参数无效');
    const result={};
    for(const field of fields){const value=Object.hasOwn(input,field.key)?input[field.key]:field.default;checkValue(field,value);result[field.key]=value;}
    return result;
  }
  function timerRequest(request,granted=[]){
    validatePermissions(granted);
    if(!granted.includes('timers'))throw Error('插件未声明后台计时权限');
    if(!plain(request)||Object.keys(request).some(key=>!['delaySeconds','title','message','channels'].includes(key))||
      !Number.isFinite(request.delaySeconds)||request.delaySeconds<1||request.delaySeconds>30*86400||
      typeof request.title!=='string'||!request.title.trim()||request.title.length>80||typeof request.message!=='string'||request.message.length>500||
      !Array.isArray(request.channels)||!request.channels.length||request.channels.length>3||new Set(request.channels).size!==request.channels.length)throw Error('计时参数无效：时间须为 1 秒至 30 天，并选择提醒方式');
    for(const channel of request.channels){
      const permission={notification:'notifications',sound:'sound',popup:'popup'}[channel];
      if(!permission||!granted.includes(permission))throw Error('插件未声明此提醒权限：'+channel);
    }
    return JSON.parse(JSON.stringify(request));
  }
  function reminderRequest(request,granted=[]){
    if(!plain(request)||Object.keys(request).some(key=>!['title','message','channels'].includes(key)))throw Error('提醒参数无效');
    const checked=timerRequest({...request,delaySeconds:1},[...new Set([...granted,'timers'])]);
    delete checked.delaySeconds;return checked;
  }
  const api={permissions,validatePermissions,validateFields,values,timerRequest,reminderRequest};
  if(typeof module!=='undefined')module.exports=api;else root.pluginCapabilities=api;
})(globalThis);
