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
    request:async(method,thread)=>{calls.push([method,thread]);return {pending:null};},apply:view=>{state.pending=view.pending;}});
  assert.equal(outcome.ok,true);assert.equal(state.pending,null);assert.equal(state.lastSwitch.phase,'Finished');
  assert.deepEqual(calls,[['resume','chat']]);assert.equal(saves,2);
});
test('unknown send result never retries the switch or continuation automatically',async()=>{
  const calls=[],state={};
  await runSwitch({state,id:1,save:async()=>{},request:async method=>{calls.push(method);throw new Error('Disconnected');},apply:()=>{throw new Error('Must not apply');}});
  assert.deepEqual(calls,['switch','status']);assert.equal(state.lastSwitch.status,'error');
});
