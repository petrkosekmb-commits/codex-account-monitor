import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('automatic timer cannot authorize reset credits',()=>{
 const source=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 const timer=source.slice(source.indexOf('const automaticTimer='));
 assert.match(timer,/await refresh\(false\)/);
 assert.doesNotMatch(source,/refresh\(true\)/);
});
