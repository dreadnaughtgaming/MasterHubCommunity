'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {Host,inside}=require('../src/streamdeck/core.cjs');
const {slotsFromGetters}=require('../src/streamdeck/renderer.cjs');
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mh-sd-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const folder=path.join(root,'plugin');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'index.html'),'');
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({UUID:'com.test.plugin',Name:'Test',CodePath:'index.html',Actions:[{UUID:'com.test.action',Name:'Counter',States:[{},{}]}]}));
 const h=new Host({root});h.addPlugin(folder);const c=h.create('com.test.plugin','com.test.action');
 const socket=()=>({readyState:1,messages:[],send(x){this.messages.push(JSON.parse(x))},close(code){this.closed=code}});
 const s=socket();h.receive(s,JSON.stringify({event:'registerPlugin',uuid:h.ticket('com.test.plugin')}));
 const send=(event,payload={},context=c)=>h.receive(s,JSON.stringify({event,payload,context}));
 return {root,folder,h,c,s,send,socket};
}
test('registration requires a one-use ticket',t=>{
 const {h,socket}=setup(t),token=h.ticket('com.test.plugin'),a=socket(),b=socket();
 h.receive(a,JSON.stringify({event:'registerPlugin',uuid:token}));h.receive(b,JSON.stringify({event:'registerPlugin',uuid:token}));
 assert.equal(b.closed,1008);assert.equal(h.connections.has(a),true);
});
test('settings and global settings survive host restart',t=>{
 const {h,c,root,send}=setup(t);send('setSettings',{count:7});send('setGlobalSettings',{theme:'blue'});
 const next=new Host({root});assert.equal(next.db.instances[c].settings.count,7);assert.equal(next.db.globals['com.test.plugin'].theme,'blue');
});
test('held key is released before disappearing, duplicate release ignored',t=>{
 const {h,c,s}=setup(t);h.layout([{context:c,device:'unit',column:0,row:0,columns:5}]);s.messages=[];
 h.key(c,true);h.key(c,true);h.layout([]);h.key(c,false);
 assert.deepEqual(s.messages.filter(x=>x.context).map(x=>x.event),['keyDown','keyUp','willDisappear']);
 assert.equal(h.db.instances[c].state,1);
});
test('property inspector is bound to its own context and exchanges messages',t=>{
 const {h,c,s,socket}=setup(t),ui=socket(),other=h.create('com.test.plugin','com.test.action');
 h.receive(ui,JSON.stringify({event:'registerPropertyInspector',uuid:h.ticket('com.test.plugin','ui',c)}));
 h.receive(ui,JSON.stringify({event:'setSettings',context:other,payload:{value:3}}));
 assert.deepEqual(h.db.instances[c].settings,{value:3});assert.deepEqual(h.db.instances[other].settings,{});
 h.receive(ui,JSON.stringify({event:'sendToPlugin',payload:{hello:1}}));assert.equal(s.messages.at(-1).context,c);
});
test('plugin cannot change another plugins action settings',t=>{
 const {h,c,send}=setup(t);h.db.instances.foreign={plugin:'other',settings:{}};send('setSettings',{bad:true},'foreign');
 assert.deepEqual(h.db.instances.foreign.settings,{});
 send('setTitle',{title:'Hello'});assert.equal(h.snapshot().instances.find(i=>i.context===c).title,'Hello');
});
test('path traversal and external symlinks rejected',t=>{
 const {folder,root}=setup(t);fs.writeFileSync(path.join(root,'outside'),'secret');
 assert.throws(()=>inside(folder,'../outside'));fs.symlinkSync(path.join(root,'outside'),path.join(folder,'link'));assert.throws(()=>inside(folder,'link'));
});
test('four-key folder mapping uses current page and folder',t=>{
 const {c}=setup(t),button={btnFunc:'web-url',url:'https://masterhub-addon.invalid/streamdeck/'+c};
 const slots=slotsFromGetters({m3704Alive:[{serialNumber:'four'}],keypadBtnConfig:{four:{currentPage:1,viewMode:'folder',currentFolderIndex:0}},keypadBtnList:{four:[[],[{folder:[{}, {},button]}]]}});
 assert.equal(slots[0].row,1);assert.equal(slots[0].column,0);assert.equal(slots[0].kind,'m3704');
});
test('loopback WebSocket registration and settings round trip',{skip:!process.env.MASTERHUB_WS_PATH},async t=>{
 const WS=require(process.env.MASTERHUB_WS_PATH),{h,c}=setup(t),server=new WS.Server({host:'127.0.0.1',port:0});
 t.after(()=>server.close());server.on('connection',s=>s.on('message',raw=>h.receive(s,raw)));
 await new Promise(r=>server.once('listening',r));const client=new WS('ws://127.0.0.1:'+server.address().port);
 t.after(()=>client.terminate());await new Promise(r=>client.once('open',r));
 const reply=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('reply timeout')),2000);client.on('message',raw=>{const m=JSON.parse(raw);if(m.event==='didReceiveSettings'){clearTimeout(timer);resolve(m)}})});
 client.send(JSON.stringify({event:'registerPlugin',uuid:h.ticket('com.test.plugin')}));
 client.send(JSON.stringify({event:'setSettings',context:c,payload:{counter:9}}));
 client.send(JSON.stringify({event:'getSettings',context:c,id:'request-1'}));
 const m=await reply;assert.equal(m.payload.settings.counter,9);assert.equal(m.id,'request-1');client.close();
});

test('protected manifest gives an actionable error before import',t=>{
 const {folder}=setup(t);fs.writeFileSync(path.join(folder,'manifest.json'),'ELGATO[]protected');
 assert.throws(()=>require('../src/streamdeck/manifest.cjs').readManifest(folder),/still ELGATO-protected/);
});
test('manifest accepts UTF-8 BOM and explains malformed JSON',t=>{
 const {folder}=setup(t),file=path.join(folder,'manifest.json'),read=require('../src/streamdeck/manifest.cjs').readManifest;
 fs.writeFileSync(file,'\uFEFF'+JSON.stringify({UUID:'com.test'}));assert.equal(read(folder).UUID,'com.test');
 fs.writeFileSync(file,'broken');assert.throws(()=>read(folder),/not valid JSON/);
});
test('integrated encrypted import changes only the copied manifest',async t=>{
 const {h,folder,root}=setup(t),{importPlugin}=require('../src/streamdeck/importer.cjs');
 const plain=fs.readFileSync(path.join(folder,'manifest.json'));fs.writeFileSync(path.join(folder,'manifest.json'),'ELGATO fixture');
 h.plugins.clear();const pluginsDir=path.join(root,'imported');fs.mkdirSync(pluginsDir);
 const uuid=await importPlugin({source:folder,pluginsDir,host:h,decrypt:async(input,output)=>{assert.notEqual(input,path.join(folder,'manifest.json'));fs.writeFileSync(output,plain);}});
 assert.equal(uuid,'com.test.plugin');assert.equal(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'),'ELGATO fixture');
 assert.deepEqual(fs.readFileSync(path.join(pluginsDir,uuid+'.sdPlugin','manifest.json')),plain);
 assert.deepEqual(fs.readdirSync(pluginsDir),[uuid+'.sdPlugin']);
});
test('failed integrated conversion publishes nothing and cleans temporary copy',async t=>{
 const {h,folder,root}=setup(t),{importPlugin}=require('../src/streamdeck/importer.cjs');
 fs.writeFileSync(path.join(folder,'manifest.json'),'ELGATO fixture');const pluginsDir=path.join(root,'imported');fs.mkdirSync(pluginsDir);
 await assert.rejects(importPlugin({source:folder,pluginsDir,host:h,decrypt:async(i,o)=>fs.writeFileSync(o,'invalid')}),/not valid JSON/);
 assert.deepEqual(fs.readdirSync(pluginsDir),[]);assert.equal(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'),'ELGATO fixture');
});
test('plain import needs no decrypter and refuses duplicate replacement',async t=>{
 const {h,folder,root}=setup(t),{importPlugin}=require('../src/streamdeck/importer.cjs');h.plugins.clear();
 const pluginsDir=path.join(root,'imported');fs.mkdirSync(pluginsDir);const args={source:folder,pluginsDir,host:h,decrypt:()=>{throw Error('should not run')}};
 await importPlugin(args);await assert.rejects(importPlugin(args),/already imported/);assert.deepEqual(fs.readdirSync(pluginsDir),['com.test.plugin.sdPlugin']);
});
test('import source containing destination rejected before recursive copy',async t=>{
 const {h,root}=setup(t),{importPlugin}=require('../src/streamdeck/importer.cjs');const pluginsDir=path.join(root,'imported');fs.mkdirSync(pluginsDir);
 await assert.rejects(importPlugin({source:root,pluginsDir,host:h}),/outside/);assert.deepEqual(fs.readdirSync(pluginsDir),[]);
});
