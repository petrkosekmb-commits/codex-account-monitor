import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,cp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {EXAMPLE_EMAILS} from '../core.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const source=new URL('../',import.meta.url);

test('isolated HTTP server protects operations, rejects duplicates, and recovers after process loss',async t=>{
  const root=await mkdtemp(join(tmpdir(),'account-monitor-http-'));
  const code=join(root,'code'),data=join(root,'data');let child;
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  const port=listener.address().port;await new Promise(r=>listener.close(r));
  const url=`http://127.0.0.1:${port}`;
  const start=()=>spawn(process.execPath,[join(code,'app.mjs')],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,ACCOUNT_MONITOR_DATA:data,ACCOUNT_MONITOR_PORT:String(port),ACCOUNT_MONITOR_CODEX:join(root,'unavailable-codex.exe')}});
  async function ready(){for(let n=0;n<80;n++){try{const runtime=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));const r=await fetch(url+'/api/state',{headers:{'X-Monitor-Key':runtime.key},signal:AbortSignal.timeout(500)});if(r.ok)return runtime;}catch{}await pause(100);}throw new Error('Isolated server did not start');}
  async function stop(){if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}}
  try{
    for(const file of ['account-health.mjs','state-writer.mjs','account-state.mjs','config.mjs','app.mjs','core.mjs','rpc.mjs','switcher.mjs','switch-flow.mjs','automatic-switch.mjs','index.html'])await cp(new URL(file,source),join(code,file));
    await mkdir(data,{recursive:true});await writeFile(join(data,'accounts.json'),JSON.stringify({accounts:EXAMPLE_EMAILS}));
    child=start();let runtime=await ready();
    const headers={'X-Monitor-Key':runtime.key,'Content-Type':'application/json'};
    await t.test('page is served and credentials are required for API reads',async()=>{
      assert.equal((await fetch(url)).status,200);assert.equal((await fetch(url+'/api/state')).status,403);
      const state=await (await fetch(url+'/api/state',{headers})).json();assert.equal(state.switcher.installed,false);assert.equal(state.slots.length,4);
    });
    await t.test('foreign origins cannot invoke local operations',async()=>{
      assert.equal((await fetch(url+'/api/refresh',{method:'POST',headers:{...headers,Origin:'https://example.com'}})).status,403);
    });
    await t.test('invalid account and unavailable switcher cannot start a transition',async()=>{
      assert.equal((await fetch(url+'/api/switch',{method:'POST',headers,body:JSON.stringify({id:8})})).status,400);
      assert.equal((await fetch(url+'/api/switch',{method:'POST',headers,body:JSON.stringify({id:2})})).status,409);
    });
    await t.test('automation requires verified desktop and can always be disabled',async()=>{
      const set=body=>fetch(url+'/api/automation',{method:'POST',headers,body:JSON.stringify(body)});
      assert.equal((await set({enabled:'yes'})).status,400);
      assert.equal((await set({enabled:true,threadId:'invalid'})).status,400);
      assert.equal((await set({enabled:true})).status,409);
      assert.equal((await set({enabled:false})).status,200);
      const state=await (await fetch(url+'/api/state',{headers})).json();assert.equal(state.automation.enabled,false);
      assert.equal((await fetch(url+'/api/dismiss-switch',{method:'POST',headers})).status,409);
    });
    await t.test('duplicate launch verifies and keeps the existing server',async()=>{
      const duplicate=start();const exited=once(duplicate,'exit');const [code]=await exited;assert.equal(code,0);assert.equal((await ready()).pid,runtime.pid);
    });
    await t.test('restart recovers the dead process lock and rotates local authorization',async()=>{
      const previous=runtime;await stop();child=start();runtime=await ready();
      assert.notEqual(runtime.pid,previous.pid);assert.notEqual(runtime.key,previous.key);
      assert.equal((await fetch(url+'/api/state',{headers:{'X-Monitor-Key':previous.key}})).status,403);
    });
  }finally{
    await stop();
    const absolute=resolve(root),temporary=resolve(tmpdir())+sep;
    if(!absolute.startsWith(temporary)||!absolute.split(sep).at(-1).startsWith('account-monitor-http-'))throw new Error('Unsafe test cleanup');
    await rm(absolute,{recursive:true,force:true});
  }
});
