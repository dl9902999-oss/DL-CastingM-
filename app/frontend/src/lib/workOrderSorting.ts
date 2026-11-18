export type WorkOrderSort = 'serialAsc' | 'serialDesc' | 'categoryAsc' | 'categoryDesc';

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function workOrderSortParts(number: string) {
  // Customer numbers may contain a separator: A-001 or A001.
  const match = number.trim().match(/^WO-\d{8}-([A-Z]+)-?\d+-(.+)$/i);
  return {
    category: match?.[1].toUpperCase() ?? null,
    serial: match && /^\d+$/.test(match[2]) ? match[2] : null,
  };
}

export function compareWorkOrders(
  a: { id: string; order_no: string },
  b: { id: string; order_no: string },
  mode: WorkOrderSort,
) {
  const left = workOrderSortParts(a.order_no);
  const right = workOrderSortParts(b.order_no);
  const categoryMode = mode.startsWith('category');
  const key = categoryMode ? 'category' : 'serial';
  const x = left[key], y = right[key];
  // Unrecognized/manual numbers remain visible at the end in either direction.
  if (x === null && y !== null) return 1;
  if (x !== null && y === null) return -1;
  const direction = mode.endsWith('Asc') ? 1 : -1;
  const primary = x !== null && y !== null ? natural.compare(x, y) * direction : 0;
  if (primary) return primary;
  if (categoryMode) {
    if (left.serial === null && right.serial !== null) return 1;
    if (left.serial !== null && right.serial === null) return -1;
    if (left.serial !== null && right.serial !== null) {
      const secondary = natural.compare(right.serial, left.serial);
      if (secondary) return secondary;
    }
  }
  return natural.compare(a.order_no, b.order_no) || a.id.localeCompare(b.id);
}
