'use strict';
const fs=require('fs'),path=require('path');
const {atomicWriteSync,readJson}=require('./storage.cjs');
const connections=require('./connections.cjs');
const bindings=require('./bindings.cjs');
const {floatingPanel}=require('./panels.cjs');
let state=null;
function readLocal(storage,key){try{return JSON.parse(storage.getItem(key));}catch{return null;}}
function obsCheck(vm,app,OBS){
  if(vm._dngObsConnecting)return;
  const info=readLocal(window.localStorage,'obsConnection');
  if(!info?.obsIp||!info?.obsPort){vm.isLoginOBS=false;return;}
  vm.isLoginOBS=true;vm._dngObsConnecting=true;
  let completed=false;
  const finish=ok=>{if(completed)return;completed=true;clearTimeout(timeout);vm._dngObsConnecting=false;vm.handleObsConnection(vm,ok);};
  const timeout=setTimeout(()=>finish(false),15000);
  try{
    if(app.obsPlugin)app.obsPlugin.reconnect(info,()=>finish(true),()=>finish(false));
    else app.obsPlugin=OBS.getInstance({...info,connectCallback:()=>finish(true),disconnectCallback:()=>{vm._dngObsConnecting=false;vm.handleObsConnection(vm,false);}},vm.obsState);
  }catch{finish(false);}
}
function install({store,app,ipc,base,getTwitch,getDiscord,ensureTwitch}){
  if(state)return state;
  const root=path.join(base,'community'),addonRoot=path.join(root,'addons');fs.mkdirSync(addonRoot,{recursive:true});
  state={store,app,ipc,root,addonRoot,actions:new Map(),addons:[],listeners:[],logs:[],panel:null,stopped:false};
  const log=(message)=>{state.logs.push(`${new Date().toLocaleTimeString()} ${String(message).slice(0,300)}`);if(state.logs.length>40)state.logs.shift();};state.log=log;state.notify=notify;
  state.disposeOrientation=require('./orientation.cjs').install({store,ipc,root,log});
  const vault=ipc.sendSync('dng-vault-load');let vaultBlocked=!vault?.ok;
  if(vaultBlocked)log('Account restore failed; existing encrypted file will not be overwritten.');
  const saved=vault?.ok?vault.value:null;
  if(saved?.sns&&Array.isArray(saved.sns.twitchAccounts)&&Array.isArray(saved.sns.discordAccounts)){
    store.state.sns={...store.state.sns,...saved.sns};
  }
  for(const [key,prefix,fields] of [['obsConnection','obs',['Ip','Port','Pwd']],['streamlabsConnection','streamlabs',['Ip','Port','Token']]]){
    let value=readLocal(window.localStorage,key);
    if(!value&&saved?.[key]){value=saved[key];window.localStorage.setItem(key,JSON.stringify(value));}
    if(value)for(const field of fields)if(value[prefix+field]!==undefined)store.commit(prefix+field,value[prefix+field]);
  }
  let lastVault='';
  const persist=()=>{
    if(vaultBlocked)return;
    const value={version:1,sns:store.state.sns,obsConnection:readLocal(window.localStorage,'obsConnection'),streamlabsConnection:readLocal(window.localStorage,'streamlabsConnection')};
    let text;try{text=JSON.stringify(value);}catch{return;}
    if(text===lastVault)return;
    let reply;try{reply=ipc.sendSync('dng-vault-save',JSON.parse(text));}catch{log('Could not send account settings to the encryption service.');return;}
    if(reply?.ok)lastVault=text;else log('Could not save encrypted account settings.');
  };
  state.persist=persist;
  state.vaultTimer=setInterval(persist,2000);
  store.watch(()=>store.state.sns,persist,{deep:true});
  window.addEventListener('beforeunload',persist);
  let saveTimer;
  store.subscribe(mutation=>{
    // Only editor mutations, not status updates, volume polling, or animations.
    if(!/^(keypadBtn(?:Title|EnableTitle|Url|URL|Content|Func)|profileName$)/.test(mutation.type))return;
    clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveProfile().catch(()=>{}),2000);
  });
  state.saveProfile=saveProfile;
  async function saveProfile(){
    if(store.getters.flagFirstLoad||store.getters.flagImportingConfig||!store.getters.currentBase64SerialNumber||!store.getters.currentProfile){log('Profile is not ready to save yet.');return false;}
    try{await store.dispatch('syncConfig');log('Profile saved.');return true;}catch{log('Profile save failed. Check folder permissions or free disk space; previous file is preserved.');return false;}
  }
  const example=path.join(__dirname,'examples','example');
  if(!fs.existsSync(path.join(addonRoot,'example'))&&fs.existsSync(example)){const dest=path.join(addonRoot,'example');fs.mkdirSync(dest,{recursive:true});for(const name of ['manifest.json','index.cjs'])fs.writeFileSync(path.join(dest,name),fs.readFileSync(path.join(example,name)));}
  loadAddons();
  require('./streamdeck/renderer.cjs').attach(state);
  setTimeout(async()=>{
    buildPanel();
    requestAnimationFrame(()=>ipc.send('mhc-renderer-ready'));
    const sns=store.state.sns;
    const account=sns.twitchAccounts.find(x=>x.username===sns.selectedTwitchUsername)||sns.twitchAccounts[0];
    if(account){try{if(ensureTwitch)await ensureTwitch(account);app.twitchChatPlugin=getTwitch(account);if(!sns.selectedTwitchUsername)sns.selectedTwitchUsername=account.username;}catch{log('Twitch connection could not start.');}}
    if(sns.discordAccounts[0]?.access_token){try{getDiscord(sns.discordAccounts[0].access_token);}catch{log('Discord connection could not start.');}}
  },1000);
  return state;
}
function notify(text){
  if(!global.document)return;
  const box=document.createElement('div');box.textContent=String(text);box.style.cssText='position:fixed;bottom:72px;left:20px;z-index:2147483647;background:#17446b;color:white;padding:16px;border-radius:10px;max-width:380px;font:14px Arial;box-shadow:0 4px 25px #0008';document.body.appendChild(box);setTimeout(()=>box.remove(),6000);
}
function loadAddons(){
  for(const remove of state.listeners)try{remove();}catch{}state.listeners=[];
  for(const addon of state.addons)try{addon.dispose?.();}catch{}
  state.actions.clear();state.addons=[];
  const config=readJson(path.join(state.root,'addons.json'),{disabled:[]});
  for(const name of fs.readdirSync(state.addonRoot)){
    if(!/^[a-z0-9][a-z0-9_-]*$/.test(name))continue;
    const folder=path.join(state.addonRoot,name),manifest=readJson(path.join(folder,'manifest.json'),null);
    if(!manifest||manifest.id!==name||manifest.apiVersion!==1)continue;
    const row={id:name,name:String(manifest.name||name),enabled:!config.disabled.includes(name)};state.addons.push(row);
    if(!row.enabled)continue;
    try{
      const entry=path.join(folder,'index.cjs');delete require.cache[require.resolve(entry)];
      const api={
        registerAction(id,label,run){
          if(!/^[a-z0-9][a-z0-9_-]*$/.test(id)||typeof run!=='function')throw Error('Invalid action');
          state.actions.set(`${name}/${id}`,{addon:name,label:String(label),run});
        },
        getSettings(){return readJson(path.join(state.root,`settings-${name}.json`),{});},
        setSettings(value){atomicWriteSync(path.join(state.root,`settings-${name}.json`),JSON.stringify(value,null,2));},
        notify,log:message=>state.log(`[${name}] ${message}`),
        async openExternal(url){const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw Error('Use http(s) URLs');await require('electron').shell.openExternal(u.href);},
        async obsCall(type,data={}){if(!state.store.state.checkOBSStatus)throw Error('OBS is disconnected');return state.app.obsPlugin.ws.call(type,data);},
        onInput(callback){
          const channels=['replyM4315IoStatus','replyM3704IoStatus','replyM002IoStatus','replyM003IoStatus','replyM131IoStatus'];
          const disposers=channels.map(channel=>{const fn=(_event,value)=>{try{Promise.resolve(callback({channel,...value})).catch(()=>state.log(`[${name}] Input handler failed`));}catch{state.log(`[${name}] Input handler failed`);}};state.ipc.on(channel,fn);return()=>state.ipc.removeListener(channel,fn);});
          const dispose=()=>disposers.forEach(f=>f());state.listeners.push(dispose);return dispose;
        }
      };
      const addon=require(entry);if(typeof addon.activate!=='function')throw Error('Missing activate(api)');
      const dispose=addon.activate(api);if(dispose&&typeof dispose.then==='function')throw Error('activate must be synchronous; start asynchronous work inside actions');
      row.dispose=typeof dispose==='function'?dispose:null;state.log(`Loaded ${row.name}`);
    }catch{row.error='Load failed; check manifest and index.cjs';state.log(`${row.name}: ${row.error}`);for(const [key,action] of state.actions)if(action.addon===name)state.actions.delete(key);}
  }
}
function isAddonURL(url){try{const u=new URL(url);return u.protocol==='mhaddon:'||(u.protocol==='https:'&&u.hostname==='masterhub-addon.invalid');}catch{return false;}}
async function runURL(url,context={}){
  try{
    const sdContext=require('./streamdeck/renderer.cjs').contextFromURL(url);if(sdContext){if(context.source==='keypad')return;return state?.streamdeckTest?.(sdContext);}
    const u=new URL(url),key=u.protocol==='mhaddon:'?u.hostname+u.pathname:u.pathname.slice(1);
    const action=state?.actions.get(key.replace(/\/$/,''));
    if(!action)throw Error('Unknown or disabled add-on action');
    // One in-flight invocation per action; prevents repeated hardware events duplicating work.
    if(action.busy)return;
    action.busy=true;try{return await action.run({params:Object.fromEntries(u.searchParams),...context});}finally{action.busy=false;}
  }catch{notify('Add-on action failed or is unavailable. Check Add-ons and its configuration.');state?.log('An add-on action failed.');}
}
function buildPanel(){
  const button=document.createElement('button');button.textContent='Add-ons';button.style.cssText='position:fixed;bottom:14px;left:18px;z-index:2147483645;background:#1766a5;color:#fff;border:1px solid #6bb8f1;border-radius:8px;padding:10px 18px;cursor:pointer;font:14px Arial';
  document.body.appendChild(button);button.onclick=()=>{if(state.panel){state.panel.remove();state.panel=null;}else renderPanel();};
}
function renderPanel(){
  state.panel?.remove();
  const panel=floatingPanel('addons','Add-ons');state.panel=panel;
  const add=(tag,text,parent=panel)=>{const el=document.createElement(tag);el.textContent=text;parent.appendChild(el);return el;};
  const btn=(label,fn,parent=panel)=>{const el=add('button',label,parent);el.style.cssText='margin:5px;padding:8px 12px;background:#245983;border:0;border-radius:5px;color:white;cursor:pointer';el.onclick=fn;return el;};
  const heading=add('h2','MasterHUB Community');
  const updateStatus=add('p','Reading update status…');
  const showUpdate=s=>{heading.textContent='MasterHUB Community • '+s.current+' experimental';updateStatus.textContent=(s.pending?'Version '+s.pending+' downloaded. ':'')+s.message;};
  state.ipc.invoke('mhc-update-status').then(showUpdate).catch(()=>{updateStatus.textContent='Update service unavailable';});
  btn('Check for updates',async()=>{updateStatus.textContent='Checking GitHub…';try{showUpdate(await state.ipc.invoke('mhc-update-check'));}catch{updateStatus.textContent='Update check failed; current version is unchanged';}});
  add('p','Custom actions and saving repairs. Add-ons run as desktop code: install only code you trust.');
  btn('Close',()=>{panel.remove();state.panel=null;});btn('Save profile now',async()=>{await state.saveProfile();renderPanel();});
  btn('Open add-ons folder',()=>require('electron').shell.openPath(state.addonRoot));btn('Reload add-ons',()=>{loadAddons();renderPanel();});
  add('p','Move this panel by its title bar; resize using its bottom-right corner. Drag an action onto an empty keypad key to assign and save it. Copy URL is still available.');
  for(const addon of state.addons){
    const row=add('div','');row.style.cssText='border-top:1px solid #345;padding:12px 0';add('strong',`${addon.name}${addon.error?' — '+addon.error:''}`,row);
    btn(addon.enabled?'Disable':'Enable',()=>{const file=path.join(state.root,'addons.json');const config=readJson(file,{disabled:[]});config.disabled=addon.enabled?[...new Set([...config.disabled,addon.id])]:config.disabled.filter(id=>id!==addon.id);atomicWriteSync(file,JSON.stringify(config));loadAddons();renderPanel();},row);
    for(const [key,action] of state.actions)if(action.addon===addon.id){
      const line=add('div','',row);const handle=add('span','↗ '+action.label,line);bindings.draggable(handle,{url:`https://masterhub-addon.invalid/${key}`,label:action.label});btn('Run',()=>runURL(`https://masterhub-addon.invalid/${key}`,{source:'panel'}),line);btn('Copy URL',()=>{require('electron').clipboard.writeText(`https://masterhub-addon.invalid/${key}`);notify('Action URL copied.');},line);
    }
  }
  add('h3','Status');add('pre',state.logs.join('\n')).style.whiteSpace='pre-wrap';
}
module.exports={dragOverAction:bindings.dragOver,dropAction:(event,target)=>state?bindings.drop(event,target,state):false,install,obsCheck,isAddonURL,runURL,readLocal,updateTwitchTokens(username,tokens){const account=state?.store.state.sns.twitchAccounts.find(a=>a.username===username);if(account&&tokens.access_token){account.access_token=tokens.access_token;if(tokens.refresh_token)account.refresh_token=tokens.refresh_token;state.persist();}},...connections};
Object.assign(module.exports,require('./profiles.cjs'));
