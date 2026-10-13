'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const {readManifest}=require('./manifest.cjs');
const {Host,inside}=require('./core.cjs');const {readJson,atomicWriteSync}=require('../storage.cjs');
const {importPlugin}=require('./importer.cjs');
const {createDecrypter}=require('./decrypt.cjs');
exports.install=electron=>{
 const {app,ipcMain,BrowserWindow,dialog,shell}=electron;
 const root=path.join(app.getPath('appData'),'MasterHub','community','streamdeck'),pluginsDir=path.join(root,'plugins');fs.mkdirSync(pluginsDir,{recursive:true});
 const viewers=new Set();let updateTimer=null,server,port,ready;
 const host=new Host({root,openURL:url=>shell.openExternal(url),changed:()=>{
  if(updateTimer)return;updateTimer=setTimeout(()=>{updateTimer=null;const snap=host.snapshot();for(const wc of viewers)if(!wc.isDestroyed())wc.send('dng-sd-update',snap);else viewers.delete(wc);},100);
 }});
 const decrypt=createDecrypter({root,dialog,log:message=>host.log(message)});let importing=false;
 const running=new Map(),windows=new Set(),starting=new Map(),generation=new Map();
 function scan(){for(const name of fs.readdirSync(pluginsDir)){if(!name.endsWith('.sdPlugin'))continue;const folder=path.join(pluginsDir,name);try{const manifest=readManifest(folder);if(!host.plugins.has(manifest.UUID))host.addPlugin(folder);}catch(error){host.log(`Import unavailable: ${name}: ${error.message}`);}}}
 function bootstrap(){
  if(ready)return ready;
  ready=new Promise((resolve,reject)=>{
   const WS=require(path.join(process.resourcesPath,'..','daemon','resources','app.asar','node_modules','ws'));
   server=new WS.Server({host:'127.0.0.1',port:0,maxPayload:3*1024*1024,perMessageDeflate:false});
   server.once('listening',()=>{port=server.address().port;resolve();});server.on('error',reject);
   server.on('connection',socket=>{
    const timer=setTimeout(()=>{if(!host.connections.has(socket))socket.close(1008,'Registration timeout');},5000);
    socket.on('message',raw=>{try{host.receive(socket,raw);}catch{host.log('Plugin sent an invalid command.');}});
    socket.on('close',()=>{clearTimeout(timer);host.disconnected(socket);});socket.on('error',()=>{});
   });
  });return ready;
 }
 function connectPage(window,file,parameters){
  window.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(['https:','http:'].includes(u.protocol))shell.openExternal(u.href);}catch{}return{action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file:')){event.preventDefault();try{if(['https:','http:'].includes(new URL(url).protocol))shell.openExternal(url);}catch{}}});
  window.webContents.once('did-finish-load',()=>{
   const args=JSON.stringify(parameters);
   window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let tries=0;function start(){if(typeof window.connectElgatoStreamDeckSocket==='function'){try{window.connectElgatoStreamDeckSocket(...${args});resolve(true)}catch(e){reject(e)}}else if(++tries<100)setTimeout(start,100);else reject(new Error('Registration function missing'))}start()})`).catch(()=>host.log('Plugin page did not register. Check its compatibility.'));
  });window.loadFile(file).catch(()=>host.log('Plugin page could not be loaded.'));
 }
 async function nodeFor(version){
  const config=readJson(path.join(root,'runtimes.json'),{}),candidates=[config[String(version)],path.join(process.env.ProgramFiles||'C:\\Program Files','nodejs','node.exe')].filter(Boolean);
  for(const exe of candidates)try{const v=cp.execFileSync(exe,['-p','process.versions.node'],{encoding:'utf8',timeout:5000,windowsHide:true}).trim();if(Number(v.split('.')[0])===Number(version))return exe;}catch{}
  throw Error(`Node.js ${version} is required. Use Locate Node.js (optional) after installing that version.`);
 }
 function start(uuid){
  if(starting.has(uuid))return starting.get(uuid);
  const task=launch(uuid).finally(()=>{if(starting.get(uuid)===task)starting.delete(uuid);});starting.set(uuid,task);return task;
 }
 async function launch(uuid){
  const gen=generation.get(uuid)||0;
  if(running.has(uuid))return;
  const p=host.plugins.get(uuid);if(!p)throw Error('Unknown plugin');await bootstrap();if((generation.get(uuid)||0)!==gen)return;
  const token=host.ticket(uuid);p.status='Starting';host.changed();
  const args=['-port',String(port),'-pluginUUID',token,'-registerEvent','registerPlugin','-info',JSON.stringify(host.info(uuid))];
  try{
   const ext=path.extname(p.entry).toLowerCase();let resource;
   if(['.html','.htm'].includes(ext)){
    resource=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});windows.add(resource);
    connectPage(resource,p.entry,[String(port),token,'registerPlugin',JSON.stringify(host.info(uuid))]);resource.on('closed',()=>{windows.delete(resource);if(running.get(uuid)===resource){running.delete(uuid);p.status='Stopped';host.changed();}});
   }else{
    let exe=p.entry,params=args;if(['.js','.cjs','.mjs'].includes(ext)){exe=await nodeFor(p.manifest.Nodejs?.Version||20);params=['--enable-source-maps',p.entry,...args];}
    else if(ext!=='.exe')throw Error('Only Windows EXE, Node.js and HTML plugin entry points are supported');
    if((generation.get(uuid)||0)!==gen){host.sessions.delete(token);return;}
    resource=cp.spawn(exe,params,{cwd:p.folder,windowsHide:true,stdio:'ignore',shell:false});
    resource.on('error',()=>{if(running.get(uuid)===resource){running.delete(uuid);p.status='Launch failed';host.changed();}});resource.on('exit',code=>{if(running.get(uuid)===resource){running.delete(uuid);p.status=`Stopped (${code??'closed'})`;host.changed();}});
   }
   running.set(uuid,resource);
  }catch(error){host.sessions.delete(token);p.status=error.message;host.changed();throw error;}
 }
 function stop(uuid){
  generation.set(uuid,(generation.get(uuid)||0)+1);starting.delete(uuid);
  const p=host.plugins.get(uuid),resource=running.get(uuid);running.delete(uuid);
  if(p?.token)host.sessions.delete(p.token);for(const [token,s] of host.sessions)if(s.pluginID===uuid)host.sessions.delete(token);
  for(const [socket,s] of host.connections)if(s.pluginID===uuid)socket.close();
  for(const window of [...windows])if(window._dngPlugin===uuid&&!window.isDestroyed())window.close();
  if(resource){if(resource.webContents&&!resource.isDestroyed())resource.close();else resource.kill?.();}if(p){p.socket=null;p.status='Disabled';}host.changed();
 }
 async function inspector(context){
  const item=host.db.instances[context],p=host.plugins.get(item?.plugin),action=p?.manifest.Actions.find(a=>a.UUID===item.action);if(!p)throw Error('Unknown action instance');
  const relative=action?.PropertyInspectorPath||p.manifest.PropertyInspectorPath;if(!relative)throw Error('This plugin does not provide a settings panel');
  if(!host.db.enabled.includes(item.plugin))throw Error('Enable this plugin first');await start(item.plugin);
  const file=inside(p.folder,relative),token=host.ticket(item.plugin,'ui',context);
  const window=new BrowserWindow({title:`${action.Name} — settings`,width:520,height:720,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});window._dngPlugin=item.plugin;windows.add(window);
  window.on('closed',()=>{windows.delete(window);host.sessions.delete(token);});
  connectPage(window,file,[String(port),token,'registerPropertyInspector',JSON.stringify(host.info(item.plugin)),JSON.stringify(host.actionEvent(context,'willAppear'))]);
 }
 ipcMain.handle('dng-sd-command',async(event,command={})=>{
  viewers.add(event.sender);
  try{
   scan();switch(command.type){
    case 'list':break;
    case 'folder':await shell.openPath(pluginsDir);break;
    case 'import':{
     if(importing)throw Error('An import is already running. Wait for it to finish.');importing=true;
     try{
      const result=await dialog.showOpenDialog({title:'Select an extracted .sdPlugin folder',properties:['openDirectory']});if(result.canceled)break;
      host.log('Importing plugin copy…');
      const uuid=await importPlugin({source:result.filePaths[0],pluginsDir,host,decrypt});host.log('Imported '+uuid+'. Enable it to test compatibility.');
     }finally{importing=false;}break;
    }
    case 'node':{
     const result=await dialog.showOpenDialog({title:'Select node.exe (Node.js 20 or 24)',properties:['openFile'],filters:[{name:'Node.js executable',extensions:['exe']}]});if(result.canceled)break;
     const exe=result.filePaths[0];if(path.basename(exe).toLowerCase()!=='node.exe')throw Error('Select node.exe');
     const major=Number(cp.execFileSync(exe,['-p','process.versions.node'],{encoding:'utf8',timeout:5000,windowsHide:true}).trim().split('.')[0]);if(![20,24].includes(major))throw Error('Select Node.js 20 or 24');
     const file=path.join(root,'runtimes.json'),config=readJson(file,{});config[String(major)]=exe;atomicWriteSync(file,JSON.stringify(config));break;
    }
    case 'enable':if(!host.plugins.has(command.uuid))throw Error('Unknown plugin');if(!host.db.enabled.includes(command.uuid))host.db.enabled.push(command.uuid);host.save();await start(command.uuid);break;
    case 'disable':host.db.enabled=host.db.enabled.filter(x=>x!==command.uuid);host.save();stop(command.uuid);break;
    case 'restart':if(!host.db.enabled.includes(command.uuid))throw Error('Enable first');stop(command.uuid);await start(command.uuid);break;
    case 'create':return{ok:true,context:host.create(command.uuid,command.action),snapshot:host.snapshot()};
    case 'remove':host.remove(command.context);break;
    case 'configure':await inspector(command.context);break;
    case 'test':{
     const item=host.db.instances[command.context];if(!item)throw Error('Unknown action');if(!host.plugins.get(item.plugin)?.socket)throw Error('Plugin is not connected');
     const visible=host.visible.has(command.context);if(!visible){host.visible.set(command.context,{device:'community-preview',column:0,row:0,columns:5});host.sendAction(command.context,'willAppear');}
     host.key(command.context,true);setTimeout(()=>{host.key(command.context,false);if(!visible){host.sendAction(command.context,'willDisappear');host.visible.delete(command.context);}},80);break;
    }
    default:throw Error('Unknown host command');
   }return{ok:true,snapshot:host.snapshot()};
  }catch(error){return{ok:false,error:error.message,snapshot:host.snapshot()};}
 });
 ipcMain.on('dng-sd-layout',(_event,slots)=>{if(Array.isArray(slots))host.layout(slots);});
 ipcMain.on('dng-sd-key',(_event,{context,down}={})=>{if(typeof context==='string'&&typeof down==='boolean')host.key(context,down);});
 app.whenReady().then(async()=>{scan();for(const uuid of host.db.enabled)try{await start(uuid);}catch{}});
 app.on('before-quit',()=>{for(const uuid of [...running.keys()])stop(uuid);for(const window of windows)if(!window.isDestroyed())window.destroy();for(const client of server?.clients||[])client.terminate();server?.close();});
 return host;
};
