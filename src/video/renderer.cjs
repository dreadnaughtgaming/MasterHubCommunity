'use strict';
const {floatingPanel}=require('../panels.cjs');
const {targets,identity,available,sameLayout,contain,FramePump}=require('./core.cjs');
function attach(state){
 if(typeof document==='undefined'||typeof state.ipc.invoke!=='function')return;
 let panel=null;
 function open(){
  if(panel){panel.scrollIntoView();return;}
  panel=floatingPanel('video','Local video • Test');let objectURL=null,target=null,closed=false,frames=0,pump=null;
  const el=(tag,text,parent=panel)=>{const x=document.createElement(tag);if(text)x.textContent=text;parent.appendChild(x);return x;};
  el('h2','Video on one button');el('p','Choose a local video and an empty key. Audio uses your normal Windows output. Start at 2 FPS; keep this window open for this first test. YouTube URLs are not supported yet.');
  const file=el('input');file.type='file';file.accept='video/*,.mp4,.webm';
  const video=el('video');video.controls=true;video.preload='metadata';video.playsInline=true;video.volume=0.5;video.style.cssText='display:block;width:100%;max-height:230px;background:black;margin:12px 0';
  const select=el('select');select.style.maxWidth='100%';
  const refresh=el('button','Refresh empty keys');refresh.style.margin='8px';
  const fps=el('select');for(const value of [1,2,3,5]){const option=el('option',value+' FPS',fps);option.value=String(value);}fps.value='2';
  const status=el('p','Select a video file. Playback does not change saved button actions.');
  const stop=el('button','Stop'),close=el('button','Close');close.style.margin='8px';
  const canvas=document.createElement('canvas');canvas.width=canvas.height=72;const ctx=canvas.getContext('2d');
  let options=[];
  function refreshKeys(){const previous=select.value;options=targets(state.store.getters);select.replaceChildren();options.forEach((t,i)=>{const o=el('option',`${t.kind==='m4315'?'15-key':'4-key'} ${t.serialNumber.slice(-8)} • key ${t.index+1}`,select);o.value=identity(t);});if(options.some(t=>identity(t)===previous))select.value=previous;if(!options.length)status.textContent='No empty keys are available on the current page. Clear a key first.';}
  async function restore(){if(target&&sameLayout(state.store.getters,target))try{await state.store.dispatch('keypadImageBufferGenerator',{serialNumber:target.serialNumber,page:target.page,viewMode:target.viewMode,keypadBtnIndex:target.index,keypadFolderBtnIdex:target.index});}catch{state.log('Video stopped, but the original key image could not be refreshed. Switch pages to redraw it.');}}
  pump=new FramePump({
   valid:()=>!closed&&!!target&&available(state.store.getters,target),
   capture:()=>{if(video.readyState<2)throw Error('Video frame is unavailable. Wait for it to load and press Play again.');const r=contain(video.videoWidth,video.videoHeight);ctx.fillStyle='black';ctx.fillRect(0,0,72,72);ctx.drawImage(video,r.x,r.y,r.width,r.height);return Buffer.from(canvas.toDataURL('image/jpeg',0.65).split(',')[1],'base64');},
   send:async frame=>{const result=await state.ipc.invoke('mhc-video-frame',{kind:target.kind,serialNumber:target.serialNumber,index:target.index,frame});if(!result?.ok)throw Error(result?.error||'Display service unavailable');},
   restore,onFrame:()=>{frames++;status.textContent=`Playing • ${frames} frames sent • limit ${fps.value} FPS. Audio: normal Windows output.`;},
   onError:error=>{video.pause();status.textContent=error.message;state.log('Video: '+error.message);}
  });
  async function halt(){video.pause();await pump.stop();select.disabled=fps.disabled=file.disabled=refresh.disabled=false;}
  refresh.onclick=refreshKeys;
  file.onchange=async()=>{await halt();if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;const selected=file.files?.[0];if(!selected)return;objectURL=URL.createObjectURL(selected);video.src=objectURL;status.textContent='Video loaded. Choose an empty key, then use Play in the preview.';};
  video.onplaying=async()=>{await pump.stop();if(closed||video.paused)return;target=options.find(t=>identity(t)===select.value);if(!target||!available(state.store.getters,target)){video.pause();status.textContent='Choose an empty key on the current page first.';return;}frames=0;select.disabled=fps.disabled=file.disabled=refresh.disabled=true;await pump.start(Number(fps.value));};
  video.onpause=()=>{pump.stop();select.disabled=fps.disabled=file.disabled=refresh.disabled=false;};
  video.onended=async()=>{await halt();status.textContent='Video finished. Original button image restored.';};
  video.onerror=async()=>{await halt();status.textContent='This file could not be played. Try an H.264 MP4 or VP8/VP9 WebM file supported by the installed Electron build.';};
  stop.onclick=async()=>{await halt();video.currentTime=0;status.textContent='Stopped. Original button image restored.';};
  const cleanup=async()=>{if(closed)return;closed=true;await halt();video.removeAttribute('src');video.load();if(objectURL)URL.revokeObjectURL(objectURL);window.removeEventListener('beforeunload',cleanup);const old=panel;panel=null;old.remove();};
  close.onclick=cleanup;window.addEventListener('beforeunload',cleanup);refreshKeys();
 }
 setTimeout(()=>require('../community-ui.cjs').register('Video · Beta',open),1300);
}
module.exports={attach};
