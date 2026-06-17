import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoldingBatch, WorkOrder } from '@/lib/types';
import { getMoldingBatches, createMoldingBatch, updateMoldingBatch, getWorkOrders } from '@/lib/store';
import { Plus, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '@/hooks/use-toast';

export default function Molding() {
  const [batches, setBatches] = useState<MoldingBatch[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [qrBatch, setQrBatch] = useState<MoldingBatch | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({ work_order_id: '', quantity_planned: 0 });

  useEffect(() => {
    setBatches(getMoldingBatches());
    setWorkOrders(getWorkOrders().filter(o => o.status !== 'Cancelled'));
  }, []);

  const handleCreate = () => {
    if (!form.work_order_id || form.quantity_planned <= 0) {
      toast({ title: '請選擇工單並填寫數量', variant: 'destructive' });
      return;
    }
    const wo = workOrders.find(o => o.id === form.work_order_id);
    if (!wo) return;
    createMoldingBatch({ work_order_id: form.work_order_id, order_no: wo.order_no, quantity_planned: form.quantity_planned });
    setBatches(getMoldingBatches());
    setIsCreateOpen(false);
    setForm({ work_order_id: '', quantity_planned: 0 });
    toast({ title: '造模批次已建立' });
  };

  const handleUpdateQuantity = (batch: MoldingBatch, qty: number) => {
    updateMoldingBatch(batch.id, { quantity_completed: qty, status: qty >= batch.quantity_planned ? 'Completed' : 'In Progress' });
    setBatches(getMoldingBatches());
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">批次造模</h1>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
                <Plus className="w-4 h-4 mr-2" />新增批次
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-zinc-100">新增造模批次</DialogTitle>
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
                  <Label className="text-zinc-300">計劃數量</Label>
                  <Input type="number" value={form.quantity_planned} onChange={e => setForm({ ...form, quantity_planned: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <Button onClick={handleCreate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">建立</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Batches List */}
        <div className="space-y-3">
          {batches.length === 0 ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardContent className="p-8 text-center text-zinc-400">尚無造模批次</CardContent>
            </Card>
          ) : (
            batches.map(batch => (
              <Card key={batch.id} className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-amber-400">{batch.batch_no}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          batch.status === 'Pending' ? 'bg-zinc-600 text-zinc-300' :
                          batch.status === 'In Progress' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>{batch.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                        <span>工單: <span className="text-zinc-200">{batch.order_no}</span></span>
                        <span>進度: <span className="text-zinc-200">{batch.quantity_completed}/{batch.quantity_planned}</span></span>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all"
                          style={{ width: `${Math.min((batch.quantity_completed / batch.quantity_planned) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="完成數"
                        className="w-20 bg-zinc-700 border-zinc-600 text-zinc-100 text-sm"
                        defaultValue={batch.quantity_completed}
                        onBlur={e => handleUpdateQuantity(batch, Number(e.target.value))}
                      />
                      <Button variant="ghost" size="icon" onClick={() => setQrBatch(batch)} className="text-zinc-400 hover:text-zinc-100">
                        <QrCode className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* QR Code Dialog */}
        <Dialog open={!!qrBatch} onOpenChange={(open) => !open && setQrBatch(null)}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">批次 QR Code</DialogTitle>
            </DialogHeader>
            {qrBatch && (
              <div className="flex flex-col items-center gap-4 p-4">
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG value={JSON.stringify({ batch_no: qrBatch.batch_no, order_no: qrBatch.order_no, quantity: qrBatch.quantity_planned })} size={200} />
                </div>
                <p className="text-sm text-zinc-300 font-mono">{qrBatch.batch_no}</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}