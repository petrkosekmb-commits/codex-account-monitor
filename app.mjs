import {recordAutomationDecision,publicAutomationHistory} from './automation-history.mjs';
import http from 'node:http';
import {createStateWriter} from './state-writer.mjs';
import {loadAccountState} from './account-state.mjs';
import {readFile,writeFile,mkdir,rename,open,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {EMAILS,record,sameEmail,view} from './core.mjs';
import {Rpc} from './rpc.mjs';
import {Switcher,bridgeInstalled} from './switcher.mjs';
import {runSwitch} from './switch-flow.mjs';
import {automaticSwitch} from './automatic-switch.mjs';
import {currentChat,continuationView} from './current-chat.mjs';
import {observeAccountHealth} from './account-health.mjs';
import {readAccountConfig} from './config.mjs';
const ROOT=dirname(fileURLToPath(import.meta.url));
const DATA=process.env.ACCOUNT_MONITOR_DATA||join(process.env.USERPROFILE,'Codex','account-monitor');
const accounts=await readAccountConfig(join(DATA,'accounts.json'),EMAILS);
await mkdir(DATA,{recursive:true});
const statePath=join(DATA,'state.json'),lockPath=join(DATA,'monitor.lock');
let lock;
try{lock=await open(lockPath,'wx');}catch(openError){
  if(openError.code!=='EEXIST')throw openError;
  let pid;
  try{
    pid=JSON.parse(await readFile(lockPath,'utf8')).pid;
    if(!Number.isInteger(pid)||pid<=0)throw new Error('Invalid lock owner.');
    process.kill(pid,0);
    const runtime=JSON.parse(await readFile(join(DATA,'runtime.json'),'utf8'));
    const endpoint=new URL(runtime.url);
    if(runtime.pid!==pid||endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1')throw new Error('Invalid runtime owner.');
    const response=await fetch(runtime.url+'/api/state',{headers:{'X-Monitor-Key':runtime.key},signal:AbortSignal.timeout(1500)});
    if(!response.ok)throw new Error('Runtime health check failed.');
    console.log('Přehled už běží a jeho rozhraní odpovídá.');process.exit(0);
  }catch(e){
    if(e.code!=='ESRCH')throw new Error('Zámek přehledu existuje, ale běh nelze ověřit. Hostitel zkusí spuštění znovu.');
    await unlink(lockPath);lock=await open(lockPath,'wx');
  }
}
await lock.writeFile(JSON.stringify({pid:process.pid}));await lock.close();
const state=await loadAccountState(statePath,accounts);
const key=randomBytes(32).toString('hex');
const live=new Set();let login=null,busy=false,saveTail=Promise.resolve(),stopping=false;
let switcher=null,switcherView=null,switching=false,switcherError=null;
if(bridgeInstalled()){
  try{
    switcher=new Switcher(join(DATA,'switcher'),join(process.env.USERPROFILE,'.codex'),accounts).start();
    switcher.listeners.add(m=>{
      if(m.notification==='loginUrl'&&login){login.url=m.url;login.status='waiting';}
      if(m.notification==='switchProgress'){state.lastSwitch={...state.lastSwitch,phase:m.phase,accountApplied:m.accountApplied};void save().catch(()=>{});}
    });
  }catch{switcherError='Pomocník přepínání neprošel kontrolou nebo se nespustil.';}
}
const enqueueState=createStateWriter(async copy=>{const tmp=statePath+'.tmp';await writeFile(tmp,copy,{mode:0o600});await rename(tmp,statePath);});
function save(){const copy=JSON.stringify({...state,refreshing:false},null,2);saveTail=enqueueState(copy);return saveTail;}
function profileHome(id){const email=state.slots.find(s=>s.id===id).email.toLowerCase();return join(DATA,'profiles',createHash('sha256').update(email).digest('hex').slice(0,24));}
async function query(rpc){const {account}=await rpc.request('account/read',{refreshToken:false});if(account?.type!=='chatgpt'||!account.email)throw new Error('Chybí přihlášení účtu ChatGPT.');const raw=await rpc.request('account/rateLimits/read');return {account,raw};}
async function withRpc(home,fn){const rpc=new Rpc(home);live.add(rpc);try{await rpc.start();return await fn(rpc);}finally{live.delete(rpc);rpc.close();}}
async function refresh(allowResetCredits=false){
  if(busy||login?.bridge||login?.rpc)return;busy=true;state.refreshing=true;
  try{
    if(switcher){
      try{switcherView=await switcher.request('refresh',{allowResetCredits});applySwitcherView();switcherError=null;}
      catch{switcherError='Účty nebo spojení s aplikací se nepodařilo ověřit.';for(const s of state.slots)if(s.connected)s.error=switcherError;}
      await save();return;
    }
    try{
      const {account,raw}=await withRpc(null,query);state.activeEmail=account.email;
      const slot=state.slots.find(s=>sameEmail(s.email,account.email));
      if(slot)record(slot,account,raw);
      delete state.activeError;
    }catch{state.activeError='Aktivní účet se nepodařilo ověřit.';const s=state.slots.find(s=>sameEmail(s.email,state.activeEmail));if(s&&!s.connected)s.error=state.activeError;}
    for(const slot of state.slots.filter(s=>s.connected)){
      try{const {account,raw}=await withRpc(profileHome(slot.id),query);record(slot,account,raw);}
      catch{slot.error='Kontrola selhala. Zkus obnovit nebo znovu přihlásit tento účet.';}
    }
    await save();
  }finally{busy=false;state.refreshing=false;}
}
function applySwitcherView(){
  state.activeEmail=switcherView?.accounts.find(a=>a.current)?.email??null;
  for(const slot of state.slots){
    const account=switcherView?.accounts.find(a=>sameEmail(a.email,slot.email));
    observeAccountHealth(slot,account);
    slot.connected=!!account;
    slot.requiresReauthentication=account?.requiresReauthentication===true;
    slot.credentialDiagnostic=account?.diagnostic??null;
    slot.subscription=account?.subscription??null;
    if(account?.current){state.activeEmail=account.email;if(account.raw&&!account.error)delete state.activeError;}
    if(account?.raw&&!account.error)record(slot,{email:account.email,planType:account.plan},account.raw,account.checkedAt);
    else if(account?.error)slot.error=account.error;
  }
}
async function beginLogin(id){
  if(login||busy)throw new Error('Probíhá jiná kontrola nebo přihlášení.');
  const slot=state.slots.find(s=>s.id===id);if(!slot)throw new Error('Neplatný účet.');
  if(switcher){
    const operation=login={id,status:'starting',startedAt:Date.now(),bridge:true};
    try{switcherView=await switcher.request('login',{email:slot.email},16*60*1000);applySwitcherView();await save();if(login===operation)login={id,status:'done',message:'Účet je připojený pro přepínání i průběžnou kontrolu.'};}
    catch(e){if(login===operation)login={id,status:'error',message:e.message};}
    return;
  }
  const rpc=new Rpc(profileHome(id));live.add(rpc);
  login={id,rpc,status:'starting',startedAt:Date.now()};
  rpc.listeners.add(m=>{
    if(m.method==='account/login/completed')void finishLogin(rpc,m.params);
  });
  try{
    await mkdir(profileHome(id),{recursive:true});
    await rpc.start();const result=await rpc.request('account/login/start',{type:'chatgpt'});
    if(!result.authUrl||!/^https:\/\/(auth\.openai\.com|chatgpt\.com)\//.test(result.authUrl))throw new Error('Chybí ověřená přihlašovací adresa.');
    if(login?.rpc===rpc){login.url=result.authUrl;login.loginId=result.loginId;login.status='waiting';}
  }catch{live.delete(rpc);rpc.close();login={id,status:'error',message:'Přihlášení nelze spustit. Přihlašovací údaje se neukládají do nechráněného souboru.'};}
}
async function finishLogin(rpc,params){
  if(login?.rpc!==rpc)return;
  const id=login.id,slot=state.slots.find(s=>s.id===id);
  try{
    if(!params.success)throw new Error('Přihlášení nebylo dokončeno.');
    const {account,raw}=await query(rpc);
    if(!sameEmail(account.email,slot.email))throw new Error('Byl přihlášen jiný účet. Otevři odkaz v samostatném profilu prohlížeče a přihlas vybranou adresu.');
    record(slot,account,raw);slot.connected=true;await save();login={id,status:'done',message:'Účet je připojený pro průběžnou kontrolu.'};
  }catch(e){login={id,status:'error',message:e.message};}
  finally{live.delete(rpc);rpc.close();}
}
async function cancelLogin(){
  const old=login;login=null;
  if(old?.bridge){try{await switcher.request('cancel',{},10000);}catch{}return;}
  if(old?.rpc){if(old.loginId)try{await old.rpc.request('account/login/cancel',{loginId:old.loginId},5000);}catch{}live.delete(old.rpc);old.rpc.close();}
}
function publicView(){const result=view(state);result.automation=state.automation??{enabled:false,status:"off"};result.activeError=state.activeError??null;result.login=login?{id:login.id,status:login.status,url:login.url??null,message:login.message??null}:null;
  result.automationHistory=publicAutomationHistory(state.automationHistory);
  result.switcher={installed:!!switcher,ready:!!switcherView?.ready,desktop:!!switcherView?.desktop,error:switcherError,switching,
    threads:switcherView?.threads??[],pending:switcherView?.pending??null,lastSwitch:state.lastSwitch??null,history:state.switchHistory??[]};result.continuation=continuationView(switcherView?.threads,state.automation?.observedTurns);return result;}
async function switchAccount(id,threadId,resume=false){
  if(!switcher||!switcherView?.ready||switching||busy||login?.bridge||login?.rpc)throw new Error('Přepínač není připravený nebo právě probíhá jiná operace.');
  const slot=state.slots.find(s=>s.id===id);if(!slot?.connected)throw new Error('Nejdřív jednou přihlas vybraný účet.');
  if(resume){
    const chats=switcherView?.pending?.chats??[];
    if(chats.length!==1)throw new Error('Připravený přechod nemá jednoznačně určený chat.');
    threadId=chats[0].id;
  }else if(!threadId){
    const selected=currentChat(switcherView?.threads,state.automation?.observedTurns);
    if(!selected.thread)throw new Error(selected.reason);
    threadId=selected.thread.id;
  }
  const beforeTurnId=switcherView?.threads?.find(t=>t.id===threadId)?.lastTurnId;
  switching=true;busy=true;
  try{
    const result=await runSwitch({state,id,threadId,resume,save,beforeTurnId,expectedEmail:slot.email,
      request:(method,selected)=>switcher.request(method,method==='status'?{}:{email:slot.email,threadId:selected},method==='status'?10000:11*60*1000),
      apply:result=>{switcherView=result;applySwitcherView();}});
    if(result.ok)switcherError=null;
  }
  finally{busy=false;switching=false;await save();}
}
const html=(await readFile(join(ROOT,'index.html'),'utf8')).replace('__MONITOR_KEY__',key);
let origin;
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'");
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  if(req.headers.host!==new URL(origin).host)return send(403,{error:'Nepovolený hostitel.'});
  if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Nepovolený původ požadavku.'});
  if(req.url==='/'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);}
  if(req.headers['x-monitor-key']!==key)return send(403,{error:'Chybí místní oprávnění.'});
  try{
    if(req.url==='/api/state'&&req.method==='GET')return send(200,publicView());
    if(req.url==='/api/refresh'&&req.method==='POST'){if(login?.rpc||login?.bridge)return send(409,{error:'Nejdřív dokonči přihlášení.'});void refresh().catch(()=>{});return send(202,{ok:true});}
    if(req.url==='/api/automation'&&req.method==='POST'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)return send(413,{error:'Příliš dlouhý požadavek.'});}
      const options=JSON.parse(body);
      if(typeof options.enabled!=='boolean'||options.threadId&&!/^[a-f0-9-]{36}$/i.test(options.threadId))return send(400,{error:'Neplatné nastavení automatiky.'});
      if(options.enabled&&(!switcherView?.ready||!switcherView.desktop||switcherView.pending||switching||busy||login?.bridge||login?.rpc))return send(409,{error:'Nejdřív ověř spojení a dokonči připravený přechod.'});
      state.automation={enabled:options.enabled,attempts:state.automation?.attempts??{},status:options.enabled?'waiting':'off'};
      await save();return send(200,{ok:true});
    }
    if(req.url==='/api/dismiss-switch'&&req.method==='POST'){
      if(!switcher||switching||busy)return send(409,{error:'Probíhá jiná operace.'});
      switcherView=await switcher.request('dismiss');applySwitcherView();await save();return send(200,{ok:true});
    }
    if(req.url==='/api/login'&&req.method==='POST'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)return send(413,{error:'Příliš dlouhý požadavek.'});}
      const id=JSON.parse(body).id;if(!Number.isInteger(id)||id<1||id>4)return send(400,{error:'Neplatný účet.'});
      if(login?.rpc||login?.bridge||busy)return send(409,{error:'Právě probíhá kontrola nebo přihlášení.'});void beginLogin(id).catch(()=>{login={id,status:'error',message:'Přihlášení nelze spustit.'};});return send(202,{ok:true});
    }
    if((req.url==='/api/switch'||req.url==='/api/resume')&&req.method==='POST'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)return send(413,{error:'Příliš dlouhý požadavek.'});}
      const {id}=JSON.parse(body);let threadId;
      if(!Number.isInteger(id)||id<1||id>4||threadId&& !/^[a-f0-9-]{36}$/i.test(threadId))return send(400,{error:'Neplatný účet nebo úloha.'});
      const rejectSwitch=async error=>{
        state.switchHistory=[...(state.switchHistory??[]),{id,threadId,requestedAt:Date.now(),status:'error',phase:'Rejected',accountApplied:false,error}].slice(-20);
        await save();return send(409,{error});
      };
      const target=state.slots.find(s=>s.id===id);
      const blocked=()=>{
        if(busy||switching||login?.bridge||login?.rpc)return 'Probíhá jiná operace. Vyčkej na její dokončení.';
        if(!switcherView?.ready||!switcherView?.desktop||!target?.connected)return 'Nejdřív připoj účet a vyčkej na ověření spojení s Codexem.';
        if(req.url==='/api/switch'&&switcherView.pending)return 'Předchozí přechod čeká na vyřešení. Použij jeho obnovení nebo zrušení v horní části přehledu.';
        if(req.url==='/api/switch'&&(sameEmail(target.email,state.activeEmail)||target.error))return 'Vyber jiný účet s ověřeným přihlášením.';
        if(req.url==='/api/resume'&&(switcherView.pending?.chats?.length!==1||!sameEmail(target.email,switcherView.pending.targetEmail)))return 'Připravený přechod nemá ověřený cílový účet a jediný chat.';
        return '';
      };
      let reason=blocked();if(reason)return rejectSwitch(reason);
      const fresh=await switcher.request('status',{},10000);
      // A second request or periodic refresh can win while status is pending.
      // Do not overwrite an in-flight operation with this older snapshot.
      if(busy||switching||login?.bridge||login?.rpc)return rejectSwitch('Probíhá jiná operace. Vyčkej na její dokončení.');
      switcherView=fresh;applySwitcherView();
      reason=blocked();if(reason)return rejectSwitch(reason);
      if(req.url==='/api/switch'){
        const selected=currentChat(switcherView?.threads,state.automation?.observedTurns);
        if(!selected.thread)return rejectSwitch(selected.reason);
        threadId=selected.thread.id;
      }
      void switchAccount(id,threadId,req.url==='/api/resume').catch(()=>{});return send(202,{requested:true});
    }
    if(req.url==='/api/cancel'&&req.method==='POST'){await cancelLogin();return send(200,{ok:true});}
    if(req.url==='/api/cancel-switch'&&req.method==='POST'){if(switcher&&switching)await switcher.request('cancel',{},10000);return send(200,{cancelRequested:true});}
    return send(404,{error:'Neznámý požadavek.'});
  }catch{return send(500,{error:'Požadavek se nepodařilo dokončit.'});}
});
const port=Number(process.env.ACCOUNT_MONITOR_PORT||55162);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Neplatný místní port přehledu.');
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
await writeFile(join(DATA,'runtime.json'),JSON.stringify({pid:process.pid,url:origin,key}),{mode:0o600});
await save();console.log(origin);
void refresh().catch(()=>{});
const timer=setInterval(()=>{if(!login?.rpc&&!login?.bridge&&!switching)void refresh().catch(()=>{});else if(login&&Date.now()-login.startedAt>15*60*1000)void cancelLogin();},5*60*1000);
let autoBusy=false;
const automaticTimer=setInterval(async()=>{
  if(autoBusy)return;
  if(!state.automation?.enabled||busy||switching||login?.bridge||login?.rpc){
    const reason=!state.automation?.enabled?'Automatika vypnutá.':switching?'Probíhá přepnutí.':login?.bridge||login?.rpc?'Probíhá přihlášení.':'Probíhá kontrola nebo jiná operace.';
    if(recordAutomationDecision(state,{...switcherView,switching},reason))await save().catch(()=>{});
    return;
  }
  autoBusy=true;
  try{
    await refresh(true);
    await automaticSwitch({state,switcher:{...switcherView,switching},save,switchAccount});
  }catch{state.automation.enabled=false;state.automation.status='error';state.automation.message='Kontrola automatiky selhala; stav ověř ručně.';recordAutomationDecision(state,switcherView,state.automation.message);await save().catch(()=>{});}
  finally{autoBusy=false;}
},30000);
const statusTimer=setInterval(async()=>{if(switcher&&!busy&&!switching){try{switcherView=await switcher.request('status',{},5000);}catch{switcherView=null;switcherError='Spojení s pomocníkem není ověřené.';}}},5000);
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);clearInterval(statusTimer);clearInterval(automaticTimer);switcher?.close();for(const rpc of live)rpc.close();server.close();await saveTail.catch(()=>{});await unlink(lockPath).catch(()=>{});await unlink(join(DATA,'runtime.json')).catch(()=>{});process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
