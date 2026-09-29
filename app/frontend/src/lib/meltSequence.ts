import type { MeltRecord } from './types';
import { supabase } from './supabase';
import { sbGetMeltRecords } from './supabaseStore';
import { markRecentWrite } from './realtimeSync';
import { readPendingSyncQueue } from './pendingSyncGuard';

export const formatHeat = (value?: number) => value == null ? '—' : String(value).padStart(3, '0');
export const furnaceBody = (record: Pick<MeltRecord, 'furnace_no' | 'furnace_body'>) =>
  record.furnace_body || Number(record.furnace_no.match(/^\d+/)?.[0]) || 0;
export const compareMelts = (a: MeltRecord, b: MeltRecord) =>
  a.melt_date.localeCompare(b.melt_date) || a.melt_no.localeCompare(b.melt_no, 'en', { numeric: true }) || a.id.localeCompare(b.id);

/** 與雲端檢視相同：依日期、自然數字編號排序；最近人工錨點校正其所在週期。 */
export function calculateSequences(records: MeltRecord[]): MeltRecord[] {
  const groups = new Map<number, MeltRecord[]>();
  for (const record of records) {
    const body = furnaceBody(record);
    groups.set(body, [...(groups.get(body) || []), record]);
  }
  const output: MeltRecord[] = [];
  for (const [body, group] of groups) {
    const cycles: MeltRecord[][] = [[]];
    const daily = new Map<string, number>();
    for (const record of [...group].sort(compareMelts)) {
      if (record.rebuild) cycles.push([]);
      const day = (daily.get(record.melt_date) || 0) + 1;
      daily.set(record.melt_date, day);
      cycles[cycles.length - 1].push({ ...record, furnace_body: body, daily_sequence: day });
    }
    cycles.forEach((cycle, cycleNumber) => {
      const anchors = cycle.filter(r => r.heat_anchor != null).sort((a, b) =>
        (b.sequence_updated_at || '').localeCompare(a.sequence_updated_at || '') || b.id.localeCompare(a.id));
      const anchor = anchors[0];
      const offset = anchor ? anchor.heat_anchor! - cycle.indexOf(anchor) - 1 : 0;
      cycle.forEach((record, index) => output.push({ ...record, cycle_number: cycleNumber,
        cycle_id: cycle[0].id, heat_sequence: index + 1 + offset }));
    });
  }
  return output.sort(compareMelts);
}

export async function loadSequenceRecords(): Promise<MeltRecord[]> {
  if (!navigator.onLine) throw new Error('爐次校正需連線，請恢復網路後再儲存。');
  if (readPendingSyncQueue().some(entry => entry.table === 'melt_records')) {
    throw new Error('尚有熔解紀錄待同步，請先完成同步再校正爐次。');
  }
  return sbGetMeltRecords();
}

export async function saveSequenceRecord(record: Partial<MeltRecord>, body: number, rebuild: boolean, anchor: number | null) {
  await loadSequenceRecords();
  const { data, error } = await supabase.rpc('save_melt_sequence_record', {
    p_id: record.id, p_record: record, p_body: body, p_rebuild: rebuild, p_anchor: anchor,
  });
  if (error) throw new Error(error.message);
  if (!data?.[0]) throw new Error('雲端未回傳儲存結果，請重新載入確認。');
  markRecentWrite('melt_records');
  const records = await sbGetMeltRecords();
  localStorage.setItem('foundry_melt_records', JSON.stringify(records));
  const saved = records.find(r => r.id === record.id);
  if (!saved) throw new Error('儲存後無法讀回紀錄，請重新載入確認。');
  return saved;
}
