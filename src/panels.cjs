'use strict';
let front=2147483500;
function fit(rect,width,height){
 const w=Math.min(Math.max(Number(rect.width)||440,280),Math.max(200,width-16));
 const h=Math.min(Math.max(Number(rect.height)||500,180),Math.max(140,height-80));
 return{width:w,height:h,left:Math.max(8,Math.min(Number(rect.left)||18,width-w-8)),top:Math.max(8,Math.min(Number(rect.top)||50,height-h-64))};
}
function floatingPanel(id,title){
 if(!document.getElementById('mhc-panel-theme')){const style=document.createElement('style');style.id='mhc-panel-theme';style.textContent=`[data-community-panel] h2{font-size:20px;margin:16px 0 10px}[data-community-panel] h3{font-size:15px;margin:18px 0 8px}[data-community-panel] p{line-height:1.55;color:#c5d2e1}[data-community-panel] button,[data-community-panel] select,[data-community-panel] input{box-sizing:border-box;font:inherit;border-radius:6px;border:1px solid #50647b;background:#25384e;color:#eff5ff;padding:8px 10px;margin:4px}[data-community-panel] button{cursor:pointer}[data-community-panel] button:disabled{opacity:.5;cursor:wait}[data-community-panel] :focus-visible{outline:2px solid #7ec8ff;outline-offset:2px}[data-community-panel] summary{cursor:pointer;color:#adbed1;padding:12px 0}[data-community-panel] pre{font:12px/1.5 monospace;overflow-wrap:anywhere}`;document.head.appendChild(style);}
 const key='masterhub-community-panel-'+id;let saved={left:id==='streamdeck'?470:18,top:50};
 try{saved={...saved,...JSON.parse(localStorage.getItem(key)||'{}')}}catch{}
 const panel=document.createElement('div');panel.dataset.communityPanel=id;
 panel.style.cssText='position:fixed;box-sizing:border-box;resize:both;overflow:auto;min-width:280px;min-height:180px;background:#122033;color:#eef6ff;padding:0 16px 16px;border:1px solid #5581a3;border-radius:10px;font:14px/1.5 Arial;box-shadow:0 8px 30px #0009';
 const apply=r=>{for(const [k,v] of Object.entries(r))panel.style[k]=v+'px';};
 const raise=()=>{panel.style.zIndex=String(++front);};raise();apply(fit(saved,innerWidth,innerHeight));
 const header=document.createElement('div');header.textContent=title;header.title='Drag to move. Resize from the bottom-right corner.';
 header.style.cssText='position:sticky;top:0;margin:0 -16px 12px;padding:12px 16px;background:#203c56;cursor:move;user-select:none;touch-action:none;font-weight:bold;z-index:1';panel.appendChild(header);document.body.appendChild(panel);
 const remember=()=>{const r=panel.getBoundingClientRect();try{localStorage.setItem(key,JSON.stringify({left:r.left,top:r.top,width:r.width,height:r.height}));}catch{}};
 let drag=null;
 header.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();raise();const r=panel.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};header.setPointerCapture(e.pointerId);};
 header.onpointermove=e=>{if(!drag)return;const r=panel.getBoundingClientRect();apply(fit({width:r.width,height:r.height,left:drag.left+e.clientX-drag.x,top:drag.top+e.clientY-drag.y},innerWidth,innerHeight));};
 header.onpointerup=header.onpointercancel=e=>{drag=null;if(header.hasPointerCapture(e.pointerId))header.releasePointerCapture(e.pointerId);remember();};
 panel.addEventListener('pointerdown',raise);
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(remember):null;observer?.observe(panel);
 const resized=()=>{const r=panel.getBoundingClientRect();apply(fit(r,innerWidth,innerHeight));remember();};window.addEventListener('resize',resized);
 const remove=panel.remove.bind(panel);panel.remove=()=>{remember();observer?.disconnect();window.removeEventListener('resize',resized);remove();};
 return panel;
}
module.exports={floatingPanel,fit};
