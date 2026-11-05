import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('live automatic timer refreshes without reset permission before selecting another account',async()=>{
 const source=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 const loop=source.slice(source.indexOf('const automaticTimer=setInterval('),source.indexOf('const statusTimer='));
 const calls=[];let callback;
 const ctx=vm.createContext({autoBusy:false,busy:false,switching:false,login:null,state:{automation:{enabled:true}},switcherView:{},setInterval:fn=>{callback=fn;},refresh:async allow=>calls.push(['refresh',allow]),automaticSwitch:async()=>calls.push(['selectOtherAccount']),save:async()=>{},switchAccount(){},recordAutomationDecision:()=>false});
 vm.runInContext(loop,ctx);await callback();assert.deepEqual(calls,[['refresh',false],['selectOtherAccount']]);
 const bridge=readFileSync(new URL('../bridge/Program.cs',import.meta.url),'utf8');
 const passive=bridge.slice(bridge.indexOf('if(method=="initialize"||method=="refresh")'),bridge.indexOf('else if(method=="manual-reset")'));
 assert.match(passive,/const bool allowResets=false/);assert.doesNotMatch(passive,/GetProperty\("allowResetCredits"/);
});
