'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const {readJson,atomicWriteSync}=require('../storage.cjs');
function run(exe,args,options={}){
 return new Promise((resolve,reject)=>cp.execFile(exe,args,{windowsHide:true,timeout:120000,maxBuffer:1024*1024,...options},(error,stdout)=>error?reject(Error('Helper process failed')):resolve(stdout.trim())));
}
function createDecrypter({root,dialog,log}){
 let setup;
 async function pythonEnvironment(){
  const envRoot=path.join(root,'tools','python-env'),python=path.join(envRoot,'Scripts','python.exe');
  if(!fs.existsSync(python)){
   let runner;for(const [exe,prefix] of [['py',['-3']],['python',[]]])try{await run(exe,[...prefix,'-c','import sys; assert sys.version_info >= (3,10)'],{timeout:10000});runner={exe,prefix};break;}catch{}
   if(!runner)throw Error('Encrypted manifest import requires Python 3.10 or newer. Install Python with its launcher, restart MasterHUB, and import again. Node.js is separate.');
   log('Preparing encrypted import: creating private Python environment…');
   try{await run(runner.exe,[...runner.prefix,'-m','venv',envRoot]);}catch{throw Error('Could not create the Python environment. Check that Python includes venv and pip.');}
  }
  try{await run(python,['-c','import cryptography, cbor2'],{timeout:10000});}
  catch{
   log('First-use setup: downloading decrypter dependencies from PyPI…');
   try{await run(python,['-m','pip','install','--disable-pip-version-check','cryptography>=41.0.0','cbor2>=5.4.0'],{timeout:180000});}
   catch{throw Error('Could not install decrypter dependencies. Check internet access, then import again.');}
  }
  // External Python cannot read Electron ASAR paths. Materialize the bundled,
  // reviewed source in its own versioned directory; never execute plugin code.
  const code=path.join(root,'tools','decrypter-68ca6fb'),dest=path.join(code,'elgato_decrypter');fs.mkdirSync(dest,{recursive:true});
  for(const name of ['__init__.py','__main__.py','archive.py','constants.py','crypto.py','extractor.py'])fs.writeFileSync(path.join(dest,name),fs.readFileSync(path.join(__dirname,'decrypter','elgato_decrypter',name)));
  fs.writeFileSync(path.join(code,'LICENSE'),fs.readFileSync(path.join(__dirname,'decrypter','LICENSE')));
  return{python,code};
 }
 return async function decrypt(input,output){
  const configFile=path.join(root,'decrypter.json'),config=readJson(configFile,{});
  let binary=[config.binary,path.join(process.env.ProgramFiles||'C:\\Program Files','Elgato','StreamDeck','StreamDeck.exe')].find(p=>p&&fs.existsSync(p));
  if(!binary){
   log('Select the installed StreamDeck.exe to prepare this encrypted manifest.');
   const choice=await dialog.showOpenDialog({title:'Select installed StreamDeck.exe for manifest import',properties:['openFile'],filters:[{name:'Stream Deck executable',extensions:['exe']}]});
   if(choice.canceled)throw Error('Import cancelled. The original plugin was not changed.');
   binary=choice.filePaths[0];if(path.basename(binary).toLowerCase()!=='streamdeck.exe')throw Error('Select StreamDeck.exe from the official Stream Deck installation.');
   atomicWriteSync(configFile,JSON.stringify({binary}));
  }
  if(!setup)setup=pythonEnvironment().catch(error=>{setup=null;throw error;});
  const {python,code}=await setup;log('Preparing a readable manifest in a private plugin copy…');
  // Upstream emits keys to stdout. Ignore both streams; do not expose or store them.
  await new Promise((resolve,reject)=>{
   const child=cp.spawn(python,['-m','elgato_decrypter',input,output,'--binary',binary],{cwd:code,env:{...process.env,PYTHONPATH:code,PYTHONNOUSERSITE:'1'},windowsHide:true,stdio:'ignore',shell:false});
   let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},120000);
   child.once('error',()=>{clearTimeout(timer);reject(Error('Could not start the manifest decrypter. Restart MasterHUB and retry.'));});
   child.once('close',exit=>{clearTimeout(timer);if(!timedOut&&exit===0&&fs.existsSync(output))resolve();else reject(Error('Manifest decryption failed. The decrypter may not support this StreamDeck.exe version or plugin format. Original files were preserved. Report the plugin name and Stream Deck version.'));});
  });
 };
}
module.exports={createDecrypter};
