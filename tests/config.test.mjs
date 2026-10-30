import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateAccounts,readAccountConfig} from '../config.mjs';
import {initialState} from '../core.mjs';
const EXAMPLE_EMAILS=Array.from({length:4},(_,i)=>`account${i+1}@example.com`);

test('configured addresses populate the four slots without embedded personal accounts',()=>{
  const accounts=['first@example.com','second@example.com','third@example.com','fourth@example.com'];
  assert.deepEqual(initialState(validateAccounts({accounts})).slots.map(s=>s.email),accounts);
  assert.ok(EXAMPLE_EMAILS.every(e=>e.endsWith('@example.com')));
});
test('missing, duplicate and malformed account lists are rejected',()=>{
  for(const accounts of [undefined,[],EXAMPLE_EMAILS.slice(1),[...EXAMPLE_EMAILS.slice(0,3),'ACCOUNT1@example.com'],[...EXAMPLE_EMAILS.slice(0,3),'not an email'],[...EXAMPLE_EMAILS.slice(0,3),'a@@example.com'],[...EXAMPLE_EMAILS.slice(0,3),' trailing@example.com']])
    assert.throws(()=>validateAccounts({accounts}));
});
test('configuration is read only from an explicit local file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'account-monitor-config-'));
  try{
    const path=join(dir,'accounts.json');
    await assert.rejects(readAccountConfig(path));
    await writeFile(path,JSON.stringify({accounts:EXAMPLE_EMAILS}));
    assert.deepEqual(await readAccountConfig(path),EXAMPLE_EMAILS);
    await writeFile(path,'not json');await assert.rejects(readAccountConfig(path));
  }finally{await rm(dir,{recursive:true,force:true});}
});
