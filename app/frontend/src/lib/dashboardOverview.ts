import type { WorkOrder, MoldingBatch, MeltingRecord, MeltRecord, MeltMaterial, QualityInspection, DefectRecord, CAPARecord, WarehouseEntry, ShipmentOrder } from './types';
import type { MeltPouring } from './supabaseStore';

export interface OverviewData {
  orders: WorkOrder[];
  batches: MoldingBatch[];
  meltings: MeltingRecord[];
  melts: MeltRecord[];
  materials: MeltMaterial[];
  pourings: MeltPouring[];
  inspections: QualityInspection[];
  defects: DefectRecord[];
  capas: CAPARecord[];
  warehouse: WarehouseEntry[];
  shipments: ShipmentOrder[];
}

export const emptyOverviewData: OverviewData = {
  orders: [], batches: [], meltings: [], melts: [], materials: [], pourings: [],
  inspections: [], defects: [], capas: [], warehouse: [], shipments: [],
};

const positive = (value: unknown) => Math.max(0, Number(value) || 0);
const sum = <T,>(items: T[], value: (item: T) => number) => items.reduce((total, item) => total + value(item), 0);
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function recordDay(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? localDate(date) : '';
}
export function latestRecordTime(groups: unknown[][]): string | null {
  let latest = 0;
  for (const group of groups) for (const value of group) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    for (const field of ['updated_at', 'created_at']) {
      const time = typeof record[field] === 'string' ? Date.parse(record[field]) : NaN;
      if (Number.isFinite(time)) latest = Math.max(latest, time);
    }
  }
  return latest ? new Date(latest).toISOString() : null;
}

/** 同一爐的本機明細沿用熔解管理畫面，避免與雲端快取重複累加。 */
export function mergeLocalPourings(melts: MeltRecord[], cloud: MeltPouring[], storage: Pick<Storage, 'getItem'>): MeltPouring[] {
  const result = [...cloud];
  for (const melt of melts) {
    const raw = storage.getItem(`melt_pouring_${melt.id}`);
    if (!raw) continue;
    try {
      const rows = JSON.parse(raw);
      if (!Array.isArray(rows)) continue;
      for (let i = result.length - 1; i >= 0; i--) if (result[i].melt_id === melt.id) result.splice(i, 1);
      rows.forEach((row, index) => {
        if (!row || typeof row.batch_id !== 'string') return;
        result.push({ ...row, id: row.id || `${melt.id}-${index}`, melt_id: melt.id, pouring_weights: Array.isArray(row.pouring_weights) ? row.pouring_weights : [] });
      });
    } catch { /* 格式損壞時保留雲端資料。 */ }
  }
  return result;
}

export function calculateOverview(data: OverviewData, now = new Date()) {
  const { orders, batches, melts, materials, pourings, meltings, inspections, defects, capas, warehouse, shipments } = data;
  const orderMap = new Map(orders.map(order => [order.id, order]));
  const orderNumbers = new Map(orders.map(order => [order.order_no, order.id]));
  const batchMap = new Map(batches.map(batch => [batch.id, batch]));
  const batchNumbers = new Map(batches.map(batch => [batch.batch_no, batch.id]));
  const batchId = (id?: string, number?: string) => id && batchMap.has(id) ? id : batchNumbers.get(number || '') || '';
  const batchOrder = (id?: string, number?: string) => {
    const batch = batchMap.get(batchId(id, number));
    return batch ? (orderMap.has(batch.work_order_id) ? batch.work_order_id : orderNumbers.get(batch.order_no) || '') : '';
  };
  const inspectionOrder = (inspection: QualityInspection) => orderMap.has(inspection.work_order_id || '')
    ? inspection.work_order_id! : orderNumbers.get(inspection.order_no || '') || batchOrder(inspection.batch_id, inspection.batch_no);
  const active = orders.filter(order => order.status !== 'Cancelled');
  const pouredByBatch = new Map<string, number>();
  const legacyByBatch = new Map<string, number>();
  for (const pouring of pourings) {
    const id = batchId(pouring.batch_id, pouring.batch_no);
    const count = (pouring.pouring_weights || []).filter(weight => positive(weight) > 0).length;
    pouredByBatch.set(id, (pouredByBatch.get(id) || 0) + count);
  }
  for (const record of meltings) {
    const id = batchId(record.batch_id, record.batch_no);
    const count = (record.pouring_weights || []).filter(weight => positive(weight) > 0).length;
    const quantity = count || (positive(record.pouring_weight) > 0 ? positive(batchMap.get(id)?.quantity_completed) : 0);
    legacyByBatch.set(id, (legacyByBatch.get(id) || 0) + quantity);
  }
  const pouredByOrder = new Map<string, number>();
  const moldedOrders = new Set<string>();
  for (const batch of batches) {
    const orderId = batchOrder(batch.id);
    if (positive(batch.quantity_completed) > 0 || batch.status === 'Completed') moldedOrders.add(orderId);
    // 新舊模組可能記錄同一批澆注，取較大值而不重複加總。
    const poured = Math.min(positive(batch.quantity_planned), Math.max(pouredByBatch.get(batch.id) || 0, legacyByBatch.get(batch.id) || 0));
    pouredByOrder.set(orderId, (pouredByOrder.get(orderId) || 0) + poured);
  }
  const pouredQuantity = (order: WorkOrder) => Math.min(positive(order.quantity), pouredByOrder.get(order.id) || 0);
  const shipped = new Map<string, number>();
  const pending = new Set<string>();
  for (const shipment of shipments) {
    const id = orderMap.has(shipment.work_order_id) ? shipment.work_order_id : orderNumbers.get(shipment.order_no) || '';
    if (shipment.status === 'Shipped') shipped.set(id, (shipped.get(id) || 0) + positive(shipment.quantity));
    else pending.add(id);
  }
  const inspectedOrders = new Set(inspections.map(inspectionOrder));
  const stockByOrder = new Map<string, number>();
  for (const entry of warehouse) {
    const id = batchOrder(entry.batch_id, entry.batch_no);
    stockByOrder.set(id, (stockByOrder.get(id) || 0) + positive(entry.quantity));
  }
  const pendingShipment = (order: WorkOrder) => positive(order.quantity) > (shipped.get(order.id) || 0)
    && (pending.has(order.id) || (stockByOrder.get(order.id) || 0) > (shipped.get(order.id) || 0));

  const month = localDate(now).slice(0, 7);
  const monthlyMelts = melts.filter(melt => melt.melt_date?.slice(0, 7) === month);
  const charges = new Map<string, number>();
  for (const material of materials) charges.set(material.melt_id, (charges.get(material.melt_id) || 0) + positive(material.charge_weight) + positive(material.secondary_weight));
  const energy = monthlyMelts.filter(melt => (charges.get(melt.id) || 0) > 0 && positive(melt.power_kwh) > 0)
    .map(melt => positive(melt.power_kwh) / charges.get(melt.id)!);
  const missingEnergy = monthlyMelts.length - energy.length;
  const approvedBatches = new Set(inspections.filter(inspection => inspection.result === 'PASS' || inspection.result === 'CONDITIONAL')
    .map(inspection => batchId(inspection.batch_id, inspection.batch_no)));
  let missingWarehouseWeights = 0;
  const monthlyWarehouseWeight = sum(warehouse.filter(entry => recordDay(entry.created_at).slice(0, 7) === month
    && approvedBatches.has(batchId(entry.batch_id, entry.batch_no))), entry => {
    const order = orderMap.get(batchOrder(entry.batch_id, entry.batch_no));
    if (!order || positive(order.estimated_weight) === 0) missingWarehouseWeights++;
    return positive(entry.quantity) * positive(order?.estimated_weight);
  });

  const inspectionMap = new Map(inspections.map(inspection => [inspection.id, inspection]));
  const defectMap = new Map(defects.map(defect => [defect.id, defect]));
  const exceptions = capas.filter(capa => capa.status !== 'CLOSED').map(capa => {
    const defect = defectMap.get(capa.defect_id || '');
    const inspection = inspectionMap.get(capa.inspection_id || '') || inspectionMap.get(defect?.inspection_id || '');
    const orderId = inspection ? inspectionOrder(inspection) : batchOrder(defect?.batch_id, defect?.batch_no);
    const origin = inspection ? (inspection.type === 'OUTSOURCE' ? '廠外' : '廠內') : '未分類';
    return { ...capa, origin, order: orderMap.get(orderId) };
  }).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.capa_no.localeCompare(b.capa_no));
  const exceptionOrders = new Set(exceptions.map(item => item.order?.id).filter(Boolean));
  const deadline = (days: number) => { const date = new Date(now); date.setDate(date.getDate() + days); return localDate(date); };
  const within = (order: WorkOrder, days: number) => /^\d{4}-\d{2}-\d{2}$/.test(order.due_date) && order.due_date <= deadline(days);
  const creationOrder = (a: WorkOrder, b: WorkOrder) => a.created_at.localeCompare(b.created_at) || a.order_no.localeCompare(b.order_no, 'zh-TW', { numeric: true });
  return {
    month, today: localDate(now),
    monthlyCharge: sum(monthlyMelts, melt => charges.get(melt.id) || 0),
    unpouredWeight: sum(active, order => Math.max(0, positive(order.quantity) - pouredQuantity(order)) * positive(order.estimated_weight)),
    pouredWeight: sum(active, order => pouredQuantity(order) * positive(order.estimated_weight)),
    monthlyWarehouseWeight, missingWarehouseWeights,
    averageEnergy: energy.length ? sum(energy, value => value) / energy.length : null, energyCount: energy.length, missingEnergy,
    urgentProduction: active.filter(order => within(order, 21) && pouredQuantity(order) < positive(order.quantity)).sort(creationOrder),
    urgentShipment: active.filter(order => within(order, 14) && (shipped.get(order.id) || 0) < positive(order.quantity)).sort(creationOrder),
    exceptions,
    summary: [
      { label: '總工單數', count: orders.length },
      { label: '已造模工單數', count: active.filter(order => moldedOrders.has(order.id)).length },
      { label: '已澆鑄工單數', count: active.filter(order => pouredQuantity(order) > 0).length },
      { label: '已品管工單數', count: active.filter(order => inspectedOrders.has(order.id)).length },
      { label: '待出貨工單數', count: active.filter(pendingShipment).length },
      { label: '異常追蹤工單數', count: orders.filter(order => exceptionOrders.has(order.id)).length },
    ],
  };
}
