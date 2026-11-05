import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../index.html',import.meta.url),'utf8').split('<script>')[1].split('</script>')[0];
function dashboard(waiting=false){
  const elements=new Map(),buttons=[{dataset:{switch:'3'}}],listeners={};
  const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},insertAdjacentHTML(_,s){this.innerHTML+=s;},scrollIntoView(){}});return elements.get(id);};
  const state={available:[3],slots:[{id:3,email:'target@example.com',connected:true,history:[],availability:{status:'available',label:'Dostupný'}}],activeEmail:'source@example.com',continuation:waiting?{reason:'Chat čeká na schválení nebo odpověď.'}:{threadId:'00000000-0000-0000-0000-000000000001',title:'Rozpracovaný chat',reason:''},switcher:{ready:true,desktop:true,threads:[{id:'00000000-0000-0000-0000-000000000001',title:'Čekající chat',status:'active',waiting}]}};
  const calls=[];
  const context=vm.createContext({Intl,Date,setTimeout,document:{addEventListener:(type,fn)=>listeners[type]=fn,getElementById:element,querySelectorAll:s=>s.includes('data-switch')?buttons:[]},setInterval(){},fetch:async(url,options)=>{calls.push({url,options});return url==='/api/state'?{ok:true,json:async()=>state}:{ok:false,json:async()=>({error:'Ověřovací chyba'})};}});
  vm.runInContext(script,context);
  return {context,elements,buttons,calls,listeners,ready:()=>vm.runInContext('update()',context)};
}

test('polling defers DOM replacement until pointer or keyboard activation ends',async()=>{
 for(const [start,end,event] of [['pointerdown','pointerup',{}],['pointerdown','pointercancel',{}],['keydown','keyup',{key:' '}]]){
  const d=dashboard();await d.ready();const before=d.elements.get('cards').innerHTML;
  d.listeners[start](event);
  vm.runInContext("state.slots[0].email='changed@example.com';draw()",d.context);
  assert.equal(d.elements.get('cards').innerHTML,before);
  d.listeners[end](event);await new Promise(r=>setTimeout(r,5));
  assert.match(d.elements.get('cards').innerHTML,/changed@example.com/);
 }
});

test('pending manual request survives polling and rejects a second click',async()=>{
 const d=dashboard();await d.ready();const original=d.context.fetch;let release,posts=0;
 d.context.fetch=async(url,options)=>{
  if(url!=='/api/switch')return original(url,options);
  posts++;await new Promise(r=>release=r);
  return {ok:false,json:async()=>({error:'Ověřovací chyba'})};
 };
 const first=d.buttons[0].onclick();await d.ready();
 assert.match(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
 assert.match(d.elements.get('error').textContent,/Předávám/);
 await d.buttons[0].onclick();assert.equal(posts,1);
 release();await first;await d.ready();
 assert.equal(d.elements.get('error').textContent,'Ověřovací chyba');
 assert.doesNotMatch(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
});
test('čekající schválení je viditelné a blokace ze serveru zabrání přepnutí',async()=>{
  const d=dashboard(true);await d.ready();
  assert.match(d.elements.get('switcher').innerHTML,/Čekání na schválení nebo odpověď/);
  assert.match(d.elements.get('switcher').innerHTML,/Čekající chat/);
  assert.match(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
});

test('přehled zobrazuje serverem určený chat bez nabídky výběru',async()=>{
  const d=dashboard();await d.ready();
  assert.match(d.elements.get('switcherInfo').innerHTML,/Pokračování: <strong>Rozpracovaný chat/);
  assert.doesNotMatch(d.elements.get('switcherInfo').innerHTML,/<select|automationThread/);
  vm.runInContext("state.continuation={threadId:'new',title:'Jiná rozpracovaná úloha',reason:''};draw()",d.context);
  assert.match(d.elements.get('switcherInfo').innerHTML,/Jiná rozpracovaná úloha/);
  assert.doesNotMatch(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
});
test('historie automatiky vysvětlí důvod bez identit chatů',async()=>{
 const d=dashboard();await d.ready();vm.runInContext("state.automationHistory=[{at:1,decision:{reason:'Čekám na potvrzené vyčerpání.',enabled:true,ready:true,desktop:true,threadCount:2,waitingCount:0,activeCount:1,failedCount:0}}];draw()",d.context);
 const html=d.elements.get('switcherInfo').innerHTML;assert.match(html,/Historie rozhodnutí automatiky/);assert.match(html,/Čekám na potvrzené vyčerpání/);assert.match(html,/úlohy 2, čeká 0, běží 1, chyby 0/);assert.match(html,/Neobsahuje názvy chatů/);
});

test('stará chyba je historie a neblokuje nový pokus',async()=>{
  const d=dashboard();await d.ready();
  vm.runInContext("state.switcher.lastSwitch={status:'error',error:'Stará blokace',requestedAt:1};draw()",d.context);
  assert.match(d.elements.get('switcherInfo').innerHTML,/<details(?: open)?><summary>Předchozí pokus/);
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
test('invalid subscription timestamps cannot prevent rendering all account cards',async()=>{
 const d=dashboard();await d.ready();
 for(const value of [1e100,Infinity,-1,'invalid']){
  d.context.invalidStamp=value;
  assert.doesNotThrow(()=>vm.runInContext('state.slots[0].subscription={activeUntil:invalidStamp,checkedAt:invalidStamp};draw()',d.context));
  assert.match(d.elements.get('cards').innerHTML,/data-switch="3"/);
  assert.doesNotMatch(d.elements.get('cards').innerHTML,/Invalid Date|NaN|Infinity/);
 }
});
test('each account card shows available reset credits without offering an unsafe manual reset',async()=>{
 const d=dashboard();await d.ready();
 vm.runInContext("state.slots[0].snapshot={limits:{resetCredits:2,windows:[]}};draw()",d.context);
 let html=d.elements.get('cards').innerHTML;
 assert.match(html,/K dispozici jsou 2 resety limitu/);
 assert.match(html,/pouze po vašem výslovném potvrzení/);
 assert.doesNotMatch(html,/Resetovat limit|Obnovit limit/);
 vm.runInContext("state.slots[0].snapshot.limits.resetCredits=0;draw()",d.context);
 assert.match(d.elements.get('cards').innerHTML,/Reset limitu není k dispozici/);
});

test('replace button sends the observed identity and new address only after confirmation',async()=>{
 const d=dashboard();await d.ready();const button={dataset:{replace:'3'}};
 const query=d.context.document.querySelectorAll;
 d.context.document.querySelectorAll=s=>s.includes('data-replace')?[button]:query(s);
 d.context.prompt=()=> ' new@example.com ';d.context.confirm=()=>false;
 vm.runInContext('draw()',d.context);
 assert.match(d.elements.get('cards').innerHTML,/Změnit účet na kartě/);
 await button.onclick();assert.equal(d.calls.filter(c=>c.url==='/api/replace-account').length,0);
 d.context.confirm=()=>true;await button.onclick();
 const request=d.calls.find(c=>c.url==='/api/replace-account');
 assert.deepEqual(JSON.parse(request.options.body),{id:3,expectedEmail:'target@example.com',email:'new@example.com'});
 assert.equal(button.disabled,false);assert.equal(d.elements.get('error').textContent,'Ověřovací chyba');
});

test('manual switch panel shows existing accounts with automation off and preserves waiting protection',async()=>{
 const d=dashboard();await d.ready();
 let html=d.elements.get('switcher').innerHTML;
 assert.match(html,/Ručně přepnout účet Codexu/);assert.match(html,/Přepnout na: target@example.com/);
 assert.doesNotMatch(html,/data-switch="3" disabled/);
 vm.runInContext("state.continuation={reason:'Chat čeká na schválení.'};draw()",d.context);
 html=d.elements.get('switcher').innerHTML;assert.match(html,/data-switch="3" disabled/);
});

test('reset expiration is shown separately from subscription and missing dates remain unknown',async()=>{
 const d=dashboard();await d.ready();
 let html=vm.runInContext('resetCreditInfo({resetCredits:1,resetExpirations:[2000000000]})',d.context);
 assert.match(html,/Použít nejpozději do:/);assert.match(html,/2033/);
 html=vm.runInContext('resetCreditInfo({resetCredits:1,resetExpirations:[]})',d.context);
 assert.match(html,/Datum vypršení resetu zatím není ověřené/);
 html=vm.runInContext('resetCreditInfo({resetCredits:0})',d.context);assert.match(html,/Termín dalšího získání resetu není známý/);
 html=vm.runInContext('resetCreditInfo({resetCredits:1,resetExpirations:[1]})',d.context);assert.match(html,/termín uplynul/);
});

test('reset usage distinguishes confirmed automation from unverified service origin',async()=>{
 const d=dashboard();await d.ready();
 let html=vm.runInContext('resetUseInfo({resetLastAutomaticUse:{source:"automation",confirmedAt:2000000000000}})',d.context);assert.match(html,/Použila automatika přehledu/);
 html=vm.runInContext('resetUseInfo({resetLastRedeemedAt:2000000000})',d.context);assert.match(html,/původce neověřen/);assert.doesNotMatch(html,/ručně|Použila automatika/);
 html=vm.runInContext('resetUseInfo({resetLastAutomaticUse:{source:"manual",confirmedAt:2000000000000}})',d.context);assert.match(html,/zatím není doložené/);
 html=vm.runInContext('resetCreditInfo({resetCredits:0,resetLastRedeemedAt:2000000000})',d.context);assert.match(html,/Poslední použití podle služby/);
});

test('reset confirmation cancellation never submits and acceptance identifies the exact account',async()=>{
 const d=dashboard();await d.ready();const button={dataset:{reset:'3'}},query=d.context.document.querySelectorAll;
 d.context.document.querySelectorAll=s=>s.includes('data-reset')?[button]:query(s);
 let message;d.context.confirm=m=>{message=m;return false;};vm.runInContext('draw()',d.context);
 await button.onclick();assert.equal(d.calls.filter(c=>c.url==='/api/reset-credit').length,0);assert.match(message,/target@example.com/);
 d.context.confirm=()=>true;await button.onclick();const request=d.calls.find(c=>c.url==='/api/reset-credit');
 assert.deepEqual(JSON.parse(request.options.body),{id:3,expectedEmail:'target@example.com',confirmed:true});
});
