'use strict';
// Publish the original pre-signed release without exposing the publisher private key.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const {decode}=require('../bootstrap/core.cjs');
const config=require('../bootstrap/config.json');
const dir=path.join(root,'initial-release');
const raw=fs.readFileSync(path.join(dir,'masterhub-release.json'));
const sig=fs.readFileSync(path.join(dir,'masterhub-release.sig'));
const blob=Buffer.from(fs.readFileSync(path.join(dir,'masterhub-community.json.gz.b64'),'utf8').trim(),'base64');
const release=decode(raw,sig,blob,config);
if(release.m.version!=='0.3.0'||release.m.version!==require('../package.json').version)throw Error('Initial publisher only supports the original 0.3.0 release');
const actual=[];
function walk(dir,rel='dng'){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const name=rel+'/'+e.name;if(e.isSymbolicLink())throw Error('Unexpected source link');if(e.isDirectory())walk(path.join(dir,e.name),name);else{actual.push(name);if(!release.files[name]||!fs.readFileSync(path.join(dir,e.name)).equals(release.files[name]))throw Error('Source differs from signed initial release: '+name);}}}
walk(path.join(root,'src'));
if(actual.length!==Object.keys(release.files).length)throw Error('Signed file list differs from source');
const out=path.join(root,'release');fs.mkdirSync(out,{recursive:true});
for(const [name,data] of [['masterhub-release.json',raw],['masterhub-release.sig',sig],['masterhub-community.json.gz',blob]])fs.writeFileSync(path.join(out,name),data);
console.log('Initial release signature, hashes and source contents verified. No private key required.');
