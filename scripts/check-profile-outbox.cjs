require('./lib/load-typescript.cjs');
const assert=require('node:assert/strict');
const {createProfileOutbox}=require('../src/services/profileOutbox.ts');
async function main(){
  let pending=null,cached=null,online=false,id=0,gate=null;
  const uploaded=[];
  const deps={read:async()=>structuredClone(pending),write:async value=>{pending=structuredClone(value);},clear:async()=>{pending=null;},cache:async value=>{cached=structuredClone(value);},createId:()=>String(++id),upload:async value=>{if(!online)throw Error('offline');uploaded.push(value);if(gate)await gate;}};
  let box=createProfileOutbox(deps);
  await box.stage({name:'Saved offline'});await assert.rejects(box.flush(),/offline/);
  assert.equal(pending.value.name,'Saved offline');
  box=createProfileOutbox(deps);assert.equal((await box.pending()).value.name,'Saved offline','Restart retains edits');
  online=true;await box.flush();assert.equal(pending,null);assert.equal(cached.name,'Saved offline');
  let release;gate=new Promise(resolve=>{release=resolve;});
  await box.stage({name:'Older edit'});const flushing=box.flush();
  // Wait until the first write has reached the remote.
  for(let n=0;n<20&&uploaded.at(-1).name!=='Older edit';n++)await Promise.resolve();
  assert.equal(uploaded.at(-1).name,'Older edit');
  await box.stage({name:'Newer edit'});const nextFlush=box.flush();
  gate=null;release();await Promise.all([flushing,nextFlush]);
  assert.deepEqual(uploaded.slice(-2).map(x=>x.name),['Older edit','Newer edit']);assert.equal(cached.name,'Newer edit');assert.equal(pending,null);
  const failedDisk=createProfileOutbox({...deps,write:async()=>{throw Error('disk full');}});
  const before=uploaded.length;await assert.rejects(failedDisk.stage({name:'Lost'}),/disk full/);assert.equal(uploaded.length,before,'Do not claim a save when staging fails');
  console.log('Profile outbox: offline restart, retry, serialized uploads, newer edits during upload and disk failure passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
