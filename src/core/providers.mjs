import { randomUUID } from 'node:crypto';

export const PROTOCOLS = ['openai', 'responses', 'anthropic', 'gemini', 'systemone'];
export function endpoint(base, protocol, model = '') {
  const u = new URL(base);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Base URL 必须是无账号密码的 HTTP / HTTPS 地址');
  u.hash = ''; u.search = '';
  let p = u.pathname.replace(/\/+$/, '');
  const suffix = {openai:'/chat/completions', responses:'/responses', anthropic:'/messages', systemone:'/systemone'}[protocol];
  if (protocol === 'gemini') {
    if (!/:generateContent$/.test(p)) {
      if (!/\/v1(beta)?$/.test(p)) p += '/v1beta';
      p += `/models/${model.replace(/^models\//, '').split('/').map(encodeURIComponent).join('/')}:generateContent`;
    }
  } else {
    if (!suffix) throw new Error('未知供应商协议');
    if (!p.endsWith(suffix)) { if (!p) p = '/v1'; p += suffix; }
  }
  u.pathname = p; return u.toString();
}
function parsed(value) {
  if (typeof value === 'object' && value !== null) return value;
  try { return JSON.parse(value || '{}'); } catch { return { __invalid_json: String(value) }; }
}
function grouped(messages, role, blocks, output) {
  const last = output.at(-1);
  if (last?.role === role) last.content.push(...blocks);
  else output.push({role, content:blocks});
}
export function buildRequest(provider, system, messages, tools = []) {
  const kind = provider.type;
  const common = { model: provider.model };
  const max = provider.maxTokens || 4096;
  let body;
  if (kind === 'openai') {
    body = {...common, messages:[{role:'system',content:system}, ...messages.map(m => {
      if (m.role === 'tool') return {role:'tool',tool_call_id:m.callId,content:m.content};
      if (m.role === 'assistant') return m.raw?.openai || {role:'assistant',content:m.content || null,...(m.toolCalls?.length ? {tool_calls:m.toolCalls.map(t=>({id:t.id,type:'function',function:{name:t.name,arguments:JSON.stringify(t.args)}}))}:{})};
      return {role:'user',content:m.content};
    })], stream:false, max_completion_tokens:max};
    if (tools.length) body.tools = tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.schema}}));
  } else if (kind === 'responses') {
    const input = messages.flatMap(m => {
      if (m.role === 'tool') return [{type:'function_call_output',call_id:m.callId,output:m.content}];
      if (m.role === 'assistant' && m.raw?.responses) return m.raw.responses;
      if (m.role === 'assistant' && m.toolCalls?.length) return [...(m.content ? [{role:'assistant',content:m.content}] : []), ...m.toolCalls.map(t=>({type:'function_call',call_id:t.id,name:t.name,arguments:JSON.stringify(t.args)}))];
      return [{role:m.role,content:m.content}];
    });
    body = {...common,instructions:system,input,stream:false,store:false,include:['reasoning.encrypted_content'],max_output_tokens:max};
    if (tools.length) body.tools = tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.schema,strict:false}));
  } else if (kind === 'anthropic') {
    const out = [];
    for (const m of messages) {
      if (m.role === 'tool') grouped(messages,'user',[{type:'tool_result',tool_use_id:m.callId,content:m.content,is_error:!!m.isError}],out);
      else if (m.role === 'assistant') grouped(messages,'assistant',m.raw?.anthropic || [...(m.content ? [{type:'text',text:m.content}] : []),...(m.toolCalls || []).map(t=>({type:'tool_use',id:t.id,name:t.name,input:t.args}))],out);
      else grouped(messages,'user',[{type:'text',text:m.content}],out);
    }
    body = {...common,system,messages:out,max_tokens:max,stream:false};
    if (tools.length) body.tools = tools.map(t=>({name:t.name,description:t.description,input_schema:t.schema}));
  } else if (kind === 'gemini') {
    const contents = [];
    for (const m of messages) {
      const role = m.role === 'assistant' ? 'model' : 'user';
      const parts = m.role === 'tool' ? [{functionResponse:{id:m.callId,name:m.name,response:{result:m.content,isError:!!m.isError}}}] : m.role === 'assistant' ? (m.raw?.gemini || [...(m.content ? [{text:m.content}] : []),...(m.toolCalls || []).map(t=>({functionCall:{id:t.id,name:t.name,args:t.args}}))]) : [{text:m.content}];
      if (contents.at(-1)?.role === role) contents.at(-1).parts.push(...parts); else contents.push({role,parts});
    }
    body = {systemInstruction:{parts:[{text:system}]},contents,generationConfig:{maxOutputTokens:max}};
    if (tools.length) body.tools = [{functionDeclarations:tools.map(t=>({name:t.name,description:t.description,parametersJsonSchema:t.schema}))}];
  } else throw new Error('System One 是决策接口，请将其设为辅助决策模型，并选择另一个对话模型');
  // Vendor-specific generation options, without replacing conversation or tools.
  const forbidden = new Set(['model','messages','input','instructions','system','contents','systemInstruction','tools','stream','store','include']);
  for (const [k,v] of Object.entries(provider.extraBody || {})) if (!forbidden.has(k)) body[k] = v;
  if(kind==='openai' && Object.hasOwn(provider.extraBody || {},'max_tokens'))delete body.max_completion_tokens;
  const key = provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : provider.apiKey;
  const headers = {'Content-Type':'application/json','User-Agent':'MikuDesk/0.1',...(provider.headers || {})};
  if (kind === 'anthropic') { headers['anthropic-version'] = '2023-06-01'; if(key) headers['x-api-key'] = key; }
  else if(kind === 'gemini') { if(key) headers['x-goog-api-key'] = key; }
  else if (key) headers.Authorization = `Bearer ${key}`;
  return {url:endpoint(provider.baseUrl,kind,provider.model),headers,body};
}
export function parseResponse(kind, data) {
  let content = '', calls = [], raw = {};
  if(kind === 'openai') {
    const m = data.choices?.[0]?.message;
    if (!m) throw new Error('供应商未返回 choices[0].message');
    content = typeof m.content === 'string' ? m.content : (m.content || []).map(x=>x.text || '').join('');
    calls = (m.tool_calls || []).map(t=>({id:t.id || randomUUID(),name:t.function.name,args:parsed(t.function.arguments)}));
    raw.openai = m;
  } else if(kind === 'responses') {
    if (data.status === 'failed' || data.error) throw new Error(data.error?.message || 'Responses 请求失败');
    content = (data.output || []).filter(x=>x.type==='message').flatMap(x=>x.content || []).map(x=>x.text || x.refusal || '').join('\n');
    calls = (data.output || []).filter(x=>x.type==='function_call').map(x=>({id:x.call_id,name:x.name,args:parsed(x.arguments)}));
    raw.responses = data.output || [];
  } else if(kind === 'anthropic') {
    content = (data.content || []).filter(x=>x.type==='text').map(x=>x.text).join('\n');
    calls = (data.content || []).filter(x=>x.type==='tool_use').map(x=>({id:x.id,name:x.name,args:x.input}));
    raw.anthropic = data.content || [];
  } else if(kind === 'gemini') {
    const parts = data.candidates?.[0]?.content?.parts || [];
    content = parts.filter(x=>x.text && !x.thought).map(x=>x.text).join('\n');
    calls = parts.filter(x=>x.functionCall).map(x=>({id:x.functionCall.id || randomUUID(),name:x.functionCall.name,args:x.functionCall.args || {}}));
    raw.gemini = parts;
  }
  if(!content && !calls.length) throw new Error('模型返回为空或被截断；请检查模型能力和输出 token 限制');
  return {role:'assistant',content,toolCalls:calls,raw,usage:data.usage || data.usageMetadata || null};
}
export async function postJSON(url, headers, body, signal, timeoutMs = 120000) {
  const res = await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.any([...(signal ? [signal] : []),AbortSignal.timeout(timeoutMs)])});
  const text = await res.text();
  if(!res.ok) throw new Error(`API ${res.status}: ${text.slice(0,1500)}`);
  try { return JSON.parse(text); } catch { throw new Error('API 返回了非 JSON 内容，请检查 Base URL'); }
}
export async function complete(provider, system, messages, tools, signal) {
  const req = buildRequest(provider,system,messages,tools);
  const data = await postJSON(req.url,req.headers,req.body,signal,provider.timeoutMs || 120000);
  return parseResponse(provider.type,data);
}
export async function decide(provider, state, questions, signal) {
  const key = provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : provider.apiKey;
  return postJSON(endpoint(provider.baseUrl,'systemone'),{'Content-Type':'application/json',...(key ? {Authorization:`Bearer ${key}`} : {}),...(provider.headers || {})},{model:provider.model,state,questions},signal,provider.timeoutMs || 20000);
}
