import type { WorkOrder, WorkOrderItem, MoldingBatch } from './types';

export function emptyOrderItem(): WorkOrderItem {
  return { id: crypto.randomUUID(), line_no: '', product_name: '', material: '', quantity: 1, estimated_weight: 0, mold_supply: '', mold_type: '', pattern_id: '', heat_treatment: '', group: '', remarks: '' };
}

/** 舊單品項以固定識別碼相容，不修改原始工單或批次。 */
export function orderItems(order: WorkOrder): WorkOrderItem[] {
  return order.items?.length ? order.items : [{
    id: 'legacy', line_no: '1', product_name: order.product_name, material: order.material,
    quantity: order.quantity, estimated_weight: order.estimated_weight, mold_supply: order.mold_supply,
    mold_type: order.mold_type, pattern_id: order.pattern_id, heat_treatment: order.heat_treatment, group: '', remarks: '',
  }];
}
export function resolveOrderItem(order: WorkOrder | undefined, itemId?: string): WorkOrderItem | undefined {
  if (!order) return undefined;
  const items = orderItems(order);
  return itemId ? items.find(item => item.id === itemId) : items.find(item => item.id === 'legacy') || (items.length === 1 ? items[0] : undefined);
}
export function batchItem(order: WorkOrder | undefined, batch: Pick<MoldingBatch, 'work_order_item_id'>) {
  return resolveOrderItem(order, batch.work_order_item_id);
}
export function itemMatches(order: WorkOrder, item: WorkOrderItem, itemId?: string): boolean {
  return resolveOrderItem(order, itemId)?.id === item.id;
}
export function itemSummary(items: WorkOrderItem[]) {
  const quantity = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const total = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.estimated_weight), 0);
  return {
    items, quantity, product_name: items.map(item => item.product_name).join('、'),
    material: [...new Set(items.map(item => item.material))].join('、'),
    // 舊欄位只保留相容摘要，所有重量運算均需使用品項本身。
    estimated_weight: quantity ? total / quantity : 0,
  };
}
export function validateOrderItems(items: WorkOrderItem[]): string | null {
  if (!items.length) return '至少需要一個品項';
  if (new Set(items.map(item => item.id)).size !== items.length || items.some(item => !item.id)) return '品項識別碼重複或缺漏';
  for (const [index, item] of items.entries()) {
    const prefix = `品項 ${index + 1}：`;
    if (!item.product_name.trim() || !item.material.trim()) return prefix + '請填寫品名與材質';
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 99999) return prefix + '數量須為1～99,999的整數';
    if (!Number.isFinite(item.estimated_weight) || item.estimated_weight < 0 || item.estimated_weight > 999999) return prefix + '預估單重無效';
  }
  return null;
}
