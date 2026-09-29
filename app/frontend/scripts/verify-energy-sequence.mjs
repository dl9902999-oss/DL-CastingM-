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
  const dateWindow = energy.getByTestId('energy-date-window');
  const startDate = async () => Number(await dateWindow.getAttribute('data-start'));
  const assertWindow = async () => {
    const days = (Number(await dateWindow.getAttribute('data-end')) - await startDate()) / 86400000 + 1;
    assert.ok(days >= 1 && days <= 21, '每次最多顯示21個日曆天');
  };
  await assertWindow();
  const initialStart = await startDate();
  const waitForStart = expected => page.waitForFunction(value =>
    Number(document.querySelector('[data-testid="energy-date-window"]')?.getAttribute('data-start')) === value,
  expected);
  const slider = energy.getByRole('slider', { name: '拖曳日期範圍' });
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
    assert.equal(await energy.getByRole('button', { name: '後21天', exact: true }).isDisabled(), true);
    await assertWindow();
    await page.keyboard.press('Home');
    assert.equal(await startDate(), initialStart);
    assert.equal(await energy.getByRole('button', { name: '前21天', exact: true }).isDisabled(), true);
    await chart.focus();
    await page.keyboard.press('ArrowRight');
    await waitForStart(initialStart + 86400000);
    assert.equal(await startDate(), initialStart + 86400000);
    await page.keyboard.press('ArrowLeft');
    await waitForStart(initialStart);
    assert.equal(await startDate(), initialStart);
  }
  console.log('通過：21天視窗、滑鼠拖曳、日期滑桿與鍵盤邊界');
  await energy.getByLabel('第一批定義').selectOption('rebuild');
  assert.equal(await energy.getByLabel('分析座標').count(), 0, '不可切換為爐次軸');
  assert.ok(await energy.getByText('日期能耗比較', { exact: false }).count());
  await energy.getByLabel('第一批定義').selectOption('daily');
  console.log('通過：固定日期軸、築爐001與每日第一批切換');
  await page.goto('http://localhost:3000/melting-management');
  await page.getByTestId('melt-card-edit').first().click();
  await page.getByTestId('heat-preview').waitFor();
  await page.getByTestId('heat-rebuild').check();
  assert.equal(await page.getByTestId('heat-sequence').inputValue(), '1');
  console.log('通過：爐體、爐次預覽、築爐重設001（未儲存正式紀錄）');
} finally {
  await browser.close();
}
