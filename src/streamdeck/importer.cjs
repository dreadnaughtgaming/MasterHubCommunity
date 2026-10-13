'use strict';
const fs=require('fs'),path=require('path');
const {readManifest}=require('./manifest.cjs');
function copyTree(source,destination,budget={bytes:0}){
 const stat=fs.lstatSync(source);if(stat.isSymbolicLink())throw Error('Plugin folders containing symlinks or junctions are not supported');
 if(stat.isDirectory()){fs.mkdirSync(destination,{recursive:true});for(const name of fs.readdirSync(source))copyTree(path.join(source,name),path.join(destination,name),budget);}
 else if(stat.isFile()){budget.bytes+=stat.size;if(budget.bytes>500*1024*1024)throw Error('Plugin exceeds the 500 MB import limit');fs.copyFileSync(source,destination);}
 else throw Error('Unsupported plugin file');
}
async function importPlugin({source,pluginsDir,host,decrypt}){
 const realSource=fs.realpathSync(source),realPlugins=fs.realpathSync(pluginsDir),relative=path.relative(realSource,realPlugins);
 if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Select a source folder outside the import destination.');
 const stage=fs.mkdtempSync(path.join(pluginsDir,'.import-'));let destination,published=false;
 try{
  const copied=path.join(stage,'plugin');copyTree(source,copied);
  const manifest=path.join(copied,'manifest.json');
  if(!fs.existsSync(manifest))throw Error('Select the extracted .sdPlugin folder directly containing manifest.json.');
  if(fs.statSync(manifest).size>2*1024*1024)throw Error('Manifest exceeds the 2 MB limit.');
  if(fs.readFileSync(manifest).subarray(0,6).toString()==='ELGATO'){
   const output=path.join(stage,'manifest.json');await decrypt(manifest,output);
   // Validate plaintext before replacing the manifest in the copy.
   readManifest(stage);fs.copyFileSync(output,manifest);
  }
  const m=readManifest(copied);
  if(!/^[a-z0-9][a-z0-9.-]+$/.test(m.UUID))throw Error('Invalid plugin UUID');
  destination=path.join(pluginsDir,m.UUID+'.sdPlugin');
  if(fs.existsSync(destination)||host.plugins.has(m.UUID))throw Error('Plugin already imported. Disable it before replacing files manually.');
  fs.renameSync(copied,destination);published=true;
  host.addPlugin(destination);return m.UUID;
 }catch(error){if(published)fs.rmSync(destination,{recursive:true,force:true});throw error;}
 finally{fs.rmSync(stage,{recursive:true,force:true});}
}
module.exports={importPlugin};
