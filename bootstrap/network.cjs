'use strict';
const https=require('https');
const HOSTS=new Set(['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
function download(url,limit,redirects=0){return new Promise((resolve,reject)=>{
 const u=new URL(url);if(u.protocol!=='https:'||u.port||u.username||u.password||!HOSTS.has(u.hostname)||redirects>5){reject(Error('Disallowed update URL'));return;}
 const req=https.get(u,{headers:{'User-Agent':'MasterHUB-Community-Updater','Accept':'application/vnd.github+json'}},res=>{
  if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.resume();download(new URL(res.headers.location,u).href,limit,redirects+1).then(resolve,reject);return;}
  if(res.statusCode!==200){res.resume();const err=Error(res.statusCode===404?'No published release yet':`GitHub returned HTTP ${res.statusCode}`);err.status=res.statusCode;reject(err);return;}
  let size=0;const parts=[];res.on('data',b=>{size+=b.length;if(size>limit){res.destroy(Error('Download exceeds size limit'));return;}parts.push(b);});res.on('end',()=>resolve(Buffer.concat(parts)));res.on('error',reject);
 });const deadline=setTimeout(()=>req.destroy(Error('Update download timed out')),90000);req.on('close',()=>clearTimeout(deadline));req.setTimeout(20000,()=>req.destroy(Error('Update connection timed out')));req.on('error',reject);
});}
function createChecker(slots,config,get=download){
 const {compare,channel,manifest,decode,MAX}=require('./core.cjs');
 let busy=null,lastAttempt=0;
 const current=slots.verified('current');
 const status={current:current.version,currentChannel:channel(current),pending:slots.has('pending')?slots.verified('pending').version:null,channel:slots.selectedChannel(),message:'Automatic checks enabled',checkedAt:null,checking:false,repository:`${config.owner}/${config.repo}`};
 async function latest(selected){
  const api=`https://api.github.com/repos/${config.owner}/${config.repo}/releases`;
  if(selected==='stable')return JSON.parse(await get(api+'/latest',1024*1024));
  const candidates=[];
  for(let page=1;page<=5;page++){
   const list=JSON.parse(await get(api+`?per_page=30&page=${page}`,2*1024*1024));if(!Array.isArray(list))throw Error('Invalid release list');
   for(const r of list)if(!r.draft&&r.prerelease&&/^v\d+\.\d+\.\d+-test\.\d+$/.test(r.tag_name))candidates.push(r);
   if(list.length<30)break;
  }
  if(!candidates.length)throw Error('No Test release published yet');
  candidates.sort((a,b)=>compare(b.tag_name.slice(1),a.tag_name.slice(1)));return candidates[0];
 }
 async function runCheck(){try{
   const selected=slots.selectedChannel();status.channel=selected;
   const r=await latest(selected);
   const pattern=selected==='test'?/^v\d+\.\d+\.\d+-test\.\d+$/:/^v\d+\.\d+\.\d+$/;
   if(r.draft||!!r.prerelease!==(selected==='test')||typeof r.tag_name!=='string'||!pattern.test(r.tag_name))throw Error('Release does not match selected channel');
   const v=r.tag_name.slice(1),same=selected===status.currentChannel;
   if(status.pending===v||same&&compare(v,status.pending||status.current)<=0){status.message=status.pending?'Update ready; exit MasterHUB and start it again':'Up to date';return;}
   const base=`https://github.com/${config.owner}/${config.repo}/releases/download/${r.tag_name}/`;
   const raw=await get(base+'masterhub-release.json',512*1024),sig=await get(base+'masterhub-release.sig',1024);
   const m=manifest(raw,sig,config);if(m.version!==v||channel(m)!==selected)throw Error('Release metadata and selected channel differ');
   const blob=await get(base+'masterhub-community.json.gz',MAX);
   if(slots.stage(decode(raw,sig,blob,config))){status.pending=v;status.message='Update ready; exit MasterHUB and start it again';}
  }catch(e){status.message=e.message;}finally{status.checkedAt=new Date().toISOString();status.checking=false;}
 }
 async function check(){
  if(busy){await busy;return {...status};}if(Date.now()-lastAttempt<60000)return {...status};lastAttempt=Date.now();status.checking=true;
  busy=runCheck();try{await busy;return {...status};}finally{busy=null;}
 }
 async function selectChannel(selected){if(busy)throw Error('Wait for the current update check to finish');slots.setChannel(selected);status.channel=selected;status.pending=null;lastAttempt=0;status.message='Channel selected; checking GitHub';return check();}
 return {check,selectChannel,status:()=>({...status})};
}
module.exports={download,createChecker};
