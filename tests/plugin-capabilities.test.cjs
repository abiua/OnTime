const test=require('node:test');
const assert=require('node:assert/strict');
const capabilities=require('../src/plugin-capabilities.js');
const {validate,generationPrompt}=require('../src/text-plugins.cjs');
const fields=[{key:'seconds',label:'秒数',type:'number',min:1,max:60,default:5},{key:'sound',label:'提示音',type:'checkbox',default:true},{key:'message',label:'内容',type:'text',default:'时间到'},{key:'mode',label:'方式',type:'select',options:['普通','安静'],default:'普通'}];
test('plugin settings validate types and defaults without accepting arbitrary UI or code',()=>{
 assert.deepEqual(capabilities.values(fields,{}),{seconds:5,sound:true,message:'时间到',mode:'普通'});
 for(const options of [{seconds:0},{seconds:'5'},{seconds:NaN},{sound:'yes'},{mode:'未知'},{extra:'x'}])assert.throws(()=>capabilities.values(fields,options));
 for(const item of [{...fields[0],key:'__proto__'},{...fields[0],default:100},{...fields[0],html:'<script>'},{...fields[0],type:'html'}])assert.throws(()=>capabilities.validateFields([item]));
 assert.throws(()=>capabilities.validateFields([fields[0],fields[0]]));
});
test('timer and alert channels each require declared capabilities',()=>{
 const request={delaySeconds:30,title:'计时',message:'时间到',channels:['notification','sound','popup']};
 const permissions=['timers','notifications','sound','popup'];
 assert.deepEqual(capabilities.timerRequest(request,permissions),request);
 for(const missing of permissions)assert.throws(()=>capabilities.timerRequest(request,permissions.filter(key=>key!==missing)),/权限/);
 for(const bad of [{...request,delaySeconds:0},{...request,delaySeconds:Infinity},{...request,channels:['shell']},{...request,channels:[]},{...request,channels:['popup','popup']},{...request,path:'C:/Windows'}])assert.throws(()=>capabilities.timerRequest(bad,permissions));
 assert.throws(()=>capabilities.validatePermissions(['process']));
});
test('generated interactive manifests validate and prompt explicitly teaches host timer APIs',()=>{
 const spec={schemaVersion:1,name:'倒计时',description:'设置时间',keywords:['计时'],sample:'',settings:fields,permissions:['timers','sound'],steps:[{op:'script',source:'async function run(input,api){return "ok"}',domains:[]}]};
 assert.deepEqual(validate(spec).settings,fields);
 assert.match(generationPrompt,/api\.timers\.start/);assert.match(generationPrompt,/NOT host background timers/);
 assert.throws(()=>validate({...spec,permissions:['shell']}));
 assert.throws(()=>validate({...spec,steps:[{op:'trim'}]}));
});
