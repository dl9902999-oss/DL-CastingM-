import { orderItems, resolveOrderItem, itemMatches } from '@/lib/workOrderItems';
import { useState, useEffect } from 'react';
import { useSyncTrigger } from '@/hooks/useSyncedData';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShipmentOrder, WorkOrder } from '@/lib/types';
import {
  dsGetShipmentOrders, dsCreateShipmentOrder, dsUpdateShipmentOrder, dsDeleteShipmentOrder,
  dsGetWorkOrders,
} from '@/lib/dataService';
import { Plus, Truck, Check, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Shipment() {
  const [shipments, setShipments] = useState<ShipmentOrder[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // 非空字串代表正在編輯既有出貨單，null 代表新增
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    work_order_id: '',
    work_order_item_id: '',
    quantity: 0,
    ship_date: '',
    status: 'Pending' as ShipmentOrder['status'],
  });

  const syncTrigger = useSyncTrigger();

  const loadData = async () => {
    const [s, wo] = await Promise.all([dsGetShipmentOrders(), dsGetWorkOrders()]);
    setShipments(s);
    setWorkOrders(wo);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, wo] = await Promise.all([dsGetShipmentOrders(), dsGetWorkOrders()]);
        if (!cancelled) { setShipments(s); setWorkOrders(wo); }
      } catch { /* handled */ }
    })();
    return () => { cancelled = true; };
  }, [syncTrigger]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ work_order_id: '', work_order_item_id: '', quantity: 0, ship_date: '', status: 'Pending' });
    setIsDialogOpen(true);
  };

  // 開啟編輯對話框並回填既有出貨單資料
  const openEdit = (shipment: ShipmentOrder) => {
    setEditingId(shipment.id);
    setForm({
      work_order_id: shipment.work_order_id || '',
      work_order_item_id: resolveOrderItem(workOrders.find(order => order.id === shipment.work_order_id), shipment.work_order_item_id)?.id || '',
      quantity: shipment.quantity || 0,
      ship_date: (shipment.ship_date || '').slice(0, 10),
      status: shipment.status || 'Pending',
    });
    setIsDialogOpen(true);
  };

  const handleError = (err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Shipment] operation failed:', err);
    if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
      toast({ title: '權限不足，操作失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
    } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
      toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
    } else {
      toast({ title: fallback, variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    if (!form.work_order_id || form.quantity <= 0 || !form.ship_date) {
      toast({ title: '請填寫所有必要欄位', variant: 'destructive' });
      return;
    }
    const wo = workOrders.find(o => o.id === form.work_order_id);
    const item = resolveOrderItem(wo, form.work_order_item_id);
    if (!wo || !item || !Number.isInteger(form.quantity)) { toast({ title: '請選擇工單品項並輸入整數數量', variant: 'destructive' }); return; }
    const reserved = shipments.filter(row => row.id !== editingId && row.work_order_id === wo.id && itemMatches(wo,item,row.work_order_item_id)).reduce((sum,row)=>sum+row.quantity,0);
    if (reserved + form.quantity > item.quantity) { toast({ title: `超過此品項尚未建立出貨單的數量（${Math.max(0,item.quantity-reserved)} 件）`, variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        // 編輯既有出貨單：出貨單號與建立時間保持不變
        await dsUpdateShipmentOrder(editingId, {
          work_order_item_id: item.id,
          work_order_id: form.work_order_id,
          order_no: wo?.order_no || '',
          customer: wo?.customer || '',
          quantity: form.quantity,
          ship_date: form.ship_date,
          status: form.status,
        });
        toast({ title: '出貨單已更新' });
      } else {
        await dsCreateShipmentOrder({
          work_order_item_id: item.id,
          work_order_id: form.work_order_id,
          order_no: wo?.order_no || '',
          customer: wo?.customer || '',
          quantity: form.quantity,
          ship_date: form.ship_date,
        });
        toast({ title: '出貨單已建立' });
      }
      await loadData();
      setIsDialogOpen(false);
      setEditingId(null);
      setForm({ work_order_id: '', work_order_item_id: '', quantity: 0, ship_date: '', status: 'Pending' });
    } catch (err: unknown) {
      handleError(err, editingId ? '更新失敗，請稍後再試' : '建立失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShip = async (id: string) => {
    try {
      await dsUpdateShipmentOrder(id, { status: 'Shipped' });
      await loadData();
      toast({ title: '已標記為已出貨' });
    } catch (err: unknown) {
      handleError(err, '更新失敗，請稍後再試');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dsDeleteShipmentOrder(id);
      await loadData();
      toast({ title: '出貨單已刪除' });
    } catch (err: unknown) {
      handleError(err, '刪除失敗，請稍後再試');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">出貨管理</h1>
          <Button onClick={openCreate} className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
            <Plus className="w-4 h-4 mr-2" />新增出貨單
          </Button>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <Truck className={`w-5 h-5 shrink-0 ${shipment.status === 'Shipped' ? 'text-green-400' : 'text-amber-400'}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-amber-400">{shipment.shipment_no}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            shipment.status === 'Pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
                          }`}>{shipment.status === 'Pending' ? '待出貨' : '已出貨'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 mt-1">
                          <span>工單: <span className="text-zinc-200">{shipment.order_no || '-'} · {resolveOrderItem(workOrders.find(order => order.id === shipment.work_order_id), shipment.work_order_item_id)?.product_name || '品項未關聯'}</span></span>
                          <span>客戶: <span className="text-zinc-200">{shipment.customer || '-'}</span></span>
                          <span>數量: <span className="text-zinc-200">{shipment.quantity}</span></span>
                          <span>日期: <span className="text-zinc-200">{shipment.ship_date || '-'}</span></span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {shipment.status === 'Pending' && (
                        <Button size="sm" onClick={() => handleShip(shipment.id)} className="bg-green-600 hover:bg-green-700 text-white">
                          <Check className="w-3 h-3 mr-1" />確認出貨
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        title="編輯修改"
                        className="text-blue-400 hover:text-blue-300"
                        onClick={() => openEdit(shipment)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="刪除"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => handleDelete(shipment.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Create / Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) setEditingId(null); }}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">
                {editingId ? '編輯出貨單' : '新增出貨單'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-zinc-300">工單</Label>
                <Select value={form.work_order_id} onValueChange={val => { const order = workOrders.find(row => row.id === val); setForm({ ...form, work_order_id: val, work_order_item_id: order && orderItems(order).length === 1 ? orderItems(order)[0].id : '', quantity: 0 }); }}>
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
              <label className="block text-sm text-zinc-300">品項
                <select aria-label="出貨品項" className="w-full bg-zinc-700 border border-zinc-600 rounded h-10 px-2" value={form.work_order_item_id} onChange={event => setForm({ ...form, work_order_item_id: event.target.value, quantity: 0 })}>
                  <option value="">請選擇品項</option>{workOrders.filter(order => order.id === form.work_order_id).flatMap(order => orderItems(order).map(item => <option key={item.id} value={item.id}>項次 {item.line_no} · {item.product_name} · {item.quantity} 件</option>))}
                </select>
              </label>
              <div>
                <Label className="text-zinc-300">出貨數量</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: Number(e.target.value) })}
                  className="bg-zinc-700 border-zinc-600 text-zinc-100"
                />
              </div>
              <div>
                <Label className="text-zinc-300">出貨日期</Label>
                <Input
                  type="date"
                  value={form.ship_date}
                  onChange={e => setForm({ ...form, ship_date: e.target.value })}
                  className="bg-zinc-700 border-zinc-600 text-zinc-100"
                />
              </div>
              {editingId && (
                <div>
                  <Label className="text-zinc-300">狀態</Label>
                  <Select
                    value={form.status}
                    onValueChange={val => setForm({ ...form, status: val as ShipmentOrder['status'] })}
                  >
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇狀態" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      <SelectItem value="Pending">待出貨</SelectItem>
                      <SelectItem value="Shipped">已出貨</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-400 mt-1">編輯模式：出貨單號與建立時間保持不變</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-amber-500 hover:bg-amber-600 text-zinc-900"
              >
                {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {editingId ? '儲存修改' : '建立'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}