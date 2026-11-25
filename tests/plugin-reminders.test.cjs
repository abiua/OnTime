const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {deliver}=require('../src/plugin-reminders.cjs');
const task={name:'倒计时',request:{title:'结束',message:'时间到',channels:['notification','sound','popup']}};
test('reminder channels dispatch independently to Electron with native text and silent notifications',async()=>{
 const notices=[],popups=[];let beeps=0;
 class Notification extends EventEmitter{static isSupported(){return true;}constructor(options){super();notices.push(options);}show(){this.emit('show');this.emit('close');}}
 const api={Notification,shell:{beep(){beeps++;}},dialog:{showMessageBox(options){popups.push(options);return Promise.resolve();}}};
 await deliver(task,api);assert.equal(beeps,1);assert.equal(notices[0].silent,true);assert.equal(popups[0].message,'结束');
 await deliver({...task,request:{...task.request,channels:['popup']}},api);assert.equal(beeps,1);assert.equal(notices.length,1);assert.equal(popups.length,2);
});
test('notification failure does not prevent sound and popup and is returned for task history',async()=>{
 let beeps=0,popups=0;
 await assert.rejects(deliver(task,{Notification:{isSupported:()=>false},shell:{beep(){beeps++;}},dialog:{showMessageBox(){popups++;return Promise.resolve();}}}),/系统通知不可用/);
 assert.equal(beeps,1);assert.equal(popups,1);
});
