import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile = text => ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const load = (path, dependencies={}, globals={}) => {
  const exports={};
  new Function('exports','require',...Object.keys(globals),compile(readFileSync(path,'utf8')))(exports,name=>dependencies[name],...Object.values(globals));
  return exports;
};
const {readAllPages}=load('src/lib/readAllPages.ts');
const sourceRows=Array.from({length:1251},(_,id)=>({id}));
let pageCalls=0;
assert.deepEqual(await readAllPages(async (from,to)=>{pageCalls++;return {data:sourceRows.slice(from,Math.min(from+200,to+1)),error:null};}),sourceRows);
assert.equal(pageCalls,8);
await assert.rejects(()=>readAllPages(async from=>from ? {data:null,error:Error('second page failed')} : {data:[{id:1}],error:null}),/second page/);

// Execute the actual recalculation function against failed-read transports.
const store=readFileSync('src/lib/supabaseStore.ts','utf8');
const code=store.slice(store.indexOf('export async function sbRecalcMeltRecord('),store.indexOf('export function mapMeltRecord('));
let materialError=true,recordError=false,updates=[];
const supabase={from(){return {select(){return this;},eq(){return this;},update(value){updates.push(value);return this;},single:async()=>recordError?{data:null,error:Error('record read failed')}:{data:{power_kwh:500},error:null}};}};
const recalc={};
new Function('exports','sbGetMeltMaterials','supabase','mapMeltRecord',compile(code))(recalc,async()=>{if(materialError)throw Error('materials read failed');return [{charge_weight:100,secondary_weight:20,subtotal:999}];},supabase,x=>x);
await assert.rejects(()=>recalc.sbRecalcMeltRecord('m'),/materials read/);assert.equal(updates.length,0);
materialError=false;recordError=true;
await assert.rejects(()=>recalc.sbRecalcMeltRecord('m'),/record read/);assert.equal(updates.length,0);
recordError=false;await recalc.sbRecalcMeltRecord('m');assert.deepEqual(updates,[{total_charge_weight:120,specific_energy:4.167}]);

const pouring=load('src/lib/pouringData.ts');
let response, calls=0, pending=false;
const cache=new Map();
const storage={getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value)};
const maps={mapMeltRecord:x=>x,mapMeltMaterial:x=>x,mapMeltChemistry:x=>x};
const api=load('src/lib/meltBundle.ts',{
  './supabase':{supabase:{rpc:async name=>{assert.equal(name,'save_melt_bundle');calls++;return response;}}},
  './meltActor':{meltActor:()=> 'TEST-ACTOR'},
  './supabaseStore':maps,'./pouringData':pouring,'./realtimeSync':{markRecentWrite(){}},
  './pendingSyncGuard':{markDeletedIds(){},hasPendingSyncForTable:()=>pending},
},{localStorage:storage});
const request={record:{id:'m'},body:1,rebuild:false,anchor:null,expected:null,materials:[],chemistry:[],targetRange:{},pourings:[]};
response={data:null,error:{message:'MELT_CONFLICT'}};
await assert.rejects(()=>api.saveMeltBundle(request),/其他人/);assert.equal(cache.size,0);
pending=true;await assert.rejects(()=>api.saveMeltBundle(request),/待同步/);assert.equal(calls,1);
pending=false;response={data:{record:{id:'m'},materials:[],chemistry:[],pourings:[],target_range:{}},error:null};
assert.equal((await api.saveMeltBundle(request)).record.id,'m');assert.equal(calls,2);
assert.equal(JSON.parse(cache.get('foundry_melt_records'))[0].id,'m');
console.log('PASS: 1251 rows with reduced server cap, page failure, zero writes on read failures, correct totals, one-RPC save, conflict and pending-sync rejection, confirmed cache. Mock transports only.');
