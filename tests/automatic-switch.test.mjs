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
test('completed and old failed chats are not restarted',async()=>{for(const change of [s=>s.lastTurnStatus='completed',s=>s.lastTurnStartedAtMs=now-700000]){const x=setup();change(x.switcher.threads[0]);await automaticSwitch(x.options);assert.deepEqual(x.calls,[]);}});
test('same exhausted window gets only one attempt across repeated checks',async()=>{const x=setup();await automaticSwitch(x.options);await automaticSwitch(x.options);assert.equal(x.calls.length,1);});
test('unknown switch outcome disables automation without retry',async()=>{const x=setup();x.options.switchAccount=async()=>{x.calls.push('attempt');throw new Error('unknown');};await automaticSwitch(x.options);await automaticSwitch(x.options);assert.equal(x.state.automation.enabled,false);assert.equal(x.state.automation.status,'off');assert.equal(x.calls.length,1);});
test('unverified targets are never selected and credits do not make an exhausted account available',async()=>{const x=setup();x.state.slots[1].error='bad';x.state.slots[2].snapshot.checkedAt=now-700000;x.state.slots[3].snapshot.limits.credits.hasCredits=true;await automaticSwitch(x.options);assert.deepEqual(x.calls,[]);});
test('pending transition shows its exact blocking phase without another attempt',async()=>{
  const state={automation:{enabled:true}};
  const changed=await automaticSwitch({state,switcher:{pending:{phase:'BackingUp'}},save:async()=>{},switchAccount:async()=>{throw new Error('Must not switch');}});
  assert.equal(changed,false);assert.match(state.automation.message,/BackingUp/);assert.match(state.automation.message,/nedokončený/);
});
