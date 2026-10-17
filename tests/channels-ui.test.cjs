'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('bootstrap tray can return from older Stable to Test without renderer controls',async()=>{
 let tray,quit,channel='stable',checked=0;const dialogs=[];
 class Tray{constructor(){tray=this;}setToolTip(x){this.tooltip=x;}setContextMenu(x){this.menu=x;}on(){}destroy(){this.destroyed=true;}}
 const electron={Tray,Menu:{buildFromTemplate:x=>x},dialog:{showMessageBox:async x=>dialogs.push(x)},app:{whenReady:()=>Promise.resolve(),getFileIcon:async()=>({}),once:(_,fn)=>quit=fn}};
 const checker={status:()=>({current:'0.3.1',currentChannel:'stable',channel,message:'Ready'}),selectChannel:async x=>{channel=x;},check:async()=>checked++};
 require('../bootstrap/channels-ui.cjs').install(electron,checker);await new Promise(r=>setImmediate(r));
 assert.equal(tray.tooltip,'MasterHUB Community updates');
 await tray.menu.find(x=>x.label==='Beta / experimental').click();assert.equal(channel,'test');assert.equal(tray.menu[2].checked,true);
 await tray.menu.find(x=>x.label==='Check for updates').click();assert.equal(checked,1);assert.equal(dialogs.length,2);
 quit();assert.equal(tray.destroyed,true);
});
