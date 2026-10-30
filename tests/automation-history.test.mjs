import test from 'node:test';
import assert from 'node:assert/strict';
import {recordAutomationDecision,publicAutomationHistory} from '../automation-history.mjs';
const fixture=()=>({activeEmail:'private@example.com',automation:{enabled:true},slots:[{id:1,email:'private@example.com',connected:true,error:'secret-error',history:[]}]});
test('decision history omits secrets and chat identities, deduplicates and survives serialization',()=>{
 let s=fixture();const sw={ready:true,threads:[{id:'secret-id',title:'secret-title',waiting:true}]};
 assert.equal(recordAutomationDecision(s,sw,'waiting',100),true);
 assert.equal(recordAutomationDecision(s,sw,'waiting',200),false);
 s=JSON.parse(JSON.stringify(s));assert.equal(recordAutomationDecision(s,sw,'waiting',300),false);
 assert.equal(recordAutomationDecision(s,sw,'switching',400),true);
 assert.doesNotMatch(JSON.stringify(s.automationHistory),/private|secret/);
 assert.equal(s.automationHistory[0].decision.waitingCount,1);
 assert.equal(s.automationHistory.length,2);
});
test('account changes recorded even with same reason and history is bounded',()=>{
 const s=fixture();recordAutomationDecision(s,{},'waiting',1);s.activeEmail='another@example.com';recordAutomationDecision(s,{},'waiting',2);assert.equal(s.automationHistory.length,2);
 for(let i=0;i<1100;i++)recordAutomationDecision(s,{},i%2?'on':'off',i+3);
 assert.equal(s.automationHistory.length,1000);
 s.automation={enabled:false};assert.equal(s.automationHistory.length,1000);
});
test('public history rejects free text even inside allowed fields',()=>{
 const result=publicAutomationHistory([{at:10,decision:{reason:'x'.repeat(300),sourceId:2,threadCount:3,slots:[{id:2,connected:true,secret:'do-not-copy'}],secret:'do-not-copy'}}]);
 assert.equal(result.length,1);assert.equal(result[0].at,10);assert.equal(result[0].decision.reason,'Stav automatiky nebyl popsán.');assert.equal(result[0].decision.sourceId,2);
 assert.doesNotMatch(JSON.stringify(result),/do-not-copy/);assert.deepEqual(result[0].decision.slots,[{id:2,connected:true,error:false,reauth:false,availability:'unknown'}]);
});
test('history sanitizes reason and status contents, invalid slot ids and counts',()=>{
 const result=publicAutomationHistory([{at:1e100,decision:{reason:'private@example.com secret-token',sourceId:99,threadCount:-1,slots:[{id:99,availability:'secret-token'}]}}]);
 assert.doesNotMatch(JSON.stringify(result),/private|secret/);
 assert.equal(result[0].at,null);assert.equal(result[0].decision.sourceId,null);assert.equal(result[0].decision.threadCount,0);
 assert.equal(result[0].decision.slots[0].availability,'unknown');
 assert.equal(publicAutomationHistory([{at:10}],0).length,0);
});
test('known reasons and exact bounded dynamic reasons survive filtering',()=>{
 for(const reason of ['Právě používaný účet nemá potvrzené vyčerpání limitu.','Přepínám na účet 4.']){
  assert.equal(publicAutomationHistory([{at:10,decision:{reason}}])[0].decision.reason,reason);
 }
 assert.equal(publicAutomationHistory([{decision:{reason:'Přepínám na účet 4. secret'}}])[0].decision.reason,'Stav automatiky nebyl popsán.');
});

