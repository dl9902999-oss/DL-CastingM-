import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// Node 20 測試環境使用標準 WebSocket 實作。
globalThis.WebSocket ??= WebSocket;

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
}));
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const source = readFileSync('src/lib/patternDrawings.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(supabase) {
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({ supabase }));
  return exports;
}
const api = load(client);
const png = new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=', 'base64')], '測試圖面.png', { type: 'image/png' });
api.validateDrawings([png], 0);
assert.throws(() => api.validateDrawings([new File(['x'], 'test.exe', { type: 'application/octet-stream' })], 0));
assert.throws(() => api.validateDrawings([new File([], 'empty.pdf', { type: 'application/pdf' })], 0));
assert.throws(() => api.validateDrawings([{ name: 'large.pdf', type: 'application/pdf', size: 10485761 }], 0));
assert.throws(() => api.validateDrawings([png], 10));
let calls = 0;
let removed = [];
const failureApi = load({ storage: { from: () => ({
  upload: async () => ({ error: ++calls === 2 ? new Error('測試上傳失敗') : null }),
  remove: async paths => { removed = paths; return { error: null }; },
}) } });
await assert.rejects(failureApi.uploadDrawings([png, png]));
assert.equal(removed.length, 1);
console.log('通過：檔案格式、空檔、容量、數量限制及部分上傳失敗清理。');
let uploaded = [];
let patternId;
try {
  uploaded = await api.uploadDrawings([png]);
  const signed = await api.drawingUrl(uploaded[0]);
  const response = await fetch(signed);
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, png.size);
  const { data, error } = await client.from('patterns').insert({ pattern_no: `TEST-DRAWING-${crypto.randomUUID()}`, name: '圖面上傳自動驗證（暫存）', drawings: uploaded }).select('id,drawings').single();
  if (error) throw error;
  patternId = data.id;
  assert.deepEqual(data.drawings, uploaded);
  const reread = await client.from('patterns').select('drawings').eq('id', patternId).single();
  if (reread.error) throw reread.error;
  assert.deepEqual(reread.data.drawings, uploaded);
  const update = await client.from('patterns').update({ drawings: [] }).eq('id', patternId).select('drawings').single();
  if (update.error) throw update.error;
  assert.deepEqual(update.data.drawings, []);
  console.log('通過：原檔雲端上傳、限時查看、模具圖面保存、重新讀取及移除。');
} finally {
  if (patternId) {
    const result = await client.from('patterns').delete().eq('id', patternId);
    if (result.error) throw result.error;
  }
  if (uploaded.length) {
    const result = await client.storage.from('pattern-drawings').remove(uploaded.map(item => item.path));
    if (result.error) throw result.error;
  }
}
console.log('測試模具與測試檔案已清除，既有正式紀錄未修改。');
