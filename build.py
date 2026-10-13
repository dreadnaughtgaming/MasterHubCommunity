#!/usr/bin/env python3
"""Build a version-locked patch from an owner's original MasterHUB app.asar.
Only Python's standard library is needed. No downloaded code is executed.
"""
import argparse,copy,hashlib,json,pathlib,struct
EXPECTED='a80844ac26e9478023213095006bf88db178712fb7a2e1be7b244d8445202f3f'
ROOT=pathlib.Path(__file__).resolve().parent

def parse_asar(blob):
    header_size=struct.unpack_from('<I',blob,4)[0]
    text_size=struct.unpack_from('<I',blob,12)[0]
    header=json.loads(blob[16:16+text_size]);files={}
    def walk(node,prefix=''):
        for name,info in node['files'].items():
            key=prefix+name
            if 'files' in info:walk(info,key+'/')
            elif 'offset' in info:
                pos=8+header_size+int(info['offset']);files[key]=blob[pos:pos+info['size']]
    walk(header);return header,files

def pack_asar(header,files):
    header=copy.deepcopy(header);chunks=[];offset=0
    def walk(node,prefix=''):
        nonlocal offset
        for name,info in node['files'].items():
            key=prefix+name
            if 'files' in info:walk(info,key+'/')
            elif 'offset' in info:
                data=files[key];info['size']=len(data);info['offset']=str(offset);offset+=len(data);chunks.append(data)
                if 'integrity' in info:
                    size=info['integrity'].get('blockSize',4194304)
                    info['integrity']={'algorithm':'SHA256','hash':hashlib.sha256(data).hexdigest(),'blockSize':size,'blocks':[hashlib.sha256(data[x:x+size]).hexdigest() for x in range(0,len(data),size)]}
    walk(header)
    text=json.dumps(header,separators=(',',':'),ensure_ascii=False).encode()
    payload=struct.pack('<I',len(text))+text
    payload+=b'\0'*((-len(payload))%4)
    pickle=struct.pack('<I',len(payload))+payload
    return struct.pack('<II',4,len(pickle))+pickle+b''.join(chunks)

def add_file(header,files,name,data):
    node=header
    for part in name.split('/')[:-1]:node=node['files'].setdefault(part,{'files':{}})
    node['files'][name.split('/')[-1]]={'size':len(data),'offset':'0'};files[name]=data

def patch_bundle(text):
    def replace(old,new,count=1):
        nonlocal text
        actual=text.count(old)
        if actual!=count:raise ValueError(f'Patch anchor count {actual}, expected {count}: {old[:65]}')
        text=text.replace(old,new)
    def section(start,end,replacement):
        nonlocal text
        if text.count(start)!=1:raise ValueError('Ambiguous start: '+start)
        a=text.index(start);b=text.index(end,a);text=text[:a]+replacement+text[b:]
    text='const __DNG=require(require("path").join(require("electron").ipcRenderer.sendSync("mhc-runtime-root"),"runtime.cjs"));\n'+text
    replace('writeFileSync:Rq','writeFileSync:__dngOriginalWrite')
    replace('Uq=Vq.sendSync(ge);','Rq=require(require("path").join(require("electron").ipcRenderer.sendSync("mhc-runtime-root"),"storage.cjs")).atomicWriteSync,Uq=Vq.sendSync(ge);')
    section('async syncConfig({',',async importConfig(e,t)',
            'async syncConfig({getters:e,commit:t}){return __DNG.saveProfile({getters:e,commit:t,pathFor:yh,hubPath:Wq,write:Rq})}')
    start='async syncSelectedModuleConfig(';a=text.index(start);b=text.index(',async syncConfig(',a);part=text[a:b]
    marker='{o("syncHubConfig"),'
    if marker not in part:raise ValueError('Module save anchor missing')
    part=part.replace(marker,'{try{o("syncHubConfig").catch(()=>t("showProfileSaveErrorDialog",!0)),',1)
    part=part[:-1]+'}catch(__err){t("showProfileSaveErrorDialog",!0);throw __err}finally{t("flagSyncingConfig",!1)}}'
    text=text[:a]+part+text[b:]
    replace('JSON.parse(Kq(Zq,{encoding:"utf8"}))','__DNG.readRequiredJson(Zq)')
    # First occurrence is the automatic check in the root component. UI manual save remains.
    a=text.index('checkObsStatus(){');b=text.index('}},beforeUnmount(){',a)
    text=text[:a]+'checkObsStatus(){return __DNG.obsCheck(this,tY,Q)}'+text[b+1:]
    replace('const r=window.localStorage.getItem("obsConnection")?JSON.parse(window.localStorage.getItem("obsConnection")):{};','const r=__DNG.readLocal(window.localStorage,"obsConnection")||{};')
    text=text.replace('JSON.parse(window.localStorage.getItem("obsConnection"))','__DNG.readLocal(window.localStorage,"obsConnection")').replace('JSON.parse(window.localStorage.getItem("streamlabsConnection"))','__DNG.readLocal(window.localStorage,"streamlabsConnection")')
    replace('t&&(t=JSON.parse(t),e("obsIp",t.obsIp)', 't&&(t=__DNG.readLocal(window.localStorage,"obsConnection")||{},e("obsIp",t.obsIp)')
    replace('t&&(t=JSON.parse(t),e("streamlabsIp",t.streamlabsIp)', 't&&(t=__DNG.readLocal(window.localStorage,"streamlabsConnection")||{},e("streamlabsIp",t.streamlabsIp)')
    replace('i&&i.obsIp&&i.obsPort&&i.obsPwd?','i&&i.obsIp&&i.obsPort?')
    section('reconnect(e,t,o){','async connect(e,t,o,i){',
            'async reconnect(e,t,o){try{await this.ws.disconnect();await this.ws.connect("ws://"+(X.isIPv6(e.obsIp)?"["+e.obsIp+"]":e.obsIp)+":"+e.obsPort,e.obsPwd||"");await this.initEvent(this.obsState);t()}catch(__err){o(__err)}}')
    section('}connectStreamlabsSocket(e){','request(e,t,...o){',
            '}connectStreamlabsSocket(e){return __DNG.connectStreamlabs(this,e,W.a)}async reconnectStreamlabsSocket(e){return this.connectStreamlabsSocket(e)}')
    section('sendMessage(e){let t=e;','async onMessageHandler(e){',
            'sendMessage(e){return __DNG.sendStreamlabs(this,e)}')
    replace('catch(ht){await this.onConnectionHandler(e)}','catch(ht){throw ht}')
    replace('this.request(e,t).then(e=>{this.data.subscriptions[e.resourceId]=o})','this.request(e,t).then(e=>{this.data.subscriptions[e.resourceId]=o}).catch(()=>{this._dngFail&&this._dngFail()})')
    # Do not reconnect inside setup while setup is still using the old connection.
    replace('await this.reconnectStreamlabsSocket(this.data.connectionInfo)','(()=>{throw new Error("Streamlabs scene setup failed")})()',count=2)
    replace('new f.a.client({identity:', 'new f.a.client({connection:{reconnect:!0},identity:')
    replace('this.access_token=i.access_token,this.refresh_token=i.refresh_token,await this.reconnect', 'this.access_token=i.access_token,this.refresh_token=i.refresh_token,__DNG.updateTwitchTokens(this.username,i),await this.reconnect')
    replace('this.client=null,this.init({username:e,access_token:t,refresh_token:o})','this.client=null,this.init({username:e,access_token:t,refresh_token:o});return this.client.connect().catch(()=>null)')
    replace('this.init({username:e,access_token:t,refresh_token:o}),this.client.connect()','this.init({username:e,access_token:t,refresh_token:o}),this.client.connect().catch(()=>null)')
    section('connect(){const e=this.clientId,','changeChannel(e){',
            'connect(){return __DNG.connectDiscord(this,()=>new q.Client({transport:"ipc"}))}')
    replace('this.checkOBSStatus?clearInterval(this.reconnectTimer):this.checkObsStatus()},5e3)', 'this.checkOBSStatus?clearInterval(this.reconnectTimer):this.checkObsStatus()},2500)')
    # Intercept community action drags on both keypad component renderers.
    for target in ['3-r,o','s,o.serialNumber']:
        replace('onDrop:e=>n.onDropKeypad(a,'+target+')', 'onDrop:e=>__DNG.dropAction(e,{index:'+target.split(',')[0]+',serialNumber:'+target.split(',')[1]+'})||n.onDropKeypad(a,'+target+')',count=2)
        replace('onDragover:e=>n.onDragOverKeypad(e,'+target+')', 'onDragover:e=>__DNG.dragOverAction(e)||n.onDragOverKeypad(e,'+target+')',count=2)
    replace('async executeKeypadFunction(e,t,i){','async executeKeypadFunction(e,t,i){if((e.btnFunc||e.action)==="web-url"&&__DNG.isAddonURL(e.url))return __DNG.runURL(e.url,{source:"keypad",serialNumber:i,buttonIndex:t});')
    replace('eY.use(PZ["default"]),eY.mount("#app");','eY.use(PZ["default"]),__DNG.install({store:Qq,app:eY,ipc:p["ipcRenderer"],base:Uq,getTwitch:e=>T.getInstance(e),getDiscord:e=>Y.getInstance(e),ensureTwitch:async e=>{const res=await _(e.access_token);if(res.status===401){const next=await k(e.refresh_token);if(!next.access_token)throw new Error("Twitch reauthorization required");e.access_token=next.access_token;if(next.refresh_token)e.refresh_token=next.refresh_token}}}),eY.mount("#app");')
    return text

def build(source,out):
    blob=source.read_bytes()
    if hashlib.sha256(blob).hexdigest()!=EXPECTED:raise ValueError('Unsupported app.asar: expected uploaded 1.0.0.113 build; no output written')
    header,files=parse_asar(blob);original=dict(files)
    key='js/app.c762092d.js';files[key]=patch_bundle(files[key].decode()).encode()
    bg=files['background.js'].decode();anchor='await va.webContents.session.clearStorageData(),'
    if bg.count(anchor)!=1:raise ValueError('Cache patch anchor missing')
    bg=bg.replace(anchor,'')
    files['background.js']=('require("./mhc-bootstrap/boot.cjs").start(require("electron"));\n'+bg).encode()
    for file in sorted((ROOT/'bootstrap').rglob('*')):
        if file.is_file():add_file(header,files,'mhc-bootstrap/'+file.relative_to(ROOT/'bootstrap').as_posix(),file.read_bytes())
    packed=pack_asar(header,files);check_header,check_files=parse_asar(packed)
    assert check_files==files,'ASAR round-trip failed'
    changed=[name for name,value in original.items() if check_files[name]!=value]
    assert set(changed)=={key,'background.js'}
    out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(packed)
    manifest={'patchVersion':json.loads((ROOT/'package.json').read_text())['version'],'previousSha256':['fe7ff676b57998eba3bf414bdabac885d2cb71dec987e236f80a07481212ec11','5f7db84866906fdeb9bc8873780b4eea4489030b2e60f99762c82aabd1f2a3b3','92b533f8fe1a3d77d27603cf6392f405e01b6588b29cf7f1643c67fa383bb80e','8078a40164d68940fbff02021b4316019ccbbeffbf67795508c4d1a3c166eeaf','9cd2df98c2be83a01358dd2d74e29330b10cb337812c4c4c757b95289b40a2b3'],'targetVersion':'1.0.0.113','originalSha256':EXPECTED,'patchedSha256':hashlib.sha256(packed).hexdigest(),'modifiedVendorFiles':changed,'addedFiles':[name for name in files if name not in original]}
    (out.parent/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print(json.dumps({'output':str(out),'bytes':len(packed),'unchangedEntries':len(original)-len(changed),'addedEntries':len(files)-len(original),'sha256':manifest['patchedSha256']}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('app_asar',type=pathlib.Path);parser.add_argument('--out',type=pathlib.Path,default=ROOT/'payload'/'app.asar');args=parser.parse_args();build(args.app_asar,args.out)
