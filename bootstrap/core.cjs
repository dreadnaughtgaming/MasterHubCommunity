'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const MAX=32*1024*1024;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function version(v){const m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-test\.(0|[1-9]\d*))?$/.exec(v);if(!m)throw Error('Invalid release version');const a=m.slice(1,4).map(Number);if(m[4]!==undefined)a.push(Number(m[4]));if(a.some(n=>!Number.isSafeInteger(n)))throw Error('Invalid release version');return a;}
function compare(a,b){a=version(a);b=version(b);for(let i=0;i<4;i++){const x=a[i]===undefined?Infinity:a[i],y=b[i]===undefined?Infinity:b[i];if(x!==y)return x>y?1:-1;}return 0;}
function channel(m){return m.channel||'stable';}
function validPath(p){return typeof p==='string'&&/^dng\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(p)&&p.split('/').every(x=>! /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x));}
function manifest(raw,sig,config){
 if(raw.length>512*1024||sig.length>1024||!crypto.verify(null,raw,config.publicKey,Buffer.from(sig.toString().trim(),'base64')))throw Error('Update signature verification failed');
 const m=JSON.parse(raw);version(m.version);
 if(!['stable','test'].includes(channel(m))||(channel(m)==='test')!==m.version.includes('-test.'))throw Error('Release channel and version differ');
 if(m.schema!==1||!(m.bootstrap===config.bootstrap||config.bootstrap===2&&m.bootstrap===1)||m.target!==config.target)throw Error('This release needs a new installer');
 if(!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>MAX||! /^[a-f0-9]{64}$/.test(m.sha256))throw Error('Invalid bundle digest');
 if(!m.files||typeof m.files!=='object'||Array.isArray(m.files))throw Error('Invalid file list');
 const names=Object.keys(m.files);if(names.length<2||names.length>1000||!names.includes('dng/main.cjs')||!names.includes('dng/runtime.cjs'))throw Error('Incomplete release');
 const seen=new Set();let size=0;
 for(const p of names){const f=m.files[p];if(!validPath(p)||seen.has(p.toLowerCase())||!f||!Number.isSafeInteger(f.bytes)||f.bytes<0||! /^[a-f0-9]{64}$/.test(f.sha256))throw Error('Invalid release path or metadata');seen.add(p.toLowerCase());size+=f.bytes;}
 if(size>MAX)throw Error('Release too large');return m;
}
function decode(raw,sig,blob,config){
 const m=manifest(raw,sig,config);if(blob.length!==m.bytes||sha(blob)!==m.sha256)throw Error('Download checksum failed');
 const content=JSON.parse(zlib.gunzipSync(blob,{maxOutputLength:MAX*2}));
 if(!content.files||Object.keys(content.files).length!==Object.keys(m.files).length)throw Error('Bundle file list differs');
 const files={};for(const [p,f] of Object.entries(m.files)){const encoded=content.files[p];if(typeof encoded!=='string')throw Error('Missing bundle file');const b=Buffer.from(encoded,'base64');if(b.length!==f.bytes||sha(b)!==f.sha256)throw Error('File checksum failed');files[p]=b;}return {m,files,raw,sig};
}
function verifyDir(dir,config){
 const m=manifest(fs.readFileSync(path.join(dir,'release.json')),fs.readFileSync(path.join(dir,'release.sig')),config),actual=[];
 function walk(at,rel=''){for(const e of fs.readdirSync(at,{withFileTypes:true})){const p=rel+e.name;if(e.isSymbolicLink())throw Error('Links in release');if(e.isDirectory())walk(path.join(at,e.name),p+'/');else if(e.isFile())actual.push(p);else throw Error('Invalid release file');}}
 if(fs.lstatSync(dir).isSymbolicLink())throw Error('Linked release directory');walk(dir);
 const expected=[...Object.keys(m.files),'release.json','release.sig'].sort();if(JSON.stringify(actual.sort())!==JSON.stringify(expected))throw Error('Installed release file list differs');
 for(const [p,f] of Object.entries(m.files)){const b=fs.readFileSync(path.join(dir,p));if(b.length!==f.bytes||sha(b)!==f.sha256)throw Error('Installed release checksum failed');}return m;
}
function writeJSON(file,v){const tmp=file+'.tmp';const fd=fs.openSync(tmp,'w');try{fs.writeFileSync(fd,JSON.stringify(v));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
class Slots{
 constructor(root,config){this.root=root;this.config=config;fs.mkdirSync(root,{recursive:true});}
 p(name){return path.join(this.root,name);}
 has(n){return fs.existsSync(this.p(n));}
 remove(n){fs.rmSync(this.p(n),{recursive:true,force:true});}
 read(n){return JSON.parse(fs.readFileSync(this.p(n),'utf8'));}
 verified(n){return verifyDir(this.p(n),this.config);}
 selectedChannel(){try{const c=this.read('channel.json').selected;return ['stable','test'].includes(c)?c:'stable';}catch{return 'stable';}}
 setChannel(selected){if(!['stable','test'].includes(selected))throw Error('Choose Stable or Test');if(this.has('activation.json')||this.has('previous'))throw Error('Wait for startup confirmation before changing channel');writeJSON(this.p('channel.json'),{selected});this.remove('pending');}

 recover(){
  if(this.has('activation.json')){
   const j=this.read('activation.json');
   if(j.phase==='committed'){this.remove('previous');this.remove('activation.json');}
   else if(this.has('previous')){
    // Verify recovery copy before deleting anything. Every journal boundary can recover.
    this.verified('previous');this.remove('current');this.remove('pending');fs.renameSync(this.p('previous'),this.p('current'));
    writeJSON(this.p('failed.json'),{version:j.version});writeJSON(this.p('channel.json'),{selected:channel(this.verified('current'))});this.remove('activation.json');
   }else if(this.has('current')){this.verified('current');this.remove('activation.json');}
   else throw Error('Interrupted activation has no recovery copy');
  }
  if(this.has('previous'))throw Error('Unjournaled recovery copy; refusing to overwrite it');
  if(this.has('pending')){try{this.verified('pending');}catch{this.remove('pending');}}
 }
 start(){
  this.recover();let m=this.verified('current');
  if(this.has('pending')){
   const next=this.verified('pending');if(channel(next)!==this.selectedChannel()||channel(next)===channel(m)&&compare(next.version,m.version)<=0){this.remove('pending');return m;}
   writeJSON(this.p('activation.json'),{phase:'activating',version:next.version});
   fs.renameSync(this.p('current'),this.p('previous'));fs.renameSync(this.p('pending'),this.p('current'));m=next;
  }return m;
 }
 healthy(){if(!this.has('activation.json'))return;const j=this.read('activation.json');writeJSON(this.p('activation.json'),{...j,phase:'committed'});this.remove('previous');this.remove('activation.json');}
 stage(release){
  if(this.has('activation.json')||this.has('previous'))throw Error('Waiting for startup confirmation');
  const current=this.verified('current');if(channel(release.m)!==this.selectedChannel())throw Error('Selected channel changed; update discarded');if(channel(release.m)===channel(current)&&compare(release.m.version,current.version)<=0)return false;
  if(this.has('failed.json')&&this.read('failed.json').version===release.m.version)throw Error('This version failed startup; waiting for a newer release');
  if(this.has('pending')&&channel(this.verified('pending'))===channel(release.m)&&compare(this.verified('pending').version,release.m.version)>=0)return false;
  // New download is verified in memory before superseding the pending slot.
  this.remove('pending');try{
   fs.mkdirSync(this.p('pending'));for(const [p,b] of Object.entries(release.files)){const out=path.join(this.p('pending'),p);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,b);}
   fs.writeFileSync(path.join(this.p('pending'),'release.json'),release.raw);fs.writeFileSync(path.join(this.p('pending'),'release.sig'),release.sig);this.verified('pending');return true;
  }catch(e){this.remove('pending');throw e;}
 }
}
module.exports={MAX,sha,version,compare,channel,validPath,manifest,decode,verifyDir,writeJSON,Slots};
