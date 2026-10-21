import type { WorkOrderItem } from './types';
import { emptyOrderItem, validateOrderItems } from './workOrderItems';
export interface PdfOrderDraft {
  order_no: string; customer: string; order_date: string; due_date: string;
  delivery_address: string; remarks: string; source_filename: string; items: WorkOrderItem[];
}
export interface PdfWord { str: string; transform: number[]; width: number; }
const compact = (value: string) => value.replace(/\s/g, '');
const dateValue = (value: string) => value.trim().replace(/\//g, '-');
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validatePdfDraft(draft: PdfOrderDraft): string | null {
  if (!draft.order_no.trim() || !draft.customer.trim()) return '請填寫原工單號與客戶';
  if (!validDate(draft.order_date) || !validDate(draft.due_date)) return '請確認訂貨日期及交期';
  return validateOrderItems(draft.items);
}

/** 依樣本表頭建立欄位區間，不從檔名猜測工單內容。 */
export function parseOrderPage(words: PdfWord[], filename: string): PdfOrderDraft {
  const tokens = words.filter(word => word.str.trim()).map(word => ({ text: word.str.trim(), x: word.transform[4], y: word.transform[5], width: word.width }));
  const find = (label: string) => tokens.find(word => compact(word.text) === label);
  const headerLabels = ['項次','品名','材質','數量','預估重量','模具','模具種類','熱處理','組別','鑄件備註'];
  const headers = headerLabels.map(find);
  if (headers.some(header => !header) || !find('訂貨日期') || !find('預交日期') || !find('廠內訂單編號')) throw new Error('無法辨識此版型或缺少文字層；請使用與範本相同版型的文字PDF。');
  const h = headers.map(header => header!);
  const text = (rows: typeof tokens) => rows.sort((a,b) => Math.abs(a.y-b.y) > 3 ? b.y-a.y : a.x-b.x).map(row => row.text).join(' ');
  const after = (label: string, endX = Infinity) => { const anchor = find(label)!; return text(tokens.filter(word => Math.abs(word.y-anchor.y) < 4 && word.x > anchor.x + anchor.width - 1 && word.x < endX)); };
  const orderDate = find('訂貨日期')!;
  const customer = text(tokens.filter(word => Math.abs(word.y-orderDate.y) < 4 && word.x < orderDate.x));
  const foot = find('送貨地址');
  if (!foot) throw new Error('找不到表格結尾，請確認PDF版型。');
  const centers = h.map(header => header.x + header.width/2);
  const limits = centers.slice(0,-1).map((center,index) => (center+centers[index+1])/2);
  const rows = tokens.filter(word => word.y < h[0].y - 4 && word.y > foot.y + 4 && word.x < limits[0] && /^\d+$/.test(word.text)).sort((a,b) => b.y-a.y);
  const items: WorkOrderItem[] = [];
  for (const [index, row] of rows.entries()) {
    const upper = index === 0 ? (h[0].y + row.y)/2 : (rows[index-1].y+row.y)/2;
    const lower = index+1 < rows.length ? (row.y+rows[index+1].y)/2 : (row.y+foot.y)/2;
    const cells = h.map((_,column) => text(tokens.filter(word => word.y <= upper && word.y > lower && word.x + word.width/2 >= (column ? limits[column-1] : -Infinity) && word.x + word.width/2 < (limits[column] ?? Infinity))));
    if (cells.slice(1).every(cell => !cell)) continue;
    const numeric = (value: string, suffix: RegExp) => { const raw = value.replace(suffix,'').replace(/,/g,'').trim(); return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN; };
    const quantity = numeric(cells[3], /\s*PC\s*$/i);
    const estimatedWeight = numeric(cells[4], /\s*kg\s*$/i);
    const sourceNotes: string[] = [];
    if (!Number.isFinite(quantity)) sourceNotes.push(`PDF原始數量：${cells[3] || '空白'}；需人工確認件數，不自動換算單位。`);
    if (!Number.isFinite(estimatedWeight)) sourceNotes.push(`PDF原始預估單重：${cells[4] || '空白'}；需人工確認，未自動填入0。`);
    const supply = cells[5] === '客戶自備' ? '客戶提供' : cells[5];
    if (!['','客戶提供','公司自有','代客製作'].includes(supply) || !['','上下模','單面模','現板模','保模','中板模','砂心模','其他'].includes(cells[6]) || !['','退火','淬火','回火','正常化','調質','其他'].includes(cells[7])) throw new Error(`項次 ${cells[0]} 的模具或熱處理內容不在支援選項，請確認原文件。`);
    items.push({ ...emptyOrderItem(), line_no: cells[0], product_name: cells[1], material: cells[2], quantity, estimated_weight: estimatedWeight, mold_supply: supply as WorkOrderItem['mold_supply'], mold_type: cells[6] as WorkOrderItem['mold_type'], heat_treatment: cells[7] as WorkOrderItem['heat_treatment'], group: cells[8], remarks: [cells[9], ...sourceNotes].filter(Boolean).join('\n') });
  }
  const note = find('交貨備註'); const handler = find('承辦人');
  const remarks = note ? text(tokens.filter(word => word.y <= note.y+4 && word.y > (handler?.y ?? 0)+5 && word.x > note.x+note.width)) : '';
  const draft: PdfOrderDraft = { order_no: after('廠內訂單編號'), customer, order_date: dateValue(after('訂貨日期',find('預交日期')!.x)), due_date: dateValue(after('預交日期',find('廠內訂單編號')!.x)), delivery_address: after('送貨地址',find('聯絡人')?.x), remarks, source_filename: filename, items };
  if (!items.length) throw new Error('未辨識到任何品項，未建立工單。');
  // 數值缺漏保留為未確認的草稿，由編輯預覽補齊；保存前仍須通過驗證。
  return draft;
}
