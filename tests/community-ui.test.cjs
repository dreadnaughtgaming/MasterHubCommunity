'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const elements=[],listeners={},timers=new Set();
 class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};this.attrs={};elements.push(this);}appendChild(x){this.children.push(x);return x;}setAttribute(k,v){this.attrs[k]=v;}replaceChildren(){this.children=[];}contains(x){return this===x||this.children.some(c=>c.contains(x));}remove(){this.removed=true;}scrollIntoView(){}}
 const document={createElement:t=>new Element(t),body:new Element('body'),addEventListener:(k,f)=>listeners[k]=f};
 const context={module:{exports:{}},document,require:()=>({floatingPanel:()=>new Element('panel')}),setInterval:f=>{timers.add(f);return f;},clearInterval:f=>timers.delete(f)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/community-ui.cjs'),'utf8'),context);
 return{ui:context.module.exports,elements,listeners,timers,document};
}
test('one launcher collects tools, opens an action, and dismisses on Escape',()=>{
 const {ui,document,listeners}=setup();let opened=0;ui.register('Add-ons',()=>opened++);ui.register('Updates',()=>{});ui.register('Stream Deck',()=>{});
 assert.equal(document.body.children.length,2);const [button,menu]=document.body.children;assert.equal(menu.children.length,3);button.onclick();assert.equal(menu.hidden,false);menu.children.find(x=>x.textContent==='Add-ons').onclick();assert.equal(opened,1);assert.equal(menu.hidden,true);button.onclick();listeners.keydown({key:'Escape'});assert.equal(menu.hidden,true);
});
test('update channel failure restores selected channel and close clears polling',async()=>{
 const {ui,elements,timers}=setup();const calls=[];const ipc={invoke:async(name,value)=>{calls.push([name,value]);if(name==='mhc-update-channel')throw Error('Wait for startup confirmation');return{current:'0.3.2',currentChannel:'stable',channel:'stable',message:'Up to date'};}};
 ui.openUpdates(ipc);await new Promise(r=>setImmediate(r));const select=elements.find(x=>x.tag==='select');select.value='test';await select.onchange();assert.equal(select.value,'stable');assert.equal(select.disabled,false);assert(calls.some(x=>x[0]==='mhc-update-channel'&&x[1]==='test'));assert.equal(timers.size,1);elements.find(x=>x.textContent==='Close').onclick();assert.equal(timers.size,0);
});
test('channel labels distinguish installed version and pending activation',()=>{
 const {ui}=setup();assert.equal(ui.describe({current:'0.4.0-test.2',currentChannel:'test',pending:'0.3.2'}).version,'0.4.0-test.2 · Beta');assert.match(ui.describe({current:'0.3.2',pending:'0.4.0-test.2'}).message,/Fully exit/);
});
