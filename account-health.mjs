// Bounded, token-free observations persisted with each configured account.
export function observeAccountHealth(slot,account,now=Date.now()){
  const status=!account?'disconnected':account.requiresReauthentication?'reauthentication':account.error?'retry':account.raw?'verified':'unknown';
  const previous=slot.health??{since:now,successfulChecks:0,failedTransitions:0,events:[]};
  const health={...previous,events:[...(previous.events??[])]};
  if(status!==previous.status){
    health.events.push({at:now,status});health.events=health.events.slice(-100);
    if(status==='retry'||status==='reauthentication')health.failedTransitions++;
  }
  if(status==='verified'&&Number.isFinite(account.checkedAt)&&account.checkedAt>(health.lastSuccessAt??0)){
    health.lastSuccessAt=account.checkedAt;health.successfulChecks++;
  }
  health.status=status;slot.health=health;
  const r=account?.refreshHealth;
  slot.refreshHealth=r?{result:['refresh_started','refresh_retry_later','refresh_rejected','verified'].includes(r.result)?r.result:'unknown',failures:Number.isInteger(r.failures)?r.failures:0,nextAttemptAt:Number.isFinite(r.nextAttemptAt)&&r.nextAttemptAt<8.64e15?r.nextAttemptAt:null,updatedAt:Number.isFinite(r.updatedAt)?r.updatedAt:null,failureDiagnostic:typeof r.failureDiagnostic==='string'?r.failureDiagnostic.slice(0,240):null}:null;
}
