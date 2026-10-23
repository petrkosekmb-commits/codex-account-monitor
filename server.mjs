import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const data=process.env.ACCOUNT_MONITOR_DATA||join(process.env.LOCALAPPDATA||process.env.USERPROFILE,'CodexAccountMonitor');
const definitions=[
  {name:'account_overview',description:'Přehled čtyř konkrétních účtů, zbývající zahrnuté limity, jejich stáří, očekávaná obnova a historie zjištěného vyčerpání. Neznámé a staré stavy nejsou důkazem dostupnosti. Časy jsou Unix ms; zobrazuj Europe/Prague.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false}},
  {name:'refresh_limits',description:'Vyžádá kontrolu přihlášeného účtu a tří dalších samostatně připojených účtů. Nepřepíná přihlášení aplikace, neposílá úlohy, nespotřebovává ruční reset. Po chvíli znovu načti account_overview.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false}}
];
const write=m=>process.stdout.write(JSON.stringify(m)+'\n');
const lines=createInterface({input:process.stdin});
lines.on('line',line=>{void handle(line);});
async function handle(line){let m;try{m=JSON.parse(line);}catch{return;}
  if(m.id===undefined)return;
  try{
    let result;
    if(m.method==='initialize')result={protocolVersion:m.params?.protocolVersion||'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'codex-account-monitor',version:'0.2.7'}};
    else if(m.method==='ping')result={};
    else if(m.method==='tools/list')result={tools:definitions};
    else if(m.method==='tools/call'){
      if(!definitions.some(t=>t.name===m.params?.name))throw new Error('Neznámý nástroj.');
      let response;
      try{
        const runtime=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));
        const u=new URL(runtime.url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1')throw new Error('Neplatný místní přehled.');
        const refresh=m.params.name==='refresh_limits';
        const r=await fetch(runtime.url+(refresh?'/api/refresh':'/api/state'),{method:refresh?'POST':'GET',headers:{'X-Monitor-Key':runtime.key},signal:AbortSignal.timeout(8000)});
        if(!r.ok)throw new Error('Místní přehled požadavek odmítl.');response=await r.json();
        if(refresh)response={requested:true,message:'Kontrola byla vyžádána. Úspěch ověř novým přehledem a časem poslední kontroly.'};
        else delete response.login; // Never return temporary login URLs to model context.
      }catch{response={unavailable:true,message:'Místní přehled není dostupný. Spusť Spustit-prehled.cmd; starší uložená data nepovažuj za aktuální.'};}
      result={content:[{type:'text',text:JSON.stringify(response)}]};
    }else return write({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Nepodporovaná metoda.'}});
    write({jsonrpc:'2.0',id:m.id,result});
  }catch{write({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:'Požadavek přehledu účtů selhal.'}});}
}
