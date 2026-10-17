'use strict';
const {floatingPanel}=require('./panels.cjs');
const actions=new Map();let launcher,menu,updates;
function register(label,open){
 if(typeof document==='undefined')return;
 actions.set(label,open);
 if(!launcher){
  launcher=document.createElement('button');launcher.textContent='Community';launcher.setAttribute('aria-expanded','false');
  launcher.style.cssText='position:fixed;bottom:14px;left:18px;z-index:2147483645;background:#202d3d;color:#eef5ff;border:1px solid #52667d;border-radius:9px;padding:10px 18px;cursor:pointer;font:14px Arial;box-shadow:0 4px 16px #0005';
  menu=document.createElement('div');menu.hidden=true;menu.style.cssText='position:fixed;bottom:62px;left:18px;z-index:2147483646;background:#162231;border:1px solid #52667d;border-radius:10px;padding:6px;min-width:190px;box-shadow:0 8px 24px #0008';
  launcher.onclick=()=>{menu.hidden=!menu.hidden;launcher.setAttribute('aria-expanded',String(!menu.hidden));};
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!launcher.contains(e.target)){menu.hidden=true;launcher.setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;launcher.setAttribute('aria-expanded','false');}});
  document.body.appendChild(launcher);document.body.appendChild(menu);
 }
 menu.replaceChildren();
 for(const [name,fn] of [...actions].sort(([a],[b])=>a.localeCompare(b))){const b=document.createElement('button');b.textContent=name;b.style.cssText='display:block;width:100%;text-align:left;padding:10px 12px;background:transparent;color:#eef5ff;border:0;border-radius:6px;cursor:pointer;font:14px Arial';b.onmouseenter=()=>b.style.background='#30465f';b.onmouseleave=()=>b.style.background='transparent';b.onclick=()=>{menu.hidden=true;launcher.setAttribute('aria-expanded','false');fn();};menu.appendChild(b);}
}
const channelName=value=>value==='test'?'Beta':'Main';
function describe(s){return{version:`${s.current} · ${channelName(s.currentChannel)}`,last:s.checkedAt?new Date(s.checkedAt).toLocaleString():'Not checked this session',message:s.pending?`${s.pending} downloaded. Fully exit and reopen MasterHUB to activate it.`:s.message||'Automatic updates enabled'};}
function openUpdates(ipc){
 if(updates){updates.scrollIntoView();return;}
 const p=floatingPanel('updates','Updates');updates=p;
 const add=(tag,text,parent=p)=>{const x=document.createElement(tag);x.textContent=text;parent.appendChild(x);return x;};
 add('h2','Community updates');const version=add('p','Reading installed version…');
 const label=add('label','Update channel ');const select=add('select','',label);select.setAttribute('aria-label','Update channel');
 for(const [value,name]of [['stable','Main — stable'],['test','Beta — experimental']]){const o=add('option',name,select);o.value=value;}
 const status=add('p','Loading…');status.setAttribute('aria-live','polite');const last=add('p','');last.style.color='#aebfd2';
 add('p','Checks automatically shortly after startup, then every 6 hours while MasterHUB is running.');
 add('p','Changing channel checks immediately. Downloads activate on the next full restart; your profiles and settings stay in place.');
 const check=add('button','Check now'),close=add('button','Close');let busy=false,closed=false;
 const show=s=>{const d=describe(s);version.textContent=d.version;select.value=s.channel||'stable';status.textContent=d.message;last.textContent='Last check: '+d.last;select.disabled=check.disabled=busy||!!s.checking;};
 async function refresh(){try{const s=await ipc.invoke('mhc-update-status');if(!closed&&!busy)show(s);}catch{if(!closed){status.textContent='Update service unavailable. Reinstall the latest Community installer if this continues.';select.disabled=true;}}}
 async function act(channel){busy=true;select.disabled=check.disabled=true;status.textContent=channel?'Changing channel…':'Checking GitHub…';try{const s=await ipc.invoke(channel?'mhc-update-channel':'mhc-update-check',...(channel?[channel]:[]));busy=false;if(!closed)show(s);}catch(e){busy=false;await refresh();status.textContent=e.message||'Update check failed';}finally{busy=false;check.disabled=false;}}
 select.disabled=true;select.onchange=()=>act(select.value);check.onclick=()=>act();
 const timer=setInterval(refresh,5000);const remove=p.remove.bind(p);p.remove=()=>{closed=true;clearInterval(timer);updates=null;remove();};close.onclick=()=>p.remove();refresh();
}
module.exports={register,openUpdates,describe,channelName};
