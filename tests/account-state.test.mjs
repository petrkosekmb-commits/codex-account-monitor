import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {loadAccountState} from '../account-state.mjs';

const emails=['one@example.com','old@example.com','three@example.com','four@example.com'];
async function fixture(run){
  const dir=await mkdtemp(join(tmpdir(),'account-monitor-migration-'));
  const state={version:1,activeEmail:emails[3],slots:emails.map((email,i)=>({id:i+1,email,connected:true,snapshot:{marker:email},history:[{kind:'observed',marker:email}]})),automation:{enabled:true,attempts:{old:{targetId:2}}},lastSwitch:{id:2,status:'complete',phase:'Finished'}};
  const path=join(dir,'state.json');const original=JSON.stringify(state,null,2);await writeFile(path,original);
  try{await run({dir,path,state,original});}
  finally{const safe=resolve(dir);if(!safe.startsWith(resolve(tmpdir())+sep)||!safe.split(sep).at(-1).startsWith('account-monitor-migration-'))throw new Error('Unsafe test cleanup');await rm(safe,{recursive:true,force:true});}
}
test('replacement archives exact original state and never assigns old usage to the new identity',()=>fixture(async({dir,path,state,original})=>{
  const nextEmails=[emails[0],'new@example.com',...emails.slice(2)];
  const next=await loadAccountState(path,nextEmails);
  assert.deepEqual(next.slots.map(s=>s.email),nextEmails);
  assert.deepEqual(next.slots[0],state.slots[0]);assert.deepEqual(next.slots[2],state.slots[2]);assert.deepEqual(next.slots[3],state.slots[3]);
  assert.deepEqual(next.slots[1],{id:2,email:'new@example.com',connected:false,snapshot:null,history:[]});
  assert.equal(next.activeEmail,state.activeEmail);assert.equal(next.automation.enabled,false);assert.deepEqual(next.automation.attempts,{});assert.equal(next.lastSwitch,undefined);
  const backups=await readdir(join(dir,'backups'));assert.equal(backups.length,1);assert.equal(await readFile(join(dir,'backups',backups[0]),'utf8'),original);
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),next);
  assert.deepEqual(await loadAccountState(path,nextEmails),next);assert.equal((await readdir(join(dir,'backups'))).length,1);
}));
test('reordering preserves identity history and remaps the last switch',()=>fixture(async({path,state})=>{
  const next=await loadAccountState(path,[emails[1],emails[0],...emails.slice(2)]);
  assert.equal(next.slots[0].snapshot.marker,emails[1]);assert.equal(next.slots[0].id,1);assert.equal(next.lastSwitch.id,1);assert.deepEqual(next.slots[0].history,state.slots[1].history);
}));
test('requested or partially applied transitions block replacement without changing state',()=>fixture(async({path,state})=>{
  for(const lastSwitch of [{status:'requested'},{status:'error',phase:'Resuming',accountApplied:true}]){
    const original=JSON.stringify({...state,lastSwitch});await writeFile(path,original);
    await assert.rejects(loadAccountState(path,[emails[0],'new@example.com',...emails.slice(2)]),/přechod/);
    assert.equal(await readFile(path,'utf8'),original);
  }
}));
test('invalid configuration and corrupt state fail without rewriting the source',()=>fixture(async({path,original})=>{
  await assert.rejects(loadAccountState(path,[emails[0],emails[0],...emails.slice(2)]));assert.equal(await readFile(path,'utf8'),original);
  await writeFile(path,'not json');await assert.rejects(loadAccountState(path,emails));assert.equal(await readFile(path,'utf8'),'not json');
}));
test('first startup creates four empty slots for the configured identities',()=>fixture(async({dir})=>{
  const state=await loadAccountState(join(dir,'new-state.json'),emails);assert.deepEqual(state.slots.map(s=>s.email),emails);assert.ok(state.slots.every(s=>!s.connected&&s.snapshot===null));
}));
