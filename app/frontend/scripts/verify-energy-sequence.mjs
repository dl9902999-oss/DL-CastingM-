import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const executablePath = ['/opt/ms-playwright/chromium-1169/chrome-linux/chrome', '/opt/ms-playwright/chromium-1223/chrome-linux64/chrome', chromium.executablePath()].find(existsSync);
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://localhost:3000');
  await page.locator('#employeeId').fill('A001');
  await page.locator('#password').fill('AG001');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/);
  await page.goto('http://localhost:3000/melting-management');
  await page.getByTestId('melt-card').first().waitFor();
  await page.getByRole('button', { name: /能耗基線/ }).click();
  const energy = page.getByTestId('energy-baseline');
  await energy.waitFor();
  await page.waitForFunction(() => {
    const section = document.querySelector('[data-testid="energy-baseline"]');
    return section && !section.textContent.includes('正在加總');
  });
  const ticks = await energy.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents();
  assert.ok(ticks.length > 0, '須有實際能耗日期刻度');
  assert.ok(ticks.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t)), 'X軸只顯示日期');
  console.log('通過：日期刻度', ticks);
  assert.ok(await energy.locator('.recharts-scatter-symbol path[fill="#ef4444"]').count() > 0, '每日第一爐須顯示紅色點');
  assert.ok(await energy.getByText('第一爐（各爐體每日第一批）', { exact: true }).count(), '須顯示紅點圖例');
  console.log('通過：每日第一爐紅點及圖例');
  const dateWindow = energy.getByTestId('energy-date-window');
  const startDate = async () => Number(await dateWindow.getAttribute('data-start'));
  const zoom = energy.getByLabel('能耗圖表顯示區間');
  assert.equal(await zoom.inputValue(), '30', '預設顯示一個月');
  const assertWindow = async () => {
    const days = (Number(await dateWindow.getAttribute('data-end')) - await startDate()) / 86400000 + 1;
    const limit = Number(await zoom.inputValue());
    assert.ok(days >= 1 && days <= limit, `每次最多顯示${limit}個日曆天`);
  };
  await assertWindow();
  const initialStart = await startDate();
  const waitForStart = expected => page.waitForFunction(value =>
    Number(document.querySelector('[data-testid="energy-date-window"]')?.getAttribute('data-start')) === value,
  expected);
  const slider = energy.getByRole('slider', { name: '拖曳日期範圍' });
  const initialDays = (Number(await dateWindow.getAttribute('data-end')) - initialStart) / 86400000 + 1;
  const totalDays = initialDays + Number(await slider.getAttribute('max'));
  const statistics = await energy.getByTestId('energy-average').textContent();
  const details = await energy.getByTestId('energy-details').textContent();
  for (const size of [14, 7, 30]) {
    await zoom.selectOption(String(size));
    await assertWindow();
    assert.equal((Number(await dateWindow.getAttribute('data-end')) - await startDate()) / 86400000 + 1, Math.min(size, totalDays));
    assert.equal(await energy.getByTestId('energy-average').textContent(), statistics, '縮放不影響區間統計');
    assert.equal(await energy.getByTestId('energy-details').textContent(), details, '縮放不影響明細');
    const max = Number(await slider.getAttribute('max'));
    if (max > 0) {
      await energy.getByRole('button', { name: `後${size}天`, exact: true }).click();
      await waitForStart(initialStart + Math.min(size, max) * 86400000);
      await slider.focus();
      await page.keyboard.press('End');
      await waitForStart(initialStart + max * 86400000);
      assert.equal(await energy.getByRole('button', { name: `後${size}天`, exact: true }).isDisabled(), true);
      await zoom.selectOption('30');
      await assertWindow();
      assert.ok(Number(await slider.inputValue()) <= Number(await slider.getAttribute('max')), '放大區間不可越界');
      await slider.focus();
      await page.keyboard.press('Home');
      await waitForStart(initialStart);
    }
  }
  if (Number(await slider.getAttribute('max')) > 0) {
    const chart = energy.getByTestId('energy-drag-chart');
    const box = await chart.boundingBox();
    await page.mouse.move(box.x + box.width * 0.8, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + 100, { steps: 12 });
    await page.mouse.up();
    assert.ok(await startDate() > initialStart, '向左拖曳應顯示較晚日期');
    await assertWindow();
    await slider.focus();
    await page.keyboard.press('End');
    await waitForStart(initialStart + Number(await slider.getAttribute('max')) * 86400000);
    assert.equal(await energy.getByRole('button', { name: '後30天', exact: true }).isDisabled(), true);
    await assertWindow();
    await page.keyboard.press('Home');
    await waitForStart(initialStart);
    assert.equal(await startDate(), initialStart);
    assert.equal(await energy.getByRole('button', { name: '前30天', exact: true }).isDisabled(), true);
    await chart.focus();
    await page.keyboard.press('ArrowRight');
    await waitForStart(initialStart + 86400000);
    assert.equal(await startDate(), initialStart + 86400000);
    await page.keyboard.press('ArrowLeft');
    await waitForStart(initialStart);
    assert.equal(await startDate(), initialStart);
  }
  console.log('通過：30／14／7天縮放、統計不變、滑鼠拖曳、日期滑桿與鍵盤邊界');
  await energy.getByLabel('第一批定義').selectOption('rebuild');
  assert.equal(await energy.getByLabel('分析座標').count(), 0, '不可切換為爐次軸');
  assert.ok(await energy.getByText('日期能耗比較', { exact: false }).count());
  await energy.getByLabel('第一批定義').selectOption('daily');
  console.log('通過：固定日期軸、築爐001與每日第一批切換');
  const bands = await page.evaluate(async () => {
    const { getEnergyBand } = await import('/src/lib/energyComparison.ts');
    return [0.8, 0.9, 1, 1.1, 1.2].map(value => getEnergyBand(value, 1)?.key);
  });
  assert.deepEqual(bands, ['low', 'normal', 'normal', 'normal', 'high']);
  const averageElement = energy.getByTestId('energy-average');
  const originalCount = Number(await averageElement.getAttribute('data-count'));
  const originalAverage = Number(await averageElement.getAttribute('data-average'));
  const verifyBands = async () => {
    const avg = Number(await averageElement.getAttribute('data-average'));
    const cells = await energy.getByTestId('energy-band').evaluateAll(elements => elements.map(el => ({
      energy: Number(el.dataset.energy), band: el.dataset.band, classes: el.className,
    })));
    for (const cell of cells) {
      const delta = (cell.energy / avg - 1) * 100;
      const expected = delta > 10 + 1e-10 ? 'high' : delta < -10 - 1e-10 ? 'low' : 'normal';
      assert.equal(cell.band, expected);
      assert.ok(cell.classes.includes({ high: 'text-red-300', low: 'text-green-300', normal: 'text-yellow-300' }[expected]));
    }
    return cells;
  };
  await verifyBands();
  const selectedDate = await energy.getByTestId('energy-details').locator('tbody tr[data-date]').first().getAttribute('data-date');
  const applyDates = async (start, end) => {
    await energy.getByLabel('開始日期', { exact: true }).fill(start);
    await energy.getByLabel('結束日期', { exact: true }).fill(end);
    await energy.getByRole('button', { name: '套用日期', exact: true }).click();
  };
  await applyDates(selectedDate, selectedDate);
  await page.waitForFunction(date => document.querySelector('[data-testid="energy-date-window"]')?.getAttribute('data-end') === String(Date.parse(`${date}T00:00:00Z`)), selectedDate);
  const rows = energy.getByTestId('energy-details').locator('tbody tr[data-date]');
  assert.ok(await rows.count() > 0);
  assert.ok((await rows.evaluateAll(els => els.map(el => el.dataset.date))).every(date => date === selectedDate));
  assert.equal(await slider.isDisabled(), true);
  for (const size of [7, 14, 30]) {
    await zoom.selectOption(String(size));
    await assertWindow();
    assert.equal(await dateWindow.getAttribute('data-start'), await dateWindow.getAttribute('data-end'), '單日範圍不因縮放擴大');
    assert.equal(await slider.isDisabled(), true);
  }
  const dayCells = await verifyBands();
  if (Number(await averageElement.getAttribute('data-count')) <= 30) {
    assert.ok(Math.abs(Number(await averageElement.getAttribute('data-average')) - dayCells.reduce((sum, cell) => sum + cell.energy, 0) / dayCells.length) < 1e-10);
  }
  await applyDates('2099-02-02', '2099-01-01');
  await energy.getByRole('alert').filter({ hasText: '開始日期不可晚於結束日期' }).waitFor();
  assert.equal(await rows.first().getAttribute('data-date'), selectedDate, '無效範圍不可改變已套用資料');
  await applyDates('2099-01-01', '2099-01-02');
  await energy.getByText('此範圍沒有符合的批次。', { exact: true }).waitFor();
  assert.equal(await averageElement.getAttribute('data-average'), '');
  assert.equal(await energy.getByTestId('energy-band').count(), 0);
  await applyDates('', selectedDate);
  await rows.first().waitFor();
  assert.ok((await rows.evaluateAll(els => els.map(el => el.dataset.date))).every(date => date <= selectedDate));
  await energy.getByRole('button', { name: '清除日期', exact: true }).click();
  await page.waitForFunction(count => Number(document.querySelector('[data-testid="energy-average"]')?.getAttribute('data-count')) === count, originalCount);
  assert.equal(Number(await averageElement.getAttribute('data-average')), originalAverage);
  await verifyBands();
  await energy.getByTestId('baseline-chart').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/energy-date-range.png', fullPage: true });
  console.log('通過：日期區間、单日含邊界、單邊日期、無效與空區間、清除篩選、區間平均及紅綠黃±10%標記');
  await page.goto('http://localhost:3000/melting-management');
  await page.getByTestId('melt-card-edit').first().click();
  await page.getByTestId('heat-preview').waitFor();
  await page.getByTestId('heat-rebuild').check();
  assert.equal(await page.getByTestId('heat-sequence').inputValue(), '1');
  console.log('通過：爐體、爐次預覽、築爐重設001（未儲存正式紀錄）');
} finally {
  await browser.close();
}
