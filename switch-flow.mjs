// Keep account reconciliation identical after success and partial failure.
export async function runSwitch({state,id,threadId,resume,request,apply,save,now=Date.now}){
  state.lastSwitch={id,requestedAt:now(),status:'requested',phase:'Preparing'};
  try{
    await save();
    const result=await request(resume?'resume':'switch',threadId);
    apply(result);
    state.lastSwitch={...state.lastSwitch,status:'complete',phase:'Finished'};
    return {ok:true};
  }catch(error){
    state.lastSwitch={...state.lastSwitch,status:'error',error:error.message};
    try{apply(await request('status'));}catch{}
    return {ok:false};
  }finally{await save();}
}
