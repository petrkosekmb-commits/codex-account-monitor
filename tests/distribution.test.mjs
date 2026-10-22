import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('public distribution includes reviewed sources and example identities only',async()=>{
  const files=JSON.parse(await readFile(new URL('../distribution-files.json',import.meta.url),'utf8'));
  assert.equal(new Set(files).size,files.length);
  for(const path of files){
    assert.ok(!path.startsWith('/')&&!path.includes('..')&&!path.includes('\\'),'relative source path');
    assert.ok(!/(^|\/)(auth\.json|runtime\.json|state\.json|accounts\.json|accounts\.local\.json|monitor\.lock|profiles|switcher|publish|bin|obj)(\/|$)|\.(vault|log|db|sqlite[0-9]*)$/i.test(path),'no private runtime files: '+path);
    const content=await readFile(new URL('../'+path,import.meta.url),'utf8');
    for(const match of content.matchAll(/[a-z0-9][a-z0-9._%+-]*@([a-z0-9.-]+\.[a-z]{2,})/gi))
      assert.equal(match[1].toLowerCase(),'example.com','only example email domains: '+path);
    assert.ok(!/\bgh[pousr]_[A-Za-z0-9_]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bsk-[A-Za-z0-9]{32,}|eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content),'no credential patterns: '+path);
  }
  const host=await readFile(new URL('../scripts/run-monitor-host.ps1',import.meta.url),'utf8');
  assert.ok(host.includes('[int]$Port=55163'),'public host keeps its separate default port');
});