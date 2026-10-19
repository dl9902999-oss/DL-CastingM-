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

export const roundResidual = (value: number) => Math.round(value * 100) / 100;
export const residualRate = (weight: number, base: number) => base > 0 ? roundResidual(weight / base * 100) : 0;
const weight = (value: number) => Number.isFinite(Number(value)) ? Number(value) : 0;
const inRange = (date: string, start: string, end: string) => !!date && (!start || date >= start) && (!end || date <= end);
export const isResidualMaterial = (name: string) => ['殘湯', '殘鐵水', '殘鐵', '殘水', '剩湯', '餘湯', '殘鋼', '殘料'].some(keyword => (name || '').includes(keyword));

/** 只以投料明細計算分母，缺少明細時為零，不回退到可能含前爐殘湯的登錄總重。 */
function buildChargeTotals(materials: MeltMaterial[]) {
  const totals = new Map<string, { base: number; charge: number; secondary: number }>();
  for (const material of materials) {
    const entry = totals.get(material.melt_id) || { base: 0, charge: 0, secondary: 0 };
    const charge = weight(material.charge_weight);
    const secondary = weight(material.secondary_weight);
    if (isResidualMaterial(material.raw_material)) {
      entry.charge += charge;
      entry.secondary += secondary;
    } else {
      entry.base += charge + secondary;
    }
    totals.set(material.melt_id, entry);
  }
  return totals;
}

/** 前爐與本爐共用不含前爐殘湯的投料分母，但分子來源各自獨立。 */
function buildResidualRows(records: MeltRecord[], materials: MeltMaterial[], start: string, end: string, previous: boolean): ResidualStatRow[] {
  const totals = buildChargeTotals(materials);
  return records.filter(record => inRange(record.melt_date, start, end)).map(record => {
    const entry = totals.get(record.id);
    return {
      id: record.id, date: record.melt_date, recordNo: record.melt_no,
      furnaceNo: record.furnace_no, reference: record.material_grade,
      baseWeight: roundResidual(entry?.base || 0),
      residualWeight: roundResidual(previous ? (entry?.charge || 0) + (entry?.secondary || 0) : weight(record.residual_weight)),
      ...(previous ? { chargeWeight: roundResidual(entry?.charge || 0), secondaryWeight: roundResidual(entry?.secondary || 0) } : {}),
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.recordNo.localeCompare(a.recordNo, undefined, { numeric: true }));
}

export function buildPreviousResidualRows(records: MeltRecord[], materials: MeltMaterial[], start: string, end: string): ResidualStatRow[] {
  return buildResidualRows(records, materials, start, end, true);
}

export function buildMeltResidualRows(records: MeltRecord[], materials: MeltMaterial[], start: string, end: string): ResidualStatRow[] {
  return buildResidualRows(records, materials, start, end, false);
}

/** 批次澆注為獨立來源，保留其總出湯重分母。 */
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
