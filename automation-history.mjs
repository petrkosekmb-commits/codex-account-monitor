import {availability,sameEmail} from './core.mjs';
const publicReasons=new Set([
 'Automatika vypnutá.','Probíhá přepnutí.','Probíhá přihlášení.','Probíhá kontrola nebo jiná operace.',
 'Automatické přepínání je vypnuté.',
 'Čekám na ověřené spojení s aplikací Codex.',
 'Nejdřív dokonči čekající schválení nebo odpověď v Codexu.',
 'Právě používaný účet se nepodařilo určit.',
 'Stav právě používaného účtu není ověřený. Čekám na úspěšnou kontrolu; vyčerpání zatím nelze potvrdit.',
 'Právě používaný účet nemá potvrzené vyčerpání limitu.',
 'Tento vyčerpaný limit už vyvolal jeden pokus. Výsledek ověř ručně.',
 'Původní čekání bylo zrušeno kvůli novému stavu chatu nebo limitu. Při další kontrole znovu určím rozpracovaný chat.',
 'Čekající chat se nyní ověřuje. Pokračování zůstává uložené.',
 'Více chatů je rozpracovaných. Přepnutí by přerušilo další práci; nejdřív ji dokonči.',
 'Čekající chat je uložený. Jakmile bude dostupný ověřený volný účet, automatika naváže.',
 'Žádný připojený účet nemá ověřený volný zahrnutý limit.',
 'Účet byl přepnut; čekám na další potvrzené vyčerpání.',
 'Přepnutí nebylo ověřené. Automatika se vypnula; zkontroluj Codex a připravený přechod.',
 'Kontrola automatiky selhala; stav ověř ručně.',
 'Současně běží více chatů. Přepnutí počká, až zůstane jediný rozpracovaný chat.',
 'Není zjištěný rozpracovaný chat. Pokračuj v požadovaném chatu v Codexu.',
 'Právě rozpracovaný chat není jednoznačně ověřený. Pokračuj v něm v Codexu; přehled jej rozpozná automaticky.',
]);
function publicReason(value){
 if(publicReasons.has(value))return value;
 if(typeof value==='string'&&/^Přepínám na účet [1-4]\.$/.test(value))return value;
 if(typeof value==='string'&&/^Přepínání blokuje nedokončený přechod ve fázi (Preparing|BackingUp|Closing|Applying|Launching|Resuming|VerifyingContinuation|Finished)\. Ověř jeho stav v přehledu a obnov jej nebo zruš, pokud ještě nezměnil účet\.$/.test(value))return value;
 return 'Stav automatiky nebyl popsán.';
}
const slotId=value=>Number.isInteger(value)&&value>=1&&value<=4?value:null;
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const statuses=new Set(['available','exhausted','stale','unknown']);
// Fixed decision text and numeric slot IDs only: no identities, tokens or chat text.
export function recordAutomationDecision(state,switcher,reason,now=Date.now()){
 const source=state.slots?.find(s=>sameEmail(s.email,state.activeEmail));
 const threads=switcher?.threads??[];
 const entry={reason,enabled:!!state.automation?.enabled,sourceId:source?.id??null,ready:!!switcher?.ready,desktop:!!switcher?.desktop,pending:!!switcher?.pending,switching:!!switcher?.switching,threadCount:threads.length,waitingCount:threads.filter(t=>t.waiting).length,activeCount:threads.filter(t=>t.status==='active').length,failedCount:threads.filter(t=>['failed','interrupted'].includes(t.lastTurnStatus)).length,slots:(state.slots??[]).map(s=>({id:s.id,connected:!!s.connected,error:!!s.error,reauth:!!s.requiresReauthentication,availability:availability(s,now).status}))};
 const history=state.automationHistory??=[];const previous=history.at(-1);
 if(previous&&JSON.stringify(previous.decision)===JSON.stringify(entry))return false;
 history.push({at:now,decision:entry});state.automationHistory=history.slice(-1000);return true;
}

// Public dashboard history is deliberately allowlisted.  The persisted entry is
// already secret-free, but the boundary must remain safe if an older or damaged
// state file contains extra fields.
export function publicAutomationHistory(history=[],limit=30){
 const size=Number.isInteger(limit)?Math.max(0,Math.min(1000,limit)):30;
 if(size===0)return [];
 return (Array.isArray(history)?history:[]).slice(-size).map(item=>{
  const d=item?.decision??{};
  return {at:Number.isFinite(item?.at)&&item.at>0&&item.at<4102444800000?item.at:null,decision:{
   reason:publicReason(d.reason),
   enabled:d.enabled===true,ready:d.ready===true,desktop:d.desktop===true,pending:d.pending===true,switching:d.switching===true,
   sourceId:slotId(d.sourceId),threadCount:count(d.threadCount),
   waitingCount:count(d.waitingCount),activeCount:count(d.activeCount),
   failedCount:count(d.failedCount),
   slots:Array.isArray(d.slots)?d.slots.slice(0,4).map(s=>({id:slotId(s?.id),connected:s?.connected===true,error:s?.error===true,reauth:s?.reauth===true,availability:statuses.has(s?.availability)?s.availability:'unknown'})):[]
  }};
 });
}
