import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);

test('dashboard has no chat picker or pinned-chat configuration',()=>{
 assert.doesNotMatch(script,/selectedThread|automationThread|<select/);
 assert.match(script,/state\.continuation/);
});

function clickContext(continuation){
 const button={dataset:{switch:'2'}},requests=[],error={textContent:'',scrollIntoView(){}};
 const context=vm.createContext({continuation,actionError:'',document:{querySelectorAll:()=>[button]},$:()=>error,api:async(...args)=>requests.push(args),update:async()=>{}});
 const line=script.split('\n').find(l=>l.includes("document.querySelectorAll('button[data-switch]')"));
 vm.runInContext(line,context);
 return {button,requests,error};
}

test('missing or blocked current chat never reaches switch API',async()=>{
 for(const continuation of [{},{threadId:'a',reason:'Chat čeká na schválení.'},{reason:'Rozpracovaný chat se nyní ověřuje.'}]){
  const c=clickContext(continuation);await c.button.onclick();
  assert.equal(c.requests.length,0);assert.ok(c.error.textContent.length>10);
 }
});

test('manual switch leaves current-chat resolution to the server',async()=>{
 const c=clickContext({threadId:'a',title:'Práce A',reason:''});await c.button.onclick();
 assert.equal(c.requests.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(c.requests[0])),['switch','POST',{id:2}]);
});

test('automation toggle does not persist an old chat',async()=>{
 const elements={automationToggle:{}},requests=[];
 const context=vm.createContext({automation:{enabled:false,threadId:'obsolete'},$:id=>elements[id]??{textContent:''},api:async(...args)=>requests.push(args),update:async()=>{}});
 const line=script.split('\n').find(l=>l.includes("$('automationToggle').onclick"));
 vm.runInContext(line,context);await elements.automationToggle.onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(requests)),[['automation','POST',{enabled:true}]]);
});

test('disabled switch shows reason for each blocking condition',()=>{
 const rule=script.split('\n').find(l=>l.includes('const switchReason='));
 const base={current:false,sw:{ready:true,desktop:true},s:{connected:true},state:{},continuation:{threadId:'a',reason:''},date:()=> 'later'};
 for(const patch of [{s:{connected:true,error:'retry',refreshHealth:{nextAttemptAt:1}}},{state:{refreshing:true}},{continuation:{reason:'Čekám na stav rozpracovaného chatu.'}},{continuation:{}},{sw:{ready:false,desktop:false}},{sw:{ready:true,desktop:true,pending:{}}}]){
  const c=vm.createContext({...base,...patch});vm.runInContext(rule+';globalThis.reason=switchReason',c);assert.ok(c.reason.length>10);
 }
 const c=vm.createContext(base);vm.runInContext(rule+';globalThis.reason=switchReason',c);assert.equal(c.reason,'');
});
