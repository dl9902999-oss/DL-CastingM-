import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright';

// 不啟動預覽服務、不登入應用程式、不存取正式資料庫。
const result = await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    minify: true,
    lib: { entry: resolve('src/lib/readWorkOrderPdf.ts'), name: 'PdfImportTest', formats: ['iife'] },
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
const script = outputs.find(item => item.type === 'chunk' && item.isEntry)?.code;
assert.ok(script, '缺少測試打包入口');
assert.equal(outputs.filter(item => item.fileName.includes('pdf.worker')).length, 0, '不應產生獨立Worker資源');
const bytes = Array.from(readFileSync('/workspace/uploads/005467 宗達 2026-10-21.pdf'));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const externalRequests = [];
  await page.route('**/*', route => {
    if (route.request().url() === 'https://pdf-unit.test/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto('https://pdf-unit.test/');
  await page.addScriptTag({ content: script });
  const outcome = await page.evaluate(async bytes => {
    const read = window.PdfImportTest.readWorkOrderPdf;
    const makeFile = () => new File([new Uint8Array(bytes)], '005467 宗達 2026-10-21.pdf', { type: 'application/pdf' });
    const results = [];
    for (let index = 0; index < 3; index++) results.push(await read(makeFile()));
    const concurrent = await Promise.all([read(makeFile()), read(makeFile())]);
    let rejected = false;
    try { await read(new File(['invalid'], '損壞.pdf', { type: 'application/pdf' })); }
    catch { rejected = true; }
    const afterFailure = await read(makeFile());
    return { results, concurrent, rejected, afterFailure };
  }, bytes);
  for (const drafts of [...outcome.results, ...outcome.concurrent, outcome.afterFailure]) {
    assert.equal(drafts[0].order_no, '005467');
    assert.deepEqual(drafts[0].items.map(item => [item.product_name, item.quantity, item.estimated_weight]), [['上牙板', 1, 80], ['下牙板', 2, 80]]);
  }
  assert.equal(outcome.rejected, true);
  assert.deepEqual(externalRequests, [], '解析不得依賴外部Worker檔案下載');
  console.log('通過：正式打包的內嵌Worker在瀏覽器中連續／並行解析、損壞檔案拒絕後再次解析；無外部Worker資源請求，未存取正式資料。');
} finally { await browser.close(); }
