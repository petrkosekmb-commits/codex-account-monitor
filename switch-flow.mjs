// Keep account reconciliation identical after success and partial failure.
export async function verifyContinuation({view,threadId,request,apply,wait=ms=>new Promise(r=>setTimeout(r,ms)),samples=18,beforeTurnId}){
  // The first result can also arrive while history is invalidated. Wait for
  // evidence of a new turn, including across missing -> old -> new snapshots.
  let initial=view.threads?.find(t=>t.id===threadId);
  for(let retry=0;retry<6&&(!initial?.lastTurnId||(beforeTurnId&&initial.lastTurnId===beforeTurnId));retry++){
    await wait(1000);view=await request('status');apply(view);
    initial=view.threads?.find(t=>t.id===threadId);
  }
  if(beforeTurnId&&initial?.lastTurnId===beforeTurnId)
    throw new Error('Účet se změnil, ale nový tah pokračování není potvrzený. Další zpráva nebyla odeslána.');
  if(!initial?.lastTurnId)throw new Error('Účet se změnil, ale pokračování vybraného chatu není doložené. Ověř chat ručně.');
  const turnId=initial.lastTurnId;
  for(let i=0;i<=samples;i++){
    let thread=view.threads?.find(t=>t.id===threadId);
    // Canonical history updates temporarily invalidate the ledger until its
    // replacement snapshot arrives. Only read again; never resend continuation.
    for(let retry=0;retry<3&&(!thread||!thread.lastTurnId);retry++){
      await wait(1000);view=await request('status');apply(view);
      thread=view.threads?.find(t=>t.id===threadId);
    }
    if(!thread?.lastTurnId)throw new Error('Stav pokračování není dostupný ani po opakované kontrole. Další zpráva nebyla odeslána.');
    if(thread.lastTurnId!==turnId)throw new Error('Stav pokračování se změnil; další zpráva nebyla odeslána. Ověř chat ručně.');
    if(['failed','interrupted'].includes(thread.lastTurnStatus)||thread.status==='systemError')
      throw new Error('Účet se změnil, ale pokračování chatu selhalo. Otevři chat a zkontroluj jeho chybu; automatika zprávu neopakuje.');
    if(thread.lastTurnStatus==='completed')return;
    if(i===samples){
      if(thread.status==='active'&&thread.lastTurnStatus==='inProgress')return;
      throw new Error('Účet se změnil, ale běh pokračování není potvrzený. Ověř chat ručně.');
    }
    await wait(5000);view=await request('status');apply(view);
  }
}

export async function runSwitch({state,id,threadId,resume,request,apply,save,now=Date.now,wait,beforeTurnId,expectedEmail}){
  if(state.lastSwitch)state.switchHistory=[...(state.switchHistory??[]),{...state.lastSwitch}].slice(-20);
  state.lastSwitch={id,threadId,requestedAt:now(),status:'requested',phase:'Preparing'};
  try{
    await save();
    const result=await request(resume?'resume':'switch',threadId);
    apply(result);
    if(expectedEmail&&!result.accounts?.some(a=>a.current&&a.email?.toLowerCase()===expectedEmail.toLowerCase()))
      throw new Error('Cílový účet nebyl po přepnutí potvrzený.');
    state.lastSwitch={...state.lastSwitch,phase:'VerifyingContinuation'};await save();
    await verifyContinuation({view:result,threadId,request,apply,wait,beforeTurnId});
    state.lastSwitch={...state.lastSwitch,status:'complete',phase:'Finished'};
    return {ok:true};
  }catch(error){
    state.lastSwitch={...state.lastSwitch,status:'error',error:error.message};
    try{apply(await request('status'));}catch{}
    return {ok:false};
  }finally{await save();}
}
