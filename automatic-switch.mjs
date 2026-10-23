import {availability,sameEmail} from './core.mjs';

export async function automaticSwitch({state,switcher,save,switchAccount,now=Date.now()}){
  const auto=state.automation??={enabled:false,attempts:{},status:'off'};
  const pause=message=>{auto.status=auto.enabled?'waiting':'off';auto.message=message;return false;};
  if(!auto.enabled)return pause('Automatické přepínání je vypnuté.');
  if(!switcher?.ready||!switcher.desktop||switcher.switching||switcher.pending)return pause('Čekám na ověřené spojení a dokončení připraveného přechodu.');
  if(switcher.threads?.some(t=>t.waiting))return pause('Nejdřív dokonči čekající schválení nebo odpověď v Codexu.');
  const source=state.slots.find(s=>sameEmail(s.email,state.activeEmail));
  if(!source||availability(source,now).status!=='exhausted')return pause('Čekám na potvrzené vyčerpání právě používaného účtu.');
  const eligible=(switcher.threads||[]).filter(t=>!t.waiting&&(t.status==='active'||t.goal==='usageLimited'||['failed','interrupted'].includes(t.lastTurnStatus)&&t.lastTurnStartedAtMs>=now-10*60*1000));
  const selected=auto.threadId?eligible.find(t=>t.id===auto.threadId):eligible.sort((a,b)=>(b.lastTurnStartedAtMs||0)-(a.lastTurnStartedAtMs||0))[0];
  if(!selected)return pause('Zvol rozpracovaný chat pro pokračování.');
  const candidates=state.slots.filter(s=>s.id!==source.id&&s.connected&&!s.error&&availability(s,now).status==='available');
  const headroom=s=>Math.min(...s.snapshot.limits.windows.map(w=>100-w.used));
  candidates.sort((a,b)=>headroom(b)-headroom(a)||a.id-b.id);
  const target=candidates[0];if(!target)return pause('Žádný připojený účet nemá ověřený volný zahrnutý limit.');
  const window=source.id+':'+source.snapshot.limits.windows.filter(w=>w.used>=100).map(w=>w.key+'@'+w.resetsAt).join(',');
  auto.attempts??={};if(auto.attempts[window])return pause('Tento vyčerpaný limit už vyvolal jeden pokus. Výsledek ověř ručně.');
  auto.attempts[window]={at:now,targetId:target.id};auto.status='switching';auto.message='Přepínám na účet '+target.id+'.';
  // Persist before any side effect. A restart or unknown result must not resend it.
  await save();
  try{
    await switchAccount(target.id,selected.id);
    if(state.lastSwitch?.status==='error')throw new Error(state.lastSwitch.error);
    auto.status='waiting';auto.message='Účet byl přepnut; čekám na další potvrzené vyčerpání.';
  }catch{
    auto.enabled=false;auto.status='error';auto.message='Přepnutí nebylo ověřené. Automatika se vypnula; zkontroluj Codex a připravený přechod.';
  }
  await save();return true;
}