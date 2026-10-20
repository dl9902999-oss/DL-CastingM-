import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(readFileSync('src/lib/dashboardOverview.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('exports', compiled)(module.exports);
const { calculateOverview, emptyOverviewData, latestRecordTime, mergeLocalPourings } = module.exports;
const now = new Date(2026, 9, 19, 12);
const order = (id, quantity = 10, date = '2026-10-21', created = '2026-01-01T00:00:00Z') => ({ id, order_no: id, status: 'Open', quantity, estimated_weight: 20, due_date: date, created_at: created });
const data = {
 ...emptyOverviewData,
 orders: [order('B', 10, '2026-11-02', '2026-01-02T00:00:00Z'), order('A'), order('C', 5, '2026-11-09'), order('D', 4, '2026-11-10'), { ...order('X'), status: 'Cancelled' }, order('S', 2), order('OLD', 1, '2026-10-01')],
 batches: [{ id: 'b1', batch_no: 'B1', work_order_id: 'A', quantity_planned: 10, quantity_completed: 10, status: 'Completed' }, { id: 'b2', batch_no: 'B2', work_order_id: 'S', quantity_planned: 2, quantity_completed: 2, status: 'Completed' }],
 melts: [{ id: 'm1', melt_date: '2026-10-01', power_kwh: 100 }, { id: 'm2', melt_date: '2026-10-31', power_kwh: 600 }, { id: 'old', melt_date: '2026-09-30', power_kwh: 999 }, { id: 'invalid', melt_date: '2026-10-19', power_kwh: 0 }],
 materials: [{ melt_id: 'm1', charge_weight: 100, secondary_weight: 100 }, { melt_id: 'm2', charge_weight: 300, secondary_weight: 0 }, { melt_id: 'old', charge_weight: 9999, secondary_weight: 0 }],
 pourings: [{ id: 'p1', melt_id: 'm1', batch_id: 'b1', pouring_weights: [20, 20, 0, 20] }, { id: 'p2', melt_id: 'm2', batch_id: 'b1', pouring_weights: [20] }, { id: 'p3', melt_id: 'm2', batch_id: 'b2', pouring_weights: [20, 20] }],
 meltings: [{ batch_id: 'b1', pouring_weights: [20, 20, 20], pouring_weight: 60 }],
 inspections: [{ id: 'q1', batch_id: 'b1', type: 'CASTING', result: 'PASS' }, { id: 'q2', batch_id: 'b1', type: 'OUTSOURCE', result: 'CONDITIONAL' }, { id: 'q3', batch_id: 'b2', type: 'CASTING', result: 'FAIL' }],
 defects: [{ id: 'd1', inspection_id: 'q2', batch_id: 'b1' }],
 capas: [{ id: 'c1', inspection_id: 'q1', status: 'OPEN', created_at: '2026-10-01', capa_no: '1' }, { id: 'c2', defect_id: 'd1', status: 'VERIFYING', created_at: '2026-10-02', capa_no: '2' }, { id: 'c3', status: 'OPEN', created_at: '2026-10-03', capa_no: '3' }, { id: 'c4', inspection_id: 'q3', status: 'CLOSED', created_at: '2026-10-03', capa_no: '4' }],
 warehouse: [{ batch_id: 'b1', quantity: 2, created_at: '2026-10-19T00:00:00Z' }, { batch_id: 'b1', quantity: 7, created_at: '2026-09-15T00:00:00Z' }, { batch_id: 'b2', quantity: 2, created_at: '2026-10-19T00:00:00Z' }],
 shipments: [{ work_order_id: 'S', status: 'Shipped', quantity: 2 }, { work_order_id: 'A', status: 'Pending', quantity: 1 }, { work_order_id: 'A', status: 'Pending', quantity: 1 }],
};
const result = calculateOverview(data, now);
assert.equal(result.monthlyCharge, 500);
assert.equal(result.averageEnergy, 1.25);
assert.equal(result.energyCount, 2);
assert.equal(result.missingEnergy, 1);
assert.equal(result.pouredWeight, 120);
assert.equal(result.unpouredWeight, 520);
assert.equal(result.monthlyWarehouseWeight, 40);
assert.deepEqual(result.urgentProduction.map(x => x.id), ['A', 'C', 'OLD', 'B']);
assert.deepEqual(result.urgentShipment.map(x => x.id), ['A', 'OLD', 'B']);
assert.deepEqual(result.exceptions.map(x => x.origin), ['廠內', '廠外', '未分類']);
assert.deepEqual(result.summary.map(x => x.count), [7, 2, 2, 2, 1, 1]);
assert.equal(latestRecordTime([[{ created_at: '2026-01-01T00:00:00Z', updated_at: '2026-10-19T10:00:00Z' }], [{ updated_at: 'bad' }]]), '2026-10-19T10:00:00.000Z');
const empty = calculateOverview(emptyOverviewData, now);
assert.equal(empty.monthlyCharge, 0);
assert.equal(empty.averageEnergy, null);
assert.equal(latestRecordTime([]), null);
const merged = mergeLocalPourings(data.melts, data.pourings, { getItem: key => key === 'melt_pouring_m1' ? JSON.stringify([{ batch_id: 'b1', pouring_weights: [1] }]) : null });
assert.equal(merged.filter(row => row.melt_id === 'm1').length, 1);
assert.equal(merged.find(row => row.melt_id === 'm1').pouring_weights.length, 1);
const bad = mergeLocalPourings(data.melts, data.pourings, { getItem: () => 'bad' });
assert.deepEqual(bad, data.pourings);
const capped = calculateOverview({ ...data, pourings: [{ batch_id: 'b1', pouring_weights: Array(20).fill(1) }] }, now);
assert.equal(capped.pouredWeight, 200);
console.log('通過：月份邊界、明細投料、算術平均能耗、部分澆注重量、取消排除、品檢入庫推估、交期含邊界與逾期、建立順序、階段去重、CAPA分類、時間及本機澆注合併。');
