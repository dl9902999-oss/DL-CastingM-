import { meltActor } from './meltActor';
import { supabase } from './supabase';
import { readAllPages } from './readAllPages';
import { readMeltBundle } from './meltBundle';
import { hasPendingSyncForTable, markDeletedIds } from './pendingSyncGuard';
import { markRecentWrite } from './realtimeSync';

export interface MeltAudit {id:string;melt_id:string;melt_no:string;action:string;actor:string;reason:string|null;before_data:Record<string,unknown>|null;after_data:Record<string,unknown>|null;created_at:string}
export async function readMeltAudit(){return readAllPages<MeltAudit>((from,to)=>supabase.from('melt_audit_log').select('*').order('created_at',{ascending:false}).order('id').range(from,to));}
export async function voidMelt(id:string,reason:string) {
 if(['melt_records','melt_materials','melt_chemistries','melt_pourings'].some(hasPendingSyncForTable)) throw new Error('尚有待同步資料，請先完成同步。');
 const expected=await readMeltBundle(id);
 const {data,error}=await supabase.rpc('void_melt_checked',{p_id:id,p_expected:expected,p_actor:meltActor(),p_reason:reason});
 if(error) throw new Error(error.message); if(data!==true) throw new Error('雲端未確認作廢成功');
 for(const [table,rows] of [['melt_materials',expected.materials],['melt_chemistries',expected.chemistry],['melt_pourings',expected.pourings]] as const){markDeletedIds(table,rows.map(r=>String(r.id)));markRecentWrite(table);}
 markRecentWrite('melt_records'); markDeletedIds('melt_records',[id]);
 try { const rows=JSON.parse(localStorage.getItem('foundry_melt_records')||'[]');localStorage.setItem('foundry_melt_records',JSON.stringify(rows.filter((r:{id:string})=>r.id!==id))); } catch { /* Cloud remains authoritative. */ }
}
