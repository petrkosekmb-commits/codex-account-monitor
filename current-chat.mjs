// Resolve the work being continued at the time of the request. Old saved UI
// selections must never redirect an account handoff to an unrelated chat.
export function currentChat(threads=[],observedTurns={}){
  const blocked=reason=>({thread:null,reason});
  if(threads.some(t=>t.waiting))return blocked('Nejdřív dokonči čekající schválení nebo odpověď v Codexu.');
  const running=threads.filter(t=>t.status==='active'||t.lastTurnStatus==='inProgress');
  if(running.length>1)return blocked('Současně běží více chatů. Přepnutí počká, až zůstane jediný rozpracovaný chat.');
  if(running.length===1)return {thread:running[0],reason:''};
  const unfinished=t=>t.goal==='usageLimited'||t.goal==='active'||['failed','interrupted'].includes(t.lastTurnStatus);
  const candidates=threads.filter(unfinished);
  if(!candidates.length)return blocked('Není zjištěný rozpracovaný chat. Pokračuj v požadovaném chatu v Codexu.');
  const time=t=>Math.max(Number.isFinite(t.lastTurnStartedAtMs)&&t.lastTurnStartedAtMs>0?t.lastTurnStartedAtMs:0,
    observedTurns[t.id]?.turnId===t.lastTurnId&&['failed','interrupted'].includes(t.lastTurnStatus)?observedTurns[t.id]?.failedAt??0:0);
  const newest=Math.max(...threads.map(time));
  // A newer completed turn supersedes old failures. Ties/unknown chronology
  // are not permission to select an arbitrary conversation from the list.
  const latest=threads.filter(t=>time(t)===newest);
  if(latest.length===1&&unfinished(latest[0]))return {thread:latest[0],reason:''};
  if(threads.length===1&&candidates.length===1)return {thread:candidates[0],reason:''};
  return blocked('Právě rozpracovaný chat není jednoznačně ověřený. Pokračuj v něm v Codexu; přehled jej rozpozná automaticky.');
}

export function continuationView(threads,observedTurns){
  const {thread,reason}=currentChat(threads,observedTurns);
  return {threadId:thread?.id??null,title:thread?.title??null,reason};
}
