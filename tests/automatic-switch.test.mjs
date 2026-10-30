import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticSwitch} from '../automatic-switch.mjs';
const now=1800000000000;
function setup(){
 const slot=(id,used)=>({id,email:`account${id}@example.com`,connected:true,snapshot:{checkedAt:now,limits:{known:true,windows:[{key:'primary',used,resetsAt:now/1000+3600}],credits:{hasCredits:false}}},history:[]});
 const state={activeEmail:'account1@example.com',slots:[slot(1,100),slot(2,50),slot(3,10),slot(4,100)],automation:{enabled:true,attempts:{}}};
 const switcher={ready:true,desktop:true,threads:[{id:'chat',status:'idle',lastTurnStatus:'failed',lastTurnStartedAtMs:now}]};
 const calls=[];let saved=false;
 const options={state,switcher,now,save:async()=>{saved=true;},switchAccount:async(id,thread)=>{assert.ok(saved,'attempt saved before switching');calls.push([id,thread]);state.lastSwitch={status:'complete'};}};
 return {state,switcher,calls,options};
}
test('automatic switch from a confirmed exhausted source chooses most headroom and resumes the recent failed chat',async()=>{
 const x=setup();assert.equal(await automaticSwitch(x.options),true);assert.deepEqual(x.calls,[[3,'chat']]);
});
test('automatic switching stays off until explicitly enabled',async()=>{const x=setup();x.state.automation.enabled=false;await automaticSwitch(x.options);assert.deepEqual(x.calls,[]);});
test('stale or errored source is never proof of exhaustion',async()=>{for(const change of [s=>s.error='authentication failed',s=>s.snapshot.checkedAt=now-700000]){const x=setup();change(x.state.slots[0]);await automaticSwitch(x.options);assert.deepEqual(x.calls,[]);}});
test('pending approval or saved transition prevents automation',async()=>{for(const change of [s=>s.threads[0].waiting=true,s=>s.pending={accountApplied:false}]){const x=setup();change(x.switcher);await automaticSwitch(x.options);assert.deepEqual(x.calls,[]);}});
test('unfinished chat remains eligible after interruption and long quota wait',async()=>{for(const change of [s=>s.lastTurnStatus='interrupted',s=>s.lastTurnStartedAtMs=now-700000]){const x=setup();change(x.switcher.threads[0]);await automaticSwitch(x.options);assert.deepEqual(x.calls,[[3,'chat']]);}});
test('same exhausted window gets only one attempt across repeated checks',async()=>{const x=setup();await automaticSwitch(x.options);await automaticSwitch(x.options);assert.equal(x.calls.length,1);});
test('unknown switch outcome disables automation without retry',async()=>{const x=setup();x.options.switchAccount=async()=>{x.calls.push('attempt');throw new Error('unknown');};await automaticSwitch(x.options);await automaticSwitch(x.options);assert.equal(x.state.automation.enabled,false);assert.equal(x.state.automation.status,'off');assert.equal(x.calls.length,1);});
test('unverified targets are never selected and credits do not make an exhausted account available',async()=>{const x=setup();x.state.slots[1].error='bad';x.state.slots[2].snapshot.checkedAt=now-700000;x.state.slots[3].snapshot.limits.credits.hasCredits=true;await automaticSwitch(x.options);assert.deepEqual(x.calls,[]);});
test('pending transition shows its exact blocking phase without another attempt',async()=>{
  const state={automation:{enabled:true}};
  const changed=await automaticSwitch({state,switcher:{pending:{phase:'BackingUp'}},save:async()=>{},switchAccount:async()=>{throw new Error('Must not switch');}});
  assert.equal(changed,false);assert.match(state.automation.message,/BackingUp/);assert.match(state.automation.message,/nedokončený/);
});

test('a long-running turn that just failed remains eligible for automatic continuation',async()=>{
 const x=setup();x.switcher.threads[0].lastTurnId='long';x.switcher.threads[0].lastTurnStartedAtMs=now-3600000;
 x.state.automation.observedTurns={chat:{turnId:'long',status:'inProgress'}};
 assert.equal(await automaticSwitch(x.options),true);assert.deepEqual(x.calls,[[3,'chat']]);
});
test('old pinned completed selection cannot redirect automatic continuation',async()=>{
 const x=setup();x.state.automation.threadId='finished';x.switcher.threads.push({id:'finished',status:'idle',lastTurnStatus:'completed'});
 assert.equal(await automaticSwitch(x.options),true);assert.deepEqual(x.calls,[[3,'chat']]);
});
test('multiple active chats prevent restarting unrelated work',async()=>{
 const x=setup();x.switcher.threads[0].status='active';x.switcher.threads[0].lastTurnStatus='inProgress';x.switcher.threads.push({id:'other',status:'active',lastTurnStatus:'inProgress'});
 assert.equal(await automaticSwitch(x.options),false);assert.deepEqual(x.calls,[]);
});

test('uncertain active account explains missing verification instead of implying usable quota',async()=>{const x=setup();x.state.slots[0].error='temporary';await automaticSwitch(x.options);assert.match(x.state.automation.message,/není ověřený/);assert.equal(x.calls.length,0);});

function waitingSetup(){
 const x=setup();x.switcher.threads[0].lastTurnId='blocked-turn';
 for(const s of x.state.slots)s.snapshot.limits.windows[0].used=100;
 return x;
}
function later(x,minutes){
 x.options.now=now+minutes*60000;
 for(const s of x.state.slots)s.snapshot.checkedAt=x.options.now;
}
test('waiting for quota preserves the exact failed turn beyond ten minutes and across restart',async()=>{
 const x=waitingSetup();await automaticSwitch(x.options);assert.equal(x.calls.length,0);
 assert.equal(x.state.automation.waitingContinuation.turnId,'blocked-turn');
 x.state.automation=JSON.parse(JSON.stringify(x.state.automation));later(x,45);x.state.slots[2].snapshot.limits.windows[0].used=20;
 assert.equal(await automaticSwitch(x.options),true);assert.deepEqual(x.calls,[[3,'chat']]);assert.equal(x.state.automation.waitingContinuation,null);
 await automaticSwitch(x.options);assert.equal(x.calls.length,1);
});
for(const reason of ['account','completed','new-turn','window','expired','off'])test(`queued continuation is cancelled by ${reason}`,async()=>{
 const x=waitingSetup();await automaticSwitch(x.options);later(x,45);
 x.state.slots[2].snapshot.limits.windows[0].used=10;
 if(reason==='account')x.state.activeEmail=x.state.slots[2].email;
 if(reason==='completed')x.switcher.threads[0].lastTurnStatus='completed';
 if(reason==='new-turn')x.switcher.threads[0].lastTurnId='manual-turn';
 if(reason==='window')x.state.slots[0].snapshot.limits.windows[0].resetsAt+=3600;
 if(reason==='expired'){x.options.now=now+25*60*60*1000;for(const s of x.state.slots)s.snapshot.checkedAt=x.options.now;}
 if(reason==='off')x.state.automation.enabled=false;
 await automaticSwitch(x.options);assert.equal(x.calls.length,0);assert.equal(x.state.automation.waitingContinuation,null);
});
test('missing queued chat never redirects to a previously known old failure',async()=>{
 const x=waitingSetup(),old={id:'other',lastTurnId:'other-turn',lastTurnStatus:'failed',lastTurnStartedAtMs:now-60000};
 x.switcher.threads.push(old);await automaticSwitch(x.options);later(x,45);x.state.slots[2].snapshot.limits.windows[0].used=10;
 const original=x.switcher.threads[0];x.switcher.threads=[old];
 await automaticSwitch(x.options);assert.equal(x.calls.length,0);assert.equal(x.state.automation.waitingContinuation.threadId,'chat');
 x.switcher.threads=[old,original];await automaticSwitch(x.options);assert.deepEqual(x.calls,[[3,'chat']]);
});

for(const status of ['failed','completed','inProgress'])test(`new work in another chat cancels old queued continuation after ${status}`,async()=>{
 const x=waitingSetup();await automaticSwitch(x.options);later(x,45);x.state.slots[2].snapshot.limits.windows[0].used=10;
 x.switcher.threads.push({id:'other',lastTurnId:'new-turn',lastTurnStatus:status,status:status==='inProgress'?'active':'idle',lastTurnStartedAtMs:x.options.now-1000});
 await automaticSwitch(x.options);assert.equal(x.calls.length,0);assert.equal(x.state.automation.waitingContinuation,null);
 await automaticSwitch(x.options);assert.deepEqual(x.calls,status==='completed'?[]:[[3,'other']]);
});

test('changed turn in a known other chat cancels queue even when its timestamp is missing',async()=>{
 const x=waitingSetup(),other={id:'other',lastTurnId:'known-turn',lastTurnStatus:'failed',lastTurnStartedAtMs:now-60000};
 x.switcher.threads.push(other);await automaticSwitch(x.options);later(x,45);x.state.slots[2].snapshot.limits.windows[0].used=10;
 other.lastTurnId='new-turn';delete other.lastTurnStartedAtMs;
 await automaticSwitch(x.options);assert.equal(x.calls.length,0);assert.equal(x.state.automation.waitingContinuation,null);
});

test('current failure supersedes an older saved selection without asking user to pick',async()=>{
 const x=setup();x.state.automation.threadId='other';x.switcher.threads.push({id:'other',lastTurnStatus:'failed',lastTurnStartedAtMs:now-60000});
 assert.equal(await automaticSwitch(x.options),true);assert.deepEqual(x.calls,[[3,'chat']]);
});

for(const replace of [false,true])test(`disabling automation during attempt persistence cancels dispatch (${replace?'replacement':'same object'})`,async()=>{
 const x=setup();let disabled=false;
 x.options.save=async()=>{
  if(!disabled&&x.state.automation.status==='switching'){
   disabled=true;
   if(replace)x.state.automation={enabled:false,status:'off',attempts:x.state.automation.attempts};
   else x.state.automation.enabled=false;
  }
 };
 assert.equal(await automaticSwitch(x.options),false);assert.deepEqual(x.calls,[]);
 assert.deepEqual(x.state.automation.attempts,{},'an unsent attempt must not block later re-enabling');
});
