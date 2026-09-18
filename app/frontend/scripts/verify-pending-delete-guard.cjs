/**
 * 待同步刪除守衛回歸測試（直接載入 src/lib/pendingSyncGuard.ts 實際原始碼）
 *
 * 驗證「刪除投料／成份後資料復活」的核心防護：
 * 1. 表名別名正規化：pending queue 使用 `melt_chemistry`，Realtime 使用
 *    `melt_chemistries`，兩者必須視為同一張表，否則過濾會失效導致資料復活。
 * 2. filterPendingDeletes 必須濾掉待刪除列、保留其他列。
 * 3. purgePendingDeletesFromStorage 必須清掉本地殘留，避免孤兒資料保護把
 *    已刪除的明細合併回畫面。
 * 4. 只有 delete 動作會被過濾；create／update 不得被誤濾。
 * 5. 缺少 data.id 的刪除項目不得造成例外。
 */
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const ts = require('typescript');
const sourcePath = join(process.cwd(), 'src/lib/pendingSyncGuard.ts');
const source = readFileSync(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

const tmpFile = join(os.tmpdir(), `pending-sync-guard-${Date.now()}.cjs`);
writeFileSync(tmpFile, outputText, 'utf8');

// localStorage 記憶體替身（守衛模組於呼叫時才存取 localStorage）
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const guard = require(tmpFile);
const PENDING_KEY = guard.PENDING_SYNC_KEY;
const MELT_STORAGE_KEY = 'foundry_melt_materials';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const setQueue = entries => store.set(PENDING_KEY, JSON.stringify(entries));
const setLocalRows = rows => store.set(MELT_STORAGE_KEY, JSON.stringify(rows));

// --- 情境：使用者刪除 1 筆投料與 1 筆成份，雲端尚未同步完成 ---
setQueue([
  { id: 'q1', table: 'melt_chemistry', action: 'delete', timestamp: Date.now(), data: { id: 'chem-1' } },
  { id: 'q2', table: 'melt_materials', action: 'delete', timestamp: Date.now(), data: { id: 'mat-1' } },
  { id: 'q3', table: 'melt_materials', action: 'create', timestamp: Date.now(), data: { id: 'mat-new' } },
  { id: 'q4', table: 'melt_materials', action: 'update', timestamp: Date.now(), data: { id: 'mat-2' } },
  { id: 'q5', table: 'melt_materials', action: 'delete', timestamp: Date.now() },
]);
setLocalRows([
  { id: 'mat-1', raw_material: '已刪除的投料' },
  { id: 'mat-2', raw_material: '保留的投料' },
  { id: 'mat-new', raw_material: '新增的投料' },
]);

// 1. 別名正規化：以 Realtime 的實際表名查詢，必須找到 pending queue 中
//    以 `melt_chemistry` 記錄的刪除項目。
const chemIdsViaRealName = guard.getPendingDeleteIds('melt_chemistries');
const chemIdsViaAlias = guard.getPendingDeleteIds('melt_chemistry');
check(
  '成份表別名正規化（melt_chemistry ↔ melt_chemistries）',
  chemIdsViaRealName.has('chem-1') && chemIdsViaAlias.has('chem-1'),
  `realName=[${[...chemIdsViaRealName]}] alias=[${[...chemIdsViaAlias]}]`
);

// 2. 成份明細過濾：雲端回傳的舊成份列必須被濾掉
const chemRows = guard.filterPendingDeletes('melt_chemistry', [
  { id: 'chem-1' },
  { id: 'chem-2' },
]);
check('成份明細過濾掉待刪除列', chemRows.length === 1 && chemRows[0].id === 'chem-2', `remaining=[${chemRows.map(r => r.id)}]`);

// 3. 投料明細過濾：只濾 delete，create／update 對應的列必須保留
const matRows = guard.filterPendingDeletes('melt_materials', [
  { id: 'mat-1' },
  { id: 'mat-2' },
  { id: 'mat-new' },
]);
check(
  '投料明細僅濾除 delete，保留 update／create 列',
  matRows.length === 2 && matRows.some(r => r.id === 'mat-2') && matRows.some(r => r.id === 'mat-new'),
  `remaining=[${matRows.map(r => r.id)}]`
);

// 4. 缺少 data.id 的刪除項目不得拋錯，也不得誤濾任何列
let noIdOk = false;
try {
  const rows = guard.filterPendingDeletes('melt_materials', [{ id: 'mat-2' }]);
  noIdOk = rows.length === 1;
} catch { noIdOk = false; }
check('缺少 data.id 的刪除項目不影響過濾', noIdOk);

// 5. 本地殘留清理：purge 後已刪除列不得留在 localStorage
guard.purgePendingDeletesFromStorage('melt_materials', MELT_STORAGE_KEY);
const afterPurge = JSON.parse(store.get(MELT_STORAGE_KEY));
check(
  '本地殘留清理移除已刪除列',
  afterPurge.length === 2 && !afterPurge.some(r => r.id === 'mat-1'),
  `localIds=[${afterPurge.map(r => r.id)}]`
);

// 6. 跨表查詢不互相污染
check('成份刪除不會影響投料表判定', guard.getPendingDeleteIds('melt_materials').has('mat-1') && !guard.getPendingDeleteIds('melt_materials').has('chem-1'));

// 7. hasPendingSyncForTable 亦須支援別名
check(
  'hasPendingSyncForTable 支援別名',
  guard.hasPendingSyncForTable('melt_chemistries') && guard.hasPendingSyncForTable('melt_materials')
);

// 8. 無待同步項目時原樣回傳（不得誤刪資料）
setQueue([]);
const untouched = guard.filterPendingDeletes('melt_materials', [{ id: 'mat-1' }, { id: 'mat-2' }]);
check('無待同步刪除時資料原樣回傳', untouched.length === 2);

const failed = results.filter(r => !r.ok);
console.log(`\n=== 總結：${results.length - failed.length}/${results.length} 通過 ===`);
if (failed.length > 0) process.exitCode = 1;
