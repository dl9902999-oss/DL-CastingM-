import { residualRate, summarizeResidual, type ResidualStatRow } from '@/lib/residualStatistics';

export default function ResidualStatistics({ rows, source }: { rows: ResidualStatRow[]; source: 'melt' | 'pour' }) {
  const isMelt = source === 'melt';
  const title = isMelt ? '爐次殘湯統計（本爐產生）' : '批次澆注殘湯（獨立登錄）';
  const baseLabel = isMelt ? '總投料重' : '總出湯重';
  const summary = summarizeResidual(rows);
  return (
    <section data-testid={`residual-${source}`} className="space-y-3 rounded border border-violet-900/50 p-4 text-zinc-300">
      <h3 className="text-sm font-semibold text-violet-200">{title}</h3>
      <p className="text-xs text-zinc-400">
        {isMelt ? '來源：熔解紀錄的本爐殘湯重量，依熔解日期篩選；不包含投料明細的前爐殘湯。' : '來源：批次澆注登錄值，依建立日期篩選；與上方熔解爐次分開統計，不合併、不互相補值。'}
      </p>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 border-y border-zinc-700 py-3 text-xs tabular-nums">
        <div><dt>紀錄數</dt><dd className="mt-1 text-base text-zinc-100">{rows.length} 筆</dd></div>
        <div><dt>{baseLabel}</dt><dd className="mt-1 text-base text-zinc-100" data-testid="residual-base">{summary.baseWeight} kg</dd></div>
        <div><dt>{isMelt ? '本爐殘湯合計' : '澆注殘湯合計'}</dt><dd className="mt-1 text-base text-violet-200" data-testid="residual-total">{summary.residualWeight} kg</dd></div>
        <div><dt>{isMelt ? '本爐殘湯率' : '澆注殘湯率'}</dt><dd className="mt-1 text-base text-violet-200">{summary.rate}%</dd></div>
      </dl>
      <p className="text-xs text-zinc-400">殘湯率 = 此來源殘湯合計 ÷ {baseLabel} × 100%；分母為 0 時顯示 0%。</p>
      {rows.length === 0 ? <p className="py-4 text-center text-sm text-zinc-400">此日期區間內無{isMelt ? '熔解' : '澆注'}紀錄</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs tabular-nums">
            <thead className="bg-zinc-800 text-zinc-300"><tr>
              {['日期', isMelt ? '熔解編號' : '澆注編號', '爐號', isMelt ? '材質' : '批次', `${baseLabel}(kg)`, '殘湯重量(kg)', '殘湯率'].map((label, index) => <th key={label} className={`p-2 ${index >= 4 ? 'text-right' : 'text-left'}`}>{label}</th>)}
            </tr></thead>
            <tbody>{rows.map(row => <tr key={row.id} className="border-b border-zinc-700/50">
              <td className="p-2">{row.date}</td><td className="p-2">{row.recordNo || '-'}</td><td className="p-2">{row.furnaceNo || '-'}</td><td className="p-2">{row.reference || '-'}</td>
              <td className="p-2 text-right">{row.baseWeight}</td><td className="p-2 text-right text-violet-200">{row.residualWeight}</td><td className="p-2 text-right">{residualRate(row.residualWeight, row.baseWeight)}%</td>
            </tr>)}</tbody>
            <tfoot className="bg-zinc-800 font-semibold"><tr><td colSpan={4} className="p-2">合計</td><td className="p-2 text-right">{summary.baseWeight}</td><td className="p-2 text-right text-violet-200">{summary.residualWeight}</td><td className="p-2 text-right">{summary.rate}%</td></tr></tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
