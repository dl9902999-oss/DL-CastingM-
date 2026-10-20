import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, Package, Truck, Flame, Zap, RefreshCw, ArrowUpRight } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { useDataConnection } from '@/contexts/DataContext';
import { loadDashboardOverview } from '@/lib/dashboardService';
import type { WorkOrder } from '@/lib/types';

const number = (value: number) => value.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
const statusNames: Record<string, string> = { OPEN: '開立', ANALYZING: '分析中', IMPLEMENTING: '實施中', VERIFYING: '驗證中' };

function QueueCard<T extends { id: string }>({ title, note, rows, render }: {
  title: string; note: string; rows: T[]; render: (row: T) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / 5));
  const current = Math.min(page, totalPages - 1);
  return <Card className="bg-zinc-800 border-zinc-700 min-w-0 flex flex-col">
    <CardHeader className="pb-3"><CardTitle className="text-base text-zinc-100 flex justify-between gap-2">{title}<span className="text-amber-400 tabular-nums">{rows.length}</span></CardTitle><p className="text-xs text-zinc-400 leading-5">{note}</p></CardHeader>
    <CardContent className="flex-1 flex flex-col gap-3">
      <div className="space-y-2 flex-1">{rows.length ? rows.slice(current * 5, current * 5 + 5).map(row => <div key={row.id}>{render(row)}</div>) : <p className="text-sm text-zinc-400 py-8 text-center">目前無待處理項目</p>}</div>
      {totalPages > 1 && <div className="flex items-center justify-between text-xs text-zinc-400"><Button variant="ghost" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>上一頁</Button><span>{current + 1} / {totalPages}</span><Button variant="ghost" size="sm" disabled={current + 1 === totalPages} onClick={() => setPage(current + 1)}>下一頁</Button></div>}
    </CardContent>
  </Card>;
}

function OrderRow({ order, today, target }: { order: WorkOrder; today: string; target: string }) {
  return <Link to={target} className="block rounded-lg bg-zinc-900/50 p-3 hover:bg-zinc-700 focus-visible:outline-amber-400">
    <div className="flex justify-between gap-2"><span className="text-sm font-medium text-zinc-100 break-all">{order.order_no}</span><ArrowUpRight className="w-4 h-4 shrink-0 text-zinc-400" /></div>
    <p className="text-xs text-zinc-400 mt-1 break-words">{order.customer} · {order.product_name}</p>
    <div className="flex flex-wrap justify-between gap-1 mt-2 text-xs"><span className={order.due_date < today ? 'text-red-400' : 'text-amber-300'}>{order.due_date < today ? '已逾期' : '交期'} {order.due_date}</span><span className="text-zinc-300">{number(order.quantity)} 件</span></div>
  </Link>;
}

export default function Dashboard() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadDashboardOverview>> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const { lastSyncTime, isOnline } = useDataConnection();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadDashboardOverview().then(result => { if (!cancelled) { setData(result); setError(''); } })
      .catch(() => { if (!cancelled) setError('總覽資料載入失敗，請重試。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lastSyncTime, retry]);
  const metrics = data ? [
    { label: '本月投料總重', value: number(data.monthlyCharge), unit: 'kg', icon: Flame, color: 'text-orange-400', note: '當月熔解投料明細：首次＋二次投料' },
    { label: '待排產工單預估重', value: number(data.unpouredWeight), unit: 'kg', icon: Package, color: 'text-blue-400', note: '未澆注件數 × 工單預估單重' },
    { label: '已澆鑄待處理重', value: number(data.pouredWeight), unit: 'kg', icon: Activity, color: 'text-amber-400', note: '已澆注件數 × 工單預估單重' },
    { label: '本月入庫重量', value: number(data.monthlyWarehouseWeight), unit: 'kg', icon: Truck, color: 'text-emerald-400', note: `推估重量：品檢放行批次入庫件數 × 預估單重${data.missingWarehouseWeights ? `；${data.missingWarehouseWeights} 筆缺少單重／工單` : ''}` },
    { label: '熔解月均能耗', value: data.averageEnergy === null ? '—' : data.averageEnergy.toFixed(3), unit: 'kWh/kg', icon: Zap, color: 'text-purple-400', note: `${data.energyCount} 爐有效能耗的算術平均${data.missingEnergy ? `；${data.missingEnergy} 爐缺有效投料／電量` : ''}` },
  ] : [];
  return <AppLayout><div className="space-y-6">
    <header className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-zinc-100">總覽</h1><p className="text-sm text-zinc-400 mt-1">{data?.month.replace('-', ' 年 ')}{data ? ' 月生產摘要' : '生產摘要'}</p></div><Button variant="ghost" disabled={loading} onClick={() => setRetry(value => value + 1)} className="text-zinc-300"><RefreshCw className={`mr-2 w-4 h-4 ${loading ? 'animate-spin' : ''}`} />重新整理</Button></header>
    {error && <div role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-red-300">{error}{data && ' 下方保留上次成功載入資料。'}</div>}
    {!data && loading && <p role="status" className="py-12 text-center text-zinc-400">正在載入總覽資料…</p>}
    {data && <>
      <section aria-label="生產重量與能耗" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">{metrics.map(metric => <Card key={metric.label} className="bg-zinc-800 border-zinc-700 min-w-0"><CardContent className="p-4"><metric.icon className={`w-5 h-5 mb-4 ${metric.color}`} /><h2 className="text-sm text-zinc-300 mb-2">{metric.label}</h2><p className="text-2xl font-bold text-zinc-100 tabular-nums break-words">{metric.value}<span className="text-xs font-normal text-zinc-400 ml-1">{metric.unit}</span></p><p className="text-xs text-zinc-400 mt-3 leading-5">{metric.note}</p></CardContent></Card>)}</section>
      <section aria-label="待辦事項" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <QueueCard title="需盡快排產" note="交期 3 週內（含逾期）、尚有未澆注數量；依工單建立順序" rows={data.urgentProduction} render={order => <OrderRow order={order} today={data.today} target="/work-orders" />} />
        <QueueCard title="需盡快出貨" note="交期 2 週內（含逾期）、尚未全數出貨；依工單建立順序" rows={data.urgentShipment} render={order => <OrderRow order={order} today={data.today} target="/shipment" />} />
        <QueueCard title="異常處理追蹤" note="品管未結案 CAPA · 廠外／廠內／未分類" rows={data.exceptions} render={item => <Link to="/quality?tab=capa" className="block rounded-lg bg-zinc-900/50 p-3 hover:bg-zinc-700"><div className="flex justify-between gap-2 text-xs"><span className="text-amber-300">{item.origin} · {item.capa_no}</span><span className="text-zinc-300">{statusNames[item.status]}</span></div><p className="text-sm text-zinc-200 mt-2 break-words line-clamp-3">{item.problem_description}</p><p className="text-xs text-zinc-400 mt-2">{item.order?.order_no || '未關聯工單'} · {item.responsible_person || '未指定負責人'}</p>{item.due_date && <p className="text-xs text-zinc-400 mt-1">處理期限 {item.due_date}</p>}</Link>} />
      </section>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4"><Card className="bg-zinc-800 border-zinc-700"><CardHeader><CardTitle className="text-lg text-zinc-100">生產概況</CardTitle></CardHeader><CardContent><dl className="space-y-3">{data.summary.map(row => <div className="flex justify-between text-sm" key={row.label}><dt className="text-zinc-400">{row.label}</dt><dd className="text-zinc-100 tabular-nums">{row.count} 單</dd></div>)}</dl><p className="text-xs text-zinc-500 mt-4">各階段按工單去重；部分完成亦計入。除總數外，生產階段排除取消工單；異常保留未結案追蹤。</p></CardContent></Card>
      <Card className="bg-zinc-800 border-zinc-700"><CardHeader><CardTitle className="text-lg text-zinc-100">系統狀態</CardTitle></CardHeader><CardContent className="space-y-4 text-sm text-zinc-300"><p className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${error ? 'bg-red-400' : 'bg-emerald-400'}`} />{error ? '資料載入異常' : '系統運行正常'}</p><p className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />{isOnline === null ? '連線檢查中…' : isOnline ? 'Supabase 雲端已連接' : '離線模式（本地儲存）'}</p><div className="border-t border-zinc-700 pt-4"><p className="text-zinc-400 mb-1">最後一筆資料更新時間</p><p className="tabular-nums">{data.lastUpdated ? new Date(data.lastUpdated).toLocaleString('zh-TW', { hour12: false }) : '尚無資料更新紀錄'}</p>{(isOnline === false || data.updateTimeUnavailable) && <p className="text-xs text-amber-300 mt-2">目前顯示快取時間，尚未確認最新雲端異動。</p>}</div></CardContent></Card></section>
    </>}
  </div></AppLayout>;
}
