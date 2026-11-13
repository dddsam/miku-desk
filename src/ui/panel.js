import {ModelPicker} from './model-picker.mjs';
import {cleanError,diagnoseApiError,providerCatalogKey,providerRequestKey} from './api-diagnostics.mjs';
const $=id=>document.getElementById(id);
const api=window.miku;
let config,appliedConfig,selected='',busy=false,toastTimer,editorKey,rendered=0;
const modelLists=new Map(),testRecords=new Map();
const modelPicker=new ModelPicker({dialog:$('modelPicker'),search:$('modelSearch'),list:$('modelResults'),count:$('modelCount'),empty:$('modelEmpty'),onSelect:model=>{
  $('modelId').value=model;$('modelId').dispatchEvent(new Event('input',{bubbles:true}));
}});
const labels={standby:'在这里，陪你把事情做好。',happy:'开心工作中 · 正在认真处理',angry:'哼，我会把这个难题解决掉。',confused:'有一点困惑，等你回来。',finished:'做好啦！又完成了一件事。'};
const videos={standby:'miku_standby.mp4',happy:'miku_work_happy.mp4',angry:'miku_work_angry.mp4',confused:'miku_not_understand.mp4',finished:'miku_finishwork.mp4'};
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function guarded(fn){return async(...args)=>{try{return await fn(...args);}catch(e){toast(cleanError(e));}};}
function on(id,fn){$(id).addEventListener('click',guarded(fn));}
function option(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o;}
function switchTab(name){document.querySelectorAll('.tab').forEach(e=>e.classList.toggle('active',e.id==='tab-'+name));document.querySelectorAll('nav button').forEach(e=>e.classList.toggle('active',e.dataset.tab===name));}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
function provider(){return config.providers.find(p=>p.id===selected);}
function jsonField(id){let value;try{value=JSON.parse($(id).value || '{}');}catch{throw new Error(id+' 的 JSON 格式有误');}if(!value || Array.isArray(value) || typeof value!=='object')throw new Error(id+' 必须是 JSON 对象');return value;}
function collectProvider(){const p=provider();if(!p)return;p.name=$('providerName').value.trim();p.type=$('providerType').value;p.baseUrl=$('baseUrl').value.trim();p.apiKey=$('apiKey').value.trim();p.apiKeyEnv=$('apiKeyEnv').value.trim();p.model=$('modelId').value.trim();p.maxTokens=Number($('maxTokens').value);p.timeoutMs=Number($('apiTimeout').value)*1000;p.extraBody=jsonField('extraBody');p.headers=jsonField('providerHeaders');}
function endpointHint(){const kind=$('providerType').value;$('endpointHint').textContent=({openai:'填写 /v1 地址，自动追加 /chat/completions；也可填写完整端点。',responses:'填写 /v1 地址，自动追加 /responses；也可填写完整端点。',anthropic:'填写 /v1 地址或完整 /v1/messages；只填域名时自动追加 /v1/messages。',gemini:'填写域名或 /v1beta 地址，自动追加 /models/{模型}:generateContent。',systemone:'填写 /v1 地址，自动追加 /systemone。这是辅助决策接口。'})[kind];}
function fillProvider(){const p=provider();if(!p)return;$('providerName').value=p.name || '';$('providerType').value=p.type;$('baseUrl').value=p.baseUrl || '';$('apiKey').value=p.apiKey || '';$('apiKeyEnv').value=p.apiKeyEnv || '';$('modelId').value=p.model || '';$('maxTokens').value=p.maxTokens || 4096;$('apiTimeout').value=(p.timeoutMs || 120000)/1000;$('extraBody').value=JSON.stringify(p.extraBody || {},null,2);$('providerHeaders').value=JSON.stringify(p.headers || {},null,2);showTestRecord(testRecords.get(providerRequestKey(p)));endpointHint();}
function providerLists(){
  $('providerPicker').replaceChildren(...config.providers.map(p=>option(p.id,p.name || p.id)));$('providerPicker').value=selected;
  $('activeProvider').replaceChildren(option('','请选择'),...config.providers.filter(p=>p.type!=='systemone').map(p=>option(p.id,p.name || p.id)));$('activeProvider').value=config.activeProviderId;
  $('decisionProvider').replaceChildren(option('','不使用 · 默认开心'),...config.providers.filter(p=>p.type==='systemone').map(p=>option(p.id,p.name || p.id)));$('decisionProvider').value=config.decisionProviderId || '';
}
function fillConfig(){
  selected=config.providers.some(p=>p.id===selected)?selected:config.providers[0]?.id || '';providerLists();fillProvider();
  for(const id of ['name','personality','workspace','petSize','idleMinutes','maxSteps','historyTurns','workMood'])$(id).value=config[id];
  for(const id of ['alwaysOnTop','allowCommands'])$(id).checked=config[id];
  updateIdentity();fillExtensions();
}
function updateIdentity(){
  const saved=appliedConfig || config;
  $('petName').textContent=saved.name;
  const p=saved.providers.find(p=>p.id===saved.activeProviderId);
  $('modelLabel').textContent=p?.model?`${p.name} / ${p.model}`:'选择你的第一个模型';
  const result=p?.model?testRecords.get(providerRequestKey(p)):null;
  $('connectionBadge').textContent=result?(result.ok?'最近成功':'最近失败'):p?.model?'未验证':'待配置';
  $('connectionBadge').classList.toggle('connected',!!result?.ok);$('connectionBadge').classList.toggle('failed',result?.ok===false);
  $('connectionBadge').title=result?'本次运行中的最近一次 API 结果；不代表服务持续可用。':'配置已填写后，仍需测试连接。';
  $('prompt').placeholder=`和 ${saved.name} 说点什么…`;
}
function showTestRecord(record) {
  $('connectionResult').hidden=!record;
  $('testResult').textContent=record?(record.ok?'测试通过':'测试失败'):'尚未测试';
  if(!record)return;
  $('connectionResult').classList.toggle('success',record.ok);
  $('connectionTitle').textContent=record.ok?'模型已返回测试回复':record.diagnostic.title;
  $('connectionSummary').textContent=record.ok?'本次基础请求成功。正式任务还会携带工具定义；若正式任务失败，请查看聊天中的具体错误。':record.diagnostic.summary;
  $('connectionCooldown').textContent=record.ok?'':record.diagnostic.cooldown;
  $('connectionCooldown').hidden=record.ok || !record.diagnostic.cooldown;
  $('connectionRaw').textContent=record.ok?record.text:record.diagnostic.raw;
}
function markRequestEdited(){showTestRecord(null);$('testResult').textContent='参数已修改，请重新测试';}
function recordActiveResult(ok,error){
  const p=appliedConfig?.providers.find(p=>p.id===appliedConfig.activeProviderId);if(!p)return;
  const diagnostic=ok?null:diagnoseApiError(error);
  if(!ok && !diagnostic.status && diagnostic.kind!=='network')return;
  testRecords.set(providerRequestKey(p),ok?{ok:true,text:'最近一次聊天请求完成。'}:{ok:false,diagnostic});updateIdentity();
}
function collectConfig(){collectProvider();for(const id of ['name','personality','workspace','workMood'])config[id]=$(id).value;for(const id of ['petSize','idleMinutes','maxSteps','historyTurns'])config[id]=Number($(id).value);for(const id of ['alwaysOnTop','allowCommands'])config[id]=$(id).checked;config.activeProviderId=$('activeProvider').value;config.decisionProviderId=$('decisionProvider').value;return config;}
function fillExtensions(){
  $('mcpCount').textContent=`${config.mcpServers.filter(s=>s.enabled).length} 个已启用`;
  $('agentCount').textContent=`${config.agents.filter(s=>s.enabled).length} 个已启用`;
  $('hookCount').textContent=`${config.hooks.filter(s=>s.enabled).length} 个已启用`;
  $('skillCount').textContent=`${config.skillRoots.length} 个目录`;
  $('skillList').replaceChildren();
  config.skillRoots.forEach((root,i)=>{const row=document.createElement('div'),text=document.createElement('span'),b=document.createElement('button');text.textContent=root;b.textContent='移除';b.onclick=()=>{config.skillRoots.splice(i,1);fillExtensions();};row.append(text,b);$('skillList').append(row);});
}
function state(value){$('stateText').textContent=labels[value] || value;const v=$('avatarVideo');const src='../../assets/'+videos[value];if(v.getAttribute('src')!==src){v.src=src;v.loop=value!=='finished';v.play().catch(()=>{});}}
function setBusy(value){busy=value;$('send').hidden=value;$('stop').hidden=!value;$('progress').hidden=!value;}
function appendEvent(event){
  if(event.type==='message'){
    $('welcome')?.remove();const b=document.createElement('div');b.className='bubble '+event.message.role;
    if(event.message.role==='assistant'){const label=document.createElement('span');label.className='bubble-label';label.textContent=config.name.toUpperCase();b.append(label);}
    b.append(document.createTextNode(event.message.content));$('messages').append(b);rendered++;
  }else if(event.type==='toolResult'){
    const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('pre');d.className='tool-detail';s.textContent=(event.isError?'未完成':'已返回')+' · '+event.name;p.textContent=event.text;d.append(s,p);$('messages').append(d);
  }else if(event.type==='error'){
    const diagnostic=diagnoseApiError(event.text),box=document.createElement('div');box.className='event error';
    if(diagnostic.kind==='unknown'&&!diagnostic.status)box.textContent=event.text;
    else{
      const title=document.createElement('strong'),p=document.createElement('p'),details=document.createElement('details'),summary=document.createElement('summary'),raw=document.createElement('pre');
      title.textContent=diagnostic.title;p.textContent=diagnostic.summary+(diagnostic.cooldown?' '+diagnostic.cooldown:'');summary.textContent='查看服务端原始回复';raw.textContent=diagnostic.raw;details.append(summary,raw);box.append(title,p,details);
    }
    $('messages').append(box);
  }else if(['notice','delegate','hook','tool'].includes(event.type)){
    const p=document.createElement('p');p.className='event '+event.type;p.textContent=event.type==='tool'?'↳ '+event.text:event.text;$('messages').append(p);
  }
  $('messages').scrollTop=$('messages').scrollHeight;
}
api.onEvent(e=>{
  if(e.type==='state')state(e.state);
  else if(e.type==='busy')setBusy(e.value);
  else if(e.type==='progress')$('progress').textContent=e.text;
  else if(e.type==='config'){config=e.config;appliedConfig=structuredClone(e.config);fillConfig();}
  else if(e.type==='focus')$('prompt').focus();
  else if(e.type==='cleared'){$('messages').replaceChildren();rendered=0;}
  else if(e.type==='usage'){const u=e.usage;const total=u.total_tokens || u.totalTokenCount;$('modelLabel').title='本轮用量：'+JSON.stringify(u);if(total)$('progress').textContent=`本轮 token：${total}`;}
  else {if(e.type==='error')recordActiveResult(false,e.text);if(e.type==='done')recordActiveResult(true);appendEvent(e);}
});
on('send',async()=>{if(busy)return;const text=$('prompt').value.trim();if(!text)return;$('prompt').value='';try{await api.chat(text);}catch(e){$('prompt').value=text;throw e;}});
$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!busy)$('send').click();}});
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('prompt').value=b.dataset.prompt;$('prompt').focus();});
on('stop',()=>api.stop());on('reject',()=>api.reject());on('clearHistory',()=>api.clearHistory());
on('close',()=>api.hidePanel());on('minimize',()=>api.minimizePanel());
document.querySelectorAll('.save').forEach(b=>b.onclick=guarded(async()=>{await api.saveConfig(collectConfig());toast('设置已保存');}));
$('providerPicker').addEventListener('change',guarded(()=>{const next=$('providerPicker').value;collectProvider();selected=next;fillProvider();}));
$('providerType').addEventListener('change',guarded(()=>{collectProvider();providerLists();endpointHint();}));
$('providerName').addEventListener('change',guarded(()=>{collectProvider();providerLists();}));
$('activeProvider').addEventListener('change',()=>{config.activeProviderId=$('activeProvider').value;});
$('decisionProvider').addEventListener('change',()=>{config.decisionProviderId=$('decisionProvider').value;});
on('addProvider',()=>{collectProvider();const id='provider_'+Date.now();config.providers.push({id,name:'新供应商',type:'openai',baseUrl:'',model:'',maxTokens:4096});selected=id;providerLists();fillProvider();});
on('deleteProvider',()=>{if(config.providers.length<=1)throw new Error('请至少保留一个供应商');config.providers=config.providers.filter(p=>p.id!==selected);if(config.activeProviderId===selected)config.activeProviderId='';if(config.decisionProviderId===selected)config.decisionProviderId='';selected=config.providers[0].id;providerLists();fillProvider();});
async function refreshModels(){
  collectProvider();const p=structuredClone(provider()),key=providerCatalogKey(p);
  $('loadModels').disabled=true;$('refreshModelPicker').disabled=true;$('modelPickerError').hidden=true;
  try{
    const models=await api.listModels(p);modelLists.set(key,models);
    collectProvider();
    if(providerCatalogKey(provider())===key){modelPicker.open(models,$('modelId').value);}
    else toast('模型列表已获取；当前已切换到另一供应商配置。');
  }catch(e){
    if($('modelPicker').open){$('modelPickerError').textContent=cleanError(e);$('modelPickerError').hidden=false;}
    else toast(cleanError(e));
  }finally{$('loadModels').disabled=false;$('refreshModelPicker').disabled=false;}
}
on('loadModels',refreshModels);on('refreshModelPicker',refreshModels);
on('browseModels',()=>{collectProvider();$('modelPickerError').hidden=true;modelPicker.open(modelLists.get(providerCatalogKey(provider())) || [],$('modelId').value);});
on('closeModelPicker',()=>$('modelPicker').close());
on('testProvider',async()=>{
  collectProvider();const p=structuredClone(provider()),key=providerRequestKey(p);
  $('testProvider').disabled=true;$('connectionResult').hidden=true;$('testResult').textContent='连接中…';
  let record;
  try{const r=await api.testProvider(p);record={ok:true,text:r.text || JSON.stringify(r,null,2)};}
  catch(e){record={ok:false,diagnostic:diagnoseApiError(e)};}
  finally{$('testProvider').disabled=false;}
  testRecords.set(key,record);
  try{collectProvider();if(providerRequestKey(provider())===key){showTestRecord(record);$('connectionResult').scrollIntoView({block:'nearest'});}}catch{}
  updateIdentity();
});
for(const id of ['providerType','baseUrl','apiKey','apiKeyEnv','modelId','maxTokens','apiTimeout','extraBody','providerHeaders'])$(id).addEventListener('input',markRequestEdited);
on('chooseWorkspace',async()=>{const p=await api.chooseFolder();if(p)$('workspace').value=p;});
document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=guarded(()=>api.preview(b.dataset.preview)));
on('addSkill',async()=>{const p=await api.chooseFolder();if(p&&!config.skillRoots.includes(p)){config.skillRoots.push(p);fillExtensions();}});
const examples={
  mcpServers:[{id:'filesystem',name:'本地文件工具',enabled:false,transport:'stdio',command:'npx',args:['-y','@modelcontextprotocol/server-filesystem','{填写允许访问的绝对目录}'],env:{}},{id:'remote',name:'远程 MCP',enabled:false,transport:'http',url:'http://127.0.0.1:8000/mcp',headers:{}}],
  agents:[{id:'hermes',name:'Hermes',description:'本机 Hermes，沿用自己的模型与工具',enabled:false,type:'cli',command:'hermes',args:['-z'],input:'stdin',timeoutMs:300000},{id:'dsh',name:'DeepSeek Harness',description:'本机 DSH headless profile',enabled:false,type:'cli',command:'dsh',args:['--profile','headless'],input:'stdin',timeoutMs:300000},{id:'http-agent',name:'HTTP Agent',enabled:false,type:'http',url:'http://127.0.0.1:9000/task',headers:{},timeoutMs:300000}],
  hooks:[{id:'before-task',event:'beforeTask',enabled:false,command:'node',args:['填写 hook 脚本的绝对路径'],timeoutMs:15000,blocking:false}]
};
const editorInfo={mcpServers:['MCP 服务配置','支持数组格式，以及常见的 {"mcpServers":{"名称":{...}}} 格式。设置 enabled: true 启用。服务将在下一次任务启动时连接。'],agents:['子代理配置','CLI 默认把 Prompt 写入 stdin；需要参数时，在 args 中使用 {prompt}。HTTP 发送 {prompt,cwd} JSON。设置 enabled: true 后可被调用。'],hooks:['Hooks 配置','事件支持 beforeTask / afterTask / beforeTool / afterTool / onError。事件 JSON 通过 stdin 传入；blocking: true 且退出码非零会阻止该阶段。']};
function openEditor(key){editorKey=key;$('editorTitle').textContent=editorInfo[key][0];$('editorHelp').textContent=editorInfo[key][1];$('editorJson').value=JSON.stringify(config[key],null,2);$('editor').showModal();}
on('editMcp',()=>openEditor('mcpServers'));on('editAgents',()=>openEditor('agents'));on('editHooks',()=>openEditor('hooks'));
on('editorExample',()=>{$('editorJson').value=JSON.stringify(examples[editorKey],null,2);});
on('editorApply',()=>{
  let v;try{v=JSON.parse($('editorJson').value);}catch{throw new Error('JSON 格式不正确');}
  if(editorKey==='mcpServers'&&v.mcpServers){v=Object.entries(v.mcpServers).map(([id,s])=>({...s,id,name:s.name || id,transport:s.transport || (s.url?'http':'stdio'),enabled:s.enabled ?? !s.disabled}));}
  if(!Array.isArray(v))throw new Error('顶层必须为数组');config[editorKey]=v;fillExtensions();$('editor').close();toast('已应用，点击「保存设置」生效');
});
on('discover',async()=>{
  const found=await api.discover();$('discovered').replaceChildren();
  if(!found.length){toast('PATH 中未找到常见 Agent；可在配置中填入完整程序路径');return;}
  for(const a of found){const row=document.createElement('div'),span=document.createElement('span'),b=document.createElement('button');span.textContent=a.name+' · '+a.path;b.textContent='加入配置';b.onclick=()=>{
    if(config.agents.some(x=>x.id===a.name)){toast('已在配置中');return;}
    const template=examples.agents.find(x=>x.id===a.name);
    config.agents.push({id:a.name,name:a.name,description:'本机 '+a.name,enabled:false,type:'cli',command:a.path,args:template?.args || [],input:'stdin',timeoutMs:300000});fillExtensions();toast('已添加为未启用状态。核对当前版本的非交互参数后，在配置中启用。');
  };row.append(span,b);$('discovered').append(row);}
});
on('exportConfig',async()=>{if(await api.exportConfig())toast('配置已导出，API Key、请求头和环境变量值已移除');});
on('importConfig',async()=>{const c=await api.importConfig();if(c){config=c;fillConfig();toast('已载入，请检查后点击保存设置');}});
api.bootstrap().then(data=>{config=data.config;appliedConfig=structuredClone(data.config);fillConfig();state(data.state);setBusy(data.busy);data.events.forEach(appendEvent);}).catch(e=>toast(e.message));
