import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// 直接執行元件中的純彙總邏輯，避免測試另寫一套計算公式。
const source = readFileSync(new URL('../src/components/melting/InventoryManager.tsx', import.meta.url), 'utf8');
function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `找不到測試目標：${start}`);
  return source.slice(from + start.length, to);
}
const definitions = between("type MaterialCategory =", '/** 各分類的顯示樣式與文案 */');
const round = between('function round(', '/** 單一分類的投料統計表格 */');
const normalize = between('function normalizeGrade(', '/**\n * 將回爐料投料列依材質分組。');
const group = between('function buildReturnGradeGroups(', 'interface BalanceRow');
const helpers = `type MaterialCategory =${definitions}\nfunction round(${round}\nfunction normalizeGrade(${normalize}\nfunction buildReturnGradeGroups(${group}`;
function run(body, inputs) {
  const code = ts.transpileModule(`${helpers}\nfunction calculate(){${body}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(inputs), `${code}\nreturn calculate();`)(...Object.values(inputs));
}
const aggregateBody = between('const consumptionRows = useMemo<ConsumptionRow[]>(() => {', '}, [meltMaterials, meltDateMap, inRange, meltGradeMap, gradeMeltWeight, totalMeltWeight]);');
const balanceBody = between('const balanceRows = useMemo<BalanceRow[]>(() => {', '}, [receipts, consumptionRows, inRange]);');
const fixtures = {
  meltMaterials: [
    { melt_id: 'a', raw_material: '回爐料', charge_weight: 20, secondary_weight: 5 },
    { melt_id: 'a', raw_material: ' 回爐料 ', charge_weight: 3, secondary_weight: 2 },
    { melt_id: 'b', raw_material: '回爐料', charge_weight: 70, secondary_weight: 10 },
    { melt_id: 'c', raw_material: '回爐料', charge_weight: 10, secondary_weight: 0 },
    { melt_id: 'b', raw_material: '冒口', charge_weight: 20, secondary_weight: 0 },
    { melt_id: 'u', raw_material: '回爐料', charge_weight: 7, secondary_weight: 0 },
    { melt_id: 'old', raw_material: '回爐料', charge_weight: 900, secondary_weight: 0 },
    { melt_id: 'orphan', raw_material: '回爐料', charge_weight: 900, secondary_weight: 0 },
    { melt_id: 'a', raw_material: '前爐殘湯', charge_weight: 10, secondary_weight: 2 },
    { melt_id: 'b', raw_material: '前爐殘湯', charge_weight: 5, secondary_weight: 0 },
    { melt_id: 'a', raw_material: '生鐵', charge_weight: 40, secondary_weight: 0 },
    { melt_id: 'b', raw_material: '生鐵', charge_weight: 30, secondary_weight: 0 },
  ],
  meltDateMap: { a: '2026-09-01', b: '2026-09-02', c: '2026-09-02', u: '2026-09-02', old: '2026-08-31' },
  meltGradeMap: { a: 'FC250', b: 'FCD450', c: ' FC250 ', u: '' },
  gradeMeltWeight: { FC250: 200, FCD450: 400, 未分類材質: 0 },
  totalMeltWeight: 600,
  inRange: date => !!date && date >= '2026-09-01' && date <= '2026-09-02',
};
const rows = run(aggregateBody, fixtures);
const fc = rows.find(r => r.category === 'RETURN' && r.grade === 'FC250');
const fcd = rows.find(r => r.raw_material === '回爐料' && r.grade === 'FCD450');
assert.equal(fc.total, 40);
assert.equal(fc.charge_weight, 33);
assert.equal(fc.secondary_weight, 7);
assert.equal(fc.melt_count, 2);
assert.equal(fc.ratio, 20);
assert.equal(fcd.total, 80);
assert.equal(fcd.ratio, 20);
assert.equal(fcd.melt_count, 1);
assert.equal(rows.find(r => r.grade === '未分類材質').ratio, 0);
assert.equal(rows.find(r => r.category === 'RESIDUAL').total, 17);
assert.equal(rows.find(r => r.category === 'PURCHASED').total, 70);
const groups = run("return buildReturnGradeGroups(rows.filter(r => r.category === 'RETURN'));", { rows });
assert.equal(groups.find(g => g.grade === 'FCD450').total, 100);
assert.equal(groups.find(g => g.grade === 'FCD450').melt_total, 400);
assert.equal(groups.find(g => g.grade === 'FCD450').ratio, 25);
assert.equal(groups.reduce((sum, g) => sum + g.total, 0), 147);
const reverseRows = run(aggregateBody, { ...fixtures, meltMaterials: [...fixtures.meltMaterials].reverse() });
assert.equal(reverseRows.find(r => r.raw_material === '回爐料' && r.grade === 'FC250').total, 40);
const singleDay = run(aggregateBody, { ...fixtures, inRange: date => date === '2026-09-01' });
assert.equal(singleDay.filter(r => r.category === 'RETURN').length, 1);
assert.equal(singleDay.find(r => r.category === 'RETURN').total, 30);
assert.deepEqual(run(aggregateBody, { ...fixtures, inRange: () => false }), []);
const balances = run(balanceBody, { consumptionRows: rows, receipts: [{ raw_material: '回爐料', receipt_date: '2026-09-01', weight: 200 }], inRange: fixtures.inRange });
const balance = balances.find(r => r.raw_material === '回爐料');
assert.equal(balance.used, 127);
assert.equal(balance.balance, 73);
console.log('通過：同名回爐料跨當爐材質分組、首次與二次重量、爐次去重、材質小計與比例、未分類及零分母、日期範圍、順序無關、殘湯隔離、結算不漏算。');
