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
const validationBuild = await build({
  configFile: false, logLevel: 'warn',
  build: { write: false, minify: true, lib: { entry: resolve('src/lib/workOrderPdf.ts'), name: 'PdfDraftTest', formats: ['iife'] } },
});
const validationScript = (Array.isArray(validationBuild) ? validationBuild : [validationBuild]).flatMap(item => item.output).find(item => item.type === 'chunk' && item.isEntry)?.code;
assert.ok(validationScript, '缺少草稿驗證入口');
const missingWeightBytes = Array.from(readFileSync('/workspace/uploads/005470 旭隆昇 2026-10-21.pdf'));
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
  await page.addScriptTag({ content: validationScript });
  const missingWeight = await page.evaluate(async bytes => {
    const [draft] = await window.PdfImportTest.readWorkOrderPdf(new File([new Uint8Array(bytes)], '005470 旭隆昇 2026-10-21.pdf', { type: 'application/pdf' }));
    const validate = window.PdfDraftTest.validatePdfDraft;
    const initialError = validate(draft);
    const weightsConfirmed = { ...draft, items: draft.items.map(item => ({ ...item, estimated_weight: 0 })) };
    const quantityError = validate(weightsConfirmed);
    // 僅測試人工輸入後的驗證，不代表原始SE已確定換算為2件，不寫入資料庫。
    const confirmed = { ...weightsConfirmed, items: weightsConfirmed.items.map(item => ({ ...item, quantity: Number.isFinite(item.quantity) ? item.quantity : 2 })) };
    const confirmedError = validate(confirmed);
    const cleared = { ...confirmed, items: confirmed.items.map((item, index) => index ? item : { ...item, estimated_weight: NaN }) };
    return { draft, initialError, quantityError, confirmedError, clearedError: validate(cleared) };
  }, missingWeightBytes);
  assert.equal(missingWeight.draft.order_no, '005470');
  assert.equal(missingWeight.draft.customer, '旭隆昇(原陞達)');
  assert.equal(missingWeight.draft.order_date, '2026-10-21');
  assert.equal(missingWeight.draft.due_date, '2026-10-28');
  assert.deepEqual(missingWeight.draft.items.map(item => item.product_name.replace(/\s/g, '')), ['RG4816-A', 'RG4816-B', 'RG4816-側板L/R']);
  assert.deepEqual(missingWeight.draft.items.map(item => item.quantity), [1, 1, NaN]);
  assert.ok(missingWeight.draft.items.every(item => Number.isNaN(item.estimated_weight) && item.material === 'SCMnH-11' && item.group === '庫存'));
  assert.match(missingWeight.draft.items[2].remarks, /1 SE/);
  assert.match(missingWeight.draft.remarks.replace(/\s/g, ''), /鑄件不附重量以件計價/);
  assert.match(missingWeight.initialError, /預估單重/);
  assert.match(missingWeight.quantityError, /品項 3.*數量/);
  assert.equal(missingWeight.confirmedError, null);
  assert.match(missingWeight.clearedError, /預估單重/);
  assert.deepEqual(externalRequests, [], '解析不得依賴外部Worker檔案下載');
  console.log('通過：005467連續／並行解析與錯誤後恢復；005470三品項預覽、空白重量與SE原文保留、未確認數值拒絕保存驗證、明確填值後驗證通過及清空後再次阻擋；無外部Worker請求，未存取正式資料。');
} finally { await browser.close(); }
