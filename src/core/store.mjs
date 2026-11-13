import fs from 'node:fs/promises';
import path from 'node:path';
import { PROTOCOLS } from './providers.mjs';
export function defaults(workspace) {
  return {version:1,name:'Miku',personality:'你是温柔、活泼、认真负责的 Miku。平时简洁自然地使用中文交流，工作时保持专注。可以适度表达情绪，但不要让角色扮演妨碍完成任务。遇到不确定的信息，明确说明。',workspace,petSize:176,idleMinutes:5,alwaysOnTop:true,workMood:'auto',maxSteps:16,historyTurns:10,maxToolChars:16000,allowCommands:false,activeProviderId:'local',decisionProviderId:'',providers:[{id:'local',name:'本地 / Magpie',type:'openai',baseUrl:'http://127.0.0.1:3425/v1',apiKey:'',model:'',maxTokens:4096,extraBody:{}}],mcpServers:[],agents:[],hooks:[],skillRoots:[]};
}
export function validateConfig(c) {
  if(!c || typeof c!=='object')throw new Error('配置必须是对象');
  for(const name of ['providers','mcpServers','agents','hooks','skillRoots'])if(!Array.isArray(c[name]))throw new Error(`${name} 必须是数组`);
  if(!c.name?.trim() || !c.workspace || !path.isAbsolute(c.workspace))throw new Error('请填写名字和绝对工作目录');
  for(const [key,min,max] of [['petSize',120,320],['idleMinutes',1,240],['maxSteps',1,100],['historyTurns',1,50],['maxToolChars',1000,64000]])if(!Number.isFinite(c[key]) || c[key]<min || c[key]>max)throw new Error(`${key} 范围为 ${min}–${max}`);
  for(const key of ['providers','mcpServers','agents']) {
    const ids=new Set();
    for(const x of c[key]) {if(!x.id || ids.has(x.id))throw new Error(`${key} 中的 id 缺失或重复`);ids.add(x.id);}
  }
  for(const p of c.providers){if(!PROTOCOLS.includes(p.type))throw new Error('供应商协议不支持');if(p.baseUrl && !/^https?:\/\//.test(p.baseUrl))throw new Error('Base URL 需以 http:// 或 https:// 开头');if(p.maxTokens!==undefined&&(!Number.isInteger(p.maxTokens)||p.maxTokens<128||p.maxTokens>131072))throw new Error('输出 token 上限须为 128–131072 的整数');}
  for(const group of [c.mcpServers,c.agents,c.hooks])for(const x of group){if(x.args && (!Array.isArray(x.args)||x.args.some(v=>typeof v!=='string')))throw new Error('args 必须为字符串数组');if(x.timeoutMs!==undefined&&(!Number.isFinite(x.timeoutMs)||x.timeoutMs<1000||x.timeoutMs>3600000))throw new Error('timeoutMs 范围为 1000–3600000 毫秒');}
  for(const a of c.agents){if(a.enabled && (a.type==='http' ? !/^https?:\/\//.test(a.url || '') : !a.command))throw new Error('已启用 Agent 缺少 command 或 HTTP URL');if(a.args && (!Array.isArray(a.args) || a.args.some(v=>typeof v!=='string')))throw new Error('Agent args 必须是字符串数组');}
  for(const s of c.mcpServers){if(!['stdio','http','sse'].includes(s.transport))throw new Error('MCP transport 支持 stdio/http/sse');if(s.enabled && (s.transport==='stdio'?!s.command:!/^https?:\/\//.test(s.url || '')))throw new Error('MCP 配置不完整');}
  for(const h of c.hooks){if(!['beforeTask','afterTask','beforeTool','afterTool','onError'].includes(h.event))throw new Error('Hook 事件不支持');if(h.enabled && !h.command)throw new Error('Hook 缺少 command');}
  return c;
}
export class Store {
  constructor(dir, encryption) {this.dir=dir;this.encryption=encryption;this.queue=Promise.resolve();}
  async read(name,fallback) {
    let bytes;try{bytes=await fs.readFile(path.join(this.dir,name+'.enc'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}
    return JSON.parse(await this.encryption.decryptStringAsync(bytes));
  }
  write(name,value) {
    const task=this.queue.catch(()=>{}).then(async()=>{
      if(!await this.encryption.isAsyncEncryptionAvailable())throw new Error('系统安全存储不可用，未保存配置或密钥');
      const bytes=await this.encryption.encryptStringAsync(JSON.stringify(value));
      await fs.mkdir(this.dir,{recursive:true});
      const file=path.join(this.dir,name+'.enc');
      await fs.writeFile(file+'.tmp',bytes,{mode:0o600});await fs.rename(file+'.tmp',file);
    });this.queue=task;return task;
  }
}
