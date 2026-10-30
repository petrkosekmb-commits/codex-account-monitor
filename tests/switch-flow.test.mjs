import test from 'node:test';
import assert from 'node:assert/strict';
import {runSwitch} from '../switch-flow.mjs';

test('partial failure refreshes the applied account and retains the pending plan',async()=>{
  const state={activeEmail:'old@example.com'},calls=[];
  const outcome=await runSwitch({state,id:2,threadId:'chat',save:async()=>{},
    request:async method=>{calls.push(method);if(method==='switch')throw new Error('Resume timeout');return {email:'new@example.com',pending:{accountApplied:true}};},
    apply:view=>{state.activeEmail=view.email;state.pending=view.pending;}});
  assert.equal(outcome.ok,false);assert.equal(state.activeEmail,'new@example.com');
  assert.equal(state.pending.accountApplied,true);assert.equal(state.lastSwitch.status,'error');
  assert.deepEqual(calls,['switch','status']);
});
test('resuming an existing plan calls resume once and clears the pending state on success',async()=>{
  const state={},calls=[];let saves=0;
  const outcome=await runSwitch({state,id:2,threadId:'chat',resume:true,save:async()=>{saves++;},
    request:async(method,thread)=>{calls.push([method,thread]);return {pending:null,threads:[{id:"chat",lastTurnId:"continued",lastTurnStatus:"completed",status:"idle"}]};},apply:view=>{state.pending=view.pending;}});
  assert.equal(outcome.ok,true);assert.equal(state.pending,null);assert.equal(state.lastSwitch.phase,'Finished');
  assert.deepEqual(calls,[['resume','chat']]);assert.equal(saves,3);
});
test('unknown send result never retries the switch or continuation automatically',async()=>{
  const calls=[],state={};
  await runSwitch({state,id:1,save:async()=>{},request:async method=>{calls.push(method);throw new Error('Disconnected');},apply:()=>{throw new Error('Must not apply');}});
  assert.deepEqual(calls,['switch','status']);assert.equal(state.lastSwitch.status,'error');
});

test('an unchanged old completed turn is not evidence that continuation ran',async()=>{
 const state={},calls=[];const result=await runSwitch({state,id:2,threadId:'chat',beforeTurnId:'old',save:async()=>{},wait:async()=>{},
 request:async method=>{calls.push(method);return {threads:[{id:'chat',lastTurnId:'old',lastTurnStatus:'completed',status:'idle'}]};},apply:()=>{}});
 assert.equal(result.ok,false);assert.equal(calls.filter(x=>x==='switch').length,1);assert.match(state.lastSwitch.error,/nový tah/);
});
test('continuation failing after 55 seconds remains a failure, not a successful switch',async()=>{
 const state={};let ticks=0;const snapshot=()=>({threads:[{id:'chat',lastTurnId:'new',lastTurnStatus:ticks>=11?'failed':'inProgress',status:ticks>=11?'systemError':'active'}]});
 const result=await runSwitch({state,id:2,threadId:'chat',save:async()=>{},wait:async()=>{ticks++;},request:async()=>snapshot(),apply:()=>{}});
 assert.equal(result.ok,false);assert.equal(ticks,11);assert.match(state.lastSwitch.error,/selhalo/);
});
test('wrong active account is rejected even when a new turn completed',async()=>{
 const state={};const result=await runSwitch({state,id:2,threadId:'chat',expectedEmail:'target@example.com',save:async()=>{},
 request:async()=>({accounts:[{current:true,email:'other@example.com'}],threads:[{id:'chat',lastTurnId:'new',lastTurnStatus:'completed'}]}),apply:()=>{}});
 assert.equal(result.ok,false);assert.match(state.lastSwitch.error,/Cílový účet/);
});
test('delayed desktop snapshot is awaited without sending a second continuation',async()=>{
 let requests=0;const state={};const result=await runSwitch({state,id:2,threadId:'chat',beforeTurnId:'old',save:async()=>{},wait:async()=>{},
 request:async method=>{if(method==='switch')requests++;return {threads:[{id:'chat',lastTurnId:method==='switch'?'old':'new',lastTurnStatus:'completed',status:'idle'}]};},apply:()=>{}});
 assert.equal(result.ok,true);assert.equal(requests,1);
});

test('temporary history snapshot gap recovers without resending continuation',async()=>{
 let calls=0,sends=0;const state={};const result=await runSwitch({state,id:4,threadId:'chat',beforeTurnId:'old',save:async()=>{},wait:async()=>{},apply:()=>{},request:async method=>{
 if(method==='switch')sends++;calls++;return {threads:calls===2?[]:[{id:'chat',lastTurnId:'new',lastTurnStatus:calls>=3?'completed':'inProgress',status:calls>=3?'idle':'active'}]};}});
 assert.equal(result.ok,true);assert.equal(sends,1);assert.equal(calls,3);
});
test('permanently missing snapshot remains unverified',async()=>{
 let calls=0;const state={};const result=await runSwitch({state,id:4,threadId:'chat',save:async()=>{},wait:async()=>{},apply:()=>{},request:async()=>({threads:++calls===1?[{id:'chat',lastTurnId:'new',lastTurnStatus:'inProgress',status:'active'}]:[]})});
 assert.equal(result.ok,false);assert.match(state.lastSwitch.error,/není dostupný/);assert.ok(calls<=33);assert.equal(state.lastSwitch.errorCode,'snapshot_missing');
});
test('actual changed turn remains rejected',async()=>{
 let calls=0;const state={};const result=await runSwitch({state,id:4,threadId:'chat',save:async()=>{},wait:async()=>{},apply:()=>{},request:async()=>({threads:[{id:'chat',lastTurnId:++calls===1?'new':'other',lastTurnStatus:'inProgress',status:'active'}]})});
 assert.equal(result.ok,false);assert.match(state.lastSwitch.error,/se změnil/);
});

for(const beforeTurnId of [undefined,'old']){
 test(`missing initial snapshot recovers with baseline ${beforeTurnId??'unknown'}`,async()=>{
  const calls=[],state={};
  const result=await runSwitch({state,id:2,threadId:'chat',beforeTurnId,save:async()=>{},wait:async()=>{},apply:()=>{},request:async method=>{
   calls.push(method);
   return {threads:calls.length===1?[]:[{id:'chat',lastTurnId:'new',lastTurnStatus:'completed',status:'idle'}]};
  }});
  assert.equal(result.ok,true);assert.deepEqual(calls,['switch','status']);
 });
}

test('initial snapshot gap followed by the old turn still waits for a new turn',async()=>{
 const calls=[],state={};
 const result=await runSwitch({state,id:2,threadId:'chat',beforeTurnId:'old',save:async()=>{},wait:async()=>{},apply:()=>{},request:async method=>{
  calls.push(method);const n=calls.length;
  return {threads:n===1||n===3?[]:[{id:'chat',lastTurnId:n<4?'old':'new',lastTurnStatus:'completed',status:'idle'}]};
 }});
 assert.equal(result.ok,true);assert.deepEqual(calls,['switch','status','status','status']);
});

test('permanently missing first snapshot is bounded and never resends',async()=>{
 const calls=[],state={};
 const result=await runSwitch({state,id:2,threadId:'chat',beforeTurnId:'old',save:async()=>{},wait:async()=>{},apply:()=>{},request:async method=>{
  calls.push(method);return {threads:[]};
 }});
 assert.equal(result.ok,false);assert.match(state.lastSwitch.error,/není doložené/);
 assert.equal(calls.filter(method=>method==='switch').length,1);assert.equal(calls.length,32);
});

test('a 12-second history gap recovers without duplicate continuation',async()=>{
 const state={};let reads=0,sends=0;
 const result=await runSwitch({state,id:2,threadId:'chat',beforeTurnId:'old',save:async()=>{},wait:async()=>{},apply:()=>{},request:async method=>{
  if(method==='switch')sends++;else reads++;
  return {threads:reads>0&&reads<=12?[]:[{id:'chat',lastTurnId:'new',lastTurnStatus:reads>12?'completed':'inProgress',status:reads>12?'idle':'active'}]};
 }});
 assert.equal(result.ok,true);assert.equal(sends,1);assert.equal(state.lastSwitch.confirmedTurnId,'new');assert.equal(state.lastSwitch.continuationStatus,'completed');
});

test('snapshot gap budget is shared between first and subsequent gaps',async()=>{
 const state={};let reads=0;let slept=0;
 const result=await runSwitch({state,id:2,threadId:'chat',save:async()=>{},wait:async ms=>{slept+=ms;},apply:()=>{},request:async method=>{
  if(method==='status')reads++;
  return {threads:reads===20?[{id:'chat',lastTurnId:'new',lastTurnStatus:'inProgress',status:'active'}]:[]};
 }});
 assert.equal(result.ok,false);assert.equal(slept,35000);assert.equal(state.lastSwitch.errorCode,'snapshot_missing');
});

for(const reason of ['account','approval'])test(`a later ${reason} change prevents confirmation`,async()=>{
 const state={};let reads=0,sends=0;
 const result=await runSwitch({state,id:2,threadId:'chat',expectedEmail:'target@example.com',save:async()=>{},wait:async()=>{},apply:()=>{},request:async method=>{
  if(method==='switch')sends++;else reads++;
  return {accounts:[{current:true,email:reads&&reason==='account'?'other@example.com':'target@example.com'}],threads:[{id:'chat',lastTurnId:'new',lastTurnStatus:reads?'completed':'inProgress',status:reads?'idle':'active',waiting:reads>0&&reason==='approval'}]};
 }});
 assert.equal(result.ok,false);assert.equal(sends,1);assert.equal(state.lastSwitch.errorCode,reason==='account'?'account_unconfirmed':'approval_pending');
});
