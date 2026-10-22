import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const pause=ms=>new Promise(r=>setTimeout(r,ms));

test('Windows host restarts failed Node while its independent descendant is still alive',{skip:process.platform!=='win32',timeout:15000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'account-monitor-host-')),scripts=join(root,'scripts'),data=join(root,'data');
  await mkdir(scripts);await mkdir(data);
  await cp(new URL('../scripts/run-monitor-host.ps1',import.meta.url),join(scripts,'run-monitor-host.ps1'));
  await writeFile(join(root,'app.mjs'),`import {spawn} from 'node:child_process';import {appendFileSync} from 'node:fs';import {join} from 'node:path';const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true,detached:true});child.unref();appendFileSync(join(process.env.ACCOUNT_MONITOR_DATA,'pids.jsonl'),JSON.stringify({parent:process.pid,child:child.pid})+'\\n');process.exit(1);`);
  const pwsh=join(process.env.USERPROFILE,'.cache','codex-runtimes','codex-primary-runtime','dependencies','native','powershell','pwsh.exe');
  const host=spawn(pwsh,['-NoProfile','-NonInteractive','-File',join(scripts,'run-monitor-host.ps1'),'-DataPath',data],{windowsHide:true,stdio:'ignore'});
  try{
    let entries=[],status;
    for(let n=0;n<100;n++){
      try{entries=(await readFile(join(data,'pids.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);status=JSON.parse(await readFile(join(data,'host-status.json'),'utf8'));if(entries.length>=2)break;}catch{}
      await pause(100);
    }
    assert.ok(entries.length>=2,'failed monitor must restart without waiting for its descendant');
    assert.equal(status.lastExitCode,1,'host must retain the actual nonzero exit code');
    assert.doesNotThrow(()=>process.kill(entries[0].child,0),'independent descendant remains alive during retry');
  }finally{
    if(host.exitCode===null){const done=once(host,'exit');host.kill();await done;}
    try{for(const row of (await readFile(join(data,'pids.jsonl'),'utf8')).trim().split('\n').map(JSON.parse))for(const pid of [row.parent,row.child])try{process.kill(pid);}catch{}}catch{}
    const absolute=resolve(root);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.split(sep).at(-1).startsWith('account-monitor-host-'))throw new Error('Unsafe test cleanup');
    await rm(absolute,{recursive:true,force:true,maxRetries:20,retryDelay:100});
  }
});
