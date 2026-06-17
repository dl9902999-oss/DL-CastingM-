import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { traceByWorkOrder, traceByBatch, traceByHeatNo, traceByShipment } from '@/lib/store';
import { Search, ClipboardList, Layers, Flame, CheckCircle, Package, Truck } from 'lucide-react';

interface TraceResult {
  orders: { order_no: string; customer: string; status: string }[];
  batches: { batch_no: string; quantity_planned: number; quantity_completed: number; status: string }[];
  meltings: { heat_no: string; furnace_no: string; melting_weight: number; pouring_weight: number; yield_rate: number }[];
  inspections: { batch_no: string; result: string; inspected_quantity: number; defect_count: number }[];
  warehouse: { batch_no: string; location: string; quantity: number }[];
  shipments: { shipment_no: string; customer: string; quantity: number; status: string }[];
}

export default function Traceability() {
  const [searchType, setSearchType] = useState('workorder');
  const [searchTerm, setSearchTerm] = useState('');
  const [result, setResult] = useState<TraceResult | null>(null);

  const handleSearch = () => {
    if (!searchTerm.trim()) return;
    let traceResult;
    switch (searchType) {
      case 'workorder':
        traceResult = traceByWorkOrder(searchTerm);
        break;
      case 'batch':
        traceResult = traceByBatch(searchTerm);
        break;
      case 'heatno':
        traceResult = traceByHeatNo(searchTerm);
        break;
      case 'shipment':
        traceResult = traceByShipment(searchTerm);
        break;
      default:
        return;
    }
    setResult(traceResult as TraceResult);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-zinc-100">生產追溯</h1>

        {/* Search Section */}
        <Card className="bg-zinc-800 border-zinc-700">
          <CardContent className="p-4">
            <Tabs value={searchType} onValueChange={setSearchType}>
              <TabsList className="bg-zinc-700 mb-3">
                <TabsTrigger value="workorder" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900">工單</TabsTrigger>
                <TabsTrigger value="batch" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900">批次</TabsTrigger>
                <TabsTrigger value="heatno" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900">Heat No</TabsTrigger>
                <TabsTrigger value="shipment" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900">出貨單</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex gap-2">
              <Input
                placeholder={`輸入${searchType === 'workorder' ? '工單號' : searchType === 'batch' ? '批次號' : searchType === 'heatno' ? 'Heat No' : '出貨單號'}...`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="bg-zinc-700 border-zinc-600 text-zinc-100 placeholder:text-zinc-500"
              />
              <Button onClick={handleSearch} className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Work Orders */}
            {result.orders.length > 0 && (
              <Card className="bg-zinc-800 border-zinc-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-zinc-100 text-sm flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-blue-400" />工單
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result.orders.map((o, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-zinc-700 last:border-0">
                      <span className="text-sm text-zinc-200">{o.order_no}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">{o.customer}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">{o.status}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Batches */}
            {result.batches.length > 0 && (
              <Card className="bg-zinc-800 border-zinc-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-zinc-100 text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />造模批次
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result.batches.map((b, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-zinc-700 last:border-0">
                      <span className="text-sm text-zinc-200">{b.batch_no}</span>
                      <span className="text-xs text-zinc-400">{b.quantity_completed}/{b.quantity_planned} ({b.status})</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Melting */}
            {result.meltings.length > 0 && (
              <Card className="bg-zinc-800 border-zinc-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-zinc-100 text-sm flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-400" />熔煉澆注
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result.meltings.map((m, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-zinc-700 last:border-0">
                      <div>
                        <span className="text-sm text-zinc-200">{m.heat_no}</span>
                        <span className="text-xs text-zinc-400 ml-2">爐號: {m.furnace_no}</span>
                      </div>
                      <span className="text-xs text-zinc-400">收得率: {m.yield_rate}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Quality */}
            {result.inspections.length > 0 && (
              <Card className="bg-zinc-800 border-zinc-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-zinc-100 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />品質檢驗
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result.inspections.map((q, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-zinc-700 last:border-0">
                      <span className="text-sm text-zinc-200">{q.batch_no}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          q.result === 'PASS' ? 'bg-green-500/20 text-green-400' :
                          q.result === 'HOLD' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>{q.result}</span>
                        <span className="text-xs text-zinc-400">缺陷: {q.defect_count}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Warehouse */}
            {result.warehouse.length > 0 && (
              <Card className="bg-zinc-800 border-zinc-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-zinc-100 text-sm flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-400" />入庫
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result.warehouse.map((w, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-zinc-700 last:border-0">
                      <span className="text-sm text-zinc-200">{w.batch_no}</span>
                      <span className="text-xs text-zinc-400">庫位: {w.location} | 數量: {w.quantity}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Shipments */}
            {result.shipments.length > 0 && (
              <Card className="bg-zinc-800 border-zinc-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-zinc-100 text-sm flex items-center gap-2">
                    <Truck className="w-4 h-4 text-purple-400" />出貨
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result.shipments.map((s, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-zinc-700 last:border-0">
                      <span className="text-sm text-zinc-200">{s.shipment_no}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">{s.customer} | {s.quantity}件</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          s.status === 'Pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
                        }`}>{s.status}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* No results */}
            {result.orders.length === 0 && result.batches.length === 0 && result.meltings.length === 0 &&
             result.inspections.length === 0 && result.warehouse.length === 0 && result.shipments.length === 0 && (
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-8 text-center text-zinc-400">
                  未找到相關紀錄
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}