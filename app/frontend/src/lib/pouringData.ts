import type { MeltPouring } from './supabaseStore';
export type PouringDraft = Omit<MeltPouring, 'id' | 'created_at' | 'melt_id' | 'total_pouring_weight' | 'avg_pouring_weight'> & { id?: string };
export function preparePourings(meltId: string, rows: PouringDraft[]) {
  const ids = new Set<string>();
  return rows.map(row => {
    if (!row.batch_id || !Number.isInteger(row.quantity) || row.quantity <= 0 || !Array.isArray(row.pouring_weights) || row.pouring_weights.length !== row.quantity || row.pouring_weights.some(w => !Number.isFinite(w) || w < 0)) throw new Error('請確認澆注批次、正整數件數與逐件重量。');
    if (![row.estimated_weight, row.estimated_pouring_weight].every(w => Number.isFinite(w) && w >= 0)) throw new Error('預估重量不可為負數或無效數值。');
    const id = row.id || crypto.randomUUID();
    if (ids.has(id)) throw new Error('澆注紀錄識別碼重複。');
    ids.add(id);
    const total = row.pouring_weights.reduce((a,b) => a+b,0);
    const count = row.pouring_weights.filter(w => w > 0).length;
    return { id, melt_id: meltId, batch_id: row.batch_id, batch_no: row.batch_no, customer: row.customer, product_name: row.product_name, material: row.material, quantity: row.quantity, estimated_weight: row.estimated_weight, estimated_pouring_weight: row.estimated_pouring_weight, pouring_weights: [...row.pouring_weights], total_pouring_weight: total, avg_pouring_weight: count ? total/count : 0 };
  });
}
export function batchPouringStatus(rows: Pick<MeltPouring,'batch_id'|'pouring_weights'>[], batchId: string, planned: number): 'none'|'partial'|'full' {
  const completed = rows.filter(r=>r.batch_id===batchId).reduce((sum,r)=>sum+r.pouring_weights.filter(w=>Number.isFinite(w)&&w>0).length,0);
  return completed===0 ? 'none' : planned>0 && completed>=planned ? 'full' : 'partial';
}
