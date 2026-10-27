import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const rule=script.split('\n').find(l=>l.includes('if(!selectedThread&&threads.length===1)'));
test('selected chat survives missing snapshot and return without redirecting to another chat',()=>{
 const c=vm.createContext({selectedThread:'a',threads:[{id:'a'},{id:'b'}]});
 for(const threads of [[{id:'b'}],[],[{id:'a'},{id:'b'}]]){c.threads=threads;vm.runInContext(rule,c);assert.equal(c.selectedThread,'a');}
});
test('initial ambiguous list requires selection; single chat can be initially selected',()=>{
 const c=vm.createContext({selectedThread:'',threads:[{id:'a'},{id:'b'}]});vm.runInContext(rule,c);assert.equal(c.selectedThread,'');c.threads=[{id:'b'}];vm.runInContext(rule,c);assert.equal(c.selectedThread,'b');
});
test('missing selection never reaches switch API',async()=>{
 const line=script.split('\n').find(l=>l.includes("document.querySelectorAll('button[data-switch]')"));
 for(const selectedThread of ['', 'missing']){
  const button={dataset:{switch:'2'}};let requests=0;const error={textContent:'',scrollIntoView(){}};
  const c=vm.createContext({selectedThread,threads:[{id:'a'}],actionError:'',document:{querySelectorAll:()=>[button]},$:()=>error,api:async()=>{requests++;},update:async()=>{}});
  vm.runInContext(line,c);await button.onclick();assert.equal(requests,0);assert.match(error.textContent,/Vyber dostupný chat/);
 }
});