import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateWriter} from '../state-writer.mjs';
test('failed write is reported but next queued state can persist',async()=>{
 const written=[];let calls=0;
 const save=createStateWriter(async value=>{if(calls++===0)throw Error('disk busy');written.push(value);});
 const first=save('old');const next=save('new');
 await assert.rejects(first,/disk busy/);await next;assert.deepEqual(written,['new']);
});
test('queued saves preserve snapshot order',async()=>{
 const written=[];const save=createStateWriter(async value=>{await new Promise(r=>setTimeout(r,5));written.push(value);});
 await Promise.all([save('a'),save('b'),save('c')]);assert.deepEqual(written,['a','b','c']);
});
