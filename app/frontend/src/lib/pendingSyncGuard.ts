/**
 * 待同步刪除保護（Pending Delete Guard）
 *
 * 刪除動作在離線或 RLS 被擋時會進入 `foundry_pending_sync` 佇列等待上傳，
 * 但雲端上的舊資料此時仍然存在。若讀取流程把雲端結果與本地資料合併，
 * 已經被使用者刪除的明細就會「復活」回畫面。
 *
 * 這裡集中提供「待刪除 id」的查詢與過濾工具，供資料層（dataService）、
 * 本地儲存層（store）與 Realtime 同步層（realtimeSync）共用，
 * 避免三者互相 import 造成循環依賴。
 *
 * 另一層保護是「刪除墓碑」（`foundry_deleted_ids`）：
 * 本地快取若仍殘留已刪除的列，任何「本地孤兒資料合併」或「整表背景 upsert」
 * 都會把它重新寫回雲端與畫面。墓碑在刪除成功後仍然保留一段時間，
 * 讓三條路徑都能一致地排除這些 id。
 */

export const PENDING_SYNC_KEY = 'foundry_pending_sync';
export const DELETED_IDS_KEY = 'foundry_deleted_ids';

/** 刪除墓碑保留時間：24 小時，足以涵蓋跨裝置同步與重新整理的各種時序 */
const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 資料表名稱正規化。
 *
 * 同一張雲端表在不同層可能出現不同寫法：資料層與 pending queue 使用
 * `melt_chemistry`（歷史命名），Realtime 監聽則使用實際表名 `melt_chemistries`。
 * 若不統一，Realtime 刷新時會查不到待刪除 id，已刪除的成份明細就會復活。
 */
const TABLE_ALIASES: Record<string, string> = {
  melt_chemistry: 'melt_chemistries',
  pattern_histories: 'pattern_history',
  pattern_maintenances: 'pattern_maintenance',
};

/** 將各種表名寫法收斂為同一個鍵值，供待刪除佇列與墓碑比對使用 */
export function normalizeTableName(table: string): string {
  return TABLE_ALIASES[table] ?? table;
}

export interface PendingSyncQueueEntry {
  id: string;
  table: string;
  action: 'create' | 'update' | 'delete';
  timestamp: number;
  data?: Record<string, unknown>;
  retryCount?: number;
}

/** 讀取目前所有待同步佇列項目（解析失敗時回傳空陣列） */
export function readPendingSyncQueue(): PendingSyncQueueEntry[] {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PendingSyncQueueEntry[]) : [];
  } catch {
    return [];
  }
}

/** 取得某張表尚未同步完成的刪除 id 集合 */
export function getPendingDeleteIds(table: string): Set<string> {
  const ids = new Set<string>();
  const target = normalizeTableName(table);
  for (const entry of readPendingSyncQueue()) {
    if (normalizeTableName(entry.table) !== target || entry.action !== 'delete') continue;
    const id = entry.data?.id;
    if (typeof id === 'string' && id) ids.add(id);
  }
  return ids;
}

/** 該表是否有任何待同步項目（create／update／delete） */
export function hasPendingSyncForTable(table: string): boolean {
  const target = normalizeTableName(table);
  return readPendingSyncQueue().some(entry => normalizeTableName(entry.table) === target);
}

// ============================================================
// 刪除墓碑（Deleted ID Tombstones）
// ============================================================

interface TombstoneStore {
  [normalizedTable: string]: Record<string, number>; // id -> 刪除時間
}

function readTombstones(): TombstoneStore {
  try {
    const raw = localStorage.getItem(DELETED_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as TombstoneStore)
      : {};
  } catch {
    return {};
  }
}

function writeTombstones(store: TombstoneStore): void {
  try {
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(store));
  } catch {
    /* 容量不足時放棄墓碑寫入，不影響主要流程 */
  }
}

/** 清掉超過保留期限的墓碑，避免 localStorage 無限成長 */
function pruneExpired(store: TombstoneStore): TombstoneStore {
  const now = Date.now();
  const pruned: TombstoneStore = {};
  for (const [table, ids] of Object.entries(store)) {
    const alive: Record<string, number> = {};
    for (const [id, ts] of Object.entries(ids)) {
      if (typeof ts === 'number' && now - ts < TOMBSTONE_TTL_MS) alive[id] = ts;
    }
    if (Object.keys(alive).length > 0) pruned[table] = alive;
  }
  return pruned;
}

/**
 * 標記某張表的一批 id 為「已刪除」。
 * 刪除成功或失敗都應呼叫：成功時防止舊快取被合併回畫面，
 * 失敗（進入 pending queue）時則與待刪佇列形成雙重保護。
 */
export function markDeletedIds(table: string, ids: string[]): void {
  const valid = ids.filter(id => typeof id === 'string' && id);
  if (valid.length === 0) return;
  const store = pruneExpired(readTombstones());
  const target = normalizeTableName(table);
  const bucket = store[target] ?? {};
  const now = Date.now();
  for (const id of valid) bucket[id] = now;
  store[target] = bucket;
  writeTombstones(store);
}

/** 取得某張表的刪除墓碑 id 集合（已含期限清理） */
export function getDeletedIds(table: string): Set<string> {
  const target = normalizeTableName(table);
  const store = readTombstones();
  const bucket = store[target];
  if (!bucket) return new Set<string>();
  const now = Date.now();
  return new Set(
    Object.entries(bucket)
      .filter(([, ts]) => typeof ts === 'number' && now - ts < TOMBSTONE_TTL_MS)
      .map(([id]) => id)
  );
}

/** 移除墓碑（例如使用者重新建立了相同 id，或雲端已確認刪除後不再需要） */
export function clearDeletedIds(table: string, ids: string[]): void {
  if (ids.length === 0) return;
  const store = pruneExpired(readTombstones());
  const target = normalizeTableName(table);
  const bucket = store[target];
  if (!bucket) return;
  for (const id of ids) delete bucket[id];
  if (Object.keys(bucket).length === 0) delete store[target];
  writeTombstones(store);
}

/** 過濾掉帶有刪除墓碑的資料 */
export function filterDeletedIds<T extends { id?: unknown }>(table: string, items: T[]): T[] {
  const ids = getDeletedIds(table);
  if (ids.size === 0) return items;
  return items.filter(item => typeof item.id !== 'string' || !ids.has(item.id));
}

/** 從 localStorage 的資料陣列中直接移除帶有刪除墓碑的資料 */
export function purgeDeletedFromStorage(table: string, storageKey: string): void {
  const ids = getDeletedIds(table);
  if (ids.size === 0) return;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items)) return;
    const filtered = (items as Array<{ id?: unknown }>).filter(
      item => typeof item.id !== 'string' || !ids.has(item.id)
    );
    if (filtered.length !== items.length) {
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    }
  } catch {
    /* 解析失敗時保留原資料，不影響讀取流程 */
  }
}

/**
 * 綜合過濾：同時排除「待同步刪除」與「刪除墓碑」的資料。
 * 這是所有讀取與合併路徑的統一入口，避免任一層漏掉而讓明細復活。
 */
export function filterRemovedIds<T extends { id?: unknown }>(table: string, items: T[]): T[] {
  if (!Array.isArray(items) || items.length === 0) return items;
  return filterDeletedIds(table, filterPendingDeletes(table, items));
}

// ============================================================
// 待同步刪除過濾
// ============================================================

/**
 * 過濾掉仍在待同步刪除佇列中的資料。
 * 這是防止「刪除後重新整理又出現」的關鍵：雲端還沒真的刪掉之前，
 * 這些資料一律不得進入畫面或本地快取。
 */
export function filterPendingDeletes<T extends { id?: unknown }>(table: string, items: T[]): T[] {
  const ids = getPendingDeleteIds(table);
  if (ids.size === 0) return items;
  return items.filter(item => typeof item.id !== 'string' || !ids.has(item.id));
}

/**
 * 直接從 localStorage 的資料陣列中移除待同步刪除的資料，
 * 避免後續的「本地獨有資料合併保護」把它們當成孤兒資料而復活。
 */
export function purgePendingDeletesFromStorage(table: string, storageKey: string): void {
  const ids = getPendingDeleteIds(table);
  if (ids.size === 0) return;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items)) return;
    const filtered = (items as Array<{ id?: unknown }>).filter(
      item => typeof item.id !== 'string' || !ids.has(item.id)
    );
    if (filtered.length !== items.length) {
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    }
  } catch {
    /* 解析失敗時保留原資料，不影響讀取流程 */
  }
}

/**
 * 同時清理「待同步刪除」與「刪除墓碑」的本地殘留。
 * 讀取流程開頭呼叫，確保後續的本地合併不會撈到已刪除的列。
 */
export function purgeRemovedFromStorage(table: string, storageKey: string): void {
  purgePendingDeletesFromStorage(table, storageKey);
  purgeDeletedFromStorage(table, storageKey);
}
