import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import WorkOrderItemsEditor from './WorkOrderItemsEditor';
import { readWorkOrderPdf } from '@/lib/readWorkOrderPdf';
import { type PdfOrderDraft, validatePdfDraft } from '@/lib/workOrderPdf';
import { emptyOrderItem, itemSummary, orderItems } from '@/lib/workOrderItems';
import { localDate } from '@/lib/dashboardOverview';
import { supabase } from '@/lib/supabase';
import { dsGetMoldingBatches, dsGetShipmentOrders, dsGetWorkOrders, dsUpdateWorkOrder } from '@/lib/dataService';
import { markRecentWrite } from '@/lib/realtimeSync';
import type { WorkOrder } from '@/lib/types';

interface DraftRow { key: string; draft: PdfOrderDraft; status: 'ready' | 'saved'; error: string; }
function blank(): PdfOrderDraft { return { order_no: '', customer: '', order_date: localDate(new Date()), due_date: '', delivery_address: '', remarks: '', source_filename: '', items: [emptyOrderItem()] }; }
export default function WorkOrderImportDialog({ mode, order, onClose, onSaved }: { mode: 'pdf' | 'manual' | 'edit'; order?: WorkOrder; onClose: () => void; onSaved: () => Promise<void> }) {
  const [rows, setRows] = useState<DraftRow[]>(() => mode === 'pdf' ? [] : [{ key: crypto.randomUUID(), draft: order ? { ...blank(), ...order, order_date: order.order_date || order.created_at.slice(0,10), delivery_address: order.delivery_address || '', source_filename: order.source_filename || '', items: orderItems(order) } : blank(), status: 'ready', error: '' }]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const current = rows[index];
  const change = (draft: PdfOrderDraft) => setRows(previous => previous.map((row,i) => i === index ? { ...row, draft, error: '' } : row));
  const readFiles = async (files: File[]) => {
    if (files.length > 20) { setErrors(['每次最多20份PDF。']); return; }
    setBusy(true); setRows([]); setErrors([]); setIndex(0);
    const next: DraftRow[] = []; const problems: string[] = [];
    for (const file of files) {
      try { const drafts = await readWorkOrderPdf(file); next.push(...drafts.map(draft => ({ key: crypto.randomUUID(), draft, status: 'ready' as const, error: '' }))); }
      catch (error) { problems.push(`${file.name}：${error instanceof Error ? error.message : '解析失敗'}`); }
    }
    setRows(next); setErrors(problems); setBusy(false);
  };
  const save = async () => {
    setBusy(true); setErrors([]);
    try {
      const [existing, batches, shipments] = await Promise.all([dsGetWorkOrders(), dsGetMoldingBatches(), dsGetShipmentOrders()]);
      const seen = new Set(existing.filter(record => record.id !== order?.id).map(record => record.order_no));
      const next = [...rows];
      for (let i = 0; i < next.length; i++) {
        const row = next[i]; if (row.status === 'saved') continue;
        const draft = { ...row.draft, order_no: row.draft.order_no.trim(), customer: row.draft.customer.trim() };
        const previouslySaved = existing.find(record => record.id === row.key && record.order_no === draft.order_no);
        if (previouslySaved && !order) { next[i] = { ...row, status: 'saved', error: '' }; continue; }
        let error = validatePdfDraft(draft);
        if (!error && seen.has(draft.order_no)) error = '工單號已存在或本批重複，未匯入；請核對編號。';
        if (!error && order) {
          const used = [...batches.filter(b => b.work_order_id === order.id), ...shipments.filter(s => s.work_order_id === order.id)];
          if (used.some(record => !draft.items.some(item => item.id === (record.work_order_item_id || 'legacy')))) error = '不可移除已有造模或出貨關聯的品項。';
          for (const item of draft.items) {
            const planned = batches.filter(b => b.work_order_id === order.id && (b.work_order_item_id || 'legacy') === item.id).reduce((s,b) => s+b.quantity_planned,0);
            const reserved = shipments.filter(s => s.work_order_id === order.id && (s.work_order_item_id || 'legacy') === item.id).reduce((s,r) => s+r.quantity,0);
            if (item.quantity < Math.max(planned,reserved)) error = `${item.product_name}數量不可低於已排產／出貨數量。`;
          }
        }
        if (error) { next[i] = { ...row, error }; continue; }
        try {
          const payload = { ...draft, ...itemSummary(draft.items), mold_supply: draft.items[0].mold_supply, mold_type: draft.items[0].mold_type, pattern_id: draft.items[0].pattern_id, heat_treatment: draft.items[0].heat_treatment };
          if (order) {
            const result = await dsUpdateWorkOrder(order.id, payload);
            if (!result) throw new Error('未成功更新工單');
          } else {
            // 直接雲端建立，一張工單與全部品項以同一次寫入保存；失敗不假報離線成功。
            const result = await supabase.from('work_orders').insert({ id: row.key, ...payload, status: 'Open', mold_photos: [], drawing_photos: [] }).select('id').single();
            if (result.error) {
              const check = await supabase.from('work_orders').select('id').eq('id', row.key).maybeSingle();
              if (!check.data) throw new Error(result.error.code === '23505' ? '工單號重複，未匯入。' : result.error.message);
            }
            markRecentWrite('work_orders');
          }
          seen.add(draft.order_no); next[i] = { ...row, draft, status: 'saved', error: '' };
        } catch (failure) { next[i] = { ...row, error: failure instanceof Error ? failure.message : '保存失敗，請重試' }; }
        setRows([...next]);
      }
      setRows(next); await onSaved();
    } catch (error) { setErrors([error instanceof Error ? error.message : '讀取資料失敗，請重試']); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => !open && !busy && onClose()}><DialogContent className="bg-zinc-800 border-zinc-700 max-w-4xl max-h-[92vh] overflow-y-auto text-zinc-100"><DialogHeader><DialogTitle>{mode === 'pdf' ? '批量匯入 PDF 工單' : mode === 'edit' ? '編輯多品項工單' : '新增多品項工單'}</DialogTitle></DialogHeader>
    {mode === 'pdf' && <div className="space-y-2"><p className="text-sm text-zinc-400">同版型文字PDF，每頁一張工單；保留原單號、多個品項。每檔10 MB／30頁，每次20份。掃描或不同版型會提示錯誤，不猜測內容。</p><Input disabled={busy} aria-label="選擇批量工單PDF" type="file" accept="application/pdf,.pdf" multiple onChange={event => { void readFiles(Array.from(event.target.files || [])); event.target.value = ''; }} /></div>}
    {busy && <p role="status" className="text-amber-300">正在處理，請勿關閉視窗…</p>}
    {errors.map((error,i) => <p key={i} role="alert" className="text-red-300 text-sm">{error}</p>)}
    {rows.length > 0 && <div className="flex flex-wrap items-center gap-3"><label className="text-sm">工單預覽 <select disabled={busy} className="bg-zinc-700 rounded p-2 max-w-full" value={index} onChange={e => setIndex(Number(e.target.value))}>{rows.map((row,i) => <option key={row.key} value={i}>{i+1}. {row.draft.order_no || '未填單號'} · {row.status === 'saved' ? '已保存' : row.error ? '需修正' : '待確認'}</option>)}</select></label><span className="text-sm text-zinc-400">共 {rows.length} 單，已保存 {rows.filter(row=>row.status==='saved').length} 單</span></div>}
    {current && <fieldset disabled={busy || current.status === 'saved'} className="space-y-4 min-w-0">
      <p className="text-xs text-zinc-400 break-all">{current.draft.source_filename || '手動建立'} · 請核對全部品項後再確認保存，重量均為每件重量。</p>
      {current.error && <p role="alert" className="text-red-300">{current.error}</p>}
      <div className="grid grid-cols-2 gap-3">{(['order_no','customer','order_date','due_date','delivery_address'] as const).map((key,i) => <label key={key} className="text-sm text-zinc-300">{['原工單號','客戶','訂貨日期','交期','送貨地址'][i]}<Input disabled={key === 'order_no' && !!order} type={key.endsWith('date') ? 'date' : 'text'} value={current.draft[key]} onChange={e => change({ ...current.draft, [key]: e.target.value })} className="bg-zinc-700 border-zinc-600" /></label>)}</div>
      <label className="text-sm text-zinc-300 block">交貨備註<textarea className="w-full bg-zinc-700 border border-zinc-600 rounded p-2" value={current.draft.remarks} onChange={e => change({ ...current.draft, remarks: e.target.value })} /></label>
      <WorkOrderItemsEditor items={current.draft.items} onChange={items => change({ ...current.draft, items })} disabled={busy || current.status==='saved'} />
    </fieldset>}
    <div className="flex justify-end gap-3"><Button disabled={busy} className="bg-zinc-700 text-zinc-100" onClick={onClose}>關閉</Button><Button disabled={busy || !rows.some(row=>row.status==='ready')} className="bg-amber-500 text-zinc-900 hover:bg-amber-600" onClick={save}>確認並保存{mode === 'pdf' ? '所有有效工單' : ''}</Button></div>
  </DialogContent></Dialog>;
}
