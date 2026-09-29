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
