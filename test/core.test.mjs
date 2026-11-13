import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {endpoint,buildRequest,parseResponse,complete,decide} from '../src/core/providers.mjs';
import {PetState} from '../src/core/state.mjs';
import {defaults,validateConfig,Store} from '../src/core/store.mjs';
import {Extensions,within,loadSkills} from '../src/core/extensions.mjs';
import {runProcess} from '../src/core/process.mjs';
import {Agent} from '../src/core/agent.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
async function temp(t){const d=await fs.mkdtemp(path.join(os.tmpdir(),'miku-test-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));return d;}
async function serve(t,handler){const seen=[];const server=http.createServer(async(req,res)=>{let data='';for await(const c of req)data+=c;const body=JSON.parse(data || '{}');seen.push({url:req.url,headers:req.headers,body});const result=await handler(body,seen.length,req);if(res.destroyed)return;res.writeHead(result.status || 200,{'Content-Type':'application/json'});res.end(JSON.stringify(result.body || result));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});return {baseUrl:`http://127.0.0.1:${server.address().port}/v1`,seen};}
const tool={name:'echo',description:'Echo',schema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}};
test('endpoint normalization supports five protocols and full URLs',()=>{
 assert.equal(endpoint('http://localhost:10','openai'),'http://localhost:10/v1/chat/completions');
 assert.equal(endpoint('https://x/v1/','responses'),'https://x/v1/responses');
 assert.equal(endpoint('https://x/v1/messages','anthropic'),'https://x/v1/messages');
 assert.equal(endpoint('https://x','anthropic'),'https://x/v1/messages');
 assert.equal(endpoint('https://x/v1beta','gemini','models/gemini-x'),'https://x/v1beta/models/gemini-x:generateContent');
 assert.equal(endpoint('https://x/v1','systemone'),'https://x/v1/systemone');
 assert.throws(()=>endpoint('file:///test','openai'));
});
test('state transitions include idle during work, rejection and completion',()=>{
 const states=[];const s=new PetState(x=>states.push(x.state));assert.equal(s.value,'standby');
 s.start();assert.equal(s.value,'happy');s.setIdle(true);assert.equal(s.value,'confused');s.activity();assert.equal(s.value,'happy');s.reject();assert.equal(s.value,'confused');s.stop();assert.equal(s.value,'confused');s.activity();assert.equal(s.value,'standby');s.start('angry');s.complete();assert.equal(s.value,'finished');s.ended();assert.equal(s.value,'standby');assert.ok(states.includes('angry'));
});
test('OpenAI protocol retains reasoning and tool-result ids',()=>{
 const raw={role:'assistant',content:null,reasoning_content:'private reasoning',tool_calls:[{id:'c1',type:'function',function:{name:'echo',arguments:'{"text":"hi"}'}}]};
 const a=parseResponse('openai',{choices:[{message:raw}]});
 const r=buildRequest({type:'openai',baseUrl:'https://x/v1',model:'test'},'sys',[{role:'user',content:'hi'},a,{role:'tool',name:'echo',callId:'c1',content:'hi'}],[tool]);
 assert.equal(r.body.messages[2].reasoning_content,'private reasoning');assert.equal(r.body.messages[3].tool_call_id,'c1');assert.equal(a.toolCalls[0].args.text,'hi');
});
test('Responses preserves reasoning output and correlates function calls',()=>{
 const output=[{type:'reasoning',id:'r1',summary:[],encrypted_content:'ciphertext'},{type:'function_call',id:'fc1',call_id:'call1',name:'echo',arguments:'{"text":"ok"}'}];
 const a=parseResponse('responses',{output});const r=buildRequest({type:'responses',baseUrl:'https://x/v1',model:'test'},'s',[a,{role:'tool',callId:'call1',content:'ok'}],[tool]);
 assert.deepEqual(r.body.input[0],output[0]);assert.equal(r.body.input[2].call_id,'call1');assert.equal(r.body.store,false);assert.equal(r.body.tools[0].strict,false);
});
test('Anthropic keeps signed blocks and groups multiple results',()=>{
 const content=[{type:'thinking',thinking:'x',signature:'sig'},{type:'tool_use',id:'a',name:'echo',input:{text:'x'}},{type:'tool_use',id:'b',name:'echo',input:{text:'y'}}];
 const a=parseResponse('anthropic',{content});const r=buildRequest({type:'anthropic',baseUrl:'https://x',model:'test',apiKey:'key'},'s',[a,{role:'tool',callId:'a',content:'x'},{role:'tool',callId:'b',content:'y',isError:true}],[tool]);
 assert.equal(r.headers['x-api-key'],'key');assert.deepEqual(r.body.messages[0].content,content);assert.equal(r.body.messages[1].content.length,2);assert.equal(r.body.messages[1].content[1].is_error,true);
});
test('Gemini retains thought signatures and function response names',()=>{
 const parts=[{functionCall:{name:'echo',id:'c1',args:{text:'hello'}},thoughtSignature:'signed'}];
 const a=parseResponse('gemini',{candidates:[{content:{parts}}]});const r=buildRequest({type:'gemini',baseUrl:'https://x',model:'test'},'s',[a,{role:'tool',name:'echo',callId:'c1',content:'hello'}],[tool]);
 assert.equal(r.body.contents[0].parts[0].thoughtSignature,'signed');assert.equal(r.body.contents[1].parts[0].functionResponse.name,'echo');assert.ok(r.body.tools[0].functionDeclarations[0].parametersJsonSchema);
});
for(const kind of ['openai','responses','anthropic','gemini'])test(`${kind} makes a real HTTP request and parses the reply`,async t=>{
 const responses={openai:{choices:[{message:{role:'assistant',content:'hello'}}]},responses:{output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'hello'}]}]},anthropic:{content:[{type:'text',text:'hello'}]},gemini:{candidates:[{content:{parts:[{text:'hello'}]}}]}};
 const {baseUrl,seen}=await serve(t,()=>responses[kind]);const r=await complete({type:kind,baseUrl,model:'test',apiKey:'secret'},'sys',[{role:'user',content:'hi'}],[tool]);assert.equal(r.content,'hello');assert.equal(seen.length,1);
});
test('System One sends typed questions and reads answers',async t=>{
 const {baseUrl,seen}=await serve(t,()=>({answers:{mood:{choice:'angry'}}}));const r=await decide({baseUrl,model:'decision',apiKey:'secret'},'hard task',{mood:{type:'choice',criteria:['happy','angry'],instructions:'mood'}});assert.equal(r.answers.mood.choice,'angry');assert.equal(seen[0].url,'/v1/systemone');assert.equal(seen[0].body.state,'hard task');
});
test('workspace rejects traversal and escaping symbolic links',async t=>{
 const root=await temp(t);const workspace=path.join(root,'work');await fs.mkdir(workspace);await fs.mkdir(path.join(root,'outside'));await fs.symlink(path.join(root,'outside'),path.join(workspace,'link'),'dir');
 await assert.rejects(()=>within(workspace,'../escape.txt',true));await assert.rejects(()=>within(workspace,'link/new/file.txt',true));assert.equal(await within(workspace,'new/file.txt',true),path.join(workspace,'new/file.txt'));
});
test('Skill discovery loads direct and child directories with stable IDs',async t=>{
 const root=await temp(t);await fs.mkdir(path.join(root,'demo'));await fs.writeFile(path.join(root,'demo','SKILL.md'),'---\nname: demo\ndescription: useful skill\n---\nDo the work.');const skills=await loadSkills([root,path.join(root,'demo')]);assert.equal(skills.length,1);assert.equal(skills[0].name,'demo');assert.match(skills[0].content,/Do the work/);
});
test('subagent stdin passes metacharacters literally without shell evaluation',async t=>{
 const workspace=await temp(t);const c=defaults(workspace);c.agents=[{id:'echo',enabled:true,type:'cli',command:process.execPath,args:['-e','process.stdin.pipe(process.stdout)']}];const ext=new Extensions(c);await ext.init();t.after(()=>ext.close());const prompt='中文 prompt $(touch nope); `x` & %PATH% "quotes"\nline2';const r=await ext.delegate({agentId:'echo',prompt});assert.equal(r.stdout,prompt);assert.equal(r.exitCode,0);
});
test('parallel agents and HTTP adapter return distinct results',async t=>{
 const workspace=await temp(t);const {baseUrl}=await serve(t,b=>({answer:b.prompt}));const c=defaults(workspace);c.agents=[{id:'http',enabled:true,type:'http',url:baseUrl}];const ext=await new Extensions(c).init();t.after(()=>ext.close());const r=await ext.tools.find(t=>t.name==='delegate_parallel').execute({tasks:[{agentId:'http',prompt:'A'},{agentId:'http',prompt:'B'}]});assert.deepEqual(r.map(x=>x.result.answer),['A','B']);
});
test('process cancellation terminates running work',async()=>{
 const ac=new AbortController();const p=runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:ac.signal});setTimeout(()=>ac.abort(),80);await assert.rejects(p,/停止/);
});
test('blocking Hooks receive JSON and stop their phase',async t=>{
 const c=defaults(await temp(t));c.hooks=[{enabled:true,event:'beforeTask',blocking:true,command:process.execPath,args:['-e','let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{console.error(JSON.parse(s).prompt);process.exit(2)})']}];const ext=new Extensions(c);await assert.rejects(()=>ext.hook('beforeTask',{prompt:'blocked'}),/blocked/);
});
test('MCP stdio performs initialize, listTools and callTool',async t=>{
 const c=defaults(await temp(t));c.mcpServers=[{id:'mock',name:'Mock',transport:'stdio',enabled:true,command:process.execPath,args:[path.join(here,'mock-mcp.mjs')]}];const events=[];const ext=await new Extensions(c,e=>events.push(e)).init();t.after(()=>ext.close());const tool=ext.tools.find(x=>x.name.startsWith('mcp_'));assert.ok(tool,JSON.stringify(events));const r=await tool.execute({text:'MCP works'});assert.equal(r.content[0].text,'MCP works');
});
test('agent actually writes a file, returns result, and finishes animation',async t=>{
 const workspace=await temp(t);const {baseUrl,seen}=await serve(t,(_b,n)=>n===1?{choices:[{message:{role:'assistant',content:'开始写入',tool_calls:[{id:'c1',type:'function',function:{name:'workspace_write',arguments:JSON.stringify({path:'result.txt',content:'真实执行'})}}]}}]}:{choices:[{message:{role:'assistant',content:'写入完成'}}]});
 const c=defaults(workspace);c.providers[0]={...c.providers[0],baseUrl,model:'mock'};const state=new PetState();const events=[];const agent=new Agent({config:()=>c,state,emit:e=>events.push(e)});await agent.run('写入文件');assert.equal(await fs.readFile(path.join(workspace,'result.txt'),'utf8'),'真实执行');assert.equal(seen[1].body.messages.at(-1).role,'tool');assert.equal(state.value,'finished');assert.ok(events.some(e=>e.type==='done'));assert.equal(agent.controller,null);
});
test('invalid tool arguments are reported to model without executing',async t=>{
 const workspace=await temp(t);const {baseUrl,seen}=await serve(t,(_b,n)=>n===1?{choices:[{message:{role:'assistant',tool_calls:[{id:'x',type:'function',function:{name:'workspace_write',arguments:'{"path":"a"}'}}]}}]}:{choices:[{message:{role:'assistant',content:'参数修正前停止'}}]});const c=defaults(workspace);c.providers[0]={...c.providers[0],baseUrl,model:'mock'};await new Agent({config:()=>c,state:new PetState(),emit:()=>{}}).run('test');assert.match(seen[1].body.messages.at(-1).content,/参数无效/);await assert.rejects(()=>fs.access(path.join(workspace,'a')));
});
test('encrypted store serializes writes and validates config',async t=>{
 const dir=await temp(t);const encryption={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async s=>Buffer.from('ENCRYPTED:'+s),decryptStringAsync:async b=>b.toString().replace(/^ENCRYPTED:/,'')};const store=new Store(dir,encryption);await Promise.all([store.write('config',{v:1}),store.write('config',{v:2})]);assert.deepEqual(await store.read('config',{}),{v:2});assert.ok(validateConfig(defaults(dir)));assert.throws(()=>validateConfig({...defaults(dir),maxSteps:10000}));
});
