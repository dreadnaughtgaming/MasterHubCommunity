'use strict';
const path=require('path');
const {readJson,atomicWriteSync}=require('./storage.cjs');
const CHANNEL='replyM00x64IoStatus',MUTATION='setM00x64Direction';
const validDirection=value=>value==='horizontal'||value==='vertical';
const validSerial=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!['__proto__','prototype','constructor'].includes(value);
function install({store,ipc,root,log=()=>{},write=atomicWriteSync}){
 const file=path.join(root,'orientation.json');
 const saved=readJson(file,null),preferences=Object.create(null);
 if(saved?.version===1&&saved.devices&&typeof saved.devices==='object'&&!Array.isArray(saved.devices)){
  for(const [serial,direction] of Object.entries(saved.devices))if(validSerial(serial)&&validDirection(direction))preferences[serial]=direction;
 }
 const originalCommit=store.commit,originalEmit=ipc.emit;
 let hardwareDepth=0;
 // Restore before Vue mounts. Device reports are observations, not user choices.
 for(const [serialNumber,direction] of Object.entries(preferences))originalCommit.call(store,MUTATION,{serialNumber,direction});
 function emit(channel,...args){
  if(channel!==CHANNEL)return originalEmit.call(this,channel,...args);
  hardwareDepth++;
  try{return originalEmit.call(this,channel,...args);}finally{hardwareDepth--;}
 }
 function commit(type,payload,...args){
  const objectStyle=type!==null&&typeof type==='object';
  const name=objectStyle?type.type:type,value=objectStyle?type:payload;
  if(name!==MUTATION||!validSerial(value?.serialNumber)||!validDirection(value?.direction))return originalCommit.call(this,type,payload,...args);
  const serial=value.serialNumber;
  const effective=hardwareDepth&&preferences[serial]?{...value,direction:preferences[serial]}:value;
  const result=objectStyle?originalCommit.call(this,effective,payload,...args):originalCommit.call(this,type,effective,...args);
  if(!hardwareDepth){
   preferences[serial]=value.direction;
   try{write(file,JSON.stringify({version:1,devices:preferences},null,2));}
   catch{log('Could not save layout orientation. Check folder permissions or free disk space.');}
  }
  return result;
 }
 ipc.emit=emit;store.commit=commit;
 return ()=>{if(ipc.emit===emit)ipc.emit=originalEmit;if(store.commit===commit)store.commit=originalCommit;};
}
module.exports={install};
