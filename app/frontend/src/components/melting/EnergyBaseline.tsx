import { useEffect, useMemo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { dsGetMeltMaterials } from '@/lib/dataService';
import { formatHeat, furnaceBody, compareMelts } from '@/lib/meltSequence';
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
  const [page, setPage] = useState(0);
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
  const groups = [1,2].map(body => points.filter(r => furnaceBody(r) === body));
  const plotted = groups.flat().sort(compareMelts);
  const dates = useMemo(() => [...new Set(points.map(r => r.date))].sort((a,b) => a-b), [points]);
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
      {loading ? <p className="py-12 text-center text-zinc-400">正在加總投料與計算能耗…</p> : !plotted.length ? <p className="py-12 text-center text-zinc-400">尚無可比較的1、2號爐體資料，需填寫投料及耗電量。</p> : <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 15, left: 5 }}>
          <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
          <XAxis type="number" dataKey="date" name="日期" domain={['dataMin','dataMax']} ticks={dates} tickFormatter={dateLabel} minTickGap={24} stroke="#a1a1aa" fontSize={11} />
          <YAxis type="number" dataKey="energy" name="能耗" stroke="#a1a1aa" fontSize={11} width={48} />
          <Tooltip content={<PointTooltip />} /><Legend />
          {groups.map((rows,index) => <Scatter key={index} name={`${index+1}號爐體`} data={rows} fill={colors[index]} isAnimationActive={false} />)}
          {groups.map((rows,index) => { const avg = mean(rows.filter(isFirst)); return avg == null ? null : <ReferenceLine key={index} y={avg} stroke={colors[index]} strokeDasharray="5 5" label={{ value: `${index+1}號第一批均 ${avg.toFixed(3)}`,fill: colors[index],fontSize:10,position:index ? 'insideBottomRight':'insideTopRight' }} />; })}
        </ScatterChart>
      </ResponsiveContainer>}
      <p className="text-xs text-zinc-400">每一點代表一批；同日期共用X座標，依實際能耗上下排列。相同日期且能耗相同的點會重疊，全部批次可在下方明細查看。</p>
    </div>
    <div className="rounded border border-zinc-700">
      <table className="w-full table-fixed text-xs tabular-nums"><thead className="bg-zinc-800"><tr>{['日期／熔解編號','爐體／週期','累計爐次','批次分類','投料 kg','耗電 kWh','能耗'].map(t => <th key={t} className="p-2 text-left break-words">{t}</th>)}</tr></thead><tbody>
        {shown.map(r => <tr key={r.id} className="border-t border-zinc-700"><td className="p-2 break-all">{r.melt_date}<br />{r.melt_no}</td><td className="p-2">{furnaceBody(r)}號／{r.cycle_number || '既有'}</td><td className="p-2">{formatHeat(r.heat_sequence)}</td><td className="p-2">{r.rebuild ? '築爐001 ' : ''}{r.daily_sequence === 1 ? '每日第一批' : `每日第${r.daily_sequence || '—'}批`}</td><td className="p-2">{r.charge.toFixed(1)}</td><td className="p-2">{r.power_kwh}</td><td className="p-2">{r.energy.toFixed(3)}</td></tr>)}
        {!shown.length && <tr><td colSpan={7} className="p-5 text-center text-zinc-400">此範圍沒有符合的批次。</td></tr>}
      </tbody></table>
    </div>
    {plotted.length > 30 && <div className="flex justify-end items-center gap-3 text-sm"><button disabled={page===0} onClick={() => setPage(p=>p-1)} className="disabled:opacity-40">上一頁</button><span>{page+1} / {Math.ceil(plotted.length/30)}</span><button disabled={(page+1)*30>=plotted.length} onClick={() => setPage(p=>p+1)} className="disabled:opacity-40">下一頁</button></div>}
    <p className="text-xs text-zinc-400">能耗 = 耗電 ÷ 投料明細總重量；平均為算術平均，加權能耗為總耗電 ÷ 總投料。差異 = 第一批平均 − 後續批平均；沒有樣本時顯示「—」，不以零代替。</p>
  </section>;
}
