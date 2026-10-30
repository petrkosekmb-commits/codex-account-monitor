import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
test('MCP nabízí jen přehled a kontrolu, bez nástroje pro přepínání nebo reset',async()=>{
  const child=spawn(process.execPath,['server.mjs'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const lines=createInterface({input:child.stdout});const msgs=[];lines.on('line',l=>msgs.push(JSON.parse(l)));
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n');
  try{await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),5000);const poll=setInterval(()=>{if(msgs.length===2){clearTimeout(t);clearInterval(poll);resolve();}},20);});
    assert.deepEqual(msgs.find(m=>m.id===2).result.tools.map(t=>t.name),['account_overview','refresh_limits']);
  }finally{child.kill();lines.close();}
});
