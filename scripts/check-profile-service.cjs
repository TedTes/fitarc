const assert=require('node:assert/strict');
const h=require('./lib/react-harness.cjs');
const {mocks,mockFile}=h;
const storage=new Map(),remote=new Map();let online=false;
mocks.set('@react-native-async-storage/async-storage',{getItem:async key=>storage.get(key)??null,setItem:async(key,value)=>{storage.set(key,value);},removeItem:async key=>{storage.delete(key);}});
mocks.set('expo-file-system/legacy',{});
mockFile('src/lib/supabaseClient.ts',{supabase:{from:()=>{let userId,value;const query={select(){return query;},eq(_,id){userId=id;return query;},maybeSingle(){return execute();},upsert(row){value=row;return query;},abortSignal(){if(!value)return query;return execute();}};const execute=()=>{if(!online)return Promise.resolve({error:Error('offline')});if(value){remote.set(value.user_id,structuredClone(value));return Promise.resolve({error:null});}return Promise.resolve({data:remote.get(userId)??null,error:null});};return query;}}});
async function main(){
  const filename=require.resolve('../src/services/userProfileService.ts');let service=require(filename);
  const user={id:'account-a',name:'Alex offline',sex:'male',age:25,heightCm:175,weightKg:70,experienceLevel:'beginner',createdAt:'2026-10-17T12:00:00Z'};
  await assert.rejects(service.saveUserProfile(user),/offline/);
  assert(storage.has('fitarc:profile:v2:account-a:pending'));
  delete require.cache[filename];service=require(filename);
  assert.equal((await service.fetchUserProfile(user.id)).name,user.name,'Pending profile survives a service/app restart while offline');
  online=true;await service.flushPendingUserProfile(user.id);
  assert.equal(remote.get(user.id).name,user.name);assert(!storage.has('fitarc:profile:v2:account-a:pending'));
  assert.equal((await service.fetchUserProfile(user.id)).name,user.name);
  assert.equal(await service.fetchUserProfile('account-b'),null,'Another account never inherits pending edits');
  await service.saveUserProfile({...user,name:'Latest profile',heightCm:180});
  assert.equal((await service.fetchUserProfile(user.id)).heightCm,180);
  online=false;assert.equal((await service.fetchUserProfile(user.id)).name,'Latest profile','Offline cache still works after acknowledgement');
  assert.equal(h.timers.size,0);
  console.log('Profile service: real storage adapter restores pending edits, retries them, retains offline cache and isolates accounts.');
}
main().then(()=>h.restore()).catch(e=>{h.restore();console.error(e);process.exitCode=1;});
