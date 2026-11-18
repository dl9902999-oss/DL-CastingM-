import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const lifetime={};new Function('exports',compile('src/lib/syncLifetime.ts'))(lifetime);
const scope=lifetime.createSyncLifetime();
assert.equal(scope.capture()(),false);scope.start();const old=scope.capture();assert(old());scope.stop();assert(!old());scope.start();assert(!old());assert(scope.capture()());
// Execute the real DataProvider effects with a deferred connection check.
// Unmount before it resolves: it must not upload, download or subscribe later.
const effects=[];let resolveConnection,uploads=0,pulls=0,subscriptions=0;
const connection=new Promise(resolve=>resolveConnection=resolve);
const react={createContext:()=>({Provider:'provider'}),useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn),createElement:()=>null};
const data={getPendingSyncCount:()=>0,getSyncHistory:()=>[],getSyncStats:()=>({}),isSupabaseConnected:()=>connection,syncPendingToSupabase:async()=>{uploads++;return {success:0,failed:0}},getConnectionStatus:()=>({reason:'none'})};
const realtime={startRealtimeSync:()=>subscriptions++,cleanupRealtimeSync:()=>{},fullSyncFromSupabase:async()=>pulls++,onDataChange:()=>()=>{}};
const exports={};
new Function('exports','require',compile('src/contexts/DataContext.tsx'))(exports,name=>name==='react'?{...react,default:react}:name.endsWith('dataService')?data:name.endsWith('realtimeSync')?realtime:name.endsWith('syncLifetime')?lifetime:{forceFullUpload:async()=>uploads++});
exports.DataProvider({children:null});const cleanups=effects.map(fn=>fn());for(const fn of cleanups)if(fn)fn();
resolveConnection(true);await new Promise(resolve=>setImmediate(resolve));
assert.equal(uploads,0);assert.equal(pulls,0);assert.equal(subscriptions,0);
console.log('PASS: stopped/previous generations invalid; unmounted real DataProvider ignores delayed connection success without upload, download or resubscription. Hook harness, not browser integration.');
