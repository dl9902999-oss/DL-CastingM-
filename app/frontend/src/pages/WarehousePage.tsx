import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WarehouseEntry, MoldingBatch } from '@/lib/types';
import { getWarehouseEntries, createWarehouseEntry, getMoldingBatches } from '@/lib/store';
import { Plus, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function WarehousePage() {
  const [entries, setEntries] = useState<WarehouseEntry[]>([]);
  const [batches, setBatches] = useState<MoldingBatch[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({ batch_id: '', location: '', quantity: 0 });

  useEffect(() => {
    setEntries(getWarehouseEntries());
    setBatches(getMoldingBatches());
  }, []);

  const handleCreate = () => {
    if (!form.batch_id || !form.location || form.quantity <= 0) {
      toast({ title: '請填寫所有必要欄位', variant: 'destructive' });
      return;
    }
    const batch = batches.find(b => b.id === form.batch_id);
    if (!batch) return;
    createWarehouseEntry({ batch_id: form.batch_id, batch_no: batch.batch_no, location: form.location, quantity: form.quantity });
    setEntries(getWarehouseEntries());
    setIsCreateOpen(false);
    setForm({ batch_id: '', location: '', quantity: 0 });
    toast({ title: '入庫紀錄已建立' });
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">入庫管理</h1>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
                <Plus className="w-4 h-4 mr-2" />新增入庫
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-zinc-100">新增入庫紀錄</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-300">批次</Label>
                  <Select value={form.batch_id} onValueChange={val => setForm({ ...form, batch_id: val })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇批次" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {batches.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.batch_no}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">庫位</Label>
                  <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" placeholder="例: A-01-03" />
                </div>
                <div>
                  <Label className="text-zinc-300">數量</Label>
                  <Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <Button onClick={handleCreate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">建立</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Entries List */}
        <div className="space-y-3">
          {entries.length === 0 ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardContent className="p-8 text-center text-zinc-400">尚無入庫紀錄</CardContent>
            </Card>
          ) : (
            entries.map(entry => (
              <Card key={entry.id} className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-blue-400" />
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{entry.batch_no}</p>
                        <p className="text-xs text-zinc-400">庫位: {entry.location}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-zinc-100">{entry.quantity}</p>
                      <p className="text-xs text-zinc-400">件</p>
                    </div>
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