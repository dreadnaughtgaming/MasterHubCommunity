'use strict';
function targets(g){
 const out=[];
 if(g.flagFirstLoad||g.flagImportingConfig||!g.currentProfile||!g.currentBase64SerialNumber)return out;
 for(const [kind,devices,count] of [['m4315',g.m4315Alive||[],15],['m3704',g.m3704Alive||[],4]])for(const {serialNumber} of devices){
  const cfg=g.keypadBtnConfig?.[serialNumber];if(!cfg)continue;
  const page=cfg.currentPage||0,folder=cfg.viewMode==='folder',list=g.keypadBtnList?.[serialNumber]?.[page];
  const buttons=folder?list?.[cfg.currentFolderIndex]?.folder:list;if(!Array.isArray(buttons))continue;
  buttons.slice(0,count).forEach((b,index)=>{if(!b||folder&&index===0||b.btnFunc||b.action||b.folder?.length)return;
   out.push({serialNumber,kind,index,page,viewMode:cfg.viewMode||'master',folderIndex:folder?cfg.currentFolderIndex:null,profile:g.currentProfile,base:g.currentBase64SerialNumber});
  });
 }return out;
}
const identity=t=>JSON.stringify([t.serialNumber,t.kind,t.index,t.page,t.viewMode,t.folderIndex,t.profile,t.base]);
const available=(g,t)=>targets(g).some(x=>identity(x)===identity(t));
function sameLayout(g,t){const cfg=g.keypadBtnConfig?.[t.serialNumber];return !!cfg&&g.currentProfile===t.profile&&g.currentBase64SerialNumber===t.base&&(cfg.currentPage||0)===t.page&&(cfg.viewMode||'master')===t.viewMode&&(cfg.viewMode!=='folder'||cfg.currentFolderIndex===t.folderIndex)&&(g[t.kind==='m4315'?'m4315Alive':'m3704Alive']||[]).some(x=>x.serialNumber===t.serialNumber);}
function contain(w,h,size=72){if(!(w>0&&h>0))throw Error('Video dimensions unavailable');const scale=Math.min(size/w,size/h);return{x:(size-w*scale)/2,y:(size-h*scale)/2,width:w*scale,height:h*scale};}
// There is never a queued frame: the next capture follows the prior hardware reply.
class FramePump{
 constructor({capture,send,valid,onError=()=>{},onFrame=()=>{},restore=async()=>{},schedule=setTimeout,cancel=clearTimeout,now=()=>Date.now()}){Object.assign(this,{capture,send,valid,onError,onFrame,restore,schedule,cancel,now});this.generation=0;this.inFlight=null;this.timer=null;this.running=false;}
 async start(fps=2){const stopped=this.stop(),request=this.request;await stopped;if(request!==this.request)return;this.fps=Math.max(1,Math.min(5,Number(fps)||2));this.running=true;const id=++this.generation;this.tick(id);}
 tick(id){if(!this.running||id!==this.generation)return;const begin=this.now();
  const work=(async()=>{if(!this.valid())throw Error('Button, page or device changed. Playback stopped.');const frame=await this.capture();if(!this.running||id!==this.generation)return;if(!this.valid())throw Error('Selected key is no longer empty.');await this.send(frame);if(this.running&&id===this.generation)this.onFrame();})();
  this.inFlight=work;
  work.then(()=>{if(this.running&&id===this.generation)this.timer=this.schedule(()=>this.tick(id),Math.max(0,1000/this.fps-(this.now()-begin)));},err=>{if(id===this.generation){this.onError(err);this.stop();}}).finally(()=>{if(this.inFlight===work)this.inFlight=null;});
 }
 stop(){this.request=(this.request||0)+1;const wasRunning=this.running;this.running=false;this.generation++;if(this.timer!==null)this.cancel(this.timer);this.timer=null;
  const flight=this.inFlight,prior=this.stopping||Promise.resolve();this.stopping=(async()=>{await prior; if(flight)try{await flight;}catch{}if(wasRunning)await this.restore();})();return this.stopping;
 }
}
module.exports={targets,identity,available,sameLayout,contain,FramePump};
