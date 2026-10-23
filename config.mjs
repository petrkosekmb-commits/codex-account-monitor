import {readFile} from 'node:fs/promises';

export function validateAccounts(config){
  const emails=config?.accounts;
  if(!Array.isArray(emails)||emails.length!==4||emails.some(e=>typeof e!=='string'||e.length>254||!/^([^\s@]+)@[^\s@]+\.[^\s@]+$/.test(e)||e!==e.trim()))
    throw new Error('accounts.json musí obsahovat pole accounts se čtyřmi e-mailovými adresami. / Configure exactly four email addresses.');
  if(new Set(emails.map(e=>e.toLowerCase())).size!==4)
    throw new Error('Adresy účtů musí být různé. / Account addresses must be unique.');
  return emails;
}
export async function readAccountConfig(path,fallback){
  let value;
  try{value=JSON.parse(await readFile(path,'utf8'));}
  catch(error){if(error.code==='ENOENT'&&fallback)return validateAccounts({accounts:fallback});throw new Error('Chybí platný místní accounts.json. Postup najdeš v README. / Create the local accounts.json described in README.');}
  return validateAccounts(value);
}
