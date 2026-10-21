import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync,readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
export function bridgeInstalled(){return existsSync(join(root,'bridge','publish','CodexSwitch.exe'));}
export class Switcher{
  constructor(data,home,accounts){this.data=data;this.home=home;this.accounts=accounts;this.next=0;this.pending=new Map();this.listeners=new Set();}
  start(){
    const dir=join(root,'bridge','publish');
    const manifest=JSON.parse(readFileSync(join(dir,'integrity.json'),'utf8'));
    for(const [name,expected] of Object.entries(manifest)){
      if(name.includes('/')||name.includes('\\')||name==='..')throw new Error('Neplatný soubor pomocníka.');
      const actual=createHash('sha256').update(readFileSync(join(dir,name))).digest('hex');
      if(actual!==expected)throw new Error('Kontrolní součet pomocníka nesouhlasí.');
    }
    this.child=spawn(join(dir,'CodexSwitch.exe'),[this.data,this.home,JSON.stringify(this.accounts)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child.stderr.on('data',()=>{});
    const fail=()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Pomocník přepínání není dostupný.'));}this.pending.clear();};
    this.child.on('exit',fail);this.child.on('error',fail);this.child.stdin.on('error',fail);
    this.lines=createInterface({input:this.child.stdout});
    this.lines.on('line',line=>{
      let m;try{m=JSON.parse(line);}catch{return;}
      if(m.notification){for(const l of this.listeners)l(m);return;}
      const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);
      m.error?p.reject(new Error(m.error)):p.resolve(m.result);
    });
    return this;
  }
  request(method,args={},timeout=180000){return new Promise((resolve,reject)=>{
    const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Vypršel čas operace; před opakováním ověř stav.'));},timeout);
    this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,method,...args})+'\n');
  });}
  close(){this.child?.stdin.end();this.lines?.close();this.child?.kill();}
}
