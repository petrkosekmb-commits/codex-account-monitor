export const EXAMPLE_EMAILS=Array.from({length:4},(_,i)=>`account${i+1}@example.com`);
export const EMAILS=EXAMPLE_EMAILS;
export const FRESH_MS=10*60*1000;
export function initialState(emails=EXAMPLE_EMAILS){return {version:1,slots:emails.map((email,i)=>({id:i+1,email,connected:false,snapshot:null,history:[]}))};}
export function sameEmail(a,b){return typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();}
export function normalize(raw){
  const buckets=raw.rateLimitsByLimitId;
  const bucket=buckets?.codex || (raw.rateLimits?.limitId==='codex'||!raw.rateLimits?.limitId ? raw.rateLimits:null);
  if(!bucket)return {known:false,windows:[],reason:'Chybí údaje pro limit Codexu.'};
  const windows=['primary','secondary'].flatMap(key=>{
    const v=bucket[key];if(!v)return [];
    return [{key,used:typeof v.usedPercent==='number'&&Number.isFinite(v.usedPercent)?Math.max(0,Math.min(100,v.usedPercent)):null,
      duration:typeof v.windowDurationMins==='number'?v.windowDurationMins:null,
      resetsAt:typeof v.resetsAt==='number'&&Number.isFinite(v.resetsAt)?v.resetsAt:null}];
  });
  return {known:windows.length>0&&windows.every(w=>w.used!==null),windows,credits:bucket.credits??null,
    reachedType:bucket.rateLimitReachedType??null,spendControlReached:bucket.spendControlReached===true,
    individualLimit:bucket.individualLimit??null,ordinaryUsageAllowed:raw.ordinaryUsageAllowed??null,
    resetLastConfirmedUse:['automation','manual'].includes(raw.rateLimitResetCredits?.lastConfirmedUse?.source)&&Number.isSafeInteger(raw.rateLimitResetCredits.lastConfirmedUse.confirmedAt)&&raw.rateLimitResetCredits.lastConfirmedUse.confirmedAt>0&&raw.rateLimitResetCredits.lastConfirmedUse.confirmedAt<4102444800000?{source:raw.rateLimitResetCredits.lastConfirmedUse.source,confirmedAt:raw.rateLimitResetCredits.lastConfirmedUse.confirmedAt}:null,
    resetLastRedeemedAt:Number.isSafeInteger(raw.rateLimitResetCredits?.lastRedeemedAt)&&raw.rateLimitResetCredits.lastRedeemedAt>0&&raw.rateLimitResetCredits.lastRedeemedAt<4102444800?raw.rateLimitResetCredits.lastRedeemedAt:null,
    resetLastAutomaticUse:raw.rateLimitResetCredits?.lastAutomaticUse?.source==='automation'&&Number.isSafeInteger(raw.rateLimitResetCredits.lastAutomaticUse.confirmedAt)&&raw.rateLimitResetCredits.lastAutomaticUse.confirmedAt>0&&raw.rateLimitResetCredits.lastAutomaticUse.confirmedAt<4102444800000?{source:'automation',confirmedAt:raw.rateLimitResetCredits.lastAutomaticUse.confirmedAt}:null,
    resetCredits:raw.rateLimitResetCredits?.availableCount??null,
    resetExpirations:(Array.isArray(raw.rateLimitResetCredits?.expiresAt)?raw.rateLimitResetCredits.expiresAt:raw.rateLimitResetCredits?.credits?.filter(c=>c.status==='available').map(c=>c.expiresAt)||[]).filter(t=>Number.isSafeInteger(t)&&t>0&&t<4102444800).sort((a,b)=>a-b),
    otherBuckets:Object.keys(buckets||{}).filter(k=>k!=='codex')};
}
export function availability(slot,now=Date.now()){
  const s=slot.snapshot;
  if(!s)return {status:'unknown',label:'Nepřipojený účet',nextAt:null};
  if(slot.error||now-s.checkedAt>FRESH_MS)return {status:'stale',label:'Nutná nová kontrola',nextAt:null};
  if(!s.limits.known)return {status:'unknown',label:'Limit nelze určit',nextAt:null};
  if(s.limits.spendControlReached||s.limits.individualLimit)
    return {status:'unknown',label:'Služba hlásí další omezení',nextAt:null};
  const blocked=s.limits.windows.filter(w=>w.used>=100);
  if(blocked.length){
    const future=blocked.every(w=>w.resetsAt&&w.resetsAt*1000>now);
    return {status:'exhausted',label:future?'Zahrnutý limit vyčerpán':'Obnova čeká na ověření',
      nextAt:future?Math.max(...blocked.map(w=>w.resetsAt*1000)):null};
  }
  if(s.limits.windows.some(w=>w.resetsAt&&w.resetsAt*1000<=now))return {status:'unknown',label:'Obnova čeká na ověření',nextAt:null};
  if(s.limits.reachedType||s.limits.ordinaryUsageAllowed===false)return {status:'unknown',label:'Služba hlásí další omezení',nextAt:null};
  return {status:'available',label:'Zbývá zahrnutý limit',nextAt:null};
}
export function record(slot,account,raw,now=Date.now()){
  if(!sameEmail(slot.email,account?.email))throw new Error('Přihlášený účet neodpovídá vybrané adrese.');
  const limits=normalize(raw),old=slot.snapshot;
  for(const w of limits.windows){
    const prev=old?.limits.windows.find(p=>p.key===w.key);
    if(w.used>=100&&(!prev||prev.used<100||prev.resetsAt!==w.resetsAt)){
      slot.history.push({kind:'exhausted_observed',window:w.key,observedAt:now,lastAvailableAt:prev?.used!==null&&prev?.used<100?old.checkedAt:null,resetsAt:w.resetsAt});
    }
    if(prev?.used>=100&&w.used!==null&&w.used<100)slot.history.push({kind:'available_observed',window:w.key,observedAt:now});
  }
  slot.history=slot.history.slice(-200);
  slot.snapshot={checkedAt:now,plan:account.planType??null,limits};delete slot.error;
}
export function view(state,now=Date.now()){
  const slots=state.slots.map(s=>({...s,availability:availability(s,now)}));
  const available=slots.filter(s=>s.availability.status==='available').map(s=>s.id);
  const times=slots.flatMap(s=>s.availability.nextAt?[{id:s.id,at:s.availability.nextAt}]:[]).sort((a,b)=>a.at-b.at);
  return {slots,now,activeEmail:state.activeEmail??null,available,nextExpected:times[0]??null,refreshing:state.refreshing??false};
}

export function weeklyLimitExhausted(slot){return slot?.snapshot?.limits?.windows?.some(w=>w.duration===10080&&Number.isFinite(w.used)&&w.used>=100)===true;}