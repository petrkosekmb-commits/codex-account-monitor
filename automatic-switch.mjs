import {recordAutomationDecision} from './automation-history.mjs';
import {availability,sameEmail} from './core.mjs';
import {currentChat} from './current-chat.mjs';

export async function automaticSwitch({state,switcher,save,switchAccount,now=Date.now()}){
  const auto=state.automation??={enabled:false,attempts:{},status:'off'};
  let changed=false;
  const setWaiting=value=>{if(JSON.stringify(auto.waitingContinuation??null)!==JSON.stringify(value)){auto.waitingContinuation=value;changed=true;}};
  const pause=async message=>{auto.status=auto.enabled?'waiting':'off';auto.message=message;if(recordAutomationDecision(state,switcher,message,now)||changed)await save();return false;};
  if(!auto.enabled){setWaiting(null);return pause('Automatické přepínání je vypnuté.');}
  if(switcher?.pending)return pause('Přepínání blokuje nedokončený přechod ve fázi '+switcher.pending.phase+'. Ověř jeho stav v přehledu a obnov jej nebo zruš, pokud ještě nezměnil účet.');
  if(!switcher?.ready||!switcher.desktop||switcher.switching)return pause('Čekám na ověřené spojení s aplikací Codex.');
  if(switcher.threads?.some(t=>t.waiting))return pause('Nejdřív dokonči čekající schválení nebo odpověď v Codexu.');
  // Track the failure transition, not the start of a potentially long-running turn.
  const previous=auto.observedTurns??{};
  auto.observedTurns=Object.fromEntries((switcher.threads??[]).map(t=>{
    const old=previous[t.id];
    const same=!!old&&old.turnId===t.lastTurnId;
    const failed=['failed','interrupted'].includes(t.lastTurnStatus);
    const failedAt=failed?(same&&old.status==='inProgress'?now:same?old.failedAt:null):null;
    return [t.id,{turnId:t.lastTurnId,status:t.lastTurnStatus,failedAt}];
  }));
  if(JSON.stringify(previous)!==JSON.stringify(auto.observedTurns))changed=true;
  const source=state.slots.find(s=>sameEmail(s.email,state.activeEmail));
  if(auto.waitingContinuation&&auto.waitingContinuation.sourceId!==source?.id)setWaiting(null);
  if(!source)return pause('Právě používaný účet se nepodařilo určit.');
  const sourceStatus=availability(source,now).status;
  if(source.error||sourceStatus==='stale'||sourceStatus==='unknown')return pause('Stav právě používaného účtu není ověřený. Čekám na úspěšnou kontrolu; vyčerpání zatím nelze potvrdit.');
  if(sourceStatus!=='exhausted'){setWaiting(null);return pause('Právě používaný účet nemá potvrzené vyčerpání limitu.');}
  const window=source.id+':'+source.snapshot.limits.windows.filter(w=>w.used>=100).map(w=>w.key+'@'+w.resetsAt).join(',');
  auto.attempts??={};if(auto.attempts[window]){setWaiting(null);return pause('Tento vyčerpaný limit už vyvolal jeden pokus. Výsledek ověř ručně.');}
  const queued=auto.waitingContinuation;
  const queuedThread=(switcher.threads||[]).find(t=>t.id===queued?.threadId);
  const newerWork=queued&&(switcher.threads||[]).some(t=>t.id!==queued.threadId&&t.lastTurnId&&
    (t.lastTurnStartedAtMs>queued.queuedAt||(queued.observedTurnIds&&queued.observedTurnIds[t.id]!==t.lastTurnId)));
  if(queued&&(newerWork||queued.window!==window||now-queued.queuedAt>24*60*60*1000||
    (queuedThread?.lastTurnId&&(queuedThread.lastTurnId!==queued.turnId||queuedThread.lastTurnStatus==='completed')))){
    setWaiting(null);
    return pause('Původní čekání bylo zrušeno kvůli novému stavu chatu nebo limitu. Při další kontrole znovu určím rozpracovaný chat.');
  }
  // Remember only a previously eligible, exact turn. A missing snapshot is not
  // permission to resume another chat; manual work/account changes invalidate it.
  if(auto.waitingContinuation&&!queuedThread?.lastTurnId)return pause('Čekající chat se nyní ověřuje. Pokračování zůstává uložené.');
  const resolved=currentChat(switcher.threads,auto.observedTurns);
  const selected=auto.waitingContinuation?queuedThread:resolved.thread;
  if((switcher.threads||[]).some(t=>(t.status==='active'||t.lastTurnStatus==='inProgress')&&t.id!==selected?.id))return pause('Více chatů je rozpracovaných. Přepnutí by přerušilo další práci; nejdřív ji dokonči.');
  if(!selected)return pause(resolved.reason);
  if(selected.lastTurnId&&!auto.waitingContinuation)setWaiting({sourceId:source.id,window,threadId:selected.id,turnId:selected.lastTurnId,queuedAt:now,observedTurnIds:Object.fromEntries((switcher.threads||[]).filter(t=>t.id!==selected.id).map(t=>[t.id,t.lastTurnId??null]))});
  const candidates=state.slots.filter(s=>s.id!==source.id&&s.connected&&!s.error&&availability(s,now).status==='available');
  const headroom=s=>Math.min(...s.snapshot.limits.windows.map(w=>100-w.used));
  candidates.sort((a,b)=>headroom(b)-headroom(a)||a.id-b.id);
  const target=candidates[0];if(!target)return pause(auto.waitingContinuation?'Čekající chat je uložený. Jakmile bude dostupný ověřený volný účet, automatika naváže.':'Žádný připojený účet nemá ověřený volný zahrnutý limit.');
  const attempt={at:now,targetId:target.id};
  auto.attempts[window]=attempt;auto.status='switching';auto.message='Přepínám na účet '+target.id+'.';
  setWaiting(null);
  // Persist before any side effect. A restart or unknown result must not resend it.
  recordAutomationDecision(state,switcher,auto.message,now);
  await save();
  // Disabling or replacing automation during persistence must cancel the
  // unsent operation. Its reserved attempt is safe to release before dispatch.
  if(state.automation!==auto||!auto.enabled){
    if(auto.attempts[window]===attempt)delete auto.attempts[window];
    if(state.automation?.attempts?.[window]===attempt)delete state.automation.attempts[window];
    await save();return false;
  }
  try{
    await switchAccount(target.id,selected.id);
    if(state.lastSwitch?.status!=='complete')throw new Error('Přepnutí nebylo potvrzeno.');
    auto.status='waiting';auto.message='Účet byl přepnut; čekám na další potvrzené vyčerpání.';
  }catch{
    auto.enabled=false;auto.status='error';auto.message='Přepnutí nebylo ověřené. Automatika se vypnula; zkontroluj Codex a připravený přechod.';
  }
  recordAutomationDecision(state,switcher,auto.message,Date.now());
  await save();return true;
}
