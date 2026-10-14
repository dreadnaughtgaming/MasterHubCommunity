'use strict';
const CHANNELS={m4315:'Display_Picture_On_Button_CM_M4315',m3704:'Display_Picture_On_Button_CM_M3704'};
function validate(value){
 if(!value||!Object.prototype.hasOwnProperty.call(CHANNELS,value.kind)||typeof value.serialNumber!=='string'||value.serialNumber.length<1||value.serialNumber.length>256||!Number.isInteger(value.index)||value.index<0||value.index>=(value.kind==='m4315'?15:4))throw Error('Invalid video target');
 const size=value.frame?.byteLength??value.frame?.length;if(!Number.isInteger(size)||size<4||size>48*1024)throw Error('Invalid or oversized JPEG frame');
 const frame=Buffer.from(value.frame);if(frame.length<4||frame.length>48*1024||frame[0]!==255||frame[1]!==216||frame[frame.length-2]!==255||frame[frame.length-1]!==217)throw Error('Invalid or oversized JPEG frame');return frame;
}
function nativeFrame(ipcMain,event,value,timeoutMs=3000){
 const frame=validate(value),handlers=ipcMain.listeners(CHANNELS[value.kind]);
 if(handlers.length!==1)return Promise.reject(Error('MasterHUB display driver is unavailable'));
 return new Promise((resolve,reject)=>{let done=false;const finish=(err,result)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(result);};
  const timer=setTimeout(()=>{const e=Error('Button display timed out; restart MasterHUB before retrying video');e.code='DISPLAY_TIMEOUT';finish(e);},timeoutMs);
  const reply={sender:event.sender};Object.defineProperty(reply,'returnValue',{set:code=>finish(code===0?null:Error('Button display rejected the frame ('+String(code)+')'),code)});
  try{Promise.resolve(handlers[0](reply,{btnId:value.index,buf:frame,serialNumber:value.serialNumber})).catch(err=>finish(err));}catch(err){finish(err);}
 });
}
function install({ipcMain}){let busy=false,blocked=false;ipcMain.handle('mhc-video-frame',async(event,value)=>{
 if(!event.sender.getURL().startsWith('app://'))return{ok:false,error:'Video frames must come from the MasterHUB interface'};
 if(blocked)return{ok:false,error:'Display timed out earlier; restart MasterHUB before retrying video'};
 if(busy)return{ok:false,error:'Another video frame is still being displayed'};busy=true;
 try{await nativeFrame(ipcMain,event,value);return{ok:true};}catch(e){if(e.code==='DISPLAY_TIMEOUT')blocked=true;return{ok:false,error:e.message};}finally{busy=false;}
});}
module.exports={validate,nativeFrame,install};
