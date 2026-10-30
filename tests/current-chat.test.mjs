import test from 'node:test';
import assert from 'node:assert/strict';
import {currentChat,continuationView} from '../current-chat.mjs';
const t=(id,status,time)=>({id,lastTurnStatus:status,lastTurnStartedAtMs:time,status:status==='inProgress'?'active':'idle'});
test('running task wins over stale failed and completed chats regardless of list order',()=>{
 for(const threads of [[t('old','failed',1),t('current','inProgress',3),t('done','completed',4)],[t('done','completed',4),t('current','inProgress',3),t('old','failed',1)]])assert.equal(currentChat(threads).thread.id,'current');
});
test('most recently started unfinished task needs no selection',()=>{
 assert.equal(currentChat([t('old','failed',1),t('current','interrupted',4),t('done','completed',2)]).thread.id,'current');
});
test('a newer completed task prevents reviving an unrelated old failure',()=>assert.equal(currentChat([t('old','failed',1),t('done','completed',2)]).thread,null));
test('one failed chat remains selectable after a long wait without a ten-minute cutoff',()=>assert.equal(currentChat([t('current','failed',1)]).thread.id,'current'));
test('completed-only chats never create a new turn',()=>assert.equal(currentChat([t('done','completed',1)]).thread,null));
test('multiple running tasks wait instead of closing unrelated work',()=>assert.equal(currentChat([t('a','inProgress',1),t('b','inProgress',2)]).thread,null));
test('unknown or equal chronology never picks an arbitrary failed chat',()=>{
 for(const value of [undefined,1])assert.equal(currentChat([t('a','failed',value),t('b','failed',value)]).thread,null);
});
test('pending user input prevents restarting the desktop',()=>assert.equal(currentChat([{...t('a','inProgress',1),waiting:true}]).thread,null));
test('usage-limited goals can continue after their previous turn completed',()=>assert.equal(currentChat([{...t('a','completed',1),goal:'usageLimited'}]).thread.id,'a'));
test('public selection view contains no message contents',()=>assert.deepEqual(continuationView([{...t('a','inProgress',1),title:'Task',message:'private'}]),{threadId:'a',title:'Task',reason:''}));
test('observed failure of a long-running task is newer evidence than an earlier completed short task',()=>{
 const threads=[{...t('long','failed',1),lastTurnId:'turn-long'},t('short','completed',2)];
 assert.equal(currentChat(threads,{long:{turnId:'turn-long',failedAt:3}}).thread.id,'long');
 assert.equal(currentChat(threads,{long:{turnId:'old-turn',failedAt:3}}).thread,null);
});
