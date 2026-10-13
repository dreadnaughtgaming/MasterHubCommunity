'use strict';
const {floatingPanel}=require('../panels.cjs');
const {draggable}=require('../bindings.cjs');
function contextFromURL(value){try{const u=new URL(value);const parts=u.pathname.split('/').filter(Boolean);if(u.protocol==='https:'&&u.hostname==='masterhub-addon.invalid'&&parts.length===2&&parts[0]==='streamdeck'&&/^[a-f0-9-]{36}$/.test(parts[1]))return parts[1];}catch{}return null;}
function slotsFromGetters(g){
 const result=[],alive=new Set([...(g.m4315Alive||[]),...(g.m3704Alive||[])].map(d=>d.serialNumber)),four=new Set((g.m3704Alive||[]).map(d=>d.serialNumber));
 for(const [serial,cfg] of Object.entries(g.keypadBtnConfig||{})){
  if(!alive.has(serial))continue;const page=g.keypadBtnList?.[serial]?.[cfg.currentPage||0];const buttons=cfg.viewMode==='folder'?page?.[cfg.currentFolderIndex]?.folder:page;
  if(!Array.isArray(buttons))continue;
  const columns=four.has(serial)?2:5;
  buttons.forEach((button,index)=>{if((button?.btnFunc||button?.action)!=='web-url')return;const context=contextFromURL(button.url);if(context)result.push({context,device:serial,column:index%columns,row:Math.floor(index/columns),index,columns,kind:columns===2?'m3704':'m4315'});});
 }return result;
}
function attach(state){
 const {ipc,store}=state;if(typeof ipc.invoke!=='function')return;
 let snapshot={plugins:[],instances:[],logs:[]},slots=[],layoutJSON='',panel=null;
 const pressed=new Map(),lastPaint=new Map(),painting=new Set();
 const command=async data=>{try{const result=await ipc.invoke('dng-sd-command',data);if(result.snapshot)snapshot=result.snapshot;if(!result.ok)alert(result.error);return result;}catch{alert('Stream Deck host is unavailable. Restart MasterHUB.');return{ok:false};}};
 const draw=async slot=>{
  const item=snapshot.instances.find(i=>i.context===slot.context);if(!item)return;
  const key=slot.device+':'+slot.index,signature=JSON.stringify([item.title,item.image,item.feedback,slot.context]);
  if(lastPaint.get(key)===signature||painting.has(key))return;painting.add(key);
  try{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=72;const ctx=canvas.getContext('2d');ctx.fillStyle='#102032';ctx.fillRect(0,0,72,72);
   if(item.image){const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=item.image;});ctx.drawImage(image,0,0,72,72);}
   const title=String(item.feedback||item.title||'');if(title){ctx.fillStyle='#000b';ctx.fillRect(0,46,72,26);ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.fillStyle='#ffffff';ctx.fillText(title.slice(0,25),36,64,68);}
   // Ignore a completed drawing if the user switched page while the image decoded.
   if(!slots.some(s=>s.context===slot.context&&s.device===slot.device&&s.index===slot.index))return;
   const buf=Buffer.from(canvas.toDataURL('image/jpeg',0.85).split(',')[1],'base64');
   ipc.send(slot.kind==='m3704'?'Display_Picture_On_Button_CM_M3704':'Display_Picture_On_Button_CM_M4315',{btnId:slot.index,buf,serialNumber:slot.device});lastPaint.set(key,signature);
  }catch{state.log('Stream Deck button image could not be rendered.');}
  finally{painting.delete(key);}
 };
 const refreshSlots=()=>{slots=slotsFromGetters(store.getters);const next=JSON.stringify(slots);if(next!==layoutJSON){layoutJSON=next;lastPaint.clear();ipc.send('dng-sd-layout',slots);}for(const slot of slots)draw(slot);};
 ipc.on('dng-sd-update',(_event,value)=>{snapshot=value;refreshSlots();if(panel){updatePreviews();const logs=panel.querySelector('[data-plugin-log]');if(logs)logs.textContent=snapshot.logs.join('\n');}});
 for(const channel of ['replyM4315IoStatus','replyM3704IoStatus'])ipc.on(channel,(_event,value)=>{
  if(value?.result!==0||!value.data)return;refreshSlots();
  const count=channel==='replyM3704IoStatus'?4:15;
  for(let index=0;index<count;index++){
   const byte=value.data[index+2];if(byte!==0&&byte!==1)continue;
   const key=value.serialNumber+':'+index,old=pressed.get(key),slot=slots.find(s=>s.device===value.serialNumber&&s.index===index);
   if(byte===1&&!old&&slot){pressed.set(key,slot.context);ipc.send('dng-sd-key',{context:slot.context,down:true});}
   else if(byte===0&&old){pressed.delete(key);ipc.send('dng-sd-key',{context:old,down:false});setTimeout(()=>{lastPaint.delete(key);refreshSlots();},120);}
  }
 });
 setInterval(refreshSlots,500);
 state.streamdeckTest=context=>command({type:'test',context});
 function updatePreviews(){
  for(const item of snapshot.instances){const row=panel?.querySelector(`[data-context="${item.context}"]`);if(!row)continue;const image=row.querySelector('img');if(item.image){if(image.src!==item.image)image.src=item.image;image.hidden=false;}else image.hidden=true;row.querySelector('span').textContent=`${item.name} • ${item.title} ${item.feedback}`;}
 }
 const render=async()=>{
  await command({type:'list'});panel?.remove();panel=floatingPanel('streamdeck','Stream Deck');
  const el=(tag,text,parent=panel)=>{const x=document.createElement(tag);x.textContent=text;parent.appendChild(x);return x;};
  const button=(text,callback,parent=panel)=>{const b=el('button',text,parent);b.style.cssText='margin:5px;padding:7px 11px;background:#245983;border:0;border-radius:4px;color:white;cursor:pointer';b.onclick=callback;return b;};
  el('h2','Stream Deck compatibility • experimental');el('p','Import an extracted .sdPlugin folder, enable it, then add an action instance. Third-party plugins run as code under your Windows account. Keypad actions only; compatibility varies by plugin.');
  button('Close',()=>{panel.remove();panel=null;});button('Import .sdPlugin folder',async()=>{await command({type:'import'});render();});button('Locate Node.js (optional)',async()=>{await command({type:'node'});render();});button('Open plugins folder',()=>command({type:'folder'}));button('Refresh',render);
  el('p','Node.js is needed only by plugins that list a Node.js version below. If requested, install that major version and locate its node.exe. The included counter needs no Node.js.');
  el('p','Encrypted manifests are prepared automatically in a copy using Tiebe/elgato-decrypter. Requires Python 3.10+ and installed Stream Deck software. First import downloads Python dependencies; progress appears below. This prepares only the manifest, not every protected asset.');
  for(const plugin of snapshot.plugins){
   const row=el('div','');row.style.cssText='border-top:1px solid #456;padding:12px 0';el('strong',`${plugin.name} — ${plugin.status}`,row);
   if(plugin.node)el('small',` (Node.js ${plugin.node})`,row);
   button(plugin.enabled?'Disable':'Enable',async()=>{await command({type:plugin.enabled?'disable':'enable',uuid:plugin.uuid});render();},row);
   if(plugin.enabled)button('Restart',async()=>{await command({type:'restart',uuid:plugin.uuid});render();},row);
   for(const action of plugin.actions)button('Add: '+action.name,async()=>{await command({type:'create',uuid:plugin.uuid,action:action.uuid});render();},row);
  }
  el('h3','Your button instances');el('p','Add an action instance above, then drag its name or image onto an empty MasterHUB keypad key. Move this panel by its title bar and resize using the bottom-right corner. Each key needs its own instance.');
  for(const item of snapshot.instances){
   const row=el('div','');row.dataset.context=item.context;row.style.cssText='border-top:1px solid #345;padding:10px 0';const image=el('img','',row);image.width=image.height=48;image.style.verticalAlign='middle';const handle=el('span','↗ '+item.name,row);const binding={url:`https://masterhub-addon.invalid/streamdeck/${item.context}`,label:item.name};draggable(handle,binding);draggable(image,binding);
   button('Configure',()=>command({type:'configure',context:item.context}),row);button('Test press',()=>command({type:'test',context:item.context}),row);
   button('Copy URL',()=>{require('electron').clipboard.writeText(`https://masterhub-addon.invalid/streamdeck/${item.context}`);state.log('Stream Deck action URL copied.');},row);
   button('Remove instance',async()=>{await command({type:'remove',context:item.context});render();},row);
  }
  updatePreviews();el('h3','Plugin messages');const logs=el('pre',snapshot.logs.join('\n'));logs.dataset.pluginLog='1';logs.style.whiteSpace='pre-wrap';
 };
 setTimeout(()=>{const b=document.createElement('button');b.textContent='Stream Deck';b.style.cssText='position:fixed;bottom:14px;left:128px;z-index:2147483645;background:#1766a5;color:white;border:1px solid #6bb8f1;border-radius:8px;padding:10px 18px;cursor:pointer;font:14px Arial';b.onclick=render;document.body.appendChild(b);command({type:'list'}).then(refreshSlots);},1200);
}
module.exports={attach,contextFromURL,slotsFromGetters};
