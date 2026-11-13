import {app,BrowserWindow,ipcMain,Menu,Tray,nativeImage,dialog,powerMonitor,screen,safeStorage,session} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Store,defaults,validateConfig} from './core/store.mjs';
import {Agent} from './core/agent.mjs';
import {PetState,VIDEO} from './core/state.mjs';
import {complete,decide,endpoint} from './core/providers.mjs';
import {discoverAgents} from './core/process.mjs';
import {PetWindowDrag,petDimensions} from './core/pet-window.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
app.setName('MikuDesk');
if(process.env.MIKU_TEST_DATA)app.setPath('userData',process.env.MIKU_TEST_DATA);
if((app.isPackaged || !process.env.MIKU_TEST_DATA) && !app.requestSingleInstanceLock())app.quit();
else {
let pet,panel,tray,config,store,agent,state,petDrag,quitting=false,finishTimer,previewTimer;
const visible=[];
function redact(text) {
  let result=String(text);
  for(const p of config?.providers || []) {const key=p.apiKeyEnv?process.env[p.apiKeyEnv]:p.apiKey;if(key&&key.length>3)result=result.split(key).join('[API KEY]');}
  return result;
}
function emit(event) {
  if(event.type==='history'){store.write('history',event.history).catch(e=>emit({type:'notice',text:e.message}));return;}
  if(event.type==='message'||event.type==='tool'||event.type==='toolResult'||event.type==='error'||event.type==='notice'||event.type==='delegate'||event.type==='hook'){
    if(event.text)event={...event,text:redact(event.text)};
    visible.push({...event,time:Date.now()});if(visible.length>300)visible.shift();
  }
  for(const w of [pet,panel])if(w&&!w.isDestroyed())w.webContents.send('miku:event',event);
}
function securedWindow(options) {
  const w=new BrowserWindow({...options,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  w.webContents.on('will-navigate',(e,url)=>{if(url!==w.webContents.getURL())e.preventDefault();});
  return w;
}
function placePanel() {
  if(!panel||!pet)return;
  const b=pet.getBounds(),a=screen.getDisplayMatching(b).workArea,w=panel.getBounds();
  const x=b.x-w.width-18>=a.x?b.x-w.width-18:Math.min(b.x+b.width+18,a.x+a.width-w.width);
  panel.setPosition(Math.round(Math.max(a.x,x)),Math.round(Math.max(a.y,Math.min(b.y,a.y+a.height-w.height))));
}
function showPanel() {placePanel();panel.show();panel.focus();emit({type:'focus'});}
function menu() {
  Menu.buildFromTemplate([
    {label:'打开聊天与设置',click:showPanel},
    {label:'显示桌宠',click:()=>{pet.show();}},
    {label:'恢复桌宠大小与位置',click:()=>{petDrag.restore(true);pet.show();}},
    {label:'置顶',type:'checkbox',checked:config.alwaysOnTop,click:i=>{config.alwaysOnTop=i.checked;pet.setAlwaysOnTop(i.checked);store.write('config',config).catch(()=>{});}},
    {type:'separator'},
    {label:'停止当前任务',click:()=>agent.cancel()},
    {label:'退出 Miku Desk',click:()=>app.quit()}
  ]).popup();
}
function syncAppearance() {petDrag.restore();pet.setAlwaysOnTop(config.alwaysOnTop);emit({type:'config',config});}
function handle(name,fn){ipcMain.handle('miku:'+name,async(event,...args)=>{
  if(![pet?.webContents.id,panel?.webContents.id].includes(event.sender.id)||!event.senderFrame.url.startsWith('file://'))throw new Error('无效窗口');
  return fn(...args);
});}
app.whenReady().then(async()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  store=new Store(app.getPath('userData'),safeStorage);
  const base=defaults(path.join(app.getPath('documents'),'MikuDeskWorkspace'));
  try{config=validateConfig({...base,...await store.read('config',{})});}catch(e){config=base;visible.push({type:'notice',text:'配置读取失败，使用默认值：'+e.message});}
  let history=[];try{history=await store.read('history',[]);}catch(e){visible.push({type:'notice',text:'历史记录未能解密：'+e.message});}
  for(const m of history)if(['user','assistant'].includes(m.role)&&m.content)visible.push({type:'message',message:{role:m.role,content:m.content}});
  state=new PetState(s=>{
    clearTimeout(finishTimer);
    emit({type:'state',...s});
    if(s.state==='finished')finishTimer=setTimeout(()=>state.ended(),6000);
  });
  agent=new Agent({config:()=>config,state,emit,history});
  const area=screen.getPrimaryDisplay().workArea;
  pet=securedWindow({...petDimensions(config.petSize),x:area.x+area.width-config.petSize-50,y:area.y+area.height-config.petSize-90,transparent:true,frame:false,resizable:false,maximizable:false,fullscreenable:false,hasShadow:false,alwaysOnTop:config.alwaysOnTop,skipTaskbar:true,backgroundColor:'#00000000',show:false});
  petDrag=new PetWindowDrag(pet,screen,()=>config.petSize);
  pet.on('hide',()=>petDrag.cancel());
  const ph=Math.min(820,area.height-30),pw=Math.min(620,area.width-30);
  panel=securedWindow({width:pw,height:ph,minWidth:440,minHeight:550,frame:false,show:false,backgroundColor:'#f6f8f8',title:'Miku Desk'});
  panel.on('close',e=>{if(!quitting){e.preventDefault();panel.hide();}});
  const handlers={
    bootstrap:()=>({config,state:state.value,busy:!!agent.controller,events:visible.slice(-200),version:app.getVersion()}),
    saveConfig:async next=>{if(agent.controller)throw new Error('请先停止或等待当前任务完成再修改配置');validateConfig(next);await store.write('config',next);const old=config.providers.find(p=>p.id===config.activeProviderId),fresh=next.providers.find(p=>p.id===next.activeProviderId);if(config.activeProviderId!==next.activeProviderId||old?.type!==fresh?.type||old?.model!==fresh?.model||old?.baseUrl!==fresh?.baseUrl){agent.history=[];visible.length=0;await store.write('history',[]);emit({type:'cleared'});}config=next;syncAppearance();return true;},
    chooseFolder:async()=>{const r=await dialog.showOpenDialog(panel,{properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0];},
    chat:async text=>{if(typeof text!=='string'||text.length>30000)throw new Error('消息长度必须小于 30000 字符');if(agent.controller)throw new Error('任务正在运行');await agent.run(text);},
    stop:()=>agent.cancel(),
    reject:()=>{state.reject();const m={role:'user',content:'我驳回刚才的方案。请不要继续执行，等待我的新要求。'};if(agent.controller){agent.rejectionPending=m;agent.cancel();}else{agent.history.push(m);emit({type:'message',message:m});store.write('history',agent.history).catch(()=>{});}},
    clearHistory:async()=>{if(agent.controller)throw new Error('请先停止任务');agent.history=[];visible.length=0;await store.write('history',[]);emit({type:'cleared'});},
    togglePanel:()=>{state.activity();panel.isVisible()?panel.hide():showPanel();},
    hidePanel:()=>panel.hide(),minimizePanel:()=>panel.minimize(),quit:()=>app.quit(),menu,
    beginPetDrag:()=>petDrag.begin(),updatePetDrag:()=>petDrag.update(),endPetDrag:()=>petDrag.end(),cancelPetDrag:()=>petDrag.cancel(),
    petEnded:()=>{if(state.value==='finished')state.ended();},activity:()=>state.activity(),
    preview:value=>{if(agent.controller)throw new Error('任务运行时不能预览');if(value&&!VIDEO[value])throw new Error('未知状态');clearTimeout(previewTimer);state.preview=value;state.update();if(value)previewTimer=setTimeout(()=>{state.preview=null;state.update();},10000);},
    discover:discoverAgents,
    testProvider:async p=>{if(p.type==='systemone')return decide(p,'The pet is ready.',{ready:{type:'noul',instructions:'The pet is ready.'}});const r=await complete(p,'只回复：连接成功',[{role:'user',content:'测试连接'}],[]);return {text:r.content,usage:r.usage};},
    listModels:async p=>{
      const key=p.apiKeyEnv?process.env[p.apiKeyEnv]:p.apiKey;
      const u=new URL(endpoint(p.baseUrl,p.type,p.model || 'placeholder'));
      const headers={...(p.headers || {})};
      if(p.type==='gemini'){u.pathname=u.pathname.replace(/\/models\/.*$/, '/models');if(key)headers['x-goog-api-key']=key;}
      else {u.pathname=u.pathname.replace(/\/(chat\/completions|responses|messages|systemone)$/,'/models');if(key)headers[p.type==='anthropic'?'x-api-key':'Authorization']=p.type==='anthropic'?key:`Bearer ${key}`;if(p.type==='anthropic')headers['anthropic-version']='2023-06-01';}
      const r=await fetch(u,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`模型列表 API ${r.status}，可手动填写模型 ID`);const j=await r.json();return (j.data || j.models || []).map(x=>x.id || x.name?.replace(/^models\//,'')).filter(Boolean);
    },
    exportConfig:async()=>{const r=await dialog.showSaveDialog(panel,{defaultPath:'miku-config.json',filters:[{name:'JSON',extensions:['json']}]});if(r.canceled)return false;const c=structuredClone(config);for(const p of c.providers){delete p.apiKey;delete p.headers;}for(const group of [c.mcpServers,c.agents,c.hooks])for(const x of group){delete x.env;delete x.headers;}await fs.writeFile(r.filePath,JSON.stringify(c,null,2));return true;},
    importConfig:async()=>{const r=await dialog.showOpenDialog(panel,{properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(r.canceled)return null;return validateConfig({...base,...JSON.parse(await fs.readFile(r.filePaths[0],'utf8'))});}
  };
  for(const [name,fn]of Object.entries(handlers))handle(name,fn);
  await pet.loadFile(path.join(here,'ui/pet.html'));
  await panel.loadFile(path.join(here,'ui/panel.html'));
  pet.show();
  if(!config.providers.find(p=>p.id===config.activeProviderId)?.model)showPanel();
  try{tray=new Tray(nativeImage.createFromPath(path.join(here,'../assets/icon.png')));tray.setToolTip('Miku Desk');tray.on('click',showPanel);tray.on('right-click',menu);}catch{}
  setInterval(()=>{state.setIdle(powerMonitor.getSystemIdleTime()>=config.idleMinutes*60);},3000).unref();
  app.on('second-instance',showPanel);
}).catch(e=>{dialog.showErrorBox('Miku Desk 启动失败',e.stack || e.message);app.quit();});
app.on('before-quit',event=>{
  if(quitting)return;
  event.preventDefault();quitting=true;agent?.cancel();
  (async()=>{
    const deadline=Date.now()+5000;
    while(agent?.controller && Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
    await Promise.race([store?.queue.catch(()=>{}),new Promise(r=>setTimeout(r,1500))]);
    app.quit();
  })();
});
app.on('window-all-closed',()=>app.quit());
}
