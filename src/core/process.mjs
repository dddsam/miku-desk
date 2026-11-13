import spawn from 'cross-spawn';
import { spawn as nativeSpawn } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
export function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') nativeSpawn('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());
  else { try { process.kill(-child.pid,'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}
export async function runProcess(command, args = [], options = {}) {
  if (!command || !Array.isArray(args) || args.some(a=>typeof a !== 'string')) throw new Error('command 和 args 格式不正确');
  options.signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const child = spawn(command,args,{cwd:options.cwd || undefined,env:{...process.env,...(options.env || {})},windowsHide:true,shell:false,detached:process.platform !== 'win32',stdio:['pipe','pipe','pipe']});
    let output = '', errors = '', finished = false;
    const limit = options.maxOutput || 24000;
    const append = (previous, chunk) => (previous + chunk.toString()).slice(-limit);
    child.stdout.on('data',b=>{output=append(output,b);});
    child.stderr.on('data',b=>{errors=append(errors,b);});
    const finish = (err,value) => { if(finished)return; finished=true; clearTimeout(timer); options.signal?.removeEventListener('abort',abort); err ? reject(err) : resolve(value); };
    const abort = () => {killTree(child); finish(new Error('任务已停止'));};
    const timer = setTimeout(()=>{killTree(child);finish(new Error('进程执行超时，已终止进程树'));},options.timeoutMs || 180000);
    options.signal?.addEventListener('abort',abort,{once:true});
    child.on('error',e=>finish(new Error(`无法启动 ${command}：${e.message}`)));
    child.on('close',(code)=>finish(null,{exitCode:code,stdout:output,stderr:errors}));
    child.stdin.on('error',()=>{});
    child.stdin.end(options.stdin || '');
    if (options.signal?.aborted) abort();
  });
}
export async function discoverAgents() {
  const names = ['hermes','dsh','codex','claude','gemini','opencode','aider','goose','pi','qoder','magpie'];
  const result = [];
  for (const name of names) {
    const suffixes = process.platform === 'win32' ? ['',...(process.env.PATHEXT || '.EXE;.CMD;.BAT').toLowerCase().split(';')] : [''];
    let found;
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      for (const ext of suffixes) { const candidate = path.join(dir,name+ext); try { await access(candidate); found=candidate; break; } catch {} }
      if(found) break;
    }
    if(found) result.push({name,path:found});
  }
  return result;
}
