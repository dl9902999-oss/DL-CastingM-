/**
 * 熔解管理介面回歸驗證（真實瀏覽器 + 真實登入 + 真實雲端資料）
 *
 * 對應修復目標「編輯熔解紀錄刪除投料／成份後儲存未生效、資料復活、畫面亂跳」：
 * 1. 以 REST API 建立臨時熔解紀錄（3 筆投料 + 1 筆成份），避免動到正式資料。
 * 2. 登入後進入熔解管理，展開紀錄讀取投料／成份明細。
 * 3. 編輯 → 刪除一筆投料 → 儲存，刪除必須真正生效。
 * 4. 儲存後畫面立即刷新，過程中不得再出現已刪除的原料（畫面亂跳）。
 * 5. 重新載入頁面後已刪除的投料不得復活。
 * 6. 清空成份紀錄後儲存，成份必須真的被刪除且不得復活。
 * 7. 直接查雲端確認列數、父紀錄總投料重量與 specific energy 已重算。
 * 8. 清理臨時資料。
 *
 * 一律使用 data-testid 定位（melt-search / melt-card / melt-card-edit /
 * dlg-materials-table / dlg-material-row / dlg-material-remove / dlg-chemistry-table / dlg-save），
 * 避免依賴樣式或文字造成選擇器脆弱。
 */
const { chromium } = require('playwright');
const { existsSync } = require('node:fs');

const BASE = process.env.PREVIEW_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tprroinxufykbsfstfyf.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const log = msg => console.log(`      · ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 雲端 REST 小工具 ----------
const headers = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};
const rest = async (path, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : [];
};

const TEST_MELT_NO = `ML-QA-${Date.now().toString().slice(-8)}`;
const KEEP_MATERIALS = ['QA原料A', 'QA原料B'];
const REMOVED_MATERIAL = 'QA原料C';
const POWER_KWH = 100;
let tempMeltId = null;

const cleanup = async () => {
  if (!tempMeltId) return;
  try {
    await rest(`melt_materials?melt_id=eq.${tempMeltId}`, { method: 'DELETE' });
    await rest(`melt_chemistries?melt_id=eq.${tempMeltId}`, { method: 'DELETE' });
    await rest(`melt_records?id=eq.${tempMeltId}`, { method: 'DELETE' });
    log(`已清理臨時紀錄 ${TEST_MELT_NO}`);
  } catch (e) {
    log(`清理臨時資料失敗（請手動刪除 ${TEST_MELT_NO}）：${e.message}`);
  }
};

(async () => {
  if (!ANON_KEY) {
    console.error('缺少 SUPABASE_ANON_KEY，請以 .env 的 VITE_SUPABASE_ANON_KEY 提供');
    process.exitCode = 1;
    return;
  }

  const executablePath = [
    process.env.CHROME_PATH,
    '/opt/ms-playwright/chromium-1169/chrome-linux/chrome',
    '/opt/ms-playwright/chromium-1223/chrome-linux64/chrome',
    chromium.executablePath(),
  ].filter(Boolean).find(p => existsSync(p));

  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  // 攔截 fetch 以取得「真實」呼叫序列（含方法與狀態碼），
  // 用於判斷儲存流程究竟是提早返回，還是請求送出後失敗。
  await page.addInitScript(() => {
    window.__calls = [];
    const orig = window.fetch;
    window.fetch = async (...args) => {
      const input = args[0];
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (args[1] && args[1].method) || (input && input.method) || 'GET';
      const short = url.split('/rest/v1/')[1] || url;
      try {
        const res = await orig(...args);
        window.__calls.push(`${method} ${res.status} ${short.slice(0, 150)}`);
        return res;
      } catch (e) {
        window.__calls.push(`${method} ERR ${short.slice(0, 150)} :: ${e.message}`);
        throw e;
      }
    };
  });
  const recentCalls = async (n = 20) =>
    (await page.evaluate(count => (window.__calls || []).slice(-count), n).catch(() => [])) || [];

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // 網路類錯誤訊息本身不含 URL，需附上 location 才能判斷來源端點
    const loc = m.location()?.url || '';
    consoleErrors.push(loc ? `${m.text()} @ ${loc}` : m.text());
  });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('response', r => {
    if (r.status() >= 400) {
      failedRequests.push(`${r.status()} ${r.request().method()} ${r.url().replace(SUPABASE_URL, '<sb>')}`);
    }
  });

  try {
    // ---------- 0. 準備臨時測試資料 ----------
    const [rec] = await rest('melt_records', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        melt_no: TEST_MELT_NO,
        melt_date: new Date().toISOString().slice(0, 10),
        material_grade: 'QA材質',
        furnace_no: 'QA爐',
        power_kwh: POWER_KWH,
        tap_temp: 1500,
        created_by: 'QA',
      }),
    });
    tempMeltId = rec.id;

    await rest('melt_materials', {
      method: 'POST',
      body: JSON.stringify([
        { melt_id: tempMeltId, raw_material: KEEP_MATERIALS[0], charge_weight: 100, secondary_weight: 0, subtotal: 100 },
        { melt_id: tempMeltId, raw_material: KEEP_MATERIALS[1], charge_weight: 50, secondary_weight: 0, subtotal: 50 },
        { melt_id: tempMeltId, raw_material: REMOVED_MATERIAL, charge_weight: 30, secondary_weight: 0, subtotal: 30 },
      ]),
    });
    await rest('melt_chemistries', {
      method: 'POST',
      body: JSON.stringify([{ melt_id: tempMeltId, sample_stage: 'TARGET', c_val: 3.5, si_val: 2.2, mn_val: 0.6 }]),
    });
    log(`已建立臨時紀錄 ${TEST_MELT_NO}（3 筆投料 + 1 筆成份，總投料 180 kg）`);
    check('建立臨時測試資料（雲端）', true, TEST_MELT_NO);

    // ---------- 1. 登入 ----------
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#employeeId', { timeout: 30000 });
    await page.fill('#employeeId', process.env.EMP_ID || 'A001');
    await page.fill('#password', process.env.EMP_PW || 'AG001');
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 30000 });
    check('以員工帳號登入成功', true);

    // ---------- 2. 進入熔解管理並定位臨時紀錄 ----------
    const locateCard = async (timeout = 30000) => {
      await page.goto(`${BASE}/melting-management`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="melt-search"]', { timeout });
      await page.fill('[data-testid="melt-search"]', TEST_MELT_NO);
      await sleep(1200);
      const el = page.locator(`[data-testid="melt-card"][data-melt-no="${TEST_MELT_NO}"]`).first();
      await el.waitFor({ state: 'visible', timeout });
      return el;
    };

    const card = await locateCard();
    check('熔解管理頁可找到臨時紀錄', await card.count() > 0, TEST_MELT_NO);

    const dialog = page.locator('[role="dialog"]');

    /** 傾印對話框內所有欄位實際值，用於確認編輯模式是否正確回填 */
    const dumpDialogFields = async (label) => {
      const dump = await dialog.first().evaluate(el => {
        const inputs = Array.from(el.querySelectorAll('input')).map(i => {
          const tid = i.getAttribute('data-testid') || i.getAttribute('placeholder') || i.type;
          return `${tid}=「${i.value}」`;
        });
        const selects = Array.from(el.querySelectorAll('button[role="combobox"], [role="combobox"]')).map(b => (b.textContent || '').trim());
        return { inputs, selects };
      }).catch(() => null);
      log(`【${label}】欄位傾印：inputs=${dump ? dump.inputs.slice(0, 24).join(' , ') : '（無法讀取）'}`);
      log(`【${label}】下拉目前值=[${dump ? dump.selects.join(' | ') : '（無法讀取）'}]`);
    };

    /** 點擊按鈕並追蹤後續雲端呼叫與提示訊息時間軸，用於定位流程中斷點 */
    const traceClick = async (label, button) => {
      const beforeIdx = await page.evaluate(() => (window.__calls || []).length);
      await button.click();
      const timeline = [];
      for (let i = 0; i < 16; i++) {
        await sleep(400);
        const n = await page.evaluate(idx => (window.__calls || []).slice(idx).length, beforeIdx).catch(() => -1);
        const toasts = await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts().catch(() => []);
        timeline.push(`t=${((i + 1) * 0.4).toFixed(1)}s calls=${n}${toasts.length ? ` toast=[${toasts.join('|').slice(0, 120)}]` : ''}`);
      }
      const calls = (await page.evaluate(idx => (window.__calls || []).slice(idx), beforeIdx).catch(() => [])) || [];
      log(`【${label}】呼叫序列（${calls.length} 筆）：\n        ${calls.join('\n        ') || '（無）'}`);
      log(`【${label}】時間軸：${timeline.join(' ; ')}`);
      return calls;
    };

    /** 展開卡片並讀取投料／成份明細（全部以 testid 定位） */
    const readCard = async (target = card) => {
      const expanded = await target.locator('[data-testid="melt-card-materials-count"]').isVisible().catch(() => false);
      if (!expanded) {
        await target.locator('[data-testid="melt-card-toggle"]').click();
        await sleep(1500);
      }
      const matLabel = await target.locator('[data-testid="melt-card-materials-count"]').innerText().catch(() => '');
      const chemLabel = await target.locator('[data-testid="melt-card-chemistry-count"]').innerText().catch(() => '');
      const matNames = (await target
        .locator('[data-testid="melt-card-materials-table"] tbody tr td:first-child')
        .allInnerTexts()
        .catch(() => [])).map(s => s.trim()).filter(Boolean);
      const totalText = await target.locator('[data-testid="melt-card-total-charge"]').innerText().catch(() => '');
      const energyText = await target.locator('text=/kWh\\/kg/').first().innerText().catch(() => '');
      return {
        matCount: Number((matLabel.match(/\((\d+) 筆\)/) || [])[1] ?? -1),
        chemCount: Number((chemLabel.match(/\((\d+) 筆\)/) || [])[1] ?? -1),
        matNames: matNames.filter(n => n !== '合計'),
        totalCharge: Number(totalText.trim()),
        energyText: energyText.replace(/\s+/g, ' ').trim(),
      };
    };

    const before = await readCard();
    log(`展開後：投料 ${before.matCount} 筆、成份 ${before.chemCount} 筆、原料=[${before.matNames.join(', ')}]`);
    check('展開紀錄讀到 3 筆投料明細', before.matCount === 3, `${before.matCount} 筆`);
    check('展開紀錄讀到 1 筆成份紀錄', before.chemCount === 1, `${before.chemCount} 筆`);
    check('投料明細含預期原料', KEEP_MATERIALS.concat(REMOVED_MATERIAL).every(n => before.matNames.includes(n)), before.matNames.join(', '));

    // ---------- 3. 編輯並刪除一筆投料 ----------
    await card.locator('[data-testid="melt-card-edit"]').click();
    await dialog.waitFor({ state: 'visible', timeout: 20000 });
    check('編輯對話框開啟', true);

    const matTable = dialog.locator('[data-testid="dlg-materials-table"]');
    await matTable.waitFor({ state: 'visible', timeout: 15000 });
    const matRows = matTable.locator('[data-testid="dlg-material-row"]');
    // 等投料明細回填完成（載入期間輸入與刪除鈕為鎖定狀態）
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="dlg-material-remove"]');
      return !!btn && !btn.hasAttribute('disabled');
    }, { timeout: 30000 }).catch(() => {});
    const rowCount = await matRows.count();
    log(`編輯對話框投料列數：${rowCount}`);
    check('編輯對話框載入既有投料明細', rowCount === 3, `${rowCount} 列`);

    const targetRow = matTable.locator(`[data-testid="dlg-material-row"][data-material="${REMOVED_MATERIAL}"]`).first();
    check('可定位欲刪除的投料列', await targetRow.count() > 0, REMOVED_MATERIAL);

    await targetRow.locator('[data-testid="dlg-material-remove"]').click();
    await sleep(700);
    const afterRemove = await matRows.count();
    check('對話框內刪除投料列生效', afterRemove === rowCount - 1, `${rowCount} → ${afterRemove}`);

    // ---------- 4. 儲存並監看畫面是否亂跳 ----------
    await traceClick('刪除投料後儲存', dialog.locator('[data-testid="dlg-save"]'));

    let dialogClosed = false;
    try {
      await dialog.waitFor({ state: 'hidden', timeout: 60000 });
      dialogClosed = true;
    } catch { dialogClosed = false; }
    check('儲存後對話框關閉（儲存成功）', dialogClosed);

    // 儲存後連續取樣卡片內容，確認已刪除的原料不會短暫閃回（畫面亂跳）
    let sawGhost = false;
    let last = before;
    for (let i = 0; i < 12; i++) {
      await sleep(400);
      last = await readCard();
      if (last.matNames.includes(REMOVED_MATERIAL)) sawGhost = true;
    }
    log(`儲存後：投料 ${last.matCount} 筆、原料=[${last.matNames.join(', ')}]、總投料=${last.totalCharge}`);
    check('儲存後投料筆數立即由 3 降為 2（刪除生效）', last.matCount === 2, `${before.matCount} → ${last.matCount}`);
    check('儲存後畫面全程未再出現已刪除原料（無亂跳）', !sawGhost, `已刪除「${REMOVED_MATERIAL}」未閃回`);
    check('儲存後成份紀錄未被誤刪', last.chemCount === 1, `${last.chemCount} 筆`);

    // ---------- 5. 重新載入確認未復活 ----------
    const card2 = await locateCard();
    const reloaded = await readCard(card2);
    log(`重新載入後：投料 ${reloaded.matCount} 筆、原料=[${reloaded.matNames.join(', ')}]、總投料=${reloaded.totalCharge}`);
    check('重新載入後已刪除投料未復活', !reloaded.matNames.includes(REMOVED_MATERIAL), `「${REMOVED_MATERIAL}」未復活`);
    check('重新載入後投料筆數與儲存結果一致', reloaded.matCount === 2, `2 → ${reloaded.matCount}`);
    check('重新載入後保留的原料仍完整', KEEP_MATERIALS.every(n => reloaded.matNames.includes(n)), reloaded.matNames.join(', '));

    // ---------- 6. 直接查雲端確認投料刪除落地與父紀錄重算 ----------
    const cloudMats = await rest(`melt_materials?melt_id=eq.${tempMeltId}&select=id,raw_material,charge_weight`);
    const cloudNames = cloudMats.map(m => m.raw_material);
    log(`雲端投料：${cloudNames.join(', ') || '（無）'}`);
    check('雲端已無該筆投料（刪除真正落地）', !cloudNames.includes(REMOVED_MATERIAL), cloudNames.join(', '));
    check('雲端投料列數為 2', cloudMats.length === 2, `${cloudMats.length} 列`);

    const [cloudRec] = await rest(`melt_records?id=eq.${tempMeltId}&select=melt_no,total_charge_weight,specific_energy`);
    const expectedTotal = cloudMats.reduce((s, m) => s + Number(m.charge_weight || 0), 0);
    const expectedEnergy = Math.round((POWER_KWH / expectedTotal) * 1000) / 1000;
    log(`雲端父紀錄總投料=${cloudRec?.total_charge_weight}、明細加總=${expectedTotal}、specific energy=${cloudRec?.specific_energy}`);
    check(
      '父熔解紀錄總投料重量已重算為 150',
      Number(cloudRec?.total_charge_weight) === expectedTotal && expectedTotal === 150,
      `${cloudRec?.total_charge_weight} / 預期 ${expectedTotal}`
    );
    check(
      '父熔解紀錄 specific energy 已依 power_kwh ÷ 總投料重算',
      Number(cloudRec?.specific_energy) === expectedEnergy && expectedEnergy === 0.667,
      `${cloudRec?.specific_energy} / 預期 ${expectedEnergy}`
    );

    const cloudChemBefore = await rest(`melt_chemistries?melt_id=eq.${tempMeltId}&select=id,sample_stage`);
    check('雲端成份紀錄未被誤刪', cloudChemBefore.length === 1, `${cloudChemBefore.length} 列`);

    // ---------- 7. 成份紀錄刪除回歸（清空目標值後儲存，成份必須真的消失） ----------
    await card2.locator('[data-testid="melt-card-edit"]').click();
    await dialog.waitFor({ state: 'visible', timeout: 20000 });
    await dumpDialogFields('成份編輯對話框開啟後');
    const chemTable = dialog.locator('[data-testid="dlg-chemistry-table"]');
    await chemTable.waitFor({ state: 'visible', timeout: 15000 });
    await dumpDialogFields('成份表出現後');

    // 「目標」列為表格首列，成份以 min/max 兩個輸入呈現，全部清空代表不再需要成份紀錄
    const targetInputs = chemTable.locator('tbody tr').first().locator('input');
    const inputCount = await targetInputs.count();
    // 明細回填完成前所有輸入為鎖定狀態（避免晚到的回填覆蓋使用者輸入），
    // 必須等第一個輸入解鎖後才開始清空，否則填入的值會被回填覆蓋。
    await page.waitForFunction(() => {
      const first = document.querySelector('[data-testid^="dlg-chem-TARGET-"][data-testid$="-min"]');
      return !!first && !first.hasAttribute('disabled');
    }, { timeout: 30000 }).catch(() => {});
    for (let i = 0; i < inputCount; i++) {
      await targetInputs.nth(i).fill('0');
    }
    await sleep(400);
    const filled = await targetInputs.evaluateAll(els => els.map(e => e.value));
    log(`已清空成份「目標」列 ${inputCount} 個輸入值（實際值=[${filled.join(',')}]）`);

    const saveBtn = dialog.locator('[data-testid="dlg-save"]');
    const dlgTitle = await dialog.locator('h2').first().innerText().catch(() => '（未知）');
    log(`對話框標題=「${dlgTitle}」（判斷編輯／新增模式）`);
    // 編輯模式必須等主表單與明細回填完成（載入期間儲存鈕為鎖定狀態）
    await saveBtn.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="dlg-save"]');
      return !!btn && !btn.hasAttribute('disabled');
    }, { timeout: 20000 }).catch(() => {});
    await dumpDialogFields('儲存前');
    log(`儲存前對話框數量=${await page.locator('[role="dialog"]').count()}、儲存鈕 disabled=${await saveBtn.isDisabled().catch(() => 'n/a')}`);

    await traceClick('清空成份後儲存', saveBtn);
    log(`儲存後對話框數量=${await page.locator('[role="dialog"]').count()}`);

    let chemDialogClosed = false;
    try {
      await dialog.waitFor({ state: 'hidden', timeout: 60000 });
      chemDialogClosed = true;
    } catch { chemDialogClosed = false; }
    check('成份清空後儲存成功（對話框關閉）', chemDialogClosed);
    if (!chemDialogClosed) {
      const toasts = await page
        .locator('[role="status"], [data-sonner-toast], li[data-state]')
        .allInnerTexts()
        .catch(() => []);
      log(`對話框未關閉，提示訊息=[${toasts.join(' || ').slice(0, 300)}]`);
      log(`近期失敗請求：${failedRequests.slice(-8).join(' | ') || '（無）'}`);
    }

    let chemGhost = false;
    let afterChem = reloaded;
    for (let i = 0; i < 8; i++) {
      await sleep(400);
      afterChem = await readCard(card2);
      if (afterChem.chemCount > 0) chemGhost = true;
    }
    log(`成份清空儲存後：成份 ${afterChem.chemCount} 筆、投料 ${afterChem.matCount} 筆`);
    check('儲存後成份紀錄降為 0 筆（刪除生效）', afterChem.chemCount === 0, `${afterChem.chemCount} 筆`);
    check('儲存後成份未閃回（畫面穩定）', !chemGhost);
    check('成份異動未影響投料明細', afterChem.matCount === 2, `${afterChem.matCount} 筆`);

    const cloudChemAfter = await rest(`melt_chemistries?melt_id=eq.${tempMeltId}&select=id`);
    check('雲端成份紀錄已真的刪除', cloudChemAfter.length === 0, `${cloudChemAfter.length} 列`);

    const card3 = await locateCard();
    const reloadedChem = await readCard(card3);
    check('重新載入後成份紀錄未復活', reloadedChem.chemCount === 0, `${reloadedChem.chemCount} 筆`);
    check('重新載入後投料明細仍為 2 筆', reloadedChem.matCount === 2, `${reloadedChem.matCount} 筆`);

    // ---------- 8. 其他入口可用性 ----------
    for (const [label, expect] of [['庫存管理', /庫存管理/], ['預設配比', /預設配比/], ['材質規範', /材質規範/]]) {
      await page.locator('button', { hasText: label }).first().click();
      await sleep(1300);
      const visible = await page.locator('[role="dialog"]').filter({ hasText: expect }).first().isVisible().catch(() => false);
      check(`「${label}」入口可開啟`, visible);
      await page.keyboard.press('Escape');
      await sleep(700);
    }

    // 500 GET /api/config、users_profile 相關請求屬平台側既有行為（非本次熔解修復範圍），
    // 僅將熔解／成份／投料相關的錯誤視為回歸失敗。
    const isPlatformNoise = e =>
      /\/api\/config/.test(e) ||
      /users_profile/.test(e) ||
      /favicon|React DevTools|chunk size|deprecated/i.test(e);
    const realErrors = consoleErrors.filter(e => !isPlatformNoise(e));
    log(`未預期錯誤（已排除平台既有雜訊）：${realErrors.length} 筆${realErrors.length ? ` → ${realErrors.join(' | ')}` : ''}`);
    check('介面無未預期的執行期錯誤', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

    // 失敗請求需列出實際端點，才能判斷是否屬熔解修復範圍
    const realFailed = failedRequests.filter(e => !isPlatformNoise(e));
    log(`失敗請求（已排除平台既有雜訊）：${realFailed.length} 筆${realFailed.length ? ` → ${realFailed.join(' | ')}` : ''}`);
    check('熔解相關請求無失敗（4xx／5xx）', realFailed.length === 0, realFailed.slice(0, 3).join(' | '));

    await page.screenshot({ path: '/tmp/melting-regression.png' });
    log('已截圖 /tmp/melting-regression.png');
  } catch (err) {
    check('腳本執行完成', false, err.message);
  } finally {
    await browser.close();
    await cleanup();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n=== 總結：${results.length - failed.length}/${results.length} 通過 ===`);
  if (failed.length) {
    console.log('未通過項目：');
    failed.forEach(f => console.log(` - ${f.name}`));
    process.exitCode = 1;
  }
})();
