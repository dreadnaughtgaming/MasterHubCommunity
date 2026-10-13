'use strict';
const fs=require('fs'),path=require('path');
function readManifest(folder){
 const file=path.join(folder,'manifest.json');
 if(!fs.existsSync(file))throw Error('Select the extracted .sdPlugin folder containing manifest.json, not its parent folder or a packaged installer.');
 if(fs.statSync(file).size>2*1024*1024)throw Error('Plugin manifest exceeds the 2 MB limit.');
 const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').trim();
 if(text.startsWith('ELGATO'))throw Error('This manifest is still ELGATO-protected. Use Import .sdPlugin folder to prepare it with the integrated decrypter. Python 3.10+ and installed Stream Deck software are required.');
 let manifest;try{manifest=JSON.parse(text);}catch{throw Error('manifest.json is not valid JSON. Import a complete, unencrypted plugin folder; renaming a packaged file does not extract it.');}
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw Error('Plugin manifest must contain a JSON object.');
 return manifest;
}
module.exports={readManifest};
