'use strict';
const {atomicWriteSync,readJson}=require('./storage.cjs');
function readRequiredJson(file){const missing={};const value=readJson(file,missing);if(value===missing)throw new Error('Configuration and its backup could not be read');return value;}
function filter(data,devices,base){return Object.fromEntries(Object.entries(data||{}).filter(([serial])=>{const device=(devices||[]).find(d=>d.serialNumber===serial);return !device||device.parentSerialNumber===base;}));}
function saveProfile({getters:g,commit,pathFor,hubPath,write=atomicWriteSync}){
  if(g.flagFirstLoad||g.flagImportingConfig||!g.currentBase64SerialNumber||!g.currentProfile)return null;
  commit('flagSyncingConfig',true);
  try{
    const profile=g.profiles.find(p=>p.id===g.currentProfile);
    if(!profile||(profile.serialNumber&&profile.serialNumber!==g.currentBase64SerialNumber))throw new Error('Profile/base mismatch');
    const base=g.currentBase64SerialNumber;
    const payload={serialNumber:base,profileId:g.currentProfile,profileName:profile.label,
      knobsList:filter(g.knobsList,g.m003Alive,base),
      keypad:g.keypadBtnList,keypadBtnConfig:Object.fromEntries(Object.entries(g.keypadBtnConfig||{}).map(([id,c])=>[id,{...c,currentPage:0,viewMode:'master'}])),
      colorPickerFavoriteColors:g.colorPickerFavoriteColors,
      rollerBlock:filter(g.rollerBlock,g.m002Alive,base),dialEncoder:filter(g.dialEncoder,g.m131Alive,base),
      sliders5List:filter(g.sliders5List,g.sliderAlive,base),touch46s:g.touch46s,touch50s:g.touch50s,
      deviceLightingEffect:g.deviceLightingEffect,devices:g.devices,filtered:true};
    // Serialise the complete snapshot before starting IO. There are no await points
    // at which another action could change the selected profile under this save.
    const text=JSON.stringify(payload),hub=JSON.stringify(g.hubProfileMap);
    write(pathFor(base,g.currentProfile),text);
    if(hubPath)write(hubPath,hub);
    commit('setProfileConfigData',payload);return payload;
  }catch(error){commit('showProfileSaveErrorDialog',true);throw error;}
  finally{commit('flagSyncingConfig',false);}
}
module.exports={saveProfile,readRequiredJson};
