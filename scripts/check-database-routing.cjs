// Exercise the real app client and installed SDK without native modules or network access.
require('./lib/load-typescript.cjs');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { TRAINING_SCHEMA, TRAINING_TABLES } = require('../src/runtime/dataModel.ts');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (['react-native-url-polyfill/auto','react-native-get-random-values'].includes(request)) return {};
  if (request === '@react-native-async-storage/async-storage') return {
    getItem: async () => null, setItem: async () => {}, removeItem: async () => {},
  };
  return originalLoad.call(this,request,parent,isMain);
};
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://fitarc-schema-check.invalid';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-test-key';
const originalFetch = global.fetch;
const requests = [];
global.fetch = async (url, options) => {
  requests.push({url:String(url),method:options?.method ?? 'GET',headers:new Headers(options?.headers)});
  return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
};
const { supabase } = require('../src/lib/supabaseClient.ts');
Module._load = originalLoad;
async function main() {
  try {
    for (const table of Object.values(TRAINING_TABLES)) {
      const {error} = await supabase.from(table).select('*').limit(0);
      assert.equal(error,null);
      const request = requests.at(-1);
      assert.equal(new URL(request.url).pathname,`/rest/v1/${table}`);
      assert.equal(request.headers.get('Accept-Profile'),TRAINING_SCHEMA);
    }
    for (const name of ['fitarc_read_training','fitarc_save_training']) {
      const {error} = await supabase.rpc(name,{});
      assert.equal(error,null);
      assert.equal(new URL(requests.at(-1).url).pathname,`/rest/v1/rpc/${name}`);
      assert.equal(requests.at(-1).headers.get('Content-Profile'),TRAINING_SCHEMA);
    }
    await supabase.from(TRAINING_TABLES.profiles).upsert({user_id:'10000000-0000-4000-8000-000000000001'});
    assert.equal(requests.at(-1).headers.get('Content-Profile'),TRAINING_SCHEMA);
    await supabase.storage.listBuckets();
    assert.equal(new URL(requests.at(-1).url).pathname,'/storage/v1/bucket');
    assert.equal(requests.at(-1).headers.get('Accept-Profile'),null);
    assert.equal(requests.at(-1).headers.get('Content-Profile'),null);
    console.log('Database routing passed: real app client targets fitarc for table reads/writes and RPCs; storage stays separate.');
  } finally {
    await supabase.auth.stopAutoRefresh();
    global.fetch = originalFetch;
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
