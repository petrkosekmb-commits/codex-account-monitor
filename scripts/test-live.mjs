import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Rpc} from '../rpc.mjs';

// Explicit, one-off acceptance test. Never runs during installation or startup.
const args=process.argv.slice(2);
const option=name=>{
  const at=args.indexOf(name);
  if(at<0)return undefined;
  const value=args[at+1];
  if(!value||value.startsWith('--'))throw new Error('Chybí hodnota přepínače '+name+'.');
  return value;
};
if(!args.includes('--execute'))throw new Error('Živý test vyžaduje výslovný přepínač --execute a zavírá Codex.');
const threadId=option('--thread'),output=resolve(option('--output')||'live-test-results.json');
if(!/^[a-f0-9-]{36}$/i.test(threadId||''))throw new Error('Chybí ověřený chat.');
const route=(option('--route')||'').split(',').map(Number);
if(!route.length||route.some(id=>!Number.isInteger(id)||id<1||id>4))throw new Error('Chybí přesná testovací trasa.');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function host(){
  const status=JSON.parse(await readFile(join(process.env.USERPROFILE,'Codex','account-monitor','host-status.json'),'utf8'));
  if(!Number.isInteger(status.hostPid)||!Number.isInteger(status.watchingPid))throw new Error('Hostitel monitoru neběží.');
  process.kill(status.hostPid,0);process.kill(status.watchingPid,0);return status;
}
async function request(path,body){
  const runtime=JSON.parse(await readFile(join(process.env.USERPROFILE,'Codex','account-monitor','runtime.json'),'utf8'));
  if(runtime.url!=='http://127.0.0.1:55163')throw new Error('Neplatný místní přehled.');
  const response=await fetch(runtime.url+'/api/'+path,{method:body?'POST':'GET',headers:{'X-Monitor-Key':runtime.key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'Požadavek přehledu selhal.');return value;
}
async function inspect(){
  const rpc=new Rpc();
  try{
    await rpc.start();const {account}=await rpc.request('account/read',{refreshToken:false});
    const {thread}=await rpc.request('thread/read',{threadId,includeTurns:true});
    const continuation=[...(thread.turns||[])].reverse().find(t=>t.items?.some(i=>i.type==='userMessage'&&i.content?.some(c=>c.type==='text'&&['Continue','Pokračuj v rozpracované úloze.'].includes(c.text?.trim()))));
    return {email:account?.email,title:thread.name,continuationTurnId:continuation?.id??null};
  }finally{rpc.close();}
}
const report={startedAt:new Date().toISOString(),threadId,route,status:'running',cases:[]};
const save=()=>writeFile(output,JSON.stringify(report,null,2)+'\n');
await save();
try{
  for(const id of route){
    let state=await request('state');
    if(state.switcher.pending||state.switcher.switching||state.refreshing||state.switcher.threads.some(t=>t.waiting))throw new Error('Přehled nebo některý chat není připravený pro test.');
    const slot=state.slots.find(s=>s.id===id);
    if(!slot?.connected||slot.error||slot.email.toLowerCase()===state.activeEmail?.toLowerCase())throw new Error('Neplatný cílový účet testu.');
    const before=await inspect(),hostBefore=await host();
    const entry={id,source:state.activeEmail,target:slot.email,startedAt:new Date().toISOString(),status:'running',phases:[]};
    entry.automatic=args.includes('--automatic');entry.sourceUsage=state.slots.find(s=>s.email===state.activeEmail)?.snapshot?.limits;report.cases.push(entry);await save();
    if(!args.includes('--automatic'))await request('switch',{id,threadId});
    const deadline=Date.now()+600000;
    while(Date.now()<deadline){
      await pause(1000);state=await request('state');const last=state.switcher.lastSwitch;
      if(last?.phase&&!entry.phases.includes(last.phase))entry.phases.push(last.phase);
      if(last?.status==='error')throw new Error(last.error||'Přepnutí selhalo.');
      if(last?.status==='complete'&&!state.switcher.pending&&state.activeEmail?.toLowerCase()===slot.email.toLowerCase()&&state.switcher.desktop){
        let proof;
        for(let n=0;n<10;n++){proof=await inspect();if(proof.continuationTurnId&&proof.continuationTurnId!==before.continuationTurnId)break;await pause(1000);}
        entry.accountVerified=proof.email?.toLowerCase()===slot.email.toLowerCase();
        entry.titlePreserved=proof.title===before.title;
        entry.newContinuation=!!proof.continuationTurnId&&proof.continuationTurnId!==before.continuationTurnId;
        entry.pendingCleared=true;entry.desktopConnected=true;
        const hostAfter=await host();
        entry.hostSurvived=hostAfter.hostPid===hostBefore.hostPid&&hostAfter.watchingPid===hostBefore.watchingPid;
        entry.status=entry.accountVerified&&entry.titlePreserved&&entry.newContinuation&&entry.hostSurvived?'passed':'failed';
        entry.finishedAt=new Date().toISOString();await save();
        if(entry.status!=='passed')throw new Error('Identita, název, nové pokračování nebo přežití hostitele nejsou ověřené.');
        break;
      }
      await save();
    }
    if(entry.status!=='passed')throw new Error('Vypršel čas živého testu.');
    // Let a resumed thread establish itself before the next intentional restart.
    await pause(7000);
  }
  report.status='passed';
}catch(error){
  report.status='failed';report.error=error.message;
  if(report.cases.at(-1)?.status==='running')report.cases.at(-1).status='failed';
  process.exitCode=1;
}finally{report.finishedAt=new Date().toISOString();await save();}
