import test from 'node:test';import assert from 'node:assert/strict';
import {initialState,record,view,availability,FRESH_MS} from '../core.mjs';
const now=1792600000000;
const raw=(a,b,r1=now/1000+100,r2=now/1000+900)=>({rateLimitsByLimitId:{codex:{primary:{usedPercent:a,resetsAt:r1,windowDurationMins:300},secondary:{usedPercent:b,resetsAt:r2,windowDurationMins:10080}}}});
function slot(a,b){const s=initialState().slots[0];record(s,{email:s.email},raw(a,b),now);return s;}
test('čtyři účty začínají bez vymyšlených údajů',()=>{const v=view(initialState(),now);assert.equal(v.slots.length,4);assert.equal(v.available.length,0);assert.equal(v.nextExpected,null);});
test('týdenní vyčerpání blokuje i volné pětihodinové okno',()=>{const s=slot(1,100);assert.equal(availability(s,now).status,'exhausted');assert.equal(availability(s,now).nextAt,now+900000);});
test('obě vyčerpaná okna vyžadují pozdější obnovu',()=>assert.equal(availability(slot(100,100),now).nextAt,now+900000));
test('minulý reset není důkaz dostupnosti',()=>{const s=slot(100,20);assert.equal(availability(s,now+101000).nextAt,null);assert.notEqual(availability(s,now+101000).status,'available');});
test('stará data ani chyba se nepovažují za dostupný účet',()=>{const s=slot(1,2);assert.equal(availability(s,now+FRESH_MS+1).status,'stale');s.error='chyba';assert.equal(availability(s,now).status,'stale');});
test('nesprávný účet nesmí přepsat snímek',()=>{const s=slot(1,2);assert.throws(()=>record(s,{email:'jiny@example.com'},raw(100,100),now));assert.equal(s.snapshot.limits.windows[0].used,1);});
test('nezaměňovat jiné měřené limity s Codexem',()=>{const s=initialState().slots[0];record(s,{email:s.email},{rateLimitsByLimitId:{other:{primary:{usedPercent:0}}}},now);assert.equal(availability(s,now).status,'unknown');});
test('historie popisuje zjištění a interval, ne přesný okamžik vyčerpání',()=>{const s=slot(2,3);record(s,{email:s.email},raw(100,3),now+1000);assert.equal(s.history[0].lastAvailableAt,now);assert.equal(s.history[0].observedAt,now+1000);record(s,{email:s.email},raw(100,3),now+2000);assert.equal(s.history.length,1);});
test('chybějící hodnoty ani dodatečné omezení nejsou zelené',()=>{const s=slot(null,2);assert.equal(availability(s,now).status,'unknown');record(s,{email:s.email},{...raw(1,2),ordinaryUsageAllowed:false},now);assert.equal(availability(s,now).status,'unknown');});
test('volný účet a nejbližší očekávaná obnova jsou oddělené',()=>{const state=initialState();record(state.slots[0],{email:state.slots[0].email},raw(1,2),now);record(state.slots[1],{email:state.slots[1].email},raw(100,2),now);const v=view(state,now);assert.deepEqual(v.available,[1]);assert.equal(v.nextExpected.id,2);});
test('hlášené vyčerpání dovoluje ukázat očekávanou obnovu, samostatný zákaz útraty ne',()=>{const s=slot(100,2);s.snapshot.limits.reachedType='usage_limit';s.snapshot.limits.ordinaryUsageAllowed=false;assert.equal(availability(s,now).nextAt,now+100000);s.snapshot.limits.spendControlReached=true;assert.equal(availability(s,now).nextAt,null);});
