const activeNotifications=new Set();
async function deliver(task,electron=require('electron')){
  const {Notification,shell,dialog}=electron;
  const {title,message,channels}=task.request;
  const failures=[];
  if(channels.includes('sound')){try{shell.beep();}catch{failures.push('提示音播放失败');}}
  if(channels.includes('notification')){
    try{
      if(!Notification.isSupported())throw Error('系统通知不可用');
      const notice=new Notification({title,body:task.name+'：'+message,silent:true});
      activeNotifications.add(notice);
      const release=setTimeout(()=>activeNotifications.delete(notice),60000);release.unref();
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{activeNotifications.delete(notice);resolve();},3000);
        const done=()=>{clearTimeout(timeout);resolve();};
        notice.once('show',done);notice.once('close',()=>{clearTimeout(release);activeNotifications.delete(notice);});
        notice.once('failed',()=>{clearTimeout(timeout);activeNotifications.delete(notice);reject(Error('系统通知发送失败，请检查 Windows 通知设置'));});
        notice.show();
      });
    }catch(error){failures.push(error.message);}
  }
  if(channels.includes('popup')){
    // No parent: showing an alert does not depend on the launcher being visible.
    try{dialog.showMessageBox({type:'info',title:'OnTime · '+task.name,message:title,detail:message,buttons:['知道了'],noLink:true}).catch(()=>{});}catch{failures.push('弹窗显示失败');}
  }
  if(failures.length)throw Error(failures.join('；'));
}
module.exports={deliver};
