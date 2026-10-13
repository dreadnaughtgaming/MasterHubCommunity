'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const {atomicWriteSync,readJson}=require('../src/storage.cjs');
const {saveProfile}=require('../src/profiles.cjs');
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'masterhub-test-'));}
function getters(){return {flagFirstLoad:false,flagImportingConfig:false,currentBase64SerialNumber:'BASE',currentProfile:1,profiles:[{id:1,label:'Test',serialNumber:'BASE'}],keypadBtnConfig:{KEY:{currentPage:2}},keypadBtnList:{KEY:[[]]},knobsList:{K:{value:1},OTHER:{value:2}},m003Alive:[{serialNumber:'K',parentSerialNumber:'BASE'},{serialNumber:'OTHER',parentSerialNumber:'OTHERBASE'}],hubProfileMap:{BASE:{inUseProfileId:1}}};}
test('atomic save keeps last distinct valid backup; damaged primary recovers',()=>{
 const dir=temp(),file=path.join(dir,'profile1_BASE');try{
 atomicWriteSync(file,'{"value":1}');atomicWriteSync(file,'{"value":2}');atomicWriteSync(file,'{"value":2}');
 assert.equal(fs.readFileSync(file+'.bak','utf8'),'{"value":1}');fs.writeFileSync(file,'broken');assert.deepEqual(readJson(file,null),{value:1});
 atomicWriteSync(file,'{"value":3}');assert.equal(fs.readFileSync(file+'.bak','utf8'),'{"value":1}');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('failed final replacement leaves existing file intact and removes temp',()=>{
 const dir=temp(),file=path.join(dir,'settings.json'),rename=fs.renameSync;try{
 fs.writeFileSync(file,'{"ok":1}');fs.renameSync=(from,to)=>{if(to===file)throw Error('simulated sharing violation');return rename(from,to);};
 assert.throws(()=>atomicWriteSync(file,'{"ok":2}'),/sharing/);assert.equal(fs.readFileSync(file,'utf8'),'{"ok":1}');assert.equal(fs.readdirSync(dir).filter(x=>x.endsWith('.tmp')).length,0);
 }finally{fs.renameSync=rename;fs.rmSync(dir,{recursive:true,force:true});}
});
test('profile save snapshots selected base and clears busy flag',()=>{
 const commits={},writes=[];const payload=saveProfile({getters:getters(),commit:(k,v)=>commits[k]=v,pathFor:(b,p)=>`${p}_${b}`,hubPath:'hub.json',write:(p,t)=>writes.push([p,JSON.parse(t)])});
 assert.deepEqual(Object.keys(payload.knobsList),['K']);assert.equal(payload.keypadBtnConfig.KEY.currentPage,0);assert.equal(writes[0][0],'1_BASE');assert.equal(writes.length,2);assert.equal(commits.flagSyncingConfig,false);
});
test('write failure shows error and releases busy flag',()=>{
 const commits={};assert.throws(()=>saveProfile({getters:getters(),commit:(k,v)=>commits[k]=v,pathFor:()=>'',write:()=>{throw Error('EACCES');}}),/EACCES/);
 assert.equal(commits.flagSyncingConfig,false);assert.equal(commits.showProfileSaveErrorDialog,true);
});
test('serialisation failure does not touch disk and releases busy flag',()=>{
 const g=getters(),commits={};g.devices={};g.devices.loop=g.devices;let writes=0;
 assert.throws(()=>saveProfile({getters:g,commit:(k,v)=>commits[k]=v,pathFor:()=>'',write:()=>writes++}));assert.equal(writes,0);assert.equal(commits.flagSyncingConfig,false);
});
test('startup and wrong-base guards prevent profile overwrite',()=>{
 let writes=0;const args={getters:getters(),commit:()=>{},pathFor:()=>'',write:()=>writes++};args.getters.flagFirstLoad=true;assert.equal(saveProfile(args),null);
 args.getters.flagFirstLoad=false;args.getters.profiles[0].serialNumber='DIFFERENT';assert.throws(()=>saveProfile(args),/mismatch/);assert.equal(writes,0);
});
function connectionHarness(){
 const timers=new Map();let id=0;
 const sandbox={require,module:{exports:{}},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:i=>timers.delete(i),console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/connections.cjs'),'utf8'),sandbox);return{api:sandbox.module.exports,timers};
}
test('Streamlabs closed socket schedules retry; old callbacks cannot replace new session',()=>{
 const {api,timers}=connectionHarness();const sockets=[];let closed=0;
 class Socket{constructor(url){this.url=url;sockets.push(this);}close(){this.closed=true;}}
 const host={data:{requests:{}},onMessageHandler:async()=>{},request:async()=>{},onConnectionHandler:async()=>{}};
 const info={streamlabsIp:'localhost',streamlabsPort:1,streamlabsToken:'test',disconnectCallback:()=>closed++};
 api.connectStreamlabs(host,info,Socket);const stale=sockets[0].onclose;stale();assert.equal(closed,1);assert.ok([...timers.values()].some(x=>x.ms===500));
 api.connectStreamlabs(host,info,Socket);stale();assert.equal(closed,1);assert.equal(sockets.length,2);
});
test('Streamlabs without credentials opens no fake network connection',()=>{
 const{api}=connectionHarness();let opened=0;api.connectStreamlabs({data:{requests:{}}},{disconnectCallback(){}},class{constructor(){opened++;}});assert.equal(opened,0);
});
test('Streamlabs auth failure retries instead of recursive setup',async()=>{
 const{api,timers}=connectionHarness();class Socket{close(){}}
 const host={data:{requests:{}},request:async()=>{throw Error('auth');},onConnectionHandler:()=>{throw Error('must not reach');}};
 api.connectStreamlabs(host,{streamlabsIp:'localhost',streamlabsPort:1,streamlabsToken:'test',disconnectCallback(){}},Socket);
 await host.data.socket.onopen();assert.ok([...timers.values()].some(x=>x.ms===500));
});
test('Streamlabs pending request times out and is removed',async()=>{
 const{api,timers}=connectionHarness();const host={data:{socket:{readyState:1,send(){}},requests:{}}};
 const promise=api.sendStreamlabs(host,{id:9,method:'test'});const rejection=assert.rejects(promise,/timed out/);[...timers.values()][0].fn();await rejection;assert.equal(Object.keys(host.data.requests).length,0);
});
test('Discord failure is handled and schedules one retry',async()=>{
 const{api,timers}=connectionHarness();const host={clientId:'test',scopes:[],access_token:'fake',rpc:null};
 const result=await api.connectDiscord(host,()=>({on(){},login:async()=>{throw Error('closed');},destroy:async()=>{}}));assert.equal(result,null);assert.equal(timers.size,1);assert.equal(host._dngConnecting,null);
});
function runtimeHarness(dir,saved){
 const calls=[],local=new Map([['obsConnection',JSON.stringify({obsIp:'localhost',obsPort:4455,obsPwd:''})]]);
 const store={state:{sns:{twitchAccounts:[],discordAccounts:[]}},getters:{},commit:(key,value)=>calls.push([key,value]),watch(){},subscribe(){}};
 const ipc={sendSync:(channel,value)=>{if(channel==='dng-vault-load')return{ok:true,value:saved};calls.push([channel,value]);return{ok:true};},on(){},removeListener(){}};
 const localRequire=name=>name.startsWith('./')?require(path.join(__dirname,'../src',name)):require(name);localRequire.resolve=require.resolve;localRequire.cache=require.cache;
 const sandbox={__dirname:path.join(__dirname,'../src'),module:{exports:{}},require:localRequire,window:{localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},addEventListener(){}},global:{},setInterval:()=>1,setTimeout:()=>1,clearTimeout(){},console,URL,Buffer};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/runtime.cjs'),'utf8'),sandbox);
 const api=sandbox.module.exports;const state=api.install({store,app:{},ipc,base:dir,getTwitch(){},getDiscord(){}});return{api,state,store,calls,local,sandbox};
}
test('account and connection restoration happen before mount',()=>{
 const dir=temp();try{const h=runtimeHarness(dir,{sns:{twitchAccounts:[{username:'tester',access_token:'FAKE'}],discordAccounts:[],selectedTwitchUsername:'tester'}});
 assert.equal(h.store.state.sns.twitchAccounts.length,1);assert.ok(h.calls.some(([k,v])=>k==='obsIp'&&v==='localhost'));assert.ok(h.calls.some(([k,v])=>k==='obsPwd'&&v===''));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('example add-on action persists its counter between invocations',async()=>{
 const dir=temp();try{
 const example=path.join(dir,'community/addons/example');fs.mkdirSync(example,{recursive:true});fs.copyFileSync(path.join(__dirname,'../src/examples/example/manifest.json'),path.join(example,'manifest.json'));fs.copyFileSync(path.join(__dirname,'../src/examples/example/index.cjs'),path.join(example,'index.cjs'));
 const h=runtimeHarness(dir,null);assert.equal(h.state.actions.size,2);await h.api.runURL('https://masterhub-addon.invalid/example/counter');await h.api.runURL('mhaddon://example/counter');
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'community/settings-example.json'))).count,2);
 assert.equal(h.api.isAddonURL('https://example.com'),false);assert.equal(h.api.isAddonURL('https://masterhub-addon.invalid/example/hello'),true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('OBS retry never writes settings and permits an empty password',()=>{
 const dir=temp();try{
 const h=runtimeHarness(dir,null);let attempts=0;const vmObj={obsState:{},handleObsConnection(){}};
 const original=h.local.get('obsConnection');h.api.obsCheck(vmObj,{obsPlugin:{reconnect:(config,ok)=>{attempts++;assert.equal(config.obsPwd,'');ok();}}},{});
 assert.equal(attempts,1);assert.equal(h.local.get('obsConnection'),original);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('vault refuses plaintext persistence if OS encryption is unavailable',()=>{
 const dir=temp(),handlers={};try{
 require('../src/main.cjs').install({app:{getPath:()=>dir},ipcMain:{on:(name,handler)=>handlers[name]=handler},safeStorage:{isEncryptionAvailable:()=>false}});
 const event={};handlers['dng-vault-save'](event,{sns:{}});assert.equal(event.returnValue.ok,false);assert.equal(fs.existsSync(path.join(dir,'MasterHub/community/accounts.enc')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('vault round-trip calls encryption provider and preserves previous encrypted copy',()=>{
 const dir=temp(),handlers={};try{
 const provider={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('MOCK:'+Buffer.from(s).toString('base64')),decryptString:b=>Buffer.from(b.toString().slice(5),'base64').toString()};
 require('../src/main.cjs').install({app:{getPath:()=>dir},ipcMain:{on:(name,handler)=>handlers[name]=handler},safeStorage:provider});
 const event={};handlers['dng-vault-save'](event,{value:1});assert.equal(event.returnValue.ok,true);handlers['dng-vault-save'](event,{value:2});handlers['dng-vault-load'](event);
 assert.deepEqual(event.returnValue.value,{value:2});assert.equal(fs.existsSync(path.join(dir,'MasterHub/community/accounts.enc.previous')),true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
