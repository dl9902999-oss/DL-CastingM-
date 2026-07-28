import { useState, useEffect } from 'react';
import { useSyncTrigger } from '@/hooks/useSyncedData';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShipmentOrder, WorkOrder } from '@/lib/types';
import { dsGetShipmentOrders, dsCreateShipmentOrder, dsUpdateShipmentOrder, dsGetWorkOrders } from '@/lib/dataService';
import { Plus, Truck, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Shipment() {
  const [shipments, setShipments] = useState<ShipmentOrder[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({ work_order_id: '', quantity: 0, ship_date: '' });

  const syncTrigger = useSyncTrigger();

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      try {
        const [s, wo] = await Promise.all([dsGetShipmentOrders(), dsGetWorkOrders()]);
        if (!cancelled) { setShipments(s); setWorkOrders(wo); }
      } catch { /* handled */ }
      finally { if (!cancelled) setLoading(false); }
    };
    loadData();
    return () => { cancelled = true; };
  }, [syncTrigger]);

  const handleCreate = async () => {
    if (!form.work_order_id || form.quantity <= 0 || !form.ship_date) {
      toast({ title: '請填寫所有必要欄位', variant: 'destructive' });
      return;
    }
    const wo = workOrders.find(o => o.id === form.work_order_id);
    if (!wo) return;
    try {
      await dsCreateShipmentOrder({
        work_order_id: form.work_order_id,
        order_no: wo.order_no,
        customer: wo.customer,
        quantity: form.quantity,
        ship_date: form.ship_date,
      });
      const data = await dsGetShipmentOrders();
      setShipments(data);
      setIsCreateOpen(false);
      setForm({ work_order_id: '', quantity: 0, ship_date: '' });
      toast({ title: '出貨單已建立' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Shipment] Create failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，出貨單建立失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '建立失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  const handleShip = async (id: string) => {
    try {
      await dsUpdateShipmentOrder(id, { status: 'Shipped' });
      const data = await dsGetShipmentOrders();
      setShipments(data);
      toast({ title: '已標記為已出貨' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Shipment] Ship failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，出貨狀態更新失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '更新失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">出貨管理</h1>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
                <Plus className="w-4 h-4 mr-2" />新增出貨單
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-zinc-100">新增出貨單</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-300">工單</Label>
                  <Select value={form.work_order_id} onValueChange={val => setForm({ ...form, work_order_id: val })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇工單" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {workOrders.map(wo => (
                        <SelectItem key={wo.id} value={wo.id}>{wo.order_no} - {wo.customer}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">出貨數量</Label>
                  <Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">出貨日期</Label>
                  <Input type="date" value={form.ship_date} onChange={e => setForm({ ...form, ship_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <Button onClick={handleCreate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">建立</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Shipments List */}
        <div className="space-y-3">
          {shipments.length === 0 ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardContent className="p-8 text-center text-zinc-400">尚無出貨單</CardContent>
            </Card>
          ) : (
            shipments.map(shipment => (
              <Card key={shipment.id} className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Truck className={`w-5 h-5 ${shipment.status === 'Shipped' ? 'text-green-400' : 'text-amber-400'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-amber-400">{shipment.shipment_no}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            shipment.status === 'Pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
                          }`}>{shipment.status === 'Pending' ? '待出貨' : '已出貨'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 mt-1">
                          <span>工單: <span className="text-zinc-200">{shipment.order_no}</span></span>
                          <span>客戶: <span className="text-zinc-200">{shipment.customer}</span></span>
                          <span>數量: <span className="text-zinc-200">{shipment.quantity}</span></span>
                          <span>日期: <span className="text-zinc-200">{shipment.ship_date}</span></span>
                        </div>
                      </div>
                    </div>
                    {shipment.status === 'Pending' && (
                      <Button size="sm" onClick={() => handleShip(shipment.id)} className="bg-green-600 hover:bg-green-700 text-white">
                        <Check className="w-3 h-3 mr-1" />確認出貨
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}