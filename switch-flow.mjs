function failure(code,message){return Object.assign(new Error(message),{code});}
function assertAccount(view,expectedEmail){
  if(expectedEmail&&!view.accounts?.some(a=>a.current&&a.email?.toLowerCase()===expectedEmail.toLowerCase()))
    throw failure('account_unconfirmed','Cílový účet nebyl po přepnutí potvrzený.');
}
// Only status reads may be retried. One shared budget bounds snapshot gaps.
export async function verifyContinuation({view,threadId,request,apply,wait=ms=>new Promise(r=>setTimeout(r,ms)),samples=18,beforeTurnId,expectedEmail}){
  let gapBudget=30;
  const inspect=()=>{
    assertAccount(view,expectedEmail);
    if(view.threads?.some(t=>t.waiting))throw failure('approval_pending','Účet se změnil, ale Codex čeká na schválení nebo odpověď. Dokonči požadavek v chatu.');
    return view.threads?.find(t=>t.id===threadId);
  };
  const poll=async(ms)=>{await wait(ms);view=await request('status');apply(view);return inspect();};
  let initial=inspect();
  while(gapBudget>0&&(!initial?.lastTurnId||(beforeTurnId&&initial.lastTurnId===beforeTurnId))){
    gapBudget--;initial=await poll(1000);
  }
  if(beforeTurnId&&initial?.lastTurnId===beforeTurnId)
    throw failure('new_turn_unconfirmed','Účet se změnil, ale nový tah pokračování není potvrzený. Další zpráva nebyla odeslána.');
  if(!initial?.lastTurnId)throw failure('snapshot_missing','Účet se změnil, ale pokračování vybraného chatu není doložené. Ověř chat ručně.');
  const turnId=initial.lastTurnId;
  for(let i=0;i<=samples;i++){
    let thread=inspect();
    while(gapBudget>0&&!thread?.lastTurnId){gapBudget--;thread=await poll(1000);}
    if(!thread?.lastTurnId)throw failure('snapshot_missing','Stav pokračování není dostupný ani po opakované kontrole. Další zpráva nebyla odeslána.');
    if(thread.lastTurnId!==turnId)throw failure('turn_changed','Stav pokračování se změnil; další zpráva nebyla odeslána. Ověř chat ručně.');
    if(['failed','interrupted'].includes(thread.lastTurnStatus)||thread.status==='systemError')
      throw failure('continuation_failed','Účet se změnil, ale pokračování chatu selhalo. Otevři chat a zkontroluj jeho chybu; automatika zprávu neopakuje.');
    if(thread.lastTurnStatus==='completed')return {turnId,status:'completed'};
    if(i===samples){
      if(thread.status==='active'&&thread.lastTurnStatus==='inProgress')return {turnId,status:'running'};
      throw failure('continuation_unconfirmed','Účet se změnil, ale běh pokračování není potvrzený. Ověř chat ručně.');
    }
    await poll(5000);
  }
}

export async function runSwitch({state,id,threadId,resume,request,apply,save,now=Date.now,wait,beforeTurnId,expectedEmail}){
  if(state.lastSwitch)state.switchHistory=[...(state.switchHistory??[]),{...state.lastSwitch}].slice(-20);
  state.lastSwitch={id,threadId,requestedAt:now(),status:'requested',phase:'Preparing',accountStatus:'unconfirmed',continuationStatus:'unconfirmed'};
  try{
    await save();
    const result=await request(resume?'resume':'switch',threadId);
    apply(result);assertAccount(result,expectedEmail);
    state.lastSwitch={...state.lastSwitch,phase:'VerifyingContinuation',accountStatus:expectedEmail?'confirmed':'unconfirmed'};await save();
    const confirmation=await verifyContinuation({view:result,threadId,request,apply,wait,beforeTurnId,expectedEmail});
    state.lastSwitch={...state.lastSwitch,status:'complete',phase:'Finished',continuationStatus:confirmation.status,confirmedTurnId:confirmation.turnId};
    return {ok:true};
  }catch(error){
    state.lastSwitch={...state.lastSwitch,status:'error',error:error.message,errorCode:error.code??'switch_unconfirmed',continuationStatus:error.code==='continuation_failed'?'failed':error.code==='approval_pending'?'waiting':'unconfirmed'};
    if(error.code==='account_unconfirmed')state.lastSwitch.accountStatus='unconfirmed';
    try{apply(await request('status'));}catch{}
    return {ok:false};
  }finally{await save();}
}
