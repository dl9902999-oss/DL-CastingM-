/**
 * 能耗基線（Specific Energy Baseline）
 *
 * 依爐號的「爐序」將熔解紀錄分成兩組並分開表列：
 *  - 第一爐：爐號尾碼為 1（例如 1-1、2-1、3-1），屬冷爐起爐，能耗天然較高
 *  - 後續爐（第二／三／四爐…）：爐號尾碼 >= 2（例如 2-2、2-3、3-4），屬熱爐接續
 *
 * 能耗一律由投料明細即時推導（耗電 ÷ 總投料），避免使用父紀錄可能殘留的舊值。
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Gauge, TrendingUp, Flame } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { MeltRecord } from '@/lib/types';
import { dsGetMeltMaterials } from '@/lib/dataService';

/** 單筆能耗基線資料點 */
export interface BaselinePoint {
  id: string;
  melt_no: string;
  melt_date: string;
  furnace_no: string;
  /** 爐序：爐號尾碼數字，無法解析時視為 1 */
  sequence: number;
  material_grade: string;
  power_kwh: number;
  total_charge: number;
  /** 能耗 = 耗電 ÷ 總投料（kWh/kg） */
  specific_energy: number;
}

/**
 * 從爐號解析爐序。
 * 支援 `1-1`、`2-3`、`A-2`、`3_2` 等格式，取最後一段數字為爐序；無法解析時回傳 1。
 */
export function parseFurnaceSequence(furnaceNo: string): number {
  if (!furnaceNo) return 1;
  const segments = String(furnaceNo).split(/[-_/]/).filter(Boolean);
  const last = segments.length > 1 ? segments[segments.length - 1] : '';
  const matched = last.match(/\d+/);
  if (!matched) return 1;
  const value = Number(matched[0]);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 平均能耗（忽略無投料資料的爐次） */
function average(points: BaselinePoint[]): number {
  if (points.length === 0) return 0;
  const sum = points.reduce((acc, p) => acc + p.specific_energy, 0);
  return Number((sum / points.length).toFixed(3));
}

/** 合計重量／耗電，用於整體加權能耗 */
function weightedEnergy(points: BaselinePoint[]): number {
  const charge = points.reduce((acc, p) => acc + p.total_charge, 0);
  const power = points.reduce((acc, p) => acc + p.power_kwh, 0);
  return charge > 0 ? Number((power / charge).toFixed(3)) : 0;
}

/** 單組統計摘要 */
interface GroupStats {
  count: number;
  avg: number;
  weighted: number;
  min: number;
  max: number;
  totalCharge: number;
  totalPower: number;
}

function buildStats(points: BaselinePoint[]): GroupStats {
  const energies = points.map(p => p.specific_energy);
  return {
    count: points.length,
    avg: average(points),
    weighted: weightedEnergy(points),
    min: energies.length ? Number(Math.min(...energies).toFixed(3)) : 0,
    max: energies.length ? Number(Math.max(...energies).toFixed(3)) : 0,
    totalCharge: Number(points.reduce((a, p) => a + p.total_charge, 0).toFixed(1)),
    totalPower: Number(points.reduce((a, p) => a + p.power_kwh, 0).toFixed(1)),
  };
}

/** 明細表格（第一爐／後續爐共用） */
function BaselineTable({ title, points, stats, accent, testId }: {
  title: string; points: BaselinePoint[]; stats: GroupStats; accent: string; testId: string;
}) {
  return (
    <div className="flex-1 min-w-0" data-testid={testId}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-semibold ${accent}`}>{title}</span>
        <span className="text-[11px] text-zinc-500">
          {stats.count} 爐 · 平均 <span className={`font-bold ${accent}`} data-testid={`${testId}-avg`}>{stats.avg}</span> kWh/kg
        </span>
      </div>
      <div className="rounded border border-zinc-700">
        <table className="w-full table-fixed text-[11px]">
          <thead>
            <tr className="bg-zinc-900/60 text-zinc-400">
              <th className="px-2 py-1 text-left font-medium">日期</th>
              <th className="px-2 py-1 text-left font-medium">熔解編號</th>
              <th className="px-2 py-1 text-left font-medium">爐號</th>
              <th className="px-2 py-1 text-right font-medium">總投料(kg)</th>
              <th className="px-2 py-1 text-right font-medium">耗電(kWh)</th>
              <th className="px-2 py-1 text-right font-medium">能耗(kWh/kg)</th>
              <th className="px-2 py-1 text-right font-medium">對平均差異</th>
            </tr>
          </thead>
          <tbody>
            {points.length === 0 ? (
              <tr><td colSpan={7} className="px-2 py-3 text-center text-zinc-500">此區間無符合條件的爐次</td></tr>
            ) : points.map(p => {
              const diff = Number((p.specific_energy - stats.avg).toFixed(3));
              return (
                <tr key={p.id} className="border-t border-zinc-700/60 text-zinc-300">
                  <td className="px-2 py-1">{p.melt_date}</td>
                  <td className="px-2 py-1 font-mono text-amber-400/90">{p.melt_no}</td>
                  <td className="px-2 py-1">{p.furnace_no}</td>
                  <td className="px-2 py-1 text-right">{p.total_charge}</td>
                  <td className="px-2 py-1 text-right">{p.power_kwh}</td>
                  <td className={`px-2 py-1 text-right font-bold ${p.specific_energy > stats.avg ? 'text-red-400' : 'text-green-400'}`}>{p.specific_energy}</td>
                  <td className={`px-2 py-1 text-right ${diff > 0 ? 'text-red-400/80' : 'text-green-400/80'}`}>{diff > 0 ? `+${diff}` : diff}</td>
                </tr>
              );
            })}
          </tbody>
          {points.length > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-600 bg-zinc-900/60 font-semibold text-zinc-200">
                <td className="px-2 py-1" colSpan={3}>合計 / 平均</td>
                <td className="px-2 py-1 text-right">{stats.totalCharge}</td>
                <td className="px-2 py-1 text-right">{stats.totalPower}</td>
                <td className={`px-2 py-1 text-right ${accent}`}>{stats.avg}</td>
                <td className="px-2 py-1 text-right text-zinc-400">加權 {stats.weighted}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-1 text-[10px] text-zinc-500">
        區間：{stats.count > 0 ? `${stats.min} ~ ${stats.max}` : '—'} kWh/kg ·
        加權能耗 = 總耗電 ÷ 總投料 = {stats.weighted} kWh/kg
      </p>
    </div>
  );
}

/**
 * 能耗基線面板：分組表列 + 折線圖連動 + 平均統計。
 * @param records 已套用頁面篩選條件的熔解紀錄
 * @param detailVersion 明細版本號，儲存後遞增以重新取得投料明細
 */
export default function EnergyBaseline({ records, detailVersion }: {
  records: MeltRecord[]; detailVersion: number;
}) {
  const [points, setPoints] = useState<BaselinePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // 依熔解紀錄逐筆取投料明細，推導總投料與能耗（與卡片顯示同一套公式）
  const recordKey = records.map(r => `${r.id}:${r.power_kwh}`).join('|');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (records.length === 0) { setPoints([]); return; }
      setLoading(true);
      try {
        const results = await Promise.all(records.map(async r => {
          const mats = await dsGetMeltMaterials(r.id);
          const totalCharge = mats.reduce(
            (sum, m) => sum + (Number(m.charge_weight) || 0) + (Number(m.secondary_weight) || 0), 0,
          );
          const power = Number(r.power_kwh) || 0;
          return {
            id: r.id,
            melt_no: r.melt_no,
            melt_date: r.melt_date,
            furnace_no: r.furnace_no,
            sequence: parseFurnaceSequence(r.furnace_no),
            material_grade: r.material_grade,
            power_kwh: Number(power.toFixed(1)),
            total_charge: Number(totalCharge.toFixed(1)),
            specific_energy: totalCharge > 0 ? Number((power / totalCharge).toFixed(3)) : 0,
          } as BaselinePoint;
        }));
        if (!cancelled) {
          // 僅保留可計算能耗的爐次（有投料且有耗電），依日期與編號升冪排列
          setPoints(results
            .filter(p => p.total_charge > 0 && p.power_kwh > 0)
            .sort((a, b) => (a.melt_date === b.melt_date
              ? a.melt_no.localeCompare(b.melt_no)
              : a.melt_date.localeCompare(b.melt_date))));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [recordKey, detailVersion, records]);

  const firstHeat = useMemo(() => points.filter(p => p.sequence <= 1), [points]);
  const laterHeat = useMemo(() => points.filter(p => p.sequence >= 2), [points]);
  const firstStats = useMemo(() => buildStats(firstHeat), [firstHeat]);
  const laterStats = useMemo(() => buildStats(laterHeat), [laterHeat]);

  // 折線圖資料：以「日期 + 編號」為共同 X 軸，兩組各自佔一條線，未屬該組者為 null 形成斷點
  const chartData = useMemo(() => points.map(p => ({
    label: `${p.melt_date.slice(5)} ${p.melt_no.slice(-6)}`,
    melt_no: p.melt_no,
    furnace_no: p.furnace_no,
    first: p.sequence <= 1 ? p.specific_energy : null,
    later: p.sequence >= 2 ? p.specific_energy : null,
  })), [points]);

  const gap = Number((firstStats.avg - laterStats.avg).toFixed(3));

  return (
    <Card className="bg-zinc-800 border-zinc-700" data-testid="energy-baseline">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-zinc-100">能耗基線</span>
            <span className="text-[11px] text-zinc-500">依爐號爐序分組（第一爐 vs 第二／三／四爐）</span>
          </div>
          <button
            type="button"
            data-testid="energy-baseline-toggle"
            onClick={() => setCollapsed(v => !v)}
            className="text-xs text-zinc-400 hover:text-zinc-100 print:hidden"
          >
            {collapsed ? '展開' : '收折'}
          </button>
        </div>

        {!collapsed && (
          <div className="mt-3 space-y-3">
            {/* 摘要卡 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded border border-zinc-700 bg-zinc-900/50 p-2">
                <p className="text-[10px] text-zinc-500 flex items-center gap-1"><Flame className="w-3 h-3" />第一爐平均能耗</p>
                <p className="text-lg font-bold text-orange-400" data-testid="baseline-first-avg">{firstStats.avg}</p>
                <p className="text-[10px] text-zinc-500">{firstStats.count} 爐 · kWh/kg</p>
              </div>
              <div className="rounded border border-zinc-700 bg-zinc-900/50 p-2">
                <p className="text-[10px] text-zinc-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" />後續爐平均能耗</p>
                <p className="text-lg font-bold text-cyan-400" data-testid="baseline-later-avg">{laterStats.avg}</p>
                <p className="text-[10px] text-zinc-500">{laterStats.count} 爐 · kWh/kg</p>
              </div>
              <div className="rounded border border-zinc-700 bg-zinc-900/50 p-2">
                <p className="text-[10px] text-zinc-500">第一爐較後續爐</p>
                <p className={`text-lg font-bold ${gap > 0 ? 'text-red-400' : 'text-green-400'}`} data-testid="baseline-gap">
                  {gap > 0 ? `+${gap}` : gap}
                </p>
                <p className="text-[10px] text-zinc-500">kWh/kg 差異</p>
              </div>
              <div className="rounded border border-zinc-700 bg-zinc-900/50 p-2">
                <p className="text-[10px] text-zinc-500">全部爐次平均</p>
                <p className="text-lg font-bold text-amber-400" data-testid="baseline-overall-avg">{average(points)}</p>
                <p className="text-[10px] text-zinc-500">{points.length} 爐 · kWh/kg</p>
              </div>
            </div>

            {/* 折線圖：兩組同圖連動，並以虛線標出各自平均基線 */}
            <div className="rounded border border-zinc-700 bg-zinc-900/40 p-2" data-testid="baseline-chart">
              {chartData.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-500">
                  {loading ? '能耗資料載入中…' : '尚無可計算能耗的爐次（需同時有投料明細與耗電量）'}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis dataKey="label" stroke="#a1a1aa" fontSize={10} tickMargin={6} interval="preserveStartEnd" />
                    <YAxis stroke="#a1a1aa" fontSize={10} width={46} unit="" />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: '#e4e4e7' }}
                      formatter={(value: number | null, name: string) => [value == null ? '—' : `${value} kWh/kg`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {firstStats.count > 0 && (
                      <ReferenceLine y={firstStats.avg} stroke="#fb923c" strokeDasharray="4 4"
                        label={{ value: `第一爐均 ${firstStats.avg}`, fill: '#fb923c', fontSize: 10, position: 'insideTopLeft' }} />
                    )}
                    {laterStats.count > 0 && (
                      <ReferenceLine y={laterStats.avg} stroke="#22d3ee" strokeDasharray="4 4"
                        label={{ value: `後續爐均 ${laterStats.avg}`, fill: '#22d3ee', fontSize: 10, position: 'insideBottomLeft' }} />
                    )}
                    <Line type="monotone" dataKey="first" name="第一爐" stroke="#fb923c" strokeWidth={2}
                      dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                    <Line type="monotone" dataKey="later" name="第二／三／四爐" stroke="#22d3ee" strokeWidth={2}
                      dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 分開表列 */}
            <div className="flex flex-col lg:flex-row gap-3">
              <BaselineTable title="第一爐（爐號尾碼 -1，如 1-1／2-1／3-1）" points={firstHeat} stats={firstStats}
                accent="text-orange-400" testId="baseline-table-first" />
              <BaselineTable title="第二／三／四爐（爐號尾碼 -2 以上，如 2-2／2-3）" points={laterHeat} stats={laterStats}
                accent="text-cyan-400" testId="baseline-table-later" />
            </div>

            <p className="text-[10px] text-zinc-500">
              能耗 = 耗電(kWh) ÷ 總投料(kg)，總投料由投料明細即時加總；平均能耗為各爐能耗的算術平均，加權能耗為總耗電 ÷ 總投料。
              分組依爐號最後一段數字判定爐序，無爐序資訊者歸入第一爐。統計範圍隨上方搜尋與篩選條件連動。
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
