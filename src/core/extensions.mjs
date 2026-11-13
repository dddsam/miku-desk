import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { runProcess } from './process.mjs';
import { postJSON } from './providers.mjs';

const object = (properties,required=[]) => ({type:'object',properties,required,additionalProperties:false});
const string = description => ({type:'string',description});
export async function within(root, relative, write = false) {
  if(typeof relative !== 'string' || relative.includes('\0')) throw new Error('无效路径');
  const base = await fs.realpath(root);
  const target = path.resolve(base,relative);
  const inside = p => { const r = path.relative(base,p); return !r.startsWith('..'+path.sep) && r !== '..' && !path.isAbsolute(r); };
  if (!inside(target)) throw new Error('路径超出工作目录');
  let current = target;
  while(true) {
    try { if(!inside(await fs.realpath(current))) throw new Error('符号链接指向工作目录之外'); break; }
    catch(e) { if(e.code !== 'ENOENT' || !write) throw e; const parent=path.dirname(current); if(parent===current)throw e; current=parent; }
  }
  return target;
}
async function readSmall(file, max = 48000) {
  const stat = await fs.stat(file); if (!stat.isFile()) throw new Error('不是文件');
  const handle = await fs.open(file,'r');
  try { const b=Buffer.alloc(Math.min(stat.size,max)); await handle.read(b,0,b.length,0); return b.toString('utf8')+(stat.size>max?'\n[内容已截断]':''); } finally { await handle.close(); }
}
export async function loadSkills(roots) {
  const result = [];
  for (const root of roots || []) {
    const candidates = [root];
    try { for (const entry of await fs.readdir(root,{withFileTypes:true})) if(entry.isDirectory()) candidates.push(path.join(root,entry.name)); } catch { continue; }
    for(const directory of candidates) {
      try {
        const content = await readSmall(path.join(directory,'SKILL.md'));
        const name = content.match(/^name:\s*["']?([^\r\n"']+)/m)?.[1]?.trim() || path.basename(directory);
        const description = content.match(/^description:\s*["']?([^\r\n"']+)/m)?.[1]?.trim() || content.replace(/^---[\s\S]*?---/,'').trim().slice(0,180);
        const id=crypto.createHash('sha256').update(path.resolve(directory)).digest('hex').slice(0,12);
        if(!result.some(x=>x.id===id)) result.push({id,name,description,directory,content});
      } catch {}
    }
  }
  return result;
}
export class Extensions {
  constructor(config, emit = () => {}) {this.config=config;this.emit=emit;this.clients=[];this.tools=[];this.skills=[];}
  add(name,description,schema,execute) {this.tools.push({name,description,schema,execute});}
  async init(signal) {
    const c=this.config;
    await fs.mkdir(c.workspace,{recursive:true});
    this.add('workspace_list','列出工作目录内的文件',object({path:string('工作目录内的相对路径，默认 .')}),async a=>(await fs.readdir(await within(c.workspace,a.path || '.'),{withFileTypes:true})).slice(0,300).map(x=>({name:x.name,type:x.isDirectory()?'directory':'file'})));
    this.add('workspace_read','读取工作目录内的文本文件，最多 48000 字符',object({path:string('相对路径')},['path']),a=>within(c.workspace,a.path).then(readSmall));
    this.add('workspace_write','创建或覆盖工作目录内的文本文件',object({path:string('相对路径'),content:string('完整文件内容')},['path','content']),async a=>{
      if(a.content.length>200000)throw new Error('单个文件最多 200000 字符');
      const p=await within(c.workspace,a.path,true);await fs.mkdir(path.dirname(p),{recursive:true});await within(c.workspace,a.path,true);await fs.writeFile(p,a.content);return {saved:a.path,bytes:Buffer.byteLength(a.content)};
    });
    if(c.allowCommands) this.add('run_command','运行本地程序。command 为可执行文件，args 为参数数组；不通过 shell 解释。需要 PowerShell 时显式运行 powershell.exe。',object({command:string('可执行文件'),args:{type:'array',items:{type:'string'}}},['command']),a=>runProcess(a.command,a.args || [],{cwd:c.workspace,signal,timeoutMs:c.commandTimeoutMs || 180000}));
    this.skills=await loadSkills(c.skillRoots);
    if(this.skills.length) {
      this.add('skill_read','按 id 读取 Skill 的完整说明或其参考文件。先读取 SKILL.md 再遵循说明。',object({id:string('技能 id'),file:string('技能目录内的相对路径，默认 SKILL.md')},['id']),async a=>{
        const s=this.skills.find(s=>s.id===a.id);if(!s)throw new Error('技能不存在');return readSmall(await within(s.directory,a.file || 'SKILL.md'));
      });
      this.add('skill_files','列出某个 Skill 目录的文件',object({id:string('技能 id'),path:string('目录，默认 .')},['id']),async a=>{
        const s=this.skills.find(s=>s.id===a.id);if(!s)throw new Error('技能不存在');return fs.readdir(await within(s.directory,a.path || '.'));
      });
    }
    const agents=(c.agents || []).filter(a=>a.enabled);
    if(agents.length) {
      this.add('delegate_agent','把任务交给一个已启用的本地/HTTP Agent。可用 Agent：'+agents.map(a=>`${a.id} (${a.description || a.name || a.id})`).join('; '),object({agentId:{type:'string',enum:agents.map(a=>a.id)},prompt:string('清晰完整的任务、必要上下文及期望输出')},['agentId','prompt']),a=>this.delegate(a,signal));
      this.add('delegate_parallel','把独立任务并行交给多个已启用 Agent，最多 4 项。避免让多个 Agent 修改同一文件。',object({tasks:{type:'array',minItems:1,maxItems:4,items:object({agentId:{type:'string',enum:agents.map(a=>a.id)},prompt:string('任务及上下文')},['agentId','prompt'])}},['tasks']),async a=>Promise.all(a.tasks.map(async t=>{try{return {agentId:t.agentId,result:await this.delegate(t,signal)};}catch(e){return {agentId:t.agentId,error:e.message};}})));
    }
    for(const server of (c.mcpServers || []).filter(s=>s.enabled)) {
      signal?.throwIfAborted();
      let client;
      try {
        client=new Client({name:'MikuDesk',version:'0.1.0'});
        const transport=server.transport==='stdio' ? new StdioClientTransport({command:server.command,args:server.args || [],env:{...process.env,...server.env},cwd:server.cwd || c.workspace,stderr:'pipe'}) : server.transport==='sse' ? new SSEClientTransport(new URL(server.url),{requestInit:{headers:server.headers || {}}}) : new StreamableHTTPClientTransport(new URL(server.url),{requestInit:{headers:server.headers || {}}});
        transport.stderr?.on('data',()=>{});
        this.clients.push(client);
        await client.connect(transport,{signal,timeout:20000});
        let cursor;
        let count=0;
        do {
          const listed=await client.listTools(cursor?{cursor}:undefined,{signal,timeout:15000});
          for(const tool of listed.tools) {
            if(++count>150)break;
            const key='mcp_'+crypto.createHash('sha256').update(server.id+':'+tool.name).digest('hex').slice(0,14);
            this.add(key,`[${server.name || server.id}/${tool.name}] ${(tool.description || '').slice(0,700)}`,tool.inputSchema,async a=>{
              const r=await client.callTool({name:tool.name,arguments:a},undefined,{signal,timeout:server.timeoutMs || 180000});
              return {isError:!!r.isError,content:(r.content || []).map(b=>b.type==='text'?{type:'text',text:b.text}:{type:b.type,note:'本版本仅向模型返回文本，非文本内容已省略'}),structuredContent:r.structuredContent};
            });
          }
          cursor=count<150?listed.nextCursor:undefined;
        }while(cursor);
        this.emit({type:'notice',text:`MCP ${server.name || server.id} 已连接，${count} 个工具`});
      }catch(e){await client?.close().catch(()=>{});this.emit({type:'notice',text:`MCP ${server.name || server.id}：${e.message}`});}
    }
    return this;
  }
  async delegate({agentId,prompt},signal) {
    const a=this.config.agents.find(a=>a.id===agentId && a.enabled);if(!a)throw new Error('Agent 未启用');
    this.emit({type:'delegate',agentId,text:`${a.name || a.id} 开始工作`});
    let result;
    if(a.type==='http') {
      result=await postJSON(a.url,{'Content-Type':'application/json',...(a.headers || {})},{...(a.extraBody || {}),prompt,cwd:a.cwd || this.config.workspace},signal,a.timeoutMs || 300000);
    } else {
      // Prompt is supplied via stdin by default. If the CLI needs an argument, {prompt} is one escaped argv value.
      const args=(a.args || []).map(v=>v.replaceAll('{prompt}',prompt).replaceAll('{workspace}',a.cwd || this.config.workspace));
      const hasPrompt=(a.args || []).some(v=>v.includes('{prompt}'));
      if(!hasPrompt && a.input==='args') throw new Error('参数模式需要在 args 中放入 {prompt}');
      result=await runProcess(a.command,args,{cwd:a.cwd || this.config.workspace,env:a.env,stdin:hasPrompt?'':prompt,signal,timeoutMs:a.timeoutMs || 300000});
    }
    this.emit({type:'delegate',agentId,text:`${a.name || a.id} 已返回`});return result;
  }
  async hook(event,payload,signal) {
    for(const h of (this.config.hooks || []).filter(h=>h.enabled && h.event===event)) {
      const result=await runProcess(h.command,h.args || [],{cwd:h.cwd || this.config.workspace,env:h.env,stdin:JSON.stringify({event,...payload}),signal,timeoutMs:h.timeoutMs || 15000});
      this.emit({type:'hook',text:`Hook ${event}：退出码 ${result.exitCode}`});
      if(result.exitCode!==0 && h.blocking)throw new Error(`Hook ${event} 阻止执行：${result.stderr || result.stdout}`);
    }
  }
  async close(){await Promise.allSettled(this.clients.map(c=>c.close()));this.clients=[];}
}
