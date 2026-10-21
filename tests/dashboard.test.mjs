import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../index.html',import.meta.url),'utf8').split('<script>')[1].split('</script>')[0];
function dashboard(waiting=false){
  const elements=new Map(),buttons=[{dataset:{switch:'3'}}];
  const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},insertAdjacentHTML(_,s){this.innerHTML+=s;},scrollIntoView(){}});return elements.get(id);};
  const state={available:[3],slots:[{id:3,email:'target@example.com',connected:true,history:[],availability:{status:'available',label:'Dostupný'}}],activeEmail:'source@example.com',switcher:{ready:true,desktop:true,threads:[{id:'00000000-0000-0000-0000-000000000001',title:'Čekající chat',status:'active',waiting}]}};
  const calls=[];
  const context=vm.createContext({Intl,Date,document:{getElementById:element,querySelectorAll:s=>s.includes('data-switch')?buttons:[]},setInterval(){},fetch:async(url,options)=>{calls.push({url,options});return url==='/api/state'?{ok:true,json:async()=>state}:{ok:false,json:async()=>({error:'Ověřovací chyba'})};}});
  vm.runInContext(script,context);
  return {context,elements,buttons,calls,ready:()=>vm.runInContext('update()',context)};
}
test('čekající schválení má viditelný důvod a blokuje přepnutí',async()=>{
  const d=dashboard(true);await d.ready();
  assert.match(d.elements.get('switcher').innerHTML,/čekání na schválení nebo odpověď/);
  assert.match(d.elements.get('switcher').innerHTML,/Čekající chat/);
  assert.match(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
});
test('ručně lze vybrat neukončený neaktivní chat, dokončený chat se nenabízí',async()=>{
  const d=dashboard();await d.ready();
  await vm.runInContext("state.switcher.threads[0].status='idle';draw()",d.context);
  assert.match(d.elements.get('cards').innerHTML,/data-switch="3" >/);
  await vm.runInContext("state.switcher.threads[0].lastTurnStatus='completed';draw()",d.context);
  assert.match(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
});
test('stará chyba je historie a neblokuje nový pokus',async()=>{
  const d=dashboard();await d.ready();
  vm.runInContext("state.switcher.lastSwitch={status:'error',error:'Stará blokace',requestedAt:1};draw()",d.context);
  assert.match(d.elements.get('switcher').innerHTML,/<details><summary>Předchozí pokus/);
  assert.doesNotMatch(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
});
test('tlačítko odešle účet a chat, chyba přežije pravidelnou obnovu',async()=>{
  const d=dashboard();await d.ready();
  assert.doesNotMatch(d.elements.get('cards').innerHTML,/data-switch="3" disabled/);
  await d.buttons[0].onclick();
  const request=d.calls.find(c=>c.url==='/api/switch');
  assert.equal(request.options.method,'POST');
  assert.deepEqual(JSON.parse(request.options.body),{id:3,threadId:'00000000-0000-0000-0000-000000000001'});
  await d.ready();assert.equal(d.elements.get('error').textContent,'Ověřovací chyba');
});
