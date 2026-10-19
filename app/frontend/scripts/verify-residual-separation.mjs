import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const executablePath = ['/opt/ms-playwright/chromium-1169/chrome-linux/chrome', '/opt/ms-playwright/chromium-1223/chrome-linux64/chrome', chromium.executablePath()].find(existsSync);
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await page.goto('http://localhost:3000');
  const results = await page.evaluate(async () => {
    const { buildMeltResidualRows, buildPourResidualRows, buildPreviousResidualRows, summarizeResidual, residualExportRows } = await import('/src/lib/residualStatistics.ts');
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
    const previous = buildPreviousResidualRows(melts, materials, '2026-09-01', '2026-09-02');
    return {
      previous: summarizeResidual(previous), previousRows: previous,
      previousChanged: summarizeResidual(buildPreviousResidualRows(melts.map(r => ({ ...r, residual_weight: 888 })), materials, '2026-09-01', '2026-09-02')),
      previousEmpty: summarizeResidual(buildPreviousResidualRows(melts, materials, '2099-01-01', '2099-01-02')),
      summary: summarizeResidual(rows), changed: summarizeResidual(changed), pour: summarizeResidual(pours),
      single: buildMeltResidualRows(melts, materials, '2026-09-01', '2026-09-01').length,
      empty: summarizeResidual(buildMeltResidualRows(melts, materials, '2099-01-01', '2099-01-02')),
      zero: summarizeResidual([{ baseWeight: 0, residualWeight: 10 }]),
      residualOnly: summarizeResidual(buildMeltResidualRows(melts, materials.filter(m => m.raw_material === '前爐殘湯'), '2026-09-01', '2026-09-02')),
      previousOnlyChanged: summarizeResidual(buildMeltResidualRows(melts, materials.map(m => m.raw_material === '前爐殘湯' ? { ...m, charge_weight: 999 } : m), '2026-09-01', '2026-09-02')),
      exported: residualExportRows(rows, '熔解爐次'),
    };
  });
  assert.deepEqual(results.previous, { baseWeight: 70, residualWeight: 30, rate: 42.86 });
  assert.deepEqual(results.previousChanged, results.previous);
  assert.deepEqual(results.previousEmpty, { baseWeight: 0, residualWeight: 0, rate: 0 });
  assert.equal(results.previousRows.find(row => row.id === 'a').chargeWeight, 20);
  assert.equal(results.previousRows.find(row => row.id === 'a').secondaryWeight, 10);
  assert.equal(results.previousRows.find(row => row.id === 'b').residualWeight, 0);
  assert.deepEqual(results.summary, { baseWeight: 70, residualWeight: 50, rate: 71.43 });
  assert.equal(results.changed.residualWeight, 50, '前爐投料異動不可改變本爐殘湯合計');
  assert.deepEqual(results.pour, { baseWeight: 100, residualWeight: 7, rate: 7 });
  assert.equal(results.single, 1);
  assert.deepEqual(results.empty, { baseWeight: 0, residualWeight: 0, rate: 0 });
  assert.equal(results.zero.rate, 0);
  assert.deepEqual(results.residualOnly, { baseWeight: 0, residualWeight: 50, rate: 0 });
  assert.deepEqual(results.previousOnlyChanged, results.summary);
  assert.equal(results.exported.at(-1)[5], 70);
  assert.equal(results.exported.at(-1)[6], 50);
  console.log('通過：日期含邊界、單日、空區間、零分母、投料異動不影響本爐殘湯、澆注來源隔離、CSV合計。');
  await page.locator('#employeeId').fill('A001');
  await page.locator('#password').fill('AG001');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/);
  await page.goto('http://localhost:3000/melting-management');
  await page.getByTestId('melt-list').getByTestId('melt-card').first().waitFor();
  const listNumbers = () => page.getByTestId('melt-list').getByTestId('melt-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-melt-no')));
  const descending = await listNumbers();
  assert.ok(descending.length > 1, '排序驗證需至少兩筆紀錄');
  await page.getByTestId('melt-date-sort').click();
  await page.getByRole('option', { name: '日期升冪（舊到新）' }).click();
  assert.deepEqual(await listNumbers(), [...descending].reverse());
  await page.getByTestId('melt-date-sort').click();
  await page.getByRole('option', { name: '日期降冪（新到舊）' }).click();
  assert.deepEqual(await listNumbers(), descending);
  const dateOrder = await page.evaluate(async () => {
    const { compareMelts } = await import('/src/lib/meltSequence.ts');
    const records = [
      { id: 'c', melt_date: '2026-09-02', melt_no: 'ML-1', created_at: '2026-01-01' },
      { id: 'b', melt_date: '2026-09-01', melt_no: 'ML-10', created_at: '2026-12-01' },
      { id: 'a', melt_date: '2026-09-01', melt_no: 'ML-2', created_at: '2026-12-02' },
    ];
    return [...records].sort(compareMelts).map(record => record.id);
  });
  assert.deepEqual(dateOrder, ['a', 'b', 'c'], '按熔解日期而非建立日期排序，同日採自然編號');
  console.log('通過：日期升降冪切換、熔解日期優先與同日自然編號排序。');
  await page.getByRole('button', { name: '庫存管理', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('開始日期', { exact: true }).fill('2000-01-01');
  await dialog.getByLabel('結束日期', { exact: true }).fill('2099-12-31');
  await dialog.getByText('前爐殘湯投料', { exact: true }).waitFor();
  await dialog.getByText('載入中...', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await dialog.getByTestId('residual-melt').count(), 1);
  assert.equal(await dialog.getByTestId('residual-pour').count(), 0);
  await dialog.getByRole('heading', { name: '爐次殘湯統計（本爐產生）' }).waitFor();
  assert.ok((await dialog.getByTestId('residual-melt').textContent()).includes('總投料重'));
  const summaryCards = dialog.getByTestId('inventory-summary').locator(':scope > div');
  assert.equal(await summaryCards.count(), 6);
  assert.deepEqual(await summaryCards.locator('p:first-child').allTextContents(), ['總投料', '外購投料', '回爐料投料', '前爐殘湯投料', '爐次澆注殘湯', '原料入庫總量']);
  const cardWeights = (await summaryCards.locator('p:nth-child(2)').allTextContents()).map(text => Number(text.replace(' kg', '')));
  assert.equal(cardWeights[0], Math.round((cardWeights[1] + cardWeights[2]) * 100) / 100);
  assert.ok((await summaryCards.nth(0).textContent()).includes('不含前爐殘湯'));
  assert.equal(await summaryCards.nth(4).locator('p:nth-child(2)').textContent(), await dialog.getByTestId('residual-melt').getByTestId('residual-total').textContent());
  const meltRate = await dialog.getByTestId('residual-melt').locator('dl > div').last().locator('dd').textContent();
  assert.ok((await summaryCards.nth(4).textContent()).includes(`殘湯率 ${meltRate}`));
  for (const index of [2, 3, 4]) {
    assert.ok((await summaryCards.nth(index).textContent()).includes(`總投料（不含前爐殘湯）${cardWeights[0]} kg`));
  }
  for (const source of ['previous', 'melt']) {
    assert.equal(await dialog.getByTestId(`residual-${source}`).getByTestId('residual-base').textContent(), `${cardWeights[0]} kg`);
  }
  const ratio = (value, digits = 1) => cardWeights[0] > 0 ? Math.round(value / cardWeights[0] * 100 * 10 ** digits) / 10 ** digits : 0;
  assert.ok((await summaryCards.nth(2).textContent()).includes(`舊料投料比例 ${ratio(cardWeights[2])}%`));
  assert.ok((await summaryCards.nth(3).textContent()).includes(`前爐殘湯利用率 ${ratio(cardWeights[3])}%`));
  assert.ok((await summaryCards.nth(4).textContent()).includes(`殘湯率 ${ratio(cardWeights[4], 2)}%`));
  console.log('通過：三種比例共用不含前爐殘湯的總投料，摘要與明細分母一致。');
  const previousSection = dialog.getByTestId('residual-previous');
  const meltSection = dialog.getByTestId('residual-melt');
  await previousSection.waitFor();
  const previousSummary = await previousSection.locator('dl').textContent();
  const meltSummary = await meltSection.locator('dl').textContent();
  await previousSection.getByRole('button', { name: /收折清單/ }).click();
  assert.equal(await previousSection.getByTestId('residual-list').isVisible(), false);
  assert.equal(await meltSection.getByTestId('residual-list').isVisible(), true);
  await meltSection.getByRole('button', { name: /收折清單/ }).click();
  assert.equal(await meltSection.getByTestId('residual-list').isVisible(), false);
  assert.equal(await previousSection.locator('dl').textContent(), previousSummary);
  assert.equal(await meltSection.locator('dl').textContent(), meltSummary);
  await previousSection.getByRole('button', { name: /展開清單/ }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await previousSection.getByTestId('residual-list').isVisible(), true);
  assert.equal(await meltSection.getByTestId('residual-list').isVisible(), false);
  await meltSection.getByRole('button', { name: /展開清單/ }).click();
  const previousExpected = await page.evaluate(async () => {
    const { dsGetMeltRecords, dsGetMeltMaterials } = await import('/src/lib/dataService.ts');
    const { buildPreviousResidualRows, summarizeResidual } = await import('/src/lib/residualStatistics.ts');
    const [records, materials] = await Promise.all([dsGetMeltRecords(), dsGetMeltMaterials()]);
    return summarizeResidual(buildPreviousResidualRows(records, materials, '2000-01-01', '2099-12-31'));
  });
  assert.equal(await previousSection.getByTestId('residual-total').textContent(), `${previousExpected.residualWeight} kg`);
  assert.equal(await previousSection.getByTestId('residual-base').textContent(), `${previousExpected.baseWeight} kg`);
  console.log('通過：前爐逐爐摘要、兩份清單獨立收折、摘要不變及鍵盤展開。');
  const consumptionSummary = await dialog.getByTestId('residual-melt').locator('dl').textContent();
  async function exportCsv() {
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '匯出', exact: true }).click();
    const download = await downloadPromise;
    return { filename: download.suggestedFilename(), text: readFileSync(await download.path(), 'utf8') };
  }
  const consumption = await exportCsv();
  const csvRows = consumption.text.replace(/^\uFEFF/, '').trim().split('\n').slice(1).map(line => line.slice(1, -1).split('\",\"').map(cell => cell.replaceAll('\"\"', '\"')));
  for (const row of csvRows.filter(row => ['舊料投料比例', '前爐殘湯利用率'].includes(row[7]))) {
    assert.equal(Number(row[9]), cardWeights[0], 'CSV比例分母應與總投料卡一致');
    assert.equal(Number(row[8]), ratio(Number(row[5])));
  }
  assert.ok(consumption.filename.startsWith('原料投料統計'));
  assert.ok(consumption.text.includes('前爐殘湯'));
  assert.ok(!consumption.text.includes('總殘湯率'));
  await dialog.getByRole('button', { name: '爐次殘湯', exact: true }).click();
  await dialog.getByTestId('residual-melt').waitFor();
  assert.equal(await dialog.getByTestId('residual-melt').locator('dl').textContent(), consumptionSummary, '投料頁與爐次分頁使用相同統計');
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
  await dialog.getByRole('button', { name: '投料統計', exact: true }).click();
  await dialog.getByTestId('residual-melt').getByText('此日期區間內無熔解紀錄', { exact: true }).waitFor();
  assert.equal(await dialog.getByTestId('residual-previous').getByTestId('residual-total').textContent(), '0 kg');
  assert.equal(await dialog.getByTestId('residual-melt').getByTestId('residual-total').textContent(), '0 kg');
  assert.equal(await dialog.getByTestId('residual-melt').getByTestId('residual-base').textContent(), '0 kg');
  console.log('通過：登入後投料／爐次分頁、真實資料合計、分頁CSV與空區間；未修改正式紀錄。');
} finally {
  await browser.close();
}
