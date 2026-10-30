import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
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
    for(const file of ['current-chat.mjs','automation-history.mjs','account-health.mjs','state-writer.mjs','account-state.mjs','config.mjs','app.mjs','core.mjs','rpc.mjs','switcher.mjs','switch-flow.mjs','automatic-switch.mjs','index.html'])await cp(new URL(file,source),join(code,file));
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


test('isolated HTTP switch resolves the current chat from a fresh helper snapshot',async t=>{
  const root=await mkdtemp(join(tmpdir(),'account-monitor-http-'));
  const code=join(root,'code'),data=join(root,'data'),fixturePath=join(root,'fixture.json'),callsPath=join(root,'calls.jsonl');let child;
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  const port=listener.address().port;await new Promise(r=>listener.close(r));
  const url=`http://127.0.0.1:${port}`,emails=[1,2,3,4].map(id=>`account${id}@example.com`);
  const a='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const thread=(id,status,time)=>({id,title:id===a?'Task A':'Task B',status:status==='inProgress'?'active':'idle',lastTurnId:id+'-turn',lastTurnStatus:status,lastTurnStartedAtMs:time});
  const fixture={ready:true,desktop:true,pending:null,threads:[thread(a,'inProgress',1),thread(b,'failed',0)],accounts:emails.map((email,i)=>({email,current:i===0,checkedAt:Date.now(),plan:'plus',raw:{rateLimits:{limitId:'codex',primary:{usedPercent:10,windowDurationMins:300,resetsAt:Date.now()/1000+10000}}}}))};
  let headers;
  const state=async()=>await (await fetch(url+'/api/state',{headers})).json();
  const post=(path,body)=>fetch(url+'/api/'+path,{method:'POST',headers,body:JSON.stringify(body)});
  async function waitState(predicate){for(let n=0;n<100;n++){try{const value=await state();if(predicate(value))return value;}catch{}await pause(30);}throw new Error('Fixture state did not settle');}
  const calls=async()=>{try{return (await readFile(callsPath,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code==='ENOENT')return [];throw e;}};
  try{
    for(const file of ['current-chat.mjs','automation-history.mjs','account-health.mjs','state-writer.mjs','account-state.mjs','config.mjs','app.mjs','core.mjs','rpc.mjs','switch-flow.mjs','automatic-switch.mjs','index.html'])await cp(new URL(file,source),join(code,file));
    await mkdir(data,{recursive:true});await writeFile(join(data,'accounts.json'),JSON.stringify({accounts:emails}));await writeFile(fixturePath,JSON.stringify(fixture));
    // The only transport is a fixture file. No real bridge, Codex home, login,
    // process shutdown or continuation message is reachable from this test.
    await writeFile(join(code,'switcher.mjs'),`
      import {readFile,appendFile} from 'node:fs/promises';
      export const bridgeInstalled=()=>true;
      export class Switcher {
        constructor(){this.listeners=new Set();}
        start(){return this;}
        close(){}
        async request(method,args={}){
          await appendFile(process.env.FAKE_CALLS,JSON.stringify({method,args})+'\\n');
          const view=JSON.parse(await readFile(process.env.FAKE_FIXTURE,'utf8'));
          if(method==='status'&&view.statusDelayMs)await new Promise(resolve=>setTimeout(resolve,view.statusDelayMs));
          if(method==='switch'){
            if(view.switchDelayMs)await new Promise(resolve=>setTimeout(resolve,view.switchDelayMs));
            for(const account of view.accounts)account.current=account.email===args.email;
            const chat=view.threads.find(t=>t.id===args.threadId);
            if(!chat)throw new Error('Wrong fixture chat');
            chat.lastTurnId+='-continued';chat.lastTurnStatus='completed';chat.status='idle';
          }
          return view;
        }
      }
    `);
    child=spawn(process.execPath,[join(code,'app.mjs')],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,ACCOUNT_MONITOR_DATA:data,ACCOUNT_MONITOR_PORT:String(port),ACCOUNT_MONITOR_CODEX:join(root,'unavailable-codex.exe'),FAKE_FIXTURE:fixturePath,FAKE_CALLS:callsPath}});
    for(let n=0;n<100;n++){try{const runtime=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));headers={'X-Monitor-Key':runtime.key,'Content-Type':'application/json'};break;}catch{}await pause(30);}
    assert.ok(headers);await waitState(s=>s.switcher.ready&&!s.refreshing);
    await t.test('public continuation is read-only current work without a chat picker',async()=>{
      assert.equal((await state()).continuation.threadId,a);
      assert.doesNotMatch(await (await fetch(url)).text(),/<select|automationThread/);
    });
    await t.test('legacy requested chat cannot override newly running task',async()=>{
      fixture.threads=[thread(a,'completed',1),thread(b,'inProgress',2)];await writeFile(fixturePath,JSON.stringify(fixture));
      assert.equal((await post('switch',{id:2,threadId:a})).status,202);
      const result=await waitState(s=>s.lastSwitch?.status==='complete'||s.switcher.lastSwitch?.status==='complete');
      assert.equal(result.switcher.lastSwitch.threadId,b);
      const switches=(await calls()).filter(c=>c.method==='switch');assert.equal(switches.length,1);assert.equal(switches[0].args.threadId,b);
    });
    await t.test('finished-only fresh snapshot blocks a second switch',async()=>{
      fixture.threads=[thread(a,'completed',1),thread(b,'completed',2)];await writeFile(fixturePath,JSON.stringify(fixture));
      const response=await post('switch',{id:3,threadId:b});assert.equal(response.status,409);assert.match((await response.json()).error,/rozpracovaný chat/);
      assert.equal((await calls()).filter(c=>c.method==='switch').length,1);
    });
    await t.test('automation settings discard legacy pinned chat',async()=>{
      assert.equal((await post('automation',{enabled:false,threadId:a})).status,200);
      assert.equal((await state()).automation.threadId,undefined);
    });
    const restoreFixture=async()=>{
      fixture.ready=true;fixture.desktop=true;fixture.pending=null;delete fixture.statusDelayMs;delete fixture.switchDelayMs;
      fixture.threads=[thread(a,'completed',1),thread(b,'inProgress',2)];
      for(const account of fixture.accounts){account.current=account.email===emails[0];delete account.error;}
      await writeFile(fixturePath,JSON.stringify(fixture));await post('refresh',{});
      await waitState(s=>!s.refreshing&&s.activeEmail===emails[0]&&s.switcher.ready&&s.switcher.desktop&&!s.switcher.pending);
    };
    for(const changed of ['current','error','pending','desktop'])await t.test(`fresh preflight rechecks ${changed} before accepting a switch`,async()=>{
      await restoreFixture();
      if(changed==='current')for(const account of fixture.accounts)account.current=account.email===emails[2];
      if(changed==='error')fixture.accounts[2].error='fixture auth failure';
      if(changed==='pending')fixture.pending={targetEmail:emails[2],chats:[{id:b}]};
      if(changed==='desktop')fixture.desktop=false;
      await writeFile(fixturePath,JSON.stringify(fixture));
      assert.equal((await post('switch',{id:3})).status,409);
      assert.equal((await calls()).filter(c=>c.method==='switch').length,1);
    });
    await t.test('concurrent preflights accept one switch and explicitly reject the other',async()=>{
      await restoreFixture();fixture.statusDelayMs=100;fixture.switchDelayMs=300;await writeFile(fixturePath,JSON.stringify(fixture));
      const replies=await Promise.all([post('switch',{id:2}),post('switch',{id:3})]);
      assert.deepEqual(replies.map(r=>r.status).sort(),[202,409]);
      await waitState(s=>!s.switcher.switching&&s.switcher.lastSwitch?.status==='complete');
      assert.equal((await calls()).filter(c=>c.method==='switch').length,2,'only one additional helper switch was dispatched');
    });
  }finally{
    if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}
    const absolute=resolve(root),temporary=resolve(tmpdir())+sep;
    if(!absolute.startsWith(temporary)||!absolute.split(sep).at(-1).startsWith('account-monitor-http-'))throw new Error('Unsafe test cleanup');
    await rm(absolute,{recursive:true,force:true});
  }
});
