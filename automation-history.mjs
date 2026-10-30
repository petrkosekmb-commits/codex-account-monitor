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
