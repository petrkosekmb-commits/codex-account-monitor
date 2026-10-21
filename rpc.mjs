import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
export function findCodex(){
  if(process.env.ACCOUNT_MONITOR_CODEX)return process.env.ACCOUNT_MONITOR_CODEX;
  const root=join(process.env.LOCALAPPDATA||'','OpenAI','Codex','bin');
  if(existsSync(root)){
    const files=readdirSync(root).map(d=>join(root,d,'codex.exe')).filter(existsSync).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs);
    if(files.length)return files[0];
  }
  const fallback=join(process.env.USERPROFILE||'','.codex','plugins','.plugin-appserver','codex.exe');
  return existsSync(fallback)?fallback:'codex';
}
export class Rpc{
  constructor(home=null){this.home=home;this.seq=0;this.pending=new Map();this.listeners=new Set();}
  async start(){
    const args=['app-server','--listen','stdio://'];
    // Each additional account uses its own official credential-store namespace.
    if(this.home)args.push('-c','cli_auth_credentials_store="keyring"');
    this.child=spawn(findCodex(),args,{windowsHide:true,env:{...process.env,...(this.home?{CODEX_HOME:this.home}:{})},stdio:['pipe','pipe','pipe']});
    this.child.stderr.on('data',()=>{});
    this.child.on('error',()=>this.fail(new Error('Místní Codex nelze spustit.')));
    this.child.on('exit',()=>this.fail(new Error('Spojení s místním Codexem skončilo.')));
    this.child.stdin.on('error',()=>this.fail(new Error('Spojení s místním Codexem není dostupné.')));
    this.lines=createInterface({input:this.child.stdout});
    this.lines.on('line',line=>{
      let m;try{m=JSON.parse(line);}catch{return;}
      if(m.id!==undefined&&!m.method){const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);
        m.error?p.reject(new Error('Rozhraní Codexu požadavek odmítlo.')):p.resolve(m.result);
      }else if(m.id!==undefined){this.write({id:m.id,error:{code:-32601,message:'Monitor neprovádí nástroje ani úlohy.'}});
      }else for(const fn of this.listeners)fn(m);
    });
    await this.request('initialize',{clientInfo:{name:'codex_account_monitor',title:'Přehled účtů',version:'0.1.0'}});
    this.write({method:'initialized'});return this;
  }
  write(m){this.child.stdin.write(JSON.stringify(m)+'\n');}
  request(method,params={},timeout=30000){return new Promise((resolve,reject)=>{
    const id=++this.seq,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Vypršel čas kontroly účtu.'));},timeout);
    this.pending.set(id,{resolve,reject,timer});this.write({id,method,params});
  });}
  fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();}
  close(){this.fail(new Error('Spojení ukončeno.'));this.lines?.close();this.child?.stdin.end();this.child?.kill();}
}
