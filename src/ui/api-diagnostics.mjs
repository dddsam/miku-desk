export function cleanError(error) {
  return String(error?.message || error || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
}
export function diagnoseApiError(error) {
  const raw=cleanError(error);
  const status=Number(raw.match(/\bAPI\s+(\d{3})\b/)?.[1]) || null;
  let detail=raw;
  const start=raw.indexOf('{');
  if(start>=0)try{const j=JSON.parse(raw.slice(start));detail=j.error?.message || j.errors?.message || j.message || raw;}catch{}
  const text=typeof detail==='string'?detail:JSON.stringify(detail);
  let title='请求未完成',summary='请查看下方服务端原始回复。',kind='unknown';
  if(/budget pool quota.*exhausted/i.test(text)){
    kind='quota';title='供应商预算池额度已耗尽';
    summary='需要在该供应商侧增加预算限额、选择另一个可用预算池，或换用仍有额度的供应商。同一预算池下只更换模型可能仍然失败。';
  }else if(/has no provider supported|model.not.found|deployment.not.found/i.test(text)){
    kind='model';title='当前渠道无法提供这个模型';
    summary='请核对模型的完整 ID 和版本，刷新供应商模型列表，再选一个实际测试可用的模型。';
  }else if(status===402){
    kind='quota';title='供应商拒绝了计费请求（402）';
    summary='请检查该供应商的余额、额度和预算限制，或切换其他可用渠道；具体原因以下方原始回复为准。';
  }else if(status===401 || status===403){
    kind='auth';title='凭据或访问权限被拒绝';summary='请检查当前供应商的 API Key、环境变量，以及该账号是否有模型访问权限。';
  }else if(status===429){
    kind='limit';title='供应商限制了本次请求';summary='可能触发请求频率或配额限制。按服务端提示处理，避免连续重试。';
  }else if(/fetch failed|ECONNREFUSED|ENOTFOUND|network error/i.test(raw)){
    kind='network';title='无法连接到 API 地址';summary='请检查 Base URL 和本地网关是否已启动。';
  }else if(/timeout|timed out|超时/i.test(raw)){
    kind='network';title='请求超时';summary='请检查服务是否响应；可按需要调整请求超时设置。';
  }else if(status){title=`API 请求失败（${status}）`;summary=text;}
  const until=text.match(/not asked again before\s+([^\r\n)]+)/i)?.[1]?.trim();
  const cooldown=until?`网关暂缓重试到 ${until}。这是重试时间，不代表额度会自动恢复。`:'';
  return {raw,status,kind,title,summary,cooldown};
}
// Keys are kept in renderer memory only; they never appear in the DOM or logs.
export function providerCatalogKey(p) {
  return JSON.stringify([p.id,p.type,p.baseUrl,p.apiKey || '',p.apiKeyEnv || '',p.headers || {}]);
}
export function providerRequestKey(p) {
  return JSON.stringify([providerCatalogKey(p),p.model,p.maxTokens || 4096,p.timeoutMs || 120000,p.extraBody || {}]);
}
