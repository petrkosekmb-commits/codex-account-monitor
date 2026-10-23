import test from 'node:test';
import assert from 'node:assert/strict';
import {Switcher} from '../switcher.mjs';
test('request to exited helper fails immediately without pending timeout',async()=>{
 const helper=new Switcher('unused','unused',[]);helper.child={exitCode:1,stdin:{destroyed:true}};
 await assert.rejects(helper.request('status'),/není dostupný/);assert.equal(helper.pending.size,0);
});
