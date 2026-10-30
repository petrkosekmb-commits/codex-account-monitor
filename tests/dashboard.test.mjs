import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../index.html',import.meta.url),'utf8').split('<script>')[1].split('</script>')[0];
function dashboard(waiting=false){
  const elements=new Map(),buttons=[{dataset:{switch:'3'}}];
  const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},insertAdjacentHTML(_,s){this.innerHTML+=s;},scrollIntoView(){}});return elements.get(id);};
  const state={available:[3],slots:[{id:3,email:'target@example.com',connected:true,history:[],availability:{status:'available',label:'Dostupný'}}],activeEmail:'source@example.com',continuation:waiting?{reason:'Chat čeká na schválení nebo odpověď.'}:{threadId:'00000000-0000-0000-0000-000000000001',title:'Rozpracovaný chat',reason:''},switcher:{ready:true,desktop:true,threads:[{id:'00000000-0000-0000-0000-000000000001',title:'Čekající chat',status:'active',waiting}]}};
  const calls=[];
  const context=vm.createContext({Intl,Date,document:{getElementById:element,querySelectorAll:s=>s.includes('data-switch')?buttons:[]},setInterval(){},fetch:async(url,options)=>{calls.push({url,options});return url==='/api/state'?{ok:true,json:async()=>state}:{ok:false,json:async()=>({error:'Ověřovací chyba'})};}});
  vm.runInContext(script,context);
  return {context,elements,buttons,calls,ready:()=>vm.runInContext('update()',context)};
}
test('čekající schválení je viditelné a blokace ze serveru zabrání přepnutí',async()=>{
  const d=dashboard(true);await d.ready();
  assert.match(d.elements.get('switcher').innerHTML,/Čekání na schválení nebo odpověď/);
  assert.match(d.elements.get('switcher').innerHTML,/Čekající chat/);
  assert.match(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
});

test('přehled zobrazuje serverem určený chat bez nabídky výběru',async()=>{
  const d=dashboard();await d.ready();
  assert.match(d.elements.get('switcher').innerHTML,/Pokračování: <strong>Rozpracovaný chat/);
  assert.doesNotMatch(d.elements.get('switcher').innerHTML,/<select|automationThread/);
  vm.runInContext("state.continuation={threadId:'new',title:'Jiná rozpracovaná úloha',reason:''};draw()",d.context);
  assert.match(d.elements.get('switcher').innerHTML,/Jiná rozpracovaná úloha/);
  assert.doesNotMatch(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
});
test('historie automatiky vysvětlí důvod bez identit chatů',async()=>{
 const d=dashboard();await d.ready();vm.runInContext("state.automationHistory=[{at:1,decision:{reason:'Čekám na potvrzené vyčerpání.',enabled:true,ready:true,desktop:true,threadCount:2,waitingCount:0,activeCount:1,failedCount:0}}];draw()",d.context);
 const html=d.elements.get('switcher').innerHTML;assert.match(html,/Historie rozhodnutí automatiky/);assert.match(html,/Čekám na potvrzené vyčerpání/);assert.match(html,/úlohy 2, čeká 0, běží 1, chyby 0/);assert.match(html,/Neobsahuje názvy chatů/);
});

test('stará chyba je historie a neblokuje nový pokus',async()=>{
  const d=dashboard();await d.ready();
  vm.runInContext("state.switcher.lastSwitch={status:'error',error:'Stará blokace',requestedAt:1};draw()",d.context);
  assert.match(d.elements.get('switcher').innerHTML,/<details(?: open)?><summary>Předchozí pokus/);
  assert.doesNotMatch(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
});
test('tlačítko odešle pouze účet, chyba přežije pravidelnou obnovu',async()=>{
  const d=dashboard();await d.ready();
  assert.doesNotMatch(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
  await d.buttons[0].onclick();
  const request=d.calls.find(c=>c.url==='/api/switch');
  assert.equal(request.options.method,'POST');
  assert.deepEqual(JSON.parse(request.options.body),{id:3});
  await d.ready();assert.equal(d.elements.get('error').textContent,'Ověřovací chyba');
});
test('otevřená stránka obnoví oprávnění po restartu přehledu',async()=>{
  const d=dashboard();await d.ready();
  const original=d.context.fetch;const fresh='a'.repeat(64);let stateCalls=0,reads=0;
  d.context.fetch=async(url,options)=>{
    if(url==='/'){reads++;return {ok:true,text:async()=>`let KEY='${fresh}';`};}
    if(url==='/api/state'&&stateCalls++===0)return {ok:false,status:403,json:async()=>({error:'Chybí místní oprávnění.'})};
    assert.equal(options.headers['X-Monitor-Key'],fresh);
    return original(url,options);
  };
  await d.ready();
  assert.equal(reads,1);assert.equal(stateCalls,2);
  assert.equal(d.elements.get('error').textContent,'');
  assert.equal(vm.runInContext('KEY',d.context),fresh);
});

test('kruhovy odpocet ukazuje zbyvajici cas a omezuje vysec na jeden cyklus',async()=>{const d=dashboard();await d.ready();const run=s=>vm.runInContext(s,d.context);assert.match(run('resetClock({duration:300,resetsAt:1000+9000},false,1000000)'),/--remaining:0.5/);assert.match(run('resetClock({duration:300,resetsAt:1000+9000},false,1000000)'),/2 h 30 m/);assert.match(run('resetClock({duration:300,resetsAt:999},false,1000000)'),/ověřit obnovu/);assert.match(run('resetClock({duration:null,resetsAt:null},false,1000000)'),/Neznámý/);assert.match(run('resetClock({duration:300,resetsAt:100000},true,1000000)'),/--remaining:1/);assert.match(run('resetClock({duration:300,resetsAt:100000},true,1000000)'),/Poslední známý údaj/);});

test('predplatne pouziva pouze znamou platnost a nevymysli dalsi platbu',async()=>{const d=dashboard();await d.ready();const run=s=>vm.runInContext(s,d.context);assert.match(run('subscriptionInfo({snapshot:{plan:"plus"},subscription:{activeUntil:2000000000000,checkedAt:1900000000000}})'),/aktivní do:/);assert.match(run('subscriptionInfo({})'),/služba neposkytla/);assert.match(run('subscriptionInfo({subscription:{activeUntil:null}})'),/automatické prodloužení: není ověřeno/);assert.match(run('subscriptionInfo({subscription:{activeUntil:1}})'),/vyžaduje ověření/);});

test('healthy exhausted account explains limit and keeps optional sign-in inside management',async()=>{
 const d=dashboard();await d.ready();vm.runInContext("state.slots[0].availability={status:'exhausted',label:'Vyčerpáno'};draw()",d.context);
 const html=d.elements.get('cards').innerHTML;assert.match(html,/<details><summary>Správa přihlášení/);assert.match(html,/Nové přihlášení limit neobnoví/);assert.doesNotMatch(html,/Obnovit neplatné přihlášení/);
});
test('confirmed revoked account keeps actionable login button',async()=>{
 const d=dashboard();await d.ready();vm.runInContext("state.slots[0].requiresReauthentication=true;draw()",d.context);
 assert.match(d.elements.get('cards').innerHTML,/Obnovit neplatné přihlášení/);assert.doesNotMatch(d.elements.get('cards').innerHTML,/<summary>Správa přihlášení/);
});
