import { supabase } from '@/lib/supabase';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { isResidualMaterial } from '@/lib/residualStatistics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getInventoryAdjustments, inventoryBalances, type InventoryAdjustment } from '@/lib/inventoryAdjustments';
import { localDate } from '@/lib/meltingUtils';
import type { RawMaterialReceipt } from '@/lib/supabaseStore';
import type { MeltMaterial, MeltRecord } from '@/lib/types';

export default function InventoryAdjustments({ receipts, materials, records, options, endDate, startDate, onRefresh, onDirtyChange }: {
  receipts: RawMaterialReceipt[]; materials: MeltMaterial[]; records: MeltRecord[]; options: string[]; endDate: string; startDate: string; onRefresh: () => Promise<void>; onDirtyChange:(dirty:boolean)=>void;
}) {
  const unsaved=useUnsavedChanges(true);
  useEffect(()=>{onDirtyChange(unsaved.dirty);return()=>onDirtyChange(false);},[unsaved.dirty,onDirtyChange]);
  const [book,setBook]=useState<number|null>(null);
  const [actual,setActual]=useState('');
  const countRequest=useRef<{id:string;actual:number;book:number;material:string;date:string;reason:string;actor:string}|null>(null);
  const [rows,setRows] = useState<InventoryAdjustment[]>([]);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [saving,setSaving] = useState(false);
  const [form,setForm] = useState({ adjustment_date: localDate(), raw_material: '', quantity_delta: '', reason: '', created_by: '' });
  const load = useCallback(async () => {
    try { setRows(await getInventoryAdjustments()); setReady(true); setError(''); }
    catch { setReady(false); setError('盤點調整資料讀取失敗，請重新讀取；尚不能新增調整。'); }
  },[]);
  useEffect(() => { if(unsaved.dirty)return;void load(); const timer = window.setInterval(load,30000); window.addEventListener('focus',load); return () => { clearInterval(timer); window.removeEventListener('focus',load); }; },[load,unsaved.dirty]);
  useEffect(()=>{let active=true;setBook(null);if(form.raw_material&&form.adjustment_date){supabase.rpc('inventory_book_weight',{p_material:form.raw_material,p_date:form.adjustment_date}).then(({data,error})=>{if(active){if(error)setError('帳面重量讀取失敗，請重選原料或重新讀取');else setBook(Number(data));}});}return()=>{active=false;};},[form.raw_material,form.adjustment_date,rows]);
  const balances = useMemo(() => inventoryBalances(receipts,materials,records,rows,endDate).filter(r => !isResidualMaterial(r.name)),[receipts,materials,records,rows,endDate]);
  const history = rows.filter(r => (!startDate || r.adjustment_date >= startDate) && (!endDate || r.adjustment_date <= endDate)).slice().reverse();
  const materialOptions = [...new Set([...options,...balances.map(r=>r.name)])].filter(name => !isResidualMaterial(name));
  return <section className="space-y-4 text-zinc-200" data-testid="inventory-adjustments">
    {unsaved.dialog}<h3>盤點調整與累計帳面庫存</h3>
    <p className="text-xs text-zinc-400">帳面庫存從最早紀錄累計至 {endDate || '最新日期'}，不受開始日期影響。計算：累計入庫 − 累計投料 ＋ 盤點調整。缺少期初庫存或自產回爐料入庫時，請先盤點並補登差額；前爐殘湯另由殘湯統計管理，不列入固態原料庫存。</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {message && <p role="status" className="text-emerald-300">{message}</p>}
    <Button variant="secondary" disabled={saving} onClick={async()=>{ await load(); }}>重新讀取</Button>
    {ready && <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['原料','累計入庫 kg','累計投料 kg','累計調整 kg','帳面庫存 kg'].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr></thead><tbody>{balances.map(r=><tr key={r.name} className="border-t border-zinc-700"><td className="p-2">{r.name}</td><td>{r.received.toFixed(2)}</td><td>{r.used.toFixed(2)}</td><td>{r.adjustment.toFixed(2)}</td><td className={r.balance<0?'text-red-300':''}>{r.balance.toFixed(2)}</td></tr>)}</tbody></table></div>}
    <form className="space-y-3 rounded border border-zinc-700 p-4" onChangeCapture={unsaved.markDirty} onSubmit={async e=>{
      e.preventDefault(); if(saving || !ready) return;
      setSaving(true); setMessage('');
      try {
        if(book===null||actual.trim()===''||!Number.isFinite(Number(actual))||Number(actual)<0)throw new Error('請確認帳面重量已載入並輸入有效實際盤點重量。');
        const payload={actual:Number(actual),book,material:form.raw_material,date:form.adjustment_date,reason:form.reason,actor:form.created_by};
        if(!countRequest.current||Object.entries(payload).some(([k,v])=>countRequest.current?.[k as keyof typeof payload]!==v))countRequest.current={id:crypto.randomUUID(),...payload};
        const req=countRequest.current;
        const {data,error}=await supabase.rpc('save_inventory_count',{p_id:req.id,p_material:req.material,p_date:req.date,p_actual:req.actual,p_expected:req.book,p_reason:req.reason,p_actor:req.actor});
        if(error)throw new Error(error.message.includes('INVENTORY_CONFLICT')?'庫存已被其他人變更，本次尚未儲存。請按重新讀取，確認新差額後再送出。':error.message);
        if(data?.id!==req.id)throw new Error('雲端未確認成功，請保留輸入內容重試。');
        countRequest.current=null;unsaved.clearDirty();setActual('');setForm(f=>({...f,quantity_delta:'',reason:''}));
        setMessage(data.unchanged === true ? '盤點重量與帳面一致，未新增調整紀錄。' : '盤點調整已儲存至雲端。'); await load(); await onRefresh();
      } catch(err) { setError(err instanceof Error?err.message:'儲存失敗'); }
      finally {setSaving(false);}
    }}>
      <h4>新增盤點調整</h4>
      <p className="text-xs text-zinc-400">選擇盤點日期與原料後，系統讀取當日累計帳面重量。輸入實際重量，自動計算差額；送出時再次核對庫存，若已變動則停止儲存。</p>
      <fieldset disabled={saving} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs">調整日期<Input required type="date" max={localDate()} value={form.adjustment_date} onChange={e=>setForm({...form,adjustment_date:e.target.value})}/></label>
        <label className="text-xs">原料<select required value={form.raw_material} onChange={e=>setForm({...form,raw_material:e.target.value})} className="block w-full bg-zinc-800 p-2 rounded"><option value="">請選擇</option>{materialOptions.map(m=><option key={m}>{m}</option>)}</select></label>
        <p className="text-xs">盤點日帳面重量：{book===null?'請先選擇日期與原料':`${book.toFixed(2)} kg`}</p>
        <label className="text-xs">實際盤點重量 kg<Input required type="number" min="0" step="0.01" value={actual} onChange={e=>setActual(e.target.value)}/></label>
        <p className="text-xs" role="status">自動調整差額：{book!==null&&actual!==''&&Number.isFinite(Number(actual))?`${(Number(actual)-book).toFixed(2)} kg`:'—'}</p>
        <label className="text-xs">登錄人<Input required value={form.created_by} onChange={e=>setForm({...form,created_by:e.target.value})}/></label>
        <label className="text-xs sm:col-span-2">原因<Input required placeholder="例如：期初盤點、耗損、補登自產回爐料" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label>
      </fieldset>
      <Button disabled={saving || !ready} type="submit">{saving?'儲存中…':'儲存盤點調整'}</Button>
    </form>
    <h4>調整歷程（依上方日期區間）</h4>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['日期','原料','調整 kg','原因','登錄人'].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr></thead><tbody>{history.map(r=><tr key={r.id} className="border-t border-zinc-700"><td className="p-2">{r.adjustment_date}</td><td>{r.raw_material}</td><td>{Number(r.quantity_delta).toFixed(2)}</td><td>{r.reason}</td><td>{r.created_by}</td></tr>)}</tbody></table>{!history.length && <p className="p-3 text-xs">此區間無調整紀錄。</p>}</div>
  </section>;
}
