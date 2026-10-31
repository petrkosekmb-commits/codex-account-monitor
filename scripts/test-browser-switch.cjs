const {chromium}=require('playwright');
const fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],commands=[];
  page.on('pageerror',e=>errors.push(e.message));
  const html=fs.readFileSync(__dirname+'/../index.html','utf8');
  const fixture={available:[1,2,3,4],slots:[1,2,3,4].map(id=>({id,email:`account${id}@example.com`,connected:true,history:[],availability:{status:'available',label:'Dostupny'}})),activeEmail:'account1@example.com',switcher:{ready:true,desktop:true,threads:[]},continuation:{threadId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',reason:''}};
  let finishPost;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   assert.equal(url.origin,'http://127.0.0.1:55999');
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(route.request().method()==='POST'){
    commands.push({path:url.pathname,body:route.request().postDataJSON()});
    await new Promise(resolve=>finishPost=resolve);
    return route.fulfill({status:409,json:{error:'Zkusebni blokace'}});
   }
   return route.fulfill({json:fixture});
  });
  await page.goto('http://127.0.0.1:55999/');
  const button=page.locator('[data-switch="2"]');await button.waitFor();
  await button.scrollIntoViewIfNeeded();
  const box=await button.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.evaluate(()=>update()); // polling between press and release
  await page.mouse.up();
  await page.waitForTimeout(150);
  console.log(JSON.stringify({clickAcrossRefreshRequests:commands.length}));
  if(process.argv.includes('--baseline')){if(finishPost)finishPost();return;}
  assert.equal(commands.length,1,'Refresh must not swallow a real pointer click');
  await page.evaluate(()=>update());
  assert.equal(await page.locator('[data-switch="3"]').isDisabled(),true);
  assert.match(await page.locator('#error').innerText(),/Předávám/);
  await page.locator('[data-switch="3"]').evaluate(b=>b.click());
  assert.equal(commands.length,1,'Only one command while awaiting response');
  finishPost();await page.waitForFunction(()=>document.querySelector('#error').textContent==='Zkusebni blokace');
  await page.evaluate(()=>update());
  assert.equal(await page.locator('#error').innerText(),'Zkusebni blokace');
  assert.deepEqual(commands,[{path:'/api/switch',body:{id:2}}]);
  await button.focus();await page.keyboard.down('Space');
  await page.evaluate(()=>update());await page.keyboard.up('Space');
  await page.waitForTimeout(150);
  assert.equal(commands.length,2,'Keyboard activation must survive a poll too');
  finishPost();await page.waitForFunction(()=>!document.querySelector('[data-switch="2"]').disabled);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.evaluate(()=>{draw();document.dispatchEvent(new Event('pointercancel'));});
  await page.mouse.move(0,0);await page.mouse.up();
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>interactionHeld||drawDeferred),false);
  assert.equal(commands.length,2,'Cancelled pointer must not send a request');
  assert.deepEqual(errors,[]);
  console.log('PASS: pointer and keyboard survive refresh; one pending request; cancellation releases rendering; visible pending and error; no live writes.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
