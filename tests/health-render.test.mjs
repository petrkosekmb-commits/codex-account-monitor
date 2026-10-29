import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('terminal and out-of-range retry timestamps never break the dashboard',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const date=html.slice(html.indexOf('const date='),html.indexOf('const ago='));
 const health=html.slice(html.indexOf('function healthInfo('),html.indexOf('function subscriptionInfo('));
 const ctx=vm.createContext({Date,Intl,Number,esc:String});vm.runInContext(date+health,ctx);
 for(const terminal of [true,false]){
  ctx.slot={health:{since:1000,successfulChecks:1,failedTransitions:1},refreshHealth:{terminal,nextAttemptAt:9223372036854775807}};
  assert.doesNotMatch(vm.runInContext('healthInfo(slot)',ctx),/Další obnova/);
 }
 assert.equal(vm.runInContext('date(9223372036854775807)',ctx),'Neznámý čas');
});
