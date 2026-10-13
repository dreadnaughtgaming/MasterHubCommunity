'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {atomicWriteSync,readJson}=require('../storage.cjs');
const {readManifest}=require('./manifest.cjs');
const id=()=>crypto.randomUUID();
function inside(root,name){
 if(typeof name!=='string'||!name||path.isAbsolute(name))throw Error('Plugin path must be relative');
 const target=path.resolve(root,name),rel=path.relative(path.resolve(root),target);
 if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Plugin path leaves its folder');
 const realRoot=fs.realpathSync(root),real=fs.realpathSync(target),r=path.relative(realRoot,real);
 if(r==='..'||r.startsWith('..'+path.sep)||path.isAbsolute(r))throw Error('Plugin symlink leaves its folder');return target;
}
class Host{
 constructor({root,changed=()=>{},openURL=()=>{}}){
  this.root=root;fs.mkdirSync(root,{recursive:true});this.dbFile=path.join(root,'state.json');
  this.db=readJson(this.dbFile,{instances:{},globals:{},enabled:[]});this.plugins=new Map();this.sessions=new Map();this.connections=new Map();this.visible=new Map();this.devices=new Map();this.pressed=new Set();this.changed=changed;this.openURL=openURL;this.logs=[];
 }
 save(){atomicWriteSync(this.dbFile,JSON.stringify(this.db,null,2));}
 log(text){this.logs.push(String(text).slice(0,300));if(this.logs.length>30)this.logs.shift();this.changed();}
 addPlugin(folder){
  const manifest=readManifest(folder);
  if(!/^[a-z0-9][a-z0-9.-]+$/.test(manifest.UUID)||!Array.isArray(manifest.Actions))throw Error('Invalid Stream Deck manifest');
  if(!manifest.Actions.every(a=>typeof a.UUID==='string'&&typeof a.Name==='string'))throw Error('Invalid action metadata');
  if(manifest.OS&&!manifest.OS.some(x=>x.Platform==='windows'))throw Error('Plugin does not declare Windows support');
  const entry=inside(folder,manifest.CodePathWin||manifest.CodePath);
  const existing=this.plugins.get(manifest.UUID);if(existing?.folder!==folder&&existing)throw Error('Duplicate plugin UUID');
  this.plugins.set(manifest.UUID,{manifest,folder,entry,status:'Disabled',token:null,socket:null});return manifest.UUID;
 }
 create(pluginID,actionID){
  const plugin=this.plugins.get(pluginID),action=plugin?.manifest.Actions.find(a=>a.UUID===actionID);
  if(!action||action.Controllers&&!action.Controllers.includes('Keypad'))throw Error('This action does not support keypad buttons');
  const context=id();this.db.instances[context]={plugin:pluginID,action:actionID,name:action.Name,settings:{},state:0,titles:{},images:{}};this.save();this.changed();return context;
 }
 remove(context){const item=this.db.instances[context];if(!item)return;this.key(context,false);this.sendAction(context,'willDisappear');this.visible.delete(context);delete this.db.instances[context];this.save();this.changed();}
 info(pluginID){const p=this.plugins.get(pluginID);return{application:{font:'Arial',language:'en',platform:'windows',platformVersion:'10',version:'6.9.0'},colors:{buttonMouseOverBackgroundColor:'#303030',buttonPressedBackgroundColor:'#303030',buttonPressedBorderColor:'#707070',buttonPressedTextColor:'#ffffff',highlightColor:'#2196f3'},devicePixelRatio:1,devices:[...this.devices].map(([device,v])=>({id:device,...v})),plugin:{uuid:pluginID,version:p.manifest.Version||'1.0.0.0'}};}
 ticket(pluginID,kind='plugin',context=null){const token=id();this.sessions.set(token,{pluginID,kind,context});if(kind==='plugin')this.plugins.get(pluginID).token=token;return token;}
 send(socket,data){if(socket?.readyState===1)socket.send(JSON.stringify(data));}
 actionEvent(context,event){const item=this.db.instances[context],slot=this.visible.get(context);if(!item)return null;return{event,action:item.action,context,device:slot?.device||'community-preview',payload:{controller:'Keypad',coordinates:{column:slot?.column||0,row:slot?.row||0},settings:item.settings,state:item.state,isInMultiAction:false,resources:{}}};}
 sendAction(context,event,extra={}){const item=this.db.instances[context],message=this.actionEvent(context,event);if(message)this.send(this.plugins.get(item.plugin)?.socket,{...message,...extra});}
 settings(socket,context,idValue){const message=this.actionEvent(context,'didReceiveSettings');if(message)this.send(socket,{...message,...(idValue!==undefined?{id:idValue}:{})});}
 globals(socket,pluginID,idValue){this.send(socket,{event:'didReceiveGlobalSettings',...(idValue!==undefined?{id:idValue}:{}),payload:{settings:this.db.globals[pluginID]||{}}});}
 receive(socket,raw){
  let msg;try{msg=JSON.parse(String(raw));}catch{socket.close(1007,'Invalid JSON');return;}
  if(!msg||typeof msg.event!=='string')return;
  if(!this.connections.has(socket)){
   const ticket=this.sessions.get(msg.uuid);
   if(!ticket||msg.event!==(ticket.kind==='plugin'?'registerPlugin':'registerPropertyInspector')){socket.close(1008,'Registration required');return;}
   this.sessions.delete(msg.uuid);this.connections.set(socket,ticket);
   const plugin=this.plugins.get(ticket.pluginID);
   if(ticket.kind==='plugin'){
    if(plugin.socket&&plugin.socket!==socket)plugin.socket.close();plugin.socket=socket;plugin.status='Connected';
    for(const [device,deviceInfo] of this.devices)this.send(socket,{event:'deviceDidConnect',device,deviceInfo});
    this.globals(socket,ticket.pluginID);for(const [context,item] of Object.entries(this.db.instances))if(item.plugin===ticket.pluginID&&this.visible.has(context))this.sendAction(context,'willAppear');
   }else{this.settings(socket,ticket.context);this.globals(socket,ticket.pluginID);this.sendAction(ticket.context,'propertyInspectorDidAppear');}
   this.changed();return;
  }
  const session=this.connections.get(socket),plugin=this.plugins.get(session.pluginID);
  const context=session.kind==='ui'?session.context:msg.context,item=this.db.instances[context];
  const owned=item?.plugin===session.pluginID;
  const changedSettings=()=>{this.save();for(const [other,s] of this.connections)if(other!==socket&&s.pluginID===session.pluginID&&(s.kind==='plugin'||s.context===context))this.settings(other,context);this.changed();};
  switch(msg.event){
   case 'getGlobalSettings':this.globals(socket,session.pluginID,msg.id);break;
   case 'setGlobalSettings':if(msg.payload&&typeof msg.payload==='object'&&!Array.isArray(msg.payload)){this.db.globals[session.pluginID]=msg.payload;this.save();for(const [other,s] of this.connections)if(other!==socket&&s.pluginID===session.pluginID)this.globals(other,session.pluginID);}break;
   case 'getSettings':if(owned)this.settings(socket,context,msg.id);break;
   case 'setSettings':if(owned&&msg.payload&&typeof msg.payload==='object'&&!Array.isArray(msg.payload)){item.settings=msg.payload;changedSettings();}break;
   case 'getResources':if(owned){const event=this.actionEvent(context,'didReceiveResources');this.send(socket,{...event,...(msg.id!==undefined?{id:msg.id}:{})});}break;
   case 'sendToPlugin':if(owned&&session.kind==='ui')this.send(plugin.socket,{event:'sendToPlugin',action:item.action,context,payload:msg.payload});break;
   case 'sendToPropertyInspector':if(owned&&session.kind==='plugin')for(const [other,s] of this.connections)if(s.kind==='ui'&&s.context===context&&s.pluginID===session.pluginID)this.send(other,{event:'sendToPropertyInspector',action:item.action,context,payload:msg.payload});break;
   case 'setTitle':case 'setImage':case 'setState':
    if(!owned||session.kind!=='plugin')break;
    if(msg.event==='setState'){const n=msg.payload?.state,states=plugin.manifest.Actions.find(a=>a.UUID===item.action)?.States||[];if(Number.isInteger(n)&&n>=0&&n<Math.max(states.length,1)){item.state=n;this.save();}}
    else{
     const value=msg.payload?.[msg.event==='setTitle'?'title':'image'];if(typeof value!=='string'||value.length>2*1024*1024)break;
     const which=msg.event==='setTitle'?item.titles:item.images;
     if(Number.isInteger(msg.payload.state))which[msg.payload.state]=value;else which['*']=value;
    }
    this.changed();break;
   case 'showOk':case 'showAlert':if(owned){item.feedback=msg.event==='showOk'?'OK':'!';this.changed();setTimeout(()=>{if(item.feedback){delete item.feedback;this.changed();}},1200).unref?.();}break;
   case 'openUrl':{try{const u=new URL(msg.payload?.url);if(['https:','http:'].includes(u.protocol))this.openURL(u.href);}catch{}break;}
   case 'logMessage':this.log(`${plugin.manifest.Name}: ${String(msg.payload?.message||'')}`);break;
   default:if(!plugin.unsupported)plugin.unsupported=new Set();if(!plugin.unsupported.has(msg.event)){plugin.unsupported.add(msg.event);this.log(`${plugin.manifest.Name}: unsupported command ${msg.event}`);}break;
  }
 }
 disconnected(socket){const s=this.connections.get(socket);if(!s)return;this.connections.delete(socket);const p=this.plugins.get(s.pluginID);if(s.kind==='plugin'&&p?.socket===socket){p.socket=null;p.status='Disconnected';}else if(s.kind==='ui')this.sendAction(s.context,'propertyInspectorDidDisappear');this.changed();}
 layout(slots){
  const next=new Map(),devices=new Map();
  for(const slot of slots.slice(0,200)){if(!this.db.instances[slot.context]||next.has(slot.context))continue;if(typeof slot.device!=='string'||!Number.isInteger(slot.column)||!Number.isInteger(slot.row))continue;next.set(slot.context,slot);devices.set(slot.device,{name:'MasterHUB keypad',type:0,size:{columns:slot.columns===2?2:5,rows:slot.columns===2?2:3}});}
  for(const [context,old] of this.visible){const now=next.get(context);if(!now||JSON.stringify(now)!==JSON.stringify(old)){this.key(context,false);this.sendAction(context,'willDisappear');}}
  for(const [device] of this.devices)if(!devices.has(device))for(const p of this.plugins.values())this.send(p.socket,{event:'deviceDidDisconnect',device});
  for(const [device,deviceInfo] of devices)if(!this.devices.has(device))for(const p of this.plugins.values())this.send(p.socket,{event:'deviceDidConnect',device,deviceInfo});
  const old=this.visible;this.visible=next;this.devices=devices;
  for(const [context,now] of next)if(!old.has(context)||JSON.stringify(old.get(context))!==JSON.stringify(now))this.sendAction(context,'willAppear');
 }
 key(context,down){const item=this.db.instances[context];if(!item||!this.visible.has(context)||this.pressed.has(context)===down)return;if(down)this.pressed.add(context);else this.pressed.delete(context);this.sendAction(context,down?'keyDown':'keyUp');if(!down){const action=this.plugins.get(item.plugin)?.manifest.Actions.find(a=>a.UUID===item.action);if(action&&!action.DisableAutomaticStates&&action.States?.length===2){item.state=1-item.state;this.save();this.changed();}}}
 image(pluginID,value){
  if(!value)return null;
  if(/^data:image\/(png|jpeg|jpg|svg\+xml|gif|webp)[;,]/i.test(value))return value;
  const plugin=this.plugins.get(pluginID);for(const name of [value,value+'.png',value+'.svg'])try{const file=inside(plugin.folder,name);if(fs.statSync(file).size>2*1024*1024)return null;const ext=path.extname(file).toLowerCase();const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.gif':'image/gif'}[ext];if(mime)return`data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;}catch{}return null;
 }
 snapshot(){return{plugins:[...this.plugins].map(([uuid,p])=>({uuid,name:p.manifest.Name,status:p.status,enabled:this.db.enabled.includes(uuid),actions:p.manifest.Actions.filter(a=>!a.Controllers||a.Controllers.includes('Keypad')).map(a=>({uuid:a.UUID,name:a.Name})),node:p.manifest.Nodejs?.Version||null,unsupported:[...(p.unsupported||[])]})),instances:Object.entries(this.db.instances).map(([context,item])=>{const p=this.plugins.get(item.plugin),a=p?.manifest.Actions.find(a=>a.UUID===item.action),def=a?.States?.[item.state]||a?.States?.[0]||{};return{context,plugin:item.plugin,action:item.action,name:item.name,title:item.titles?.[item.state]??item.titles?.['*']??def.Title??item.name,image:this.image(item.plugin,item.images?.[item.state]??item.images?.['*']??def.Image),state:item.state,feedback:item.feedback||'',visible:this.visible.has(context)};}),logs:this.logs};}
}
module.exports={Host,inside};
