'use strict';
// The host supplies its shipped SockJS constructor. This module never loads device DLLs.
function connectStreamlabs(host,info,Socket){
  clearTimeout(host._dngRetry);clearTimeout(host._dngWatchdog);
  const generation=host._dngGeneration=(host._dngGeneration||0)+1;
  const old=host.data.socket;
  if(old){old.onclose=old.onerror=old.onopen=old.onmessage=null;try{old.close();}catch{}}
  for(const request of Object.values(host.data.requests||{})){clearTimeout(request.timer);request.reject(new Error('Connection replaced'));}
  host.data.requests={};host.data.subscriptions={};host.data.connectionInfo=info;host.data.socket=null;
  const valid=info.streamlabsIp&&info.streamlabsPort&&info.streamlabsToken;
  if(!valid){info.disconnectCallback?.();return;}
  let failed=false;
  const current=()=>host._dngGeneration===generation;
  const fail=()=>{
    if(!current()||failed)return;failed=true;clearTimeout(host._dngWatchdog);
    info.disconnectCallback?.();
    const delay=Math.min(5000,500*2**Math.min(host._dngAttempts||0,4));host._dngAttempts=(host._dngAttempts||0)+1;
    if(host.data.socket){const socket=host.data.socket;socket.onclose=socket.onerror=null;try{socket.close();}catch{}}
    for(const request of Object.values(host.data.requests)){clearTimeout(request.timer);request.reject(new Error('Streamlabs disconnected'));}host.data.requests={};
    host._dngRetry=setTimeout(()=>{if(current())connectStreamlabs(host,host.data.connectionInfo,Socket);},delay);
  };
  host._dngFail=fail;
  try{
    const socket=new Socket(`http://${info.streamlabsIp}:${info.streamlabsPort}/api`);host.data.socket=socket;
    socket.onclose=socket.onerror=fail;
    socket.onopen=async()=>{
      if(!current())return;
      try{
        await host.request('TcpServerService','auth',info.streamlabsToken);
        if(!current()||failed)return;
        await host.onConnectionHandler(info);
        if(!current()||failed)return;
        host._dngAttempts=0;clearTimeout(host._dngWatchdog);
      }catch{fail();}
    };
    socket.onmessage=async event=>{
      if(!current()||failed)return;
      try{await host.onMessageHandler(event.data,info);}catch{fail();}
    };
    host._dngWatchdog=setTimeout(fail,20000);
  }catch{fail();}
}
function sendStreamlabs(host,message){
  let body=typeof message==='string'?JSON.parse(message):message;
  if(!body?.id)return Promise.reject(new Error('Streamlabs request ID missing'));
  if(host.data.socket?.readyState!==1)return Promise.reject(new Error('Streamlabs is not connected'));
  return new Promise((resolve,reject)=>{
    const finish=fn=>value=>{clearTimeout(entry.timer);delete host.data.requests[body.id];fn(value);};
    const entry={body,resolve:null,reject:null,timer:null};entry.resolve=finish(resolve);entry.reject=finish(reject);
    entry.timer=setTimeout(()=>entry.reject(new Error('Streamlabs request timed out')),10000);
    host.data.requests[body.id]=entry;
    try{host.data.socket.send(JSON.stringify(body));}catch(error){entry.reject(error);}
  });
}
function connectDiscord(host,makeClient){
  if(host._dngConnecting)return host._dngConnecting;
  clearTimeout(host._dngRetry);
  const previous=host.rpc;previous?.removeAllListeners?.('disconnected');previous?.removeAllListeners?.('error');try{Promise.resolve(previous?.destroy()).catch(()=>{});}catch{}
  const client=makeClient();host.rpc=client;
  let retryScheduled=false;
  const retry=()=>{
    if(host.rpc!==client||retryScheduled)return;retryScheduled=true;
    const delay=Math.min(10000,1000*2**Math.min(host._dngAttempts||0,4));host._dngAttempts=(host._dngAttempts||0)+1;
    host._dngRetry=setTimeout(()=>connectDiscord(host,makeClient),delay);
  };
  client.on('disconnected',retry);client.on('error',retry);
  host._dngConnecting=Promise.resolve().then(()=>client.login({clientId:host.clientId,scopes:host.scopes,accessToken:host.access_token}))
    .then(result=>{host._dngAttempts=0;return result;},()=>{retry();return null;})
    .finally(()=>{host._dngConnecting=null;});
  return host._dngConnecting;
}
module.exports={connectStreamlabs,sendStreamlabs,connectDiscord};
