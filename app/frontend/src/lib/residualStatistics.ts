import type { MeltMaterial, MeltRecord, MeltingRecord } from './types';

export interface ResidualStatRow {
  id: string;
  date: string;
  recordNo: string;
  furnaceNo: string;
  reference: string;
  baseWeight: number;
  residualWeight: number;
  chargeWeight?: number;
  secondaryWeight?: number;
}

export const isResidualMaterial = (name: string) => ['殘湯', '殘鐵水', '殘鐵', '殘水', '剩湯', '餘湯', '殘鋼', '殘料'].some(keyword => (name || '').includes(keyword));

/** 逐爐列出前爐殘湯投料；包含零投料爐次，合計分母維持區間全部爐次。 */
export function buildPreviousResidualRows(records: MeltRecord[], materials: MeltMaterial[], start: string, end: string): ResidualStatRow[] {
  const totals = new Map<string, { total: number; charge: number; secondary: number }>();
  for (const material of materials) {
    const entry = totals.get(material.melt_id) || { total: 0, charge: 0, secondary: 0 };
    const charge = weight(material.charge_weight);
    const secondary = weight(material.secondary_weight);
    entry.total += charge + secondary;
    if (isResidualMaterial(material.raw_material)) {
      entry.charge += charge;
      entry.secondary += secondary;
    }
    totals.set(material.melt_id, entry);
  }
  return records.filter(record => inRange(record.melt_date, start, end)).map(record => {
    const entry = totals.get(record.id);
    return {
      id: record.id, date: record.melt_date, recordNo: record.melt_no,
      furnaceNo: record.furnace_no, reference: record.material_grade,
      baseWeight: roundResidual(weight(record.total_charge_weight) || entry?.total || 0),
      chargeWeight: roundResidual(entry?.charge || 0),
      secondaryWeight: roundResidual(entry?.secondary || 0),
      residualWeight: roundResidual((entry?.charge || 0) + (entry?.secondary || 0)),
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.recordNo.localeCompare(a.recordNo, undefined, { numeric: true }));
}

export const roundResidual = (value: number) => Math.round(value * 100) / 100;
export const residualRate = (weight: number, base: number) => base > 0 ? roundResidual(weight / base * 100) : 0;
const weight = (value: number) => Number.isFinite(Number(value)) ? Number(value) : 0;
const inRange = (date: string, start: string, end: string) => !!date && (!start || date >= start) && (!end || date <= end);

/** 本爐殘湯只取熔解紀錄登錄值，投料僅作為比例分母，不能當成殘湯分子。 */
export function buildMeltResidualRows(records: MeltRecord[], materials: MeltMaterial[], start: string, end: string): ResidualStatRow[] {
  const totals = new Map<string, number>();
  for (const material of materials) {
    totals.set(material.melt_id, (totals.get(material.melt_id) || 0) + weight(material.charge_weight) + weight(material.secondary_weight));
  }
  return records.filter(record => inRange(record.melt_date, start, end)).map(record => ({
    id: record.id,
    date: record.melt_date,
    recordNo: record.melt_no,
    furnaceNo: record.furnace_no,
    reference: record.material_grade,
    baseWeight: roundResidual(totals.get(record.id) ?? weight(record.total_charge_weight)),
    residualWeight: roundResidual(weight(record.residual_weight)),
  })).sort((a, b) => b.date.localeCompare(a.date) || b.recordNo.localeCompare(a.recordNo, undefined, { numeric: true }));
}

/** 批次澆注為另一個登錄來源，不與熔解爐次相加或互相補值。 */
export function buildPourResidualRows(records: MeltingRecord[], start: string, end: string): ResidualStatRow[] {
  return records.map(record => ({
    id: record.id,
    date: (record.created_at || '').slice(0, 10),
    recordNo: record.heat_no,
    furnaceNo: record.furnace_no,
    reference: record.batch_no,
    baseWeight: roundResidual(weight(record.pouring_weight)),
    residualWeight: roundResidual(weight(record.residual_weight)),
  })).filter(record => inRange(record.date, start, end))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function summarizeResidual(rows: ResidualStatRow[]) {
  const baseWeight = roundResidual(rows.reduce((sum, row) => sum + row.baseWeight, 0));
  const residualWeight = roundResidual(rows.reduce((sum, row) => sum + row.residualWeight, 0));
  return { baseWeight, residualWeight, rate: residualRate(residualWeight, baseWeight) };
}

export function residualExportRows(rows: ResidualStatRow[], source: string): (string | number)[][] {
  const summary = summarizeResidual(rows);
  return [
    ...rows.map(row => [source, row.date, row.recordNo, row.furnaceNo, row.reference, row.baseWeight, row.residualWeight, residualRate(row.residualWeight, row.baseWeight)]),
    [source, '', '合計', '', '', summary.baseWeight, summary.residualWeight, summary.rate],
  ];
}
