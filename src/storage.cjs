'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function atomicWriteSync(file,data,options){
  if(typeof file!=='string')throw new TypeError('Expected file path');
  const requested=Buffer.isBuffer(data)?data:Buffer.from(data,typeof options==='string'?options:options?.encoding||'utf8');
  if(fs.existsSync(file)&&fs.readFileSync(file).equals(requested))return;
  const dir=path.dirname(file); fs.mkdirSync(dir,{recursive:true});
  const suffix=`.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const temp=file+suffix;let fd;
  try{
    const encoding=typeof options==='string'?options:options?.encoding||'utf8';
    fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,data,{encoding});fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    if(fs.existsSync(file)){
      const old=fs.readFileSync(file);let valid=true;
      try{JSON.parse(old.toString('utf8'));}catch{valid=false;}
      if(valid){const bt=file+'.bak'+suffix;try{fs.writeFileSync(bt,old,{mode:0o600});fs.renameSync(bt,file+'.bak');}finally{if(fs.existsSync(bt))fs.unlinkSync(bt);}}
    }
    // Do not delete the destination as a fallback. A failed rename must leave it intact.
    fs.renameSync(temp,file);
  }finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function readJson(file,fallback){
  for(const name of [file,file+'.bak']){try{return JSON.parse(fs.readFileSync(name,'utf8'));}catch{}}
  return fallback;
}
module.exports={atomicWriteSync,readJson};
