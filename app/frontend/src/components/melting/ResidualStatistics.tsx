import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { residualRate, roundResidual, summarizeResidual, type ResidualStatRow } from '@/lib/residualStatistics';

export default function ResidualStatistics({ rows, source }: { rows: ResidualStatRow[]; source: 'melt' | 'pour' | 'previous' }) {
  const [expanded, setExpanded] = useState(true);
  const listId = useId();
  const isPrevious = source === 'previous';
  const isPour = source === 'pour';
  const title = isPrevious ? '前爐殘湯投料統計（獨立計算）' : isPour ? '批次澆注殘湯（獨立登錄）' : '爐次殘湯統計（本爐產生）';
  const baseLabel = isPour ? '總出湯重' : '總投料重（不含前爐殘湯）';
  const totalLabel = isPrevious ? '前爐殘湯投料合計' : isPour ? '澆注殘湯合計' : '本爐殘湯合計';
  const rateLabel = isPrevious ? '前爐殘湯利用率' : isPour ? '澆注殘湯率' : '本爐殘湯率';
  const summary = summarizeResidual(rows);
  const chargeTotal = roundResidual(rows.reduce((sum, row) => sum + (row.chargeWeight || 0), 0));
  const secondaryTotal = roundResidual(rows.reduce((sum, row) => sum + (row.secondaryWeight || 0), 0));
  const headers = ['日期', isPour ? '澆注編號' : '熔解編號', '爐號', isPour ? '批次' : '材質', `${baseLabel}(kg)`,
    ...(isPrevious ? ['首次投料(kg)', '二次添加(kg)'] : []), isPrevious ? '前爐殘湯投料(kg)' : '殘湯重量(kg)', isPrevious ? rateLabel : '殘湯率'];
  return (
    <section data-testid={`residual-${source}`} className="space-y-3 rounded border border-violet-900/50 p-4 text-zinc-300">
      <h3 className="text-sm font-semibold text-violet-200">{title}</h3>
      <p className="text-xs text-zinc-400">
        {isPrevious ? '來源：投料明細中的前爐殘湯（首次投料＋二次添加），依使用當爐的熔解日期篩選；不含本爐產生的殘湯。清單包含區間內全部爐次，未投入前爐殘湯者顯示0，合計分母為全部爐次的外購與回爐料投料重，不含前爐殘湯。'
          : isPour ? '來源：批次澆注登錄值，依建立日期篩選；與上方熔解爐次分開統計，不合併、不互相補值。'
            : '來源：熔解紀錄的本爐殘湯重量，依熔解日期篩選；不包含投料明細的前爐殘湯。'}
      </p>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 border-y border-zinc-700 py-3 text-xs tabular-nums">
        <div><dt>紀錄數</dt><dd className="mt-1 text-base text-zinc-100">{rows.length} 筆</dd></div>
        <div><dt>{baseLabel}</dt><dd className="mt-1 text-base text-zinc-100" data-testid="residual-base">{summary.baseWeight} kg</dd></div>
        <div><dt>{totalLabel}</dt><dd className="mt-1 text-base text-violet-200" data-testid="residual-total">{summary.residualWeight} kg</dd></div>
        <div><dt>{rateLabel}</dt><dd className="mt-1 text-base text-violet-200">{summary.rate}%</dd></div>
      </dl>
      <p className="text-xs text-zinc-400">{rateLabel} = {totalLabel} ÷ {baseLabel} × 100%；分母為 0 時顯示 0%。</p>
      {!isPour && <Button type="button" variant="secondary" size="sm" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(value => !value)}>
        {expanded ? <ChevronUp className="mr-1 h-4 w-4" aria-hidden="true" /> : <ChevronDown className="mr-1 h-4 w-4" aria-hidden="true" />}
        {expanded ? '收折清單' : '展開清單'}（{rows.length} 筆）
      </Button>}
      <div id={listId} hidden={!isPour && !expanded} data-testid="residual-list">
        {rows.length === 0 ? <p className="py-4 text-center text-sm text-zinc-400">此日期區間內無{isPour ? '澆注' : '熔解'}紀錄</p> : (
          <div className="overflow-x-auto">
            <table className={`w-full ${isPrevious ? 'min-w-[840px]' : 'min-w-[640px]'} text-xs tabular-nums`}>
              <thead className="bg-zinc-800 text-zinc-300"><tr>
                {headers.map((label, index) => <th key={label} scope="col" className={`p-2 ${index >= 4 ? 'text-right' : 'text-left'}`}>{label}</th>)}
              </tr></thead>
              <tbody>{rows.map(row => <tr key={row.id} data-record-id={row.id} className="border-b border-zinc-700/50">
                <td className="p-2">{row.date}</td><td className="p-2">{row.recordNo || '-'}</td><td className="p-2">{row.furnaceNo || '-'}</td><td className="p-2">{row.reference || '-'}</td>
                <td className="p-2 text-right">{row.baseWeight}</td>
                {isPrevious && <><td className="p-2 text-right">{row.chargeWeight || 0}</td><td className="p-2 text-right">{row.secondaryWeight || 0}</td></>}
                <td className="p-2 text-right text-violet-200">{row.residualWeight}</td><td className="p-2 text-right">{residualRate(row.residualWeight, row.baseWeight)}%</td>
              </tr>)}</tbody>
              <tfoot className="bg-zinc-800 font-semibold"><tr><td colSpan={4} className="p-2">合計</td><td className="p-2 text-right">{summary.baseWeight}</td>
                {isPrevious && <><td className="p-2 text-right">{chargeTotal}</td><td className="p-2 text-right">{secondaryTotal}</td></>}
                <td className="p-2 text-right text-violet-200">{summary.residualWeight}</td><td className="p-2 text-right">{summary.rate}%</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
