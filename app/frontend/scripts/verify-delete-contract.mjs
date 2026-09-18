/**
 * 刪除契約驗證腳本（一次性回歸驗證用）
 *
 * 目的：確認 Supabase 的 anon key 對熔解明細表確實可以刪除，且
 * `delete().eq('id', id).select('id')` 會回傳被刪除的列；若 RLS 未開放 DELETE，
 * PostgREST 會回傳 0 列且無錯誤，前端就會誤判為刪除成功（資料復活根因）。
 *
 * 流程：建立臨時熔解紀錄 + 臨時投料 + 臨時成份 → 逐筆刪除並檢查回傳列數 → 清理。
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(line => line.includes('='))
    .map(line => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);

const BASE = `${env.VITE_SUPABASE_URL}/rest/v1`;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, init = {}) {
  const res = await fetch(`${BASE}/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

let meltId = null;

try {
  // 1. 建立臨時熔解紀錄
  const meltNo = `ZZ-DELETECHECK-${Date.now()}`;
  const created = await rest('melt_records', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      melt_no: meltNo,
      melt_date: '2026-09-17',
      material_grade: '驗證用材質',
      furnace_no: 'ZZ',
      power_kwh: 1,
      total_charge_weight: 0,
      specific_energy: 0,
      created_by: 'delete-contract-check',
      residual_weight: 0,
    }),
  });
  meltId = Array.isArray(created.body) ? created.body[0]?.id : created.body?.id;
  record('建立臨時熔解紀錄', Boolean(meltId), `status=${created.status} id=${meltId}`);

  if (!meltId) throw new Error('無法建立臨時熔解紀錄，後續驗證中止');

  // 2. 建立臨時投料與臨時成份
  const matRes = await rest('melt_materials', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ melt_id: meltId, raw_material: 'ZZ驗證料', charge_weight: 10, secondary_weight: 0, subtotal: 10 }),
  });
  const matId = Array.isArray(matRes.body) ? matRes.body[0]?.id : matRes.body?.id;
  record('建立臨時投料明細', Boolean(matId), `status=${matRes.status} id=${matId}`);

  const chemRes = await rest('melt_chemistries', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      melt_id: meltId, sample_stage: 'TARGET',
      c_val: 3.5, si_val: 2.5, mn_val: 0.6, p_val: 0.05, s_val: 0.03,
      ni_val: 0, cr_val: 0, mo_val: 0, cu_val: 0, fe_val: 93.27,
    }),
  });
  const chemId = Array.isArray(chemRes.body) ? chemRes.body[0]?.id : chemRes.body?.id;
  record('建立臨時成份明細', Boolean(chemId), `status=${chemRes.status} id=${chemId}`);

  // 3. 以與前端完全相同的形狀刪除，並檢查回傳列數
  for (const [table, id, label] of [
    ['melt_materials', matId, '投料明細'],
    ['melt_chemistries', chemId, '成份明細'],
  ]) {
    if (!id) { record(`刪除${label}（無 id，跳過）`, false, '前置建立失敗'); continue; }
    // 前端 supabase-js 的 `.delete().select('id')` 會自動帶上
    // `Prefer: return=representation`，這裡必須模擬同樣的請求形狀，
    // 否則 PostgREST 只回 204 無內容，無法驗證實際刪除列數。
    const del = await rest(`${table}?id=eq.${id}&select=id`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    const rows = Array.isArray(del.body) ? del.body : [];
    record(
      `刪除${label}回傳被刪列數`,
      del.status < 300 && rows.length === 1,
      `status=${del.status} deletedRows=${rows.length}`
    );
  }

  // 4. 確認雲端確實已無資料（防復活）
  for (const [table, id, label] of [
    ['melt_materials', matId, '投料明細'],
    ['melt_chemistries', chemId, '成份明細'],
  ]) {
    if (!id) continue;
    const check = await rest(`${table}?id=eq.${id}&select=id`);
    const rows = Array.isArray(check.body) ? check.body : [];
    record(`${label}刪除後雲端查無此列`, rows.length === 0, `remaining=${rows.length}`);
  }

  // 5. 確認父紀錄可更新（編輯儲存第一步依賴 UPDATE 權限）
  const upd = await rest(`melt_records?id=eq.${meltId}&select=id`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ total_charge_weight: 0, specific_energy: 0, updated_at: new Date().toISOString() }),
  });
  const updRows = Array.isArray(upd.body) ? upd.body : [];
  record('熔解紀錄可更新（UPDATE 權限）', upd.status < 300 && updRows.length === 1, `status=${upd.status} updatedRows=${updRows.length}`);
} catch (err) {
  record('驗證流程異常', false, err instanceof Error ? err.message : String(err));
} finally {
  // 清理臨時資料
  if (meltId) {
    await rest(`melt_materials?melt_id=eq.${meltId}`, { method: 'DELETE' });
    await rest(`melt_chemistries?melt_id=eq.${meltId}`, { method: 'DELETE' });
    const cleanup = await rest(`melt_records?id=eq.${meltId}&select=id`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    const rows = Array.isArray(cleanup.body) ? cleanup.body : [];
    console.log(`清理臨時熔解紀錄：status=${cleanup.status} deletedRows=${rows.length}`);
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n=== 總結：${results.length - failed.length}/${results.length} 通過 ===`);
  if (failed.length > 0) process.exitCode = 1;
}
