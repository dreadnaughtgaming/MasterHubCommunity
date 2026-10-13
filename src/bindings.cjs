'use strict';
const MIME='application/x-masterhub-community-action';let active=null;
function draggable(element,payload){
 element.draggable=true;element.title='Drag onto an empty MasterHUB keypad key';element.style.cursor='grab';
 element.addEventListener('dragstart',event=>{active=payload;event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData(MIME,'1');event.dataTransfer.setData('text/plain',payload.url);event.stopPropagation();});
 element.addEventListener('dragend',()=>{active=null;});
}
function accepts(event){return !!active&&Array.from(event.dataTransfer?.types||[]).includes(MIME);}
function dragOver(event){if(!accepts(event))return false;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='copy';return true;}
function bind(store,target,payload){
 const g=store.getters,cfg=g.keypadBtnConfig?.[target.serialNumber];
 if(g.flagFirstLoad||g.flagImportingConfig||!g.currentProfile||!g.currentBase64SerialNumber)throw Error('Wait until the profile has finished loading.');
 if(!cfg||!Number.isInteger(target.index)||target.index<0)throw Error('This keypad key is unavailable.');
 const page=cfg.currentPage||0,folder=cfg.viewMode==='folder',list=g.keypadBtnList[target.serialNumber]?.[page];
 const buttons=folder?list?.[cfg.currentFolderIndex]?.folder:list;
 const previous=buttons?.[target.index];
 if(!previous||folder&&target.index===0)throw Error('Drop onto a regular keypad key, not the folder back button.');
 if(previous.btnFunc||previous.action||previous.folder?.length)throw Error('This key already has an action. Clear it first, then drag the new action onto it.');
 const url=new URL(payload.url);if(url.protocol!=='https:'||url.hostname!=='masterhub-addon.invalid')throw Error('Unsupported action URL.');
 // Replace only this button through the existing Vuex mutation, preserving styles.
 const all={...g.keypadBtnList},pages=[...all[target.serialNumber]],keys=[...list];all[target.serialNumber]=pages;pages[page]=keys;
 const next={...previous,btnFunc:'web-url',url:payload.url,btnName:String(payload.label||'Community action').slice(0,80),enableTitle:true,iconPath:'web-url'};
 if(folder){const parent={...keys[cfg.currentFolderIndex],folder:[...buttons]};keys[cfg.currentFolderIndex]=parent;parent.folder[target.index]=next;}else keys[target.index]=next;
 store.commit('keypadBtnList',all);
 return{serialNumber:target.serialNumber,page,viewMode:cfg.viewMode||'master',keypadBtnIndex:target.index,keypadFolderBtnIdex:target.index};
}
function drop(event,target,state){
 if(!accepts(event))return false;event.preventDefault();event.stopPropagation();const payload=active;active=null;
 try{
  const drawing=bind(state.store,target,payload);
  Promise.resolve(state.store.dispatch('keypadImageBufferGenerator',drawing)).catch(()=>state.log('Action assigned, but its button image could not be refreshed.'));
  Promise.resolve(state.saveProfile()).then(ok=>state.notify(ok?'Action assigned and profile saved.':'Action assigned. Save the profile before closing MasterHUB.')).catch(()=>state.notify('Action assigned. Save the profile before closing MasterHUB.'));
 }catch(error){state.notify(error.message);state.log(error.message);}return true;
}
module.exports={draggable,dragOver,drop,bind};
