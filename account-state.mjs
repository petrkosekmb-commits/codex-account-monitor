import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {initialState,sameEmail} from './core.mjs';
import {validateAccounts} from './config.mjs';

export async function loadAccountState(path,accounts){
  validateAccounts({accounts});
  let state;
  try{state=JSON.parse(await readFile(path,'utf8'));}
  catch(error){if(error.code==='ENOENT')return initialState(accounts);throw error;}
  if(state.version!==1||state.slots?.length!==4)throw new Error('Neznámý formát uložených účtů.');
  validateAccounts({accounts:state.slots.map(s=>s.email)});
  if(state.slots.every((s,i)=>s.id===i+1&&sameEmail(s.email,accounts[i])))return state;
  if(state.lastSwitch?.status==='requested'||state.lastSwitch?.status==='error'&&state.lastSwitch.accountApplied&&state.lastSwitch.phase!=='Finished')
    throw new Error('Nejdřív dokonči přechod s původním seznamem účtů.');
  const at=Date.now();
  const backupDir=join(dirname(path),'backups');await mkdir(backupDir,{recursive:true});
  const backupPath=join(backupDir,'accounts-'+at+'-'+randomUUID()+'.json');
  // Preserve the original bytes before changing any slot. Credentials stay in the DPAPI vault.
  await writeFile(backupPath,await readFile(path),{flag:'wx',mode:0o600});
  const next={...state,slots:accounts.map((email,i)=>{
    const previous=state.slots.find(s=>sameEmail(s.email,email));
    return previous?{...previous,id:i+1,email}:{id:i+1,email,connected:false,snapshot:null,history:[]};
  }),refreshing:false,automation:{enabled:false,attempts:{},status:'off',message:'Seznam účtů se změnil. Automatiku můžeš po ověření účtů znovu zapnout.'},
    accountMigration:{at,backupFile:basename(backupPath)}};
  if(state.lastSwitch){
    const email=state.slots.find(s=>s.id===state.lastSwitch.id)?.email;
    const id=next.slots.find(s=>sameEmail(s.email,email))?.id;
    if(id)next.lastSwitch={...state.lastSwitch,id};else delete next.lastSwitch;
  }
  const temporary=path+'.'+randomUUID()+'.tmp';
  await writeFile(temporary,JSON.stringify(next,null,2),{flag:'wx',mode:0o600});
  await rename(temporary,path);
  return next;
}
