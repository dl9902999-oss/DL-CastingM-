import { useEffect, useMemo, useRef, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { dsGetMeltMaterials } from '@/lib/dataService';
import { formatHeat, furnaceBody, compareMelts } from '@/lib/meltSequence';
import { getEnergyBand } from '@/lib/energyComparison';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MeltRecord } from '@/lib/types';

interface EnergyPoint extends MeltRecord { energy: number; charge: number; date: number; }
const colors = ['#eab77b', '#83b4d4'];
const mean = (rows: EnergyPoint[]) => rows.length ? rows.reduce((sum, r) => sum + r.energy, 0) / rows.length : null;
const display = (value: number | null) => value == null ? '—' : value.toFixed(3);
const dateLabel = (value: number) => new Date(value).toISOString().slice(0, 10);

function PointTooltip({ active, payload }: { active?: boolean; payload?: { payload: EnergyPoint }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return <div className="rounded border border-zinc-600 bg-zinc-900 p-3 text-xs text-zinc-100 space-y-1">
    <p>{row.melt_date} · {row.melt_no}</p><p>{furnaceBody(row)}號爐體 · 爐次 {formatHeat(row.heat_sequence)}</p>
    <p>{row.cycle_number ? `築爐週期 ${row.cycle_number}` : '既有週期'} · 每日第 {row.daily_sequence || '—'} 批</p>
    <p>能耗 {row.energy.toFixed(3)} kWh/kg</p>
  </div>;
}

export default function EnergyBaseline({ records, detailVersion }: { records: MeltRecord[]; detailVersion: number }) {
  const [points, setPoints] = useState<EnergyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'daily' | 'rebuild'>('daily');
  const [dateDraft, setDateDraft] = useState({ start: '', end: '' });
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [dateError, setDateError] = useState('');
  const [page, setPage] = useState(0);
  const [windowOffset, setWindowOffset] = useState(0);
  const drag = useRef<{ pointerId: number; x: number; offset: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setPage(0);
    dsGetMeltMaterials().then(materials => {
      const totals = new Map<string, number>();
      materials.forEach(m => totals.set(m.melt_id, (totals.get(m.melt_id) || 0) + Number(m.charge_weight || 0) + Number(m.secondary_weight || 0)));
      const next = records.map(r => ({ ...r, charge: totals.get(r.id) || 0,
        energy: Number(r.power_kwh) / (totals.get(r.id) || 0), date: Date.parse(`${r.melt_date}T00:00:00Z`) }))
        .filter(r => r.charge > 0 && r.power_kwh > 0 && Number.isFinite(r.energy)).sort(compareMelts);
      if (active) setPoints(next);
    }).catch(() => { if (active) { setPoints([]); setError('投料資料讀取失敗，請關閉後重新開啟能耗基線。'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [records, detailVersion]);
  const isFirst = (r: EnergyPoint) => mode === 'daily' ? r.daily_sequence === 1 : r.rebuild && r.heat_sequence === 1;
  const filteredPoints = useMemo(() => points.filter(r =>
    (!dateRange.start || r.melt_date >= dateRange.start) && (!dateRange.end || r.melt_date <= dateRange.end)), [points, dateRange]);
  const groups = [1,2].map(body => filteredPoints.filter(r => furnaceBody(r) === body));
  const plotted = groups.flat().sort(compareMelts);
  const average = mean(plotted);
  const extent = useMemo(() => {
    const dates = filteredPoints.filter(r => [1, 2].includes(furnaceBody(r))).map(r => r.date).filter(Number.isFinite);
    if (!dates.length) return [0, 0];
    return [dateRange.start ? Date.parse(`${dateRange.start}T00:00:00Z`) : Math.min(...dates),
      dateRange.end ? Date.parse(`${dateRange.end}T00:00:00Z`) : Math.max(...dates)];
  }, [filteredPoints, dateRange]);
  const day = 86400000;
  const totalDays = Math.round((extent[1] - extent[0]) / day) + 1;
  const visibleDays = Math.min(21, totalDays);
  const maxOffset = Math.max(0, totalDays - visibleDays);
  const offset = Math.min(windowOffset, maxOffset);
  const windowStart = extent[0] + offset * day;
  const windowEnd = windowStart + (visibleDays - 1) * day;
  const dates = Array.from({ length: visibleDays }, (_, i) => windowStart + i * day);
  const visibleGroups = groups.map(rows => rows.filter(r => r.date >= windowStart && r.date <= windowEnd));
  const energyMax = Math.max(1, ...plotted.map(r => r.energy)) * 1.1;
  const moveWindow = (next: number) => setWindowOffset(Math.max(0, Math.min(maxOffset, next)));
  const stopDragging = () => { drag.current = null; setDragging(false); };
  useEffect(() => { setWindowOffset(0); }, [extent[0], extent[1]]);
  const shown = plotted.slice(page * 30, (page + 1) * 30);
  return <section className="space-y-5 text-zinc-200" data-testid="energy-baseline">
    <div className="flex flex-wrap gap-4 items-end">
      <label className="text-sm space-y-1">第一批定義<select aria-label="第一批定義" value={mode} onChange={e => setMode(e.target.value as typeof mode)} className="block rounded border border-zinc-600 bg-zinc-800 p-2"><option value="daily">各爐體每日第一批</option><option value="rebuild">重新築爐後第001批</option></select></label>
    </div>
    <p className="text-xs text-zinc-400">爐次與每日順序依完整紀錄計算，不因篩選重新起算。築爐001僅計入明確標記重新築爐的批次；未標記的既有週期不視為築爐第一批。</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="rounded border border-zinc-700 overflow-hidden">
      <table className="w-full table-fixed text-xs sm:text-sm tabular-nums"><thead className="bg-zinc-800"><tr>{['爐體','第一批平均','後續批平均','差異','加權能耗'].map(label => <th className="p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>
        {groups.map((rows,index) => {
          const first = rows.filter(isFirst); const later = rows.filter(r => mode === 'daily' ? r.daily_sequence! > 1 : r.cycle_number! > 0 && r.heat_sequence! > 1);
          const a = mean(first), b = mean(later);
          const weighted = rows.length ? rows.reduce((s,r) => s + Number(r.power_kwh),0) / rows.reduce((s,r) => s+r.charge,0) : null;
          return <tr key={index} className="border-t border-zinc-700"><th className="p-2 text-left" style={{color: colors[index]}}>{index+1}號爐體</th><td className="p-2">{display(a)}<span className="block text-zinc-400">{first.length} 批</span></td><td className="p-2">{display(b)}<span className="block text-zinc-400">{later.length} 批</span></td><td className="p-2">{display(a != null && b != null ? a-b : null)}</td><td className="p-2">{display(weighted)}</td></tr>;
        })}
      </tbody></table>
    </div>
    <div data-testid="baseline-chart" className="rounded border border-zinc-700 p-3">
      <h3 className="mb-3 text-sm font-medium">日期能耗比較 <span className="text-zinc-400 font-normal">· kWh/kg</span></h3>
      <form className="mb-4 space-y-2" onSubmit={e => {
        e.preventDefault();
        if (dateDraft.start && dateDraft.end && dateDraft.start > dateDraft.end) {
          setDateError('開始日期不可晚於結束日期，請調整後再套用。'); return;
        }
        setDateError(''); setDateRange({ ...dateDraft }); setPage(0); setWindowOffset(0);
      }}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label htmlFor="energy-start">開始日期</Label><Input id="energy-start" type="date" value={dateDraft.start} onChange={e => setDateDraft(d => ({ ...d, start: e.target.value }))} aria-invalid={!!dateError} aria-describedby={dateError ? 'energy-date-error' : undefined} className="w-44 [color-scheme:dark]" /></div>
          <div className="space-y-1"><Label htmlFor="energy-end">結束日期</Label><Input id="energy-end" type="date" value={dateDraft.end} onChange={e => setDateDraft(d => ({ ...d, end: e.target.value }))} aria-invalid={!!dateError} aria-describedby={dateError ? 'energy-date-error' : undefined} className="w-44 [color-scheme:dark]" /></div>
          <Button type="submit" size="sm">套用日期</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => { setDateDraft({ start: '', end: '' }); setDateRange({ start: '', end: '' }); setDateError(''); setPage(0); setWindowOffset(0); }}>清除日期</Button>
        </div>
        {dateError && <p id="energy-date-error" role="alert" className="text-xs text-red-300">{dateError}</p>}
        <p data-testid="energy-applied-range" className="text-xs text-zinc-400" aria-live="polite">已套用：{dateRange.start || '最早日期'} ～ {dateRange.end || '最新日期'}（含起訖日）。圖表、上方統計及下方明細同步篩選；日期留空表示不限。</p>
      </form>
      {loading ? <p className="py-12 text-center text-zinc-400">正在加總投料與計算能耗…</p> : !plotted.length ? <p className="py-12 text-center text-zinc-400">尚無可比較的1、2號爐體資料，需填寫投料及耗電量。</p> : <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <button type="button" disabled={offset === 0} onClick={() => moveWindow(offset - 21)} className="rounded border border-zinc-600 px-3 py-2 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">前21天</button>
        <span data-testid="energy-date-window" data-start={windowStart} data-end={windowEnd} aria-live="polite">{dateLabel(windowStart)} ～ {dateLabel(windowEnd)} · {visibleDays}天</span>
        <button type="button" disabled={offset === maxOffset} onClick={() => moveWindow(offset + 21)} className="rounded border border-zinc-600 px-3 py-2 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">後21天</button>
      </div>
      <div data-testid="energy-drag-chart" role="group" aria-label="可左右拖曳的能耗圖表" tabIndex={0}
        className={`select-none rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${maxOffset ? dragging ? 'cursor-grabbing' : 'cursor-grab' : ''}`}
        style={{ touchAction: 'pan-y' }}
        onKeyDown={e => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const delta = e.key === 'ArrowLeft' ? -1 : 1;
            setWindowOffset(current => Math.max(0, Math.min(maxOffset, Math.min(current, maxOffset) + delta)));
          }
        }}
        onPointerDown={e => {
          if (!maxOffset || !e.isPrimary || e.button !== 0) return;
          drag.current = { pointerId: e.pointerId, x: e.clientX, offset, width: Math.max(1, e.currentTarget.clientWidth - 73) };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          const start = drag.current;
          if (!start || start.pointerId !== e.pointerId) return;
          if (Math.abs(e.clientX - start.x) > 4) setDragging(true);
          moveWindow(start.offset + Math.round((start.x - e.clientX) / start.width * visibleDays));
        }}
        onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); stopDragging(); }}
        onPointerCancel={stopDragging} onLostPointerCapture={stopDragging}>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 15, left: 5 }}>
          <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
          <XAxis type="number" dataKey="date" name="日期" domain={[windowStart - day / 2, windowEnd + day / 2]} allowDataOverflow ticks={dates} tickFormatter={dateLabel} minTickGap={24} stroke="#a1a1aa" fontSize={11} />
          <YAxis type="number" dataKey="energy" name="能耗" domain={[0, energyMax]} stroke="#a1a1aa" fontSize={11} width={48} />
          <Tooltip content={<PointTooltip />} /><Legend />
          {visibleGroups.map((rows,index) => <Scatter key={index} name={`${index+1}號爐體（非第一爐）`} data={rows.filter(r => !isFirst(r))} fill={colors[index]} isAnimationActive={false} />)}
          <Scatter name={mode === 'daily' ? '第一爐（各爐體每日第一批）' : '第一爐（重新築爐後第001批）'} data={visibleGroups.flat().filter(isFirst)} fill="#ef4444" isAnimationActive={false} />
          {groups.map((rows,index) => { const avg = mean(rows.filter(isFirst)); return avg == null ? null : <ReferenceLine key={index} y={avg} stroke={colors[index]} strokeDasharray="5 5" label={{ value: `${index+1}號第一批均 ${avg.toFixed(3)}`,fill: colors[index],fontSize:10,position:index ? 'insideBottomRight':'insideTopRight' }} />; })}
        </ScatterChart>
      </ResponsiveContainer>
      </div>
      {!visibleGroups.some(rows => rows.length) && <p className="py-2 text-center text-xs text-zinc-400">這段日期沒有能耗資料，可左右拖曳查看其他日期。</p>}
      <label className="mt-2 block text-xs text-zinc-300">拖曳日期範圍
        <input aria-label="拖曳日期範圍" type="range" min={0} max={maxOffset} step={1} value={offset} disabled={!maxOffset} onChange={e => moveWindow(Number(e.target.value))} className="mt-2 w-full accent-amber-300 disabled:opacity-40" />
      </label>
      <p className="mb-3 text-xs text-zinc-400">左右拖曳圖表或滑桿查看其他日期，每次最多21個日曆天（含無資料日期）。聚焦圖表後亦可用左右方向鍵。上方統計、平均基線與下方明細維持完整篩選範圍。</p>
      </>}
      <p className="text-xs text-zinc-400">每一點代表一批；同日期共用X座標，依實際能耗上下排列。相同日期且能耗相同的點會重疊，全部批次可在下方明細查看。</p>
    </div>
    <div className="space-y-2 text-xs">
      <p data-testid="energy-average" data-average={average ?? ''} data-count={plotted.length}>區間平均能耗：{display(average)} kWh/kg · {plotted.length} 批（目前篩選內1、2號爐體全部批次的算術平均）</p>
      <div className="flex flex-wrap gap-3"><span className="rounded bg-red-950 px-2 py-1 text-red-300">紅色：高於平均10%</span><span className="rounded bg-green-950 px-2 py-1 text-green-300">綠色：低於平均10%</span><span className="rounded bg-yellow-950 px-2 py-1 text-yellow-300">黃色：平均±10%內（含邊界）</span></div>
    </div>
    <div className="rounded border border-zinc-700 overflow-x-auto">
      <table data-testid="energy-details" className="w-full min-w-[640px] table-fixed text-xs tabular-nums"><thead className="bg-zinc-800"><tr>{['日期／熔解編號','爐體／週期','累計爐次','批次分類','投料 kg','耗電 kWh','能耗'].map(t => <th key={t} className="p-2 text-left break-words">{t}</th>)}</tr></thead><tbody>
        {shown.map(r => {
          const band = getEnergyBand(r.energy, average);
          return <tr key={r.id} data-date={r.melt_date} className="border-t border-zinc-700"><td className="p-2 break-all">{r.melt_date}<br />{r.melt_no}</td><td className="p-2">{furnaceBody(r)}號／{r.cycle_number || '既有'}</td><td className="p-2">{formatHeat(r.heat_sequence)}</td><td className="p-2">{r.rebuild ? '築爐001 ' : ''}{r.daily_sequence === 1 ? '每日第一批' : `每日第${r.daily_sequence || '—'}批`}</td><td className="p-2">{r.charge.toFixed(1)}</td><td className="p-2">{r.power_kwh}</td><td className="p-2"><span data-testid="energy-band" data-band={band?.key} data-energy={r.energy} title={band?.label} className={`inline-block rounded px-2 py-1 font-medium ${band?.className || 'text-zinc-400'}`}>{r.energy.toFixed(3)}{band && <span className="block text-[11px]">{band.deviation >= 0 ? '+' : ''}{band.deviation.toFixed(1)}%</span>}</span></td></tr>;
        })}
        {!shown.length && <tr><td colSpan={7} className="p-5 text-center text-zinc-400">此範圍沒有符合的批次。</td></tr>}
      </tbody></table>
    </div>
    {plotted.length > 30 && <div className="flex justify-end items-center gap-3 text-sm"><button disabled={page===0} onClick={() => setPage(p=>p-1)} className="disabled:opacity-40">上一頁</button><span>{page+1} / {Math.ceil(plotted.length/30)}</span><button disabled={(page+1)*30>=plotted.length} onClick={() => setPage(p=>p+1)} className="disabled:opacity-40">下一頁</button></div>}
    <p className="text-xs text-zinc-400">能耗 = 耗電 ÷ 投料明細總重量；平均為算術平均，加權能耗為總耗電 ÷ 總投料。差異 = 第一批平均 − 後續批平均；沒有樣本時顯示「—」，不以零代替。</p>
  </section>;
}
