import test from 'node:test';
import assert from 'node:assert/strict';
import {observeAccountHealth} from '../account-health.mjs';
test('health counts distinct successful checks and survives serialization',()=>{
 let slot={};const account={raw:{},checkedAt:100};observeAccountHealth(slot,account,101);observeAccountHealth(slot,account,102);
 slot=JSON.parse(JSON.stringify(slot));observeAccountHealth(slot,{raw:{},checkedAt:110},111);
 assert.equal(slot.health.successfulChecks,2);assert.equal(slot.health.events.length,1);assert.equal(slot.health.lastSuccessAt,110);
});
test('health preserves error transitions without server text or credentials',()=>{
 const slot={};observeAccountHealth(slot,{raw:{},checkedAt:100},100);
 observeAccountHealth(slot,{error:'secret-token',diagnostic:'secret-account',requiresReauthentication:true,refreshHealth:{result:'secret-token',credential:'secret-token'}},110);
 observeAccountHealth(slot,{raw:{},checkedAt:120},120);
 assert.deepEqual(slot.health.events.map(e=>e.status),['verified','reauthentication','verified']);
 assert.equal(slot.health.failedTransitions,1);assert.doesNotMatch(JSON.stringify(slot),/secret/);
});
test('health bounds event history and does not equate transient error with logout',()=>{
 const slot={};for(let i=0;i<300;i++)observeAccountHealth(slot,i%2?{error:'timeout'}:{raw:{},checkedAt:i+1},i+1);
 assert.equal(slot.health.events.length,100);assert.equal(slot.health.status,'retry');assert.equal(slot.health.successfulChecks,150);
});
