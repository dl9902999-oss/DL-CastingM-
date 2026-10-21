import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
globalThis.WebSocket ??= WebSocket;
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, name => dependencies[name]);
  return exports;
}
const helpers = load('src/lib/workOrderItems.ts');
const parser = load('src/lib/workOrderPdf.ts', { './workOrderItems': helpers });
const overview = load('src/lib/dashboardOverview.ts', { './workOrderItems': helpers });
const document = await getDocument({ data: new Uint8Array(readFileSync('/workspace/uploads/005467 宗達 2026-10-21.pdf')), useSystemFonts: true }).promise;
let draft;
try {
  const page = await document.getPage(1);
  draft = parser.parseOrderPage((await page.getTextContent()).items, '005467 宗達 2026-10-21.pdf');
} finally { await document.destroy(); }
assert.equal(draft.order_no, '005467');
assert.equal(draft.customer, '宗達');
assert.equal(draft.due_date, '2026-11-11');
assert.equal(draft.order_date, '2026-10-21');
assert.equal(draft.delivery_address, '台中');
assert.deepEqual(draft.items.map(item => [item.product_name, item.quantity, item.estimated_weight, item.mold_supply]), [['上牙板', 1, 80, '客戶提供'], ['下牙板', 2, 80, '客戶提供']]);
assert.equal(parser.validatePdfDraft(draft), null);
assert.match(draft.remarks, /紅丹漆/);
assert.throws(() => parser.parseOrderPage([], '掃描.pdf'));
assert.ok(parser.validatePdfDraft({ ...draft, due_date: '2026-02-30' }));
assert.ok(helpers.validateOrderItems([{ ...draft.items[0], quantity: 1.5 }]));
assert.ok(helpers.validateOrderItems([draft.items[0], draft.items[0]]));
const items = draft.items.map((item, index) => ({ ...item, estimated_weight: index ? 30 : 80 }));
const order = { id: 'o', order_no: '005467', ...helpers.itemSummary(items), status: 'Open', created_at: '2026-10-21T00:00:00Z', due_date: '2026-11-11' };
const batches = items.map((item,index) => ({ id: `b${index}`, batch_no: `B${index}`, work_order_id: 'o', work_order_item_id: item.id, product_name: item.product_name, quantity_planned: item.quantity, quantity_completed: item.quantity, status: 'Completed' }));
const result = overview.calculateOverview({ ...overview.emptyOverviewData, orders: [order], batches,
  pourings: [{ batch_id: 'b0', pouring_weights: [80] }, { batch_id: 'b1', pouring_weights: [30, 0] }],
  warehouse: [{ batch_id: 'b1', quantity: 1, created_at: '2026-10-21T12:00:00Z' }],
  inspections: [{ id: 'q', batch_id: 'b1', result: 'PASS' }],
  shipments: [{ work_order_id: 'o', work_order_item_id: items[0].id, quantity: 1, status: 'Shipped' }],
}, new Date(2026,9,25,12));
assert.equal(result.pouredWeight, 110);
assert.equal(result.unpouredWeight, 30);
assert.equal(result.monthlyWarehouseWeight, 30);
assert.equal(result.urgentShipment.length, 0);
assert.deepEqual(result.summary.map(row => row.count), [1,1,1,1,1,0]);
assert.equal(helpers.resolveOrderItem(order, items[1].id).estimated_weight, 30);
assert.equal(helpers.resolveOrderItem(order), undefined);
const legacy = { id:'old', product_name:'舊品', material:'FC', quantity:4, estimated_weight:10 };
assert.equal(helpers.orderItems(legacy)[0].id, 'legacy');
assert.equal(helpers.resolveOrderItem(legacy).quantity,4);
console.log('通過：原PDF兩品項／原單號／日期與備註、錯誤版型拒絕、多品項重量、工單去重與舊單相容。');

const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => { const at=line.indexOf('='); return [line.slice(0,at),line.slice(at+1).trim().replace(/^['"]|['"]$/g,'')]; }));
const client = createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY);
const id = crypto.randomUUID(); const orderNo = `TEST-MULTI-${id}`;
const inserted = [];
const must = result => { if (result.error) throw new Error(result.error.message); return result.data; };
try {
  const saved = must(await client.from('work_orders').insert({ id, ...draft, ...helpers.itemSummary(items), order_no: orderNo }).select().single());
  inserted.push(['work_orders',id]);
  assert.equal(saved.items.length,2); assert.equal(saved.quantity,3);
  const duplicate = await client.from('work_orders').insert({ ...draft, ...helpers.itemSummary(items), order_no: orderNo });
  assert.equal(duplicate.error?.code,'23505');
  const batchId = crypto.randomUUID();
  const batch = must(await client.from('molding_batches').insert({ id:batchId,batch_no:`TEST-${batchId}`,work_order_id:id,work_order_item_id:items[1].id,quantity_planned:1,quantity_completed:0 }).select().single());
  inserted.push(['molding_batches',batchId]);
  assert.equal(batch.product_name,'下牙板'); assert.equal(batch.work_order_item_id,items[1].id);
  const overBatch = await client.from('molding_batches').insert({ batch_no:`TEST-${crypto.randomUUID()}`,work_order_id:id,work_order_item_id:items[1].id,quantity_planned:2 });
  assert.equal(overBatch.error?.code,'P0001');
  const missingItem = await client.from('molding_batches').insert({ batch_no:`TEST-${crypto.randomUUID()}`,work_order_id:id,quantity_planned:1 });
  assert.equal(missingItem.error?.code,'P0001');
  const inspectionId=crypto.randomUUID();
  must(await client.from('quality_inspections').insert({ id:inspectionId, inspection_no:`TEST-${inspectionId}`,type:'CASTING',batch_id:batchId,batch_no:batch.batch_no,work_order_id:id,order_no:orderNo,product_name:'下牙板',inspection_date:'2026-10-21',inspector:'自動驗證',result:'PASS',inspected_quantity:1,pass_quantity:1 }));
  inserted.push(['quality_inspections',inspectionId]);
  const warehouseId=crypto.randomUUID();
  must(await client.from('warehouse_entries').insert({ id:warehouseId,batch_id:batchId,batch_no:batch.batch_no,location:'測試',quantity:1 }));
  inserted.push(['warehouse_entries',warehouseId]);
  const shipmentId=crypto.randomUUID();
  const shipment=must(await client.from('shipment_orders').insert({ id:shipmentId,shipment_no:`TEST-${shipmentId}`,work_order_id:id,work_order_item_id:items[1].id,order_no:orderNo,customer:draft.customer,quantity:1,ship_date:'2026-11-11' }).select().single());
  inserted.push(['shipment_orders',shipmentId]);
  assert.equal(shipment.work_order_item_id,items[1].id);
  const overShipment=await client.from('shipment_orders').insert({shipment_no:`TEST-${crypto.randomUUID()}`,work_order_id:id,work_order_item_id:items[1].id,customer:draft.customer,quantity:2,ship_date:'2026-11-11'});
  assert.equal(overShipment.error?.code,'P0001');
  const removed=await client.from('work_orders').update({items:[items[0]]}).eq('id',id);
  assert.equal(removed.error?.code,'P0001');
  must(await client.from('work_orders').update({ delivery_address:'測試地址更新' }).eq('id',id));
  const reread=must(await client.from('work_orders').select('items,delivery_address').eq('id',id).single());
  assert.equal(reread.items.length,2); assert.equal(reread.delivery_address,'測試地址更新');
  console.log('通過：雲端工單與品項保存／重讀／更新、批次品名帶入、品檢與入庫關聯、出貨品項、重複工單與超量拒絕、關聯品項刪除保護。');
} finally {
  const errors=[];
  for (const [table,recordId] of inserted.reverse()) { const result=await client.from(table).delete().eq('id',recordId); if(result.error) errors.push(`${table}: ${result.error.message}`); }
  if(errors.length) throw new Error(`測試資料清理失敗：${errors.join('；')}`);
}
console.log('測試工單及相關資料已清除，未匯入正式樣本工單。');
