'use strict';
const fs=require('fs'),path=require('path');
const {atomicWriteSync}=require('./storage.cjs');
exports.install=(electron)=>{
  const {app,ipcMain,safeStorage}=electron;
  if(electron.BrowserWindow)require('./streamdeck/main.cjs').install(electron);
  const root=path.join(app.getPath('appData'),'MasterHub','community');
  const vault=path.join(root,'accounts.enc');
  ipcMain.on('dng-vault-load',event=>{
    try{
      if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable');
      if(!fs.existsSync(vault)){event.returnValue={ok:true,value:null};return;}
      const parsed=JSON.parse(safeStorage.decryptString(fs.readFileSync(vault)));
      event.returnValue={ok:true,value:parsed};
    }catch{event.returnValue={ok:false,error:'Could not decrypt saved accounts. Original file was preserved.'};}
  });
  ipcMain.on('dng-vault-save',(event,value)=>{
    try{
      if(!safeStorage.isEncryptionAvailable())throw Error('Encryption unavailable');
      const text=JSON.stringify(value);
      if(Buffer.byteLength(text)>1024*1024)throw Error('Credential payload too large');
      const encrypted=safeStorage.encryptString(text);
      // Explicit encrypted previous copy: storage helper deliberately backs up JSON only.
      if(fs.existsSync(vault))atomicWriteSync(vault+'.previous',fs.readFileSync(vault));
      atomicWriteSync(vault,encrypted);event.returnValue={ok:true};
    }catch{event.returnValue={ok:false,error:'Could not save encrypted accounts.'};}
  });
};
