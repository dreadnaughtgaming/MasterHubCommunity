'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const {sha,version,decode}=require('../bootstrap/core.cjs');
const root=path.resolve(__dirname,'..'),config=require('../bootstrap/config.json');
const v=process.argv[2]||require('../package.json').version;version(v);
if(v!==require('../package.json').version)throw Error('Tag version must match package.json');
const keyText=process.env.MHC_UPDATE_SIGNING_KEY;if(!keyText)throw Error('Set MHC_UPDATE_SIGNING_KEY to base64-encoded private PEM');
const key=crypto.createPrivateKey(Buffer.from(keyText,'base64'));
if(crypto.createPublicKey(key).export({type:'spki',format:'pem'}).toString()!==config.publicKey)throw Error('Signing key does not match pinned publisher key');
const files={},meta={};
function walk(dir,rel='dng'){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(e.isSymbolicLink())throw Error('Symlink in source');const p=rel+'/'+e.name;if(e.isDirectory())walk(path.join(dir,e.name),p);else{const b=fs.readFileSync(path.join(dir,e.name));files[p]=b.toString('base64');meta[p]={bytes:b.length,sha256:sha(b)};}}}
walk(path.join(root,'src'));const blob=zlib.gzipSync(Buffer.from(JSON.stringify({files})),{level:9});
const raw=Buffer.from(JSON.stringify({schema:1,version:v,channel:require('../package.json').channel||'stable',bootstrap:config.bootstrap,target:config.target,bytes:blob.length,sha256:sha(blob),files:meta}));const sig=Buffer.from(crypto.sign(null,raw,key).toString('base64'));
decode(raw,sig,blob,config);
const out=path.resolve(process.argv[3]||path.join(root,'release'));fs.mkdirSync(out,{recursive:true});
for(const [name,b] of [['masterhub-release.json',raw],['masterhub-release.sig',sig],['masterhub-community.json.gz',blob]])fs.writeFileSync(path.join(out,name),b);
console.log('Signed community release '+v+' ('+blob.length+' bytes); no vendor files included.');
