const {_electron:electron}=require('@playwright/test');
const path=require('node:path');
async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[path.join(__dirname,'..'),'--smoke','--smoke-profile=reminder-native-'+Date.now()],env});
 try{
  await app.firstWindow();
  const result=await app.evaluate(async({app,Notification,shell,dialog})=>{
   const load=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/src/main.cjs');
   const result={notification:'not-shown',sound:false,popup:false};let popup,notice;
   function WrappedNotice(options){notice=new Notification(options);notice.once('show',()=>{result.notification='show-event';});notice.once('failed',()=>{result.notification='failed-event';});return notice;}
   WrappedNotice.isSupported=()=>Notification.isSupported();
   const api={Notification:WrappedNotice,shell:{beep(){shell.beep();result.sound=true;}},dialog:{showMessageBox(options){
    const controller=new AbortController();setTimeout(()=>controller.abort(),1200);
    popup=dialog.showMessageBox({...options,signal:controller.signal}).then(()=>{result.popup=true;});return popup;
   }}};
   try{await load('./plugin-reminders.cjs').deliver({name:'提醒验收',request:{title:'OnTime 提醒测试',message:'短暂测试，弹窗会自动关闭。',channels:['notification','sound','popup']}},api);}
   catch(error){result.error=error.message;}
   await popup;notice?.close();return result;
  });
  console.log(JSON.stringify(result));
  if(!result.sound||!result.popup||result.error)process.exitCode=1;
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
