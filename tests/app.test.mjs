import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {EXAMPLE_EMAILS} from '../core.mjs';

test('dashboard uses isolated configured accounts and rejects unauthorized requests',async()=>{
  const root=await mkdtemp(join(tmpdir(),'account-monitor-app-'));
  let child;
  try{
    for(const name of ['state-writer.mjs','account-state.mjs','config.mjs','app.mjs','core.mjs','rpc.mjs','switcher.mjs','switch-flow.mjs','automatic-switch.mjs','index.html'])
      await copyFile(new URL('../'+name,import.meta.url),join(root,name));
    const data=join(root,'local-data');await mkdir(data);
    await writeFile(join(data,'accounts.json'),JSON.stringify({accounts:EXAMPLE_EMAILS}));
    // A synthetic CLI replaces Codex entirely; no real auth or desktop access.
    await writeFile(join(root,'app-server'),`const rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;let result={};if(m.method==='account/read')result={account:{type:'chatgpt',email:'account1@example.com',planType:'plus'}};if(m.method==='account/rateLimits/read')result={rateLimitsByLimitId:{codex:{primary:{usedPercent:10,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+18000}}}};process.stdout.write(JSON.stringify({id:m.id,result})+'\\n');});`);
    const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
    const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
    child=spawn(process.execPath,[join(root,'app.mjs')],{cwd:root,windowsHide:true,env:{...process.env,ACCOUNT_MONITOR_DATA:data,ACCOUNT_MONITOR_PORT:String(port),ACCOUNT_MONITOR_CODEX:process.execPath},stdio:'ignore'});
    let runtime;
    for(let i=0;i<100;i++){
      try{runtime=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));break;}catch{await new Promise(resolve=>setTimeout(resolve,50));}
    }
    assert.ok(runtime,'isolated dashboard started');
    assert.equal((await fetch(runtime.url+'/api/state')).status,403);
    assert.equal((await fetch(runtime.url+'/api/state',{headers:{'X-Monitor-Key':runtime.key,Origin:'https://example.com'}})).status,403);
    let state;
    for(let i=0;i<50;i++){
      state=await (await fetch(runtime.url+'/api/state',{headers:{'X-Monitor-Key':runtime.key}})).json();
      if(!state.refreshing&&state.activeEmail)break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.deepEqual(state.slots.map(s=>s.email),EXAMPLE_EMAILS);
    assert.equal(state.activeEmail,EXAMPLE_EMAILS[0]);
    assert.equal(state.slots[0].snapshot.limits.windows[0].used,10);
    assert.equal(state.switcher.installed,false);
    const spawnMonitor=()=>spawn(process.execPath,[join(root,'app.mjs')],{cwd:root,windowsHide:true,env:{...process.env,ACCOUNT_MONITOR_DATA:data,ACCOUNT_MONITOR_PORT:String(port),ACCOUNT_MONITOR_CODEX:process.execPath},stdio:'ignore'});
    const duplicate=spawnMonitor();const [duplicateExit]=await once(duplicate,'exit');
    assert.equal(duplicateExit,0,'duplicate succeeds only while the first dashboard responds');
    const originalPid=child.pid;const stopped=once(child,'exit');child.kill();await stopped;
    child=spawnMonitor();
    for(let i=0;i<100;i++){
      const next=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));
      if(next.pid!==originalPid){runtime=next;break;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.notEqual(runtime.pid,originalPid,'stale lock from terminated process is recovered');
    assert.equal((await fetch(runtime.url+'/api/state',{headers:{'X-Monitor-Key':runtime.key}})).status,200);

  }finally{
    if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}
    const absolute=resolve(root);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.split(sep).at(-1).startsWith('account-monitor-app-'))throw new Error('Unsafe test cleanup');
    await rm(absolute,{recursive:true,force:true,maxRetries:20,retryDelay:100});
  }
});
