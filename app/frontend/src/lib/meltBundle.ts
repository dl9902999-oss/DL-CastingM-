import { meltActor } from './meltActor';
import { supabase } from './supabase';
import { mapMeltRecord, mapMeltMaterial, mapMeltChemistry, type MeltPouring } from './supabaseStore';
import { preparePourings, type PouringDraft } from './pouringData';
import { markRecentWrite } from './realtimeSync';
import { markDeletedIds, hasPendingSyncForTable } from './pendingSyncGuard';
import type { MeltRecord, MeltChemistry } from './types';

export interface MeltBundle {
  record: Record<string, unknown>;
  materials: Record<string, unknown>[];
  chemistry: Record<string, unknown>[];
  pourings: MeltPouring[];
  target_range: Record<string, number> | null;
}
export function decodeBundle(value: unknown): MeltBundle {
  const b = value as MeltBundle;
  if (!b?.record?.id || !Array.isArray(b.materials) || !Array.isArray(b.chemistry) || !Array.isArray(b.pourings)) throw new Error('熔解回應不完整，請重新載入確認。');
  return b;
}
export async function readMeltBundle(id: string): Promise<MeltBundle> {
  const {data,error} = await supabase.rpc('read_melt_bundle', {p_id:id});
  if (error) throw new Error('熔解明細讀取失敗，請確認連線及整筆儲存功能已啟用。');
  return decodeBundle(data);
}
export const bundleMaterials = (b: MeltBundle) => b.materials.map(mapMeltMaterial);
export const bundleChemistry = (b: MeltBundle) => b.chemistry.map(mapMeltChemistry);

function cacheBundle(b: MeltBundle, expected: MeltBundle | null) {
  for (const table of ['melt_records','melt_materials','melt_chemistries','melt_pourings']) markRecentWrite(table);
  try {
    for (const [table, rows] of [['melt_materials',expected?.materials],['melt_chemistries',expected?.chemistry]] as const) {
      if (rows) markDeletedIds(table,rows.map(row=>String(row.id)));
    }
    const entries: [string, Record<string, unknown>[] , boolean][] = [
      ['foundry_melt_records',[mapMeltRecord(b.record) as unknown as Record<string,unknown>],true],
      ['foundry_melt_materials',bundleMaterials(b) as unknown as Record<string,unknown>[],false],
      ['foundry_melt_chemistry',bundleChemistry(b) as unknown as Record<string,unknown>[],false],
      ['foundry_melt_pourings',b.pourings as unknown as Record<string,unknown>[],false],
    ];
    for (const [key,rows,parent] of entries) {
      const old = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key,JSON.stringify([...(Array.isArray(old)?old:[]).filter(row=>(parent?row.id:row.melt_id)!==b.record.id),...rows]));
    }
  } catch { console.warn('熔解已存至雲端，但本機快取更新失敗；請重新整理。'); }
}

export async function saveMeltBundle(input: {
  record: Partial<MeltRecord> & {id:string}; body:number; rebuild:boolean; anchor:number|null;
  expected:MeltBundle|null;
  materials:{raw_material:string;charge_weight:number;secondary_weight:number}[];
  chemistry:Omit<MeltChemistry,'id'|'melt_id'>[];
  targetRange:Record<string,number>|null; pourings:PouringDraft[];
}): Promise<MeltBundle> {
  if (['melt_records','melt_materials','melt_chemistries','melt_pourings'].some(hasPendingSyncForTable)) throw new Error('尚有熔解資料待同步，請先完成同步再儲存。');
  const rows = preparePourings(input.record.id,input.pourings);
  const {data,error} = await supabase.rpc('save_melt_bundle', {
    p_id:input.record.id,p_record:{...input.record,_audit_actor:meltActor()},p_body:input.body,p_rebuild:input.rebuild,p_anchor:input.anchor,
    p_expected:input.expected,p_materials:input.materials.map(({raw_material,charge_weight,secondary_weight})=>({raw_material,charge_weight,secondary_weight})),
    p_chemistry:input.chemistry,p_target_range:input.targetRange,p_pourings:rows,
  });
  if(error) {
    if(error.message.includes('MELT_CONFLICT') || error.message.includes('POURING_CONFLICT')) throw new Error('熔解資料已被其他人修改，本次未覆蓋；請保留輸入內容並重新載入核對。');
    throw new Error(`整筆儲存未確認成功，請重新載入核對後再試：${error.message}`);
  }
  const confirmed=decodeBundle(data);
  cacheBundle(confirmed,input.expected);
  return confirmed;
}
