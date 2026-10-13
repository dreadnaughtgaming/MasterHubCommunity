'use strict';
const path=require('path');
const config=require('./config.json');
exports.start=electron=>{
 const {app,ipcMain,dialog}=electron;
 if(!app.requestSingleInstanceLock()){app.exit(0);return;}
 const {Slots}=require('./core.cjs');
 const slots=new Slots(path.join(app.getPath('appData'),'MasterHub','community','updates'),config);
 try{
  slots.start();const runtime=path.join(slots.p('current'),'dng');
  ipcMain.on('mhc-runtime-root',e=>{e.returnValue=runtime;});
  const checker=require('./network.cjs').createChecker(slots,config);
  ipcMain.handle('mhc-update-status',()=>checker.status());
  ipcMain.handle('mhc-update-check',()=>checker.check());
  let healthTimer=null;
  ipcMain.on('mhc-renderer-ready',e=>{
   if(healthTimer||!e.sender.getURL().startsWith('app://'))return;
   const sender=e.sender;healthTimer=setTimeout(()=>{if(!sender.isDestroyed()){try{slots.healthy();}catch(err){console.error('Community activation confirmation:',err.message);}}},20000);
   sender.once('render-process-gone',()=>{clearTimeout(healthTimer);healthTimer=null;});
  });
  require(path.join(runtime,'main.cjs')).install(electron);
  app.whenReady().then(()=>{setTimeout(()=>checker.check(),35000).unref();setInterval(()=>checker.check(),6*60*60*1000).unref();});
 }catch(e){
  // Restore old code on next launch, without loading two versions into one process.
  try{slots.recover();}catch{}
  dialog.showErrorBox('MasterHUB Community could not start',e.message+'\nClose and reopen MasterHUB. If this persists, run the Community installer again.');
  app.exit(1);throw e;
 }
};
