import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const executablePath = ['/opt/ms-playwright/chromium-1169/chrome-linux/chrome', '/opt/ms-playwright/chromium-1223/chrome-linux64/chrome', chromium.executablePath()].find(existsSync);
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await page.goto('http://localhost:3000');
  const results = await page.evaluate(async () => {
    const { buildMeltResidualRows, buildPourResidualRows, summarizeResidual, residualExportRows } = await import('/src/lib/residualStatistics.ts');
    const melts = [
      { id: 'a', melt_date: '2026-09-01', melt_no: 'ML-1', furnace_no: '1', material_grade: 'FC', total_charge_weight: 999, residual_weight: 30 },
      { id: 'b', melt_date: '2026-09-02', melt_no: 'ML-2', total_charge_weight: 200, residual_weight: 20 },
      { id: 'c', melt_date: '2026-08-31', melt_no: 'ML-3', total_charge_weight: 900, residual_weight: 800 },
    ];
    const materials = [
      { melt_id: 'a', raw_material: '生鐵', charge_weight: 70, secondary_weight: 0 },
      { melt_id: 'a', raw_material: '前爐殘湯', charge_weight: 20, secondary_weight: 10 },
    ];
    const rows = buildMeltResidualRows(melts, materials, '2026-09-01', '2026-09-02');
    const changed = buildMeltResidualRows(melts, materials.map(m => ({ ...m, charge_weight: m.charge_weight + 100 })), '2026-09-01', '2026-09-02');
    const pours = buildPourResidualRows([{ id: 'p', created_at: '2026-09-01T10:00:00Z', pouring_weight: 100, residual_weight: 7 }], '2026-09-01', '2026-09-02');
    return {
      summary: summarizeResidual(rows), changed: summarizeResidual(changed), pour: summarizeResidual(pours),
      single: buildMeltResidualRows(melts, materials, '2026-09-01', '2026-09-01').length,
      empty: summarizeResidual(buildMeltResidualRows(melts, materials, '2099-01-01', '2099-01-02')),
      zero: summarizeResidual([{ baseWeight: 0, residualWeight: 10 }]),
      exported: residualExportRows(rows, '熔解爐次'),
    };
  });
  assert.deepEqual(results.summary, { baseWeight: 300, residualWeight: 50, rate: 16.67 });
  assert.equal(results.changed.residualWeight, 50, '前爐投料異動不可改變本爐殘湯合計');
  assert.deepEqual(results.pour, { baseWeight: 100, residualWeight: 7, rate: 7 });
  assert.equal(results.single, 1);
  assert.deepEqual(results.empty, { baseWeight: 0, residualWeight: 0, rate: 0 });
  assert.equal(results.zero.rate, 0);
  assert.equal(results.exported.at(-1)[6], 50);
  console.log('通過：日期含邊界、單日、空區間、零分母、投料異動不影響本爐殘湯、澆注來源隔離、CSV合計。');
  await page.locator('#employeeId').fill('A001');
  await page.locator('#password').fill('AG001');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/);
  await page.goto('http://localhost:3000/melting-management');
  await page.getByRole('button', { name: '庫存管理', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('開始日期', { exact: true }).fill('2000-01-01');
  await dialog.getByLabel('結束日期', { exact: true }).fill('2099-12-31');
  await dialog.getByText('前爐殘湯投料', { exact: true }).waitFor();
  await dialog.getByText('載入中...', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await dialog.getByTestId('residual-melt').count(), 0);
  async function exportCsv() {
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '匯出', exact: true }).click();
    const download = await downloadPromise;
    return { filename: download.suggestedFilename(), text: readFileSync(await download.path(), 'utf8') };
  }
  const consumption = await exportCsv();
  assert.ok(consumption.filename.startsWith('原料投料統計'));
  assert.ok(consumption.text.includes('前爐殘湯'));
  assert.ok(!consumption.text.includes('總殘湯率'));
  await dialog.getByRole('button', { name: '爐次殘湯', exact: true }).click();
  await dialog.getByTestId('residual-melt').waitFor();
  assert.equal(await dialog.getByText('前爐殘湯投料', { exact: true }).count(), 0);
  const expected = await page.evaluate(async () => {
    const { dsGetMeltRecords, dsGetMeltMaterials, dsGetMeltingRecords } = await import('/src/lib/dataService.ts');
    const { buildMeltResidualRows, buildPourResidualRows, summarizeResidual } = await import('/src/lib/residualStatistics.ts');
    const [melts, materials, pours] = await Promise.all([dsGetMeltRecords(), dsGetMeltMaterials(), dsGetMeltingRecords()]);
    return {
      melt: summarizeResidual(buildMeltResidualRows(melts, materials, '2000-01-01', '2099-12-31')),
      pour: summarizeResidual(buildPourResidualRows(pours, '2000-01-01', '2099-12-31')),
    };
  });
  for (const source of ['melt', 'pour']) {
    const section = dialog.getByTestId(`residual-${source}`);
    assert.equal(await section.getByTestId('residual-total').textContent(), `${expected[source].residualWeight} kg`);
    assert.equal(await section.getByTestId('residual-base').textContent(), `${expected[source].baseWeight} kg`);
  }
  const residual = await exportCsv();
  assert.ok(residual.filename.startsWith('爐次殘湯統計'));
  assert.ok(residual.text.includes('熔解爐次'));
  assert.ok(residual.text.includes('批次澆注'));
  assert.ok(!residual.text.includes('入庫單號'));
  assert.ok(!residual.text.includes('前爐殘湯利用率'));
  await page.screenshot({ path: '/tmp/residual-separation.png', fullPage: true });
  await dialog.getByLabel('開始日期', { exact: true }).fill('2099-01-01');
  await dialog.getByLabel('結束日期', { exact: true }).fill('2099-01-02');
  await dialog.getByText('此日期區間內無熔解紀錄', { exact: true }).waitFor();
  assert.equal(await dialog.getByTestId('residual-melt').getByTestId('residual-total').textContent(), '0 kg');
  await dialog.getByRole('button', { name: '匯出', exact: true }).click();
  await page.getByText('無資料可匯出', { exact: true }).first().waitFor();
  console.log('通過：登入後投料／爐次分頁、真實資料合計、分頁CSV與空區間；未修改正式紀錄。');
} finally {
  await browser.close();
}
