import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
function declaration(name,next){return source.slice(source.indexOf('async function '+name+'('),source.indexOf(next,source.indexOf('async function '+name+'(')));}
test('cancelled bridge login cannot restore its error panel after cancellation',async()=>{
 let reject;const pending=new Promise((_,r)=>reject=r);let calls=0;
 const context=vm.createContext({Date,Error,login:null,busy:false,state:{slots:[{id:4,email:'four@example.com'}]},switcher:{request:()=>{calls++;return pending;}},switcherView:null,applySwitcherView(){},save:async()=>{}});
 vm.runInContext(declaration('beginLogin','async function finishLogin'),context);
 const run=vm.runInContext('beginLogin(4)',context);assert.equal(context.login.status,'starting');
 context.login=null;reject(new Error('Cancelled'));await run;assert.equal(context.login,null);assert.equal(calls,1);
});
test('periodic refresh does not collide with an active login',async()=>{
 const context=vm.createContext({login:{bridge:true},busy:false,state:{refreshing:false}});
 vm.runInContext(declaration('refresh','function applySwitcherView'),context);
 await vm.runInContext('refresh()',context);assert.equal(context.busy,false);assert.equal(context.state.refreshing,false);
});
