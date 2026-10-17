'use strict';
// This tray control lives in the bootstrap, so it survives a return to older Stable code.
let tray;
function install(electron,checker){
 const {app,Tray,Menu,dialog}=electron;if(!Tray||!Menu)return;
 app.whenReady().then(async()=>{
  try{
   const icon=await app.getFileIcon(process.execPath);tray=new Tray(icon);tray.setToolTip('MasterHUB Community updates');
   const show=()=>{const s=checker.status();return dialog.showMessageBox({type:'info',title:'MasterHUB Community updates',message:`Running ${s.current} (${s.currentChannel})`,detail:`Selected channel: ${s.channel}\n${s.pending?'Ready for next launch: '+s.pending+'\n':''}${s.message}\n\nExit MasterHUB completely and reopen it to activate a downloaded version.`});};
   const act=async fn=>{try{await fn();}catch(e){await dialog.showMessageBox({type:'error',title:'MasterHUB Community updates',message:e.message});}menu();};
   const menu=()=>{const s=checker.status();tray.setContextMenu(Menu.buildFromTemplate([
    {label:`Community ${s.current}`,enabled:false},
    {label:'Main / stable',type:'radio',checked:s.channel==='stable',click:()=>act(async()=>{await checker.selectChannel('stable');await show();})},
    {label:'Beta / experimental',type:'radio',checked:s.channel==='test',click:()=>act(async()=>{await checker.selectChannel('test');await show();})},
    {type:'separator'},{label:'Check for updates',click:()=>act(async()=>{await checker.check();await show();})},
    {label:'Version and update status',click:()=>act(show)}
   ]));};
   menu();tray.on('click',()=>{menu();tray.popUpContextMenu();});tray.on('right-click',menu);app.once('before-quit',()=>{tray?.destroy();tray=null;});
  }catch(e){console.error('Community update tray unavailable:',e.message);}
 });
}
module.exports={install};
