import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseApiError,providerCatalogKey,providerRequestKey} from '../src/ui/api-diagnostics.mjs';

test('AgentRouter budget exhaustion retains raw evidence and distinguishes retry time from quota renewal',()=>{
  const raw='API 402: '+JSON.stringify({error:{code:null,message:'AgentRouter: Budget pool quota has been exhausted. Please ask an administrator to increase the limit or select another budget pool. (out of its allowance: not asked again before 19:36 UTC+8)',type:'api_error'}});
  const result=diagnoseApiError(new Error("Error invoking remote method 'miku:testProvider': Error: "+raw));
  assert.equal(result.raw,raw);assert.equal(result.status,402);assert.equal(result.kind,'quota');
  assert.match(result.title,/预算池/);assert.match(result.summary,/同一预算池/);
  assert.match(result.cooldown,/19:36 UTC\+8/);assert.match(result.cooldown,/不代表额度会自动恢复/);
});

test('ModelScope unavailable model is separate from credit and authentication failures',()=>{
  const d=diagnoseApiError('API 400: '+JSON.stringify({error:{message:'ModelScope: Model id : deepseek-ai/DeepSeek-V4-Pro , has no provider supported'}}));
  assert.equal(d.kind,'model');assert.equal(d.cooldown,'');
  assert.equal(diagnoseApiError('API 401: Unauthorized').kind,'auth');
  assert.equal(diagnoseApiError('API 429: rate limit').kind,'limit');
});

test('unknown 402 and malformed upstream errors do not invent budget renewal',()=>{
  const d=diagnoseApiError('API 402: payment rejected');
  assert.doesNotMatch(d.title,/已耗尽/);assert.equal(d.cooldown,'');
  const raw='API 503: {truncated';assert.equal(diagnoseApiError(raw).summary,raw);
  assert.equal(diagnoseApiError('fetch failed').kind,'network');
  assert.equal(diagnoseApiError('任务已停止。').kind,'unknown');
});

test('model catalog and connection results are scoped to provider credentials and request parameters',()=>{
  const p={id:'local',type:'responses',baseUrl:'http://127.0.0.1:3425/v1',apiKey:'test-key',model:'pool/a'};
  assert.equal(providerCatalogKey(p),providerCatalogKey({...p,model:'pool/b'}));
  assert.notEqual(providerRequestKey(p),providerRequestKey({...p,model:'pool/b'}));
  for(const patch of [{id:'other'},{apiKey:'changed'},{apiKeyEnv:'MY_KEY'},{baseUrl:'http://127.0.0.1:3426/v1'},{type:'openai'},{headers:{Authorization:'other'}}]){
    assert.notEqual(providerCatalogKey(p),providerCatalogKey({...p,...patch}));
    assert.notEqual(providerRequestKey(p),providerRequestKey({...p,...patch}));
  }
  for(const patch of [{maxTokens:8192},{timeoutMs:10000},{extraBody:{temperature:0}}])assert.notEqual(providerRequestKey(p),providerRequestKey({...p,...patch}));
  assert.equal(providerRequestKey(p),providerRequestKey({...p,maxTokens:4096,timeoutMs:120000,headers:{},extraBody:{}}));
});
