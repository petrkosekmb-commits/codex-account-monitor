// Serialize writes without allowing one failed disk operation to poison the queue.
export function createStateWriter(write){
  let tail=Promise.resolve();
  return value=>{
    const next=tail.catch(()=>{}).then(()=>write(value));
    tail=next;
    return next;
  };
}
