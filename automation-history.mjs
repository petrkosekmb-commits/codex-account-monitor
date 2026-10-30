import {availability,sameEmail} from './core.mjs';
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
 return (Array.isArray(history)?history:[]).slice(-limit).map(item=>{
  const d=item?.decision??{};
  return {at:Number.isFinite(item?.at)?item.at:null,decision:{
   reason:typeof d.reason==='string'?d.reason.slice(0,180):'Stav automatiky nebyl popsán.',
   enabled:d.enabled===true,ready:d.ready===true,desktop:d.desktop===true,pending:d.pending===true,switching:d.switching===true,
   sourceId:Number.isInteger(d.sourceId)?d.sourceId:null,threadCount:Number.isInteger(d.threadCount)?d.threadCount:0,
   waitingCount:Number.isInteger(d.waitingCount)?d.waitingCount:0,activeCount:Number.isInteger(d.activeCount)?d.activeCount:0,
   failedCount:Number.isInteger(d.failedCount)?d.failedCount:0,
   slots:Array.isArray(d.slots)?d.slots.slice(0,4).map(s=>({id:Number.isInteger(s?.id)?s.id:null,connected:s?.connected===true,error:s?.error===true,reauth:s?.reauth===true,availability:typeof s?.availability==='string'?s.availability:'unknown'})):[]
  }};
 });
}
