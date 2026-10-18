const assert=require('node:assert/strict');
const h=require('./lib/react-harness.cjs');
const {React,act,render,advance,appState,mockFile,deferred}=h;
const {useSyncRecovery}=require('../src/hooks/useSyncRecovery.ts');
const {emptyRuntimeState,createRuntimePersistence}=require('../src/runtime/runtimePersistence.ts');
async function main(){
  const {withNetworkTimeout}=require('../src/lib/networkTimeout.ts');
  let signal;
  const stalled=withNetworkTimeout(s=>{signal=s;return new Promise((_,reject)=>s.addEventListener('abort',()=>reject(Error('aborted'))));},1000);
  const rejected=assert.rejects(stalled,/aborted/);
  await advance(1000);await rejected;assert.equal(signal.aborted,true);
  assert.equal(await withNetworkTimeout(async()=>42),42);assert.equal(h.timers.size,0,'Completed requests clear their timeout');

  let calls=0;
  function Probe({status,ready=true}){useSyncRecovery(status,ready,()=>calls++);return null;}
  const tree=await render(React.createElement(Probe,{status:'device'}));
  await advance(1999);assert.equal(calls,0);await advance(1);assert.equal(calls,1);
  await act(async()=>tree.update(React.createElement(Probe,{status:'saving'})));
  await act(async()=>tree.update(React.createElement(Probe,{status:'device'})));
  await advance(4999);assert.equal(calls,1);await advance(1);assert.equal(calls,2,'Backoff increases');
  await act(async()=>tree.update(React.createElement(Probe,{status:'conflict'})));
  await act(async()=>appState('background'));await act(async()=>appState('active'));await advance(60000);assert.equal(calls,2,'Conflicts never auto-resolve');
  await act(async()=>tree.update(React.createElement(Probe,{status:'failed'})));
  await act(async()=>appState('background'));await advance(60000);assert.equal(calls,2);
  await act(async()=>appState('active'));assert.equal(calls,3,'Foreground retries immediately');
  await act(async()=>tree.update(React.createElement(Probe,{status:'synced'})));
  await act(async()=>tree.update(React.createElement(Probe,{status:'device'})));
  await advance(2000);assert.equal(calls,4,'Success resets backoff');
  await act(async()=>tree.unmount());await advance(60000);assert.equal(calls,4);
  assert.equal(h.listeners.size,0);

  // Exercise the real outbox through the controller, not just a retry callback.
  let online=false,local=null,remote={state:null,revision:0,mutationId:null},id=0,writes=0,loadGate=null,localFailure=false;
  const store=createRuntimePersistence({readLocal:async()=>local,writeLocal:async value=>{if(localFailure)throw Error('disk');local=structuredClone(value);},
    readRemote:async()=>{if(loadGate)await loadGate.promise;if(!online)throw Error('offline');return structuredClone(remote);},
    writeRemote:async(state,revision,mutationId)=>{if(!online)throw Error('offline');writes++;remote={state:structuredClone(state),revision:revision+1,mutationId};return {revision:remote.revision,conflict:false};},backup:async()=>{},createId:()=>String(++id)});
  mockFile('src/runtime/index.ts',{emptyRuntimeState,loadRuntimeState:()=>store.load(),stageRuntimeState:stateUser=>{throw Error(stateUser);},flushRuntimeState:()=>store.flush(),useCloudRuntimeState:()=>store.useCloud()});
  // Keep the production user-id adapter signature.
  h.mocks.get(require.resolve('../src/runtime/index.ts')).stageRuntimeState=(_,state)=>store.stage(state);
  const {useRuntimeController}=require('../src/screens/runtime/useRuntimeController.ts');
  let controller;
  function Controller(){controller=useRuntimeController('user');return null;}
  let app=await render(React.createElement(Controller));
  assert.equal(controller.sync,'device');
  await act(async()=>controller.apply(s=>({...s,lastBlockDiff:['first offline edit']})));
  assert.equal(controller.sync,'device');assert.deepEqual(local.state.lastBlockDiff,['first offline edit']);
  online=true;
  await advance(2000);
  assert.equal(controller.sync,'synced');assert.equal(writes,1);assert.deepEqual(remote.state.lastBlockDiff,['first offline edit']);
  localFailure=true;
  await act(async()=>controller.apply(s=>({...s,lastBlockDiff:['disk retry']})));
  assert.equal(controller.sync,'failed');localFailure=false;await advance(2000);assert.equal(controller.sync,'synced');assert.deepEqual(remote.state.lastBlockDiff,['disk retry']);
  await act(async()=>app.unmount());
  // Empty offline launch must fetch existing cloud history, never push an empty state.
  local=null;online=false;remote={state:{...emptyRuntimeState(),lastBlockDiff:['cloud history']},revision:9,mutationId:null};
  app=await render(React.createElement(Controller));assert.equal(controller.sync,'device');const before=writes;
  online=true;await act(async()=>appState('background'));await act(async()=>appState('active'));
  assert.deepEqual(controller.state.lastBlockDiff,['cloud history']);assert.equal(writes,before);
  await act(async()=>app.unmount());
  // A slow initial load cannot update an unmounted screen or permit edits before it finishes.
  loadGate=deferred();app=await render(React.createElement(Controller));
  let outcome;await act(async()=>{outcome=controller.apply(s=>s);});assert.equal(outcome.ok,false);
  await act(async()=>app.unmount());await act(async()=>loadGate.resolve());assert.equal(h.listeners.size,0);
  console.log('Sync recovery: offline edits, backoff, foreground recovery, disk retry, conflict pause, empty offline launch and unmount passed.');
}
main().then(()=>h.restore()).catch(e=>{h.restore();console.error(e);process.exitCode=1;});
