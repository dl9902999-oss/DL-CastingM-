import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MeltingRecord, MoldingBatch } from '@/lib/types';
import { getMeltingRecords, createMeltingRecord, getMoldingBatches } from '@/lib/store';
import { Plus, Flame } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Melting() {
  const [records, setRecords] = useState<MeltingRecord[]>([]);
  const [batches, setBatches] = useState<MoldingBatch[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({ batch_id: '', furnace_no: '', melting_weight: 0, pouring_weight: 0 });

  useEffect(() => {
    setRecords(getMeltingRecords());
    setBatches(getMoldingBatches());
  }, []);

  const handleCreate = () => {
    if (!form.batch_id || !form.furnace_no || form.melting_weight <= 0) {
      toast({ title: '請填寫所有必要欄位', variant: 'destructive' });
      return;
    }
    const batch = batches.find(b => b.id === form.batch_id);
    if (!batch) return;
    createMeltingRecord({
      batch_id: form.batch_id,
      batch_no: batch.batch_no,
      furnace_no: form.furnace_no,
      melting_weight: form.melting_weight,
      pouring_weight: form.pouring_weight,
    });
    setRecords(getMeltingRecords());
    setIsCreateOpen(false);
    setForm({ batch_id: '', furnace_no: '', melting_weight: 0, pouring_weight: 0 });
    toast({ title: '熔煉紀錄已建立' });
  };

  const yieldRate = form.melting_weight > 0 ? ((form.pouring_weight / form.melting_weight) * 100).toFixed(1) : '0.0';

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">批次澆注</h1>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
                <Plus className="w-4 h-4 mr-2" />新增熔煉
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-zinc-100">新增熔煉紀錄</DialogTitle>
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
                        <SelectItem key={b.id} value={b.id}>{b.batch_no} ({b.order_no})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">爐號</Label>
                  <Input value={form.furnace_no} onChange={e => setForm({ ...form, furnace_no: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" placeholder="例: F-01" />
                </div>
                <div>
                  <Label className="text-zinc-300">熔煉重量 (kg)</Label>
                  <Input type="number" value={form.melting_weight} onChange={e => setForm({ ...form, melting_weight: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">澆注重量 (kg)</Label>
                  <Input type="number" value={form.pouring_weight} onChange={e => setForm({ ...form, pouring_weight: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="p-3 bg-zinc-700/50 rounded-md">
                  <span className="text-sm text-zinc-400">收得率: </span>
                  <span className="text-lg font-bold text-amber-400">{yieldRate}%</span>
                </div>
                <Button onClick={handleCreate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">建立</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Records List */}
        <div className="space-y-3">
          {records.length === 0 ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardContent className="p-8 text-center text-zinc-400">尚無熔煉紀錄</CardContent>
            </Card>
          ) : (
            records.map(record => (
              <Card key={record.id} className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Flame className="w-4 h-4 text-orange-400" />
                        <span className="font-mono text-sm font-semibold text-amber-400">{record.heat_no}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-400">
                        <span>批次: <span className="text-zinc-200">{record.batch_no}</span></span>
                        <span>爐號: <span className="text-zinc-200">{record.furnace_no}</span></span>
                        <span>熔煉: <span className="text-zinc-200">{record.melting_weight}kg</span></span>
                        <span>澆注: <span className="text-zinc-200">{record.pouring_weight}kg</span></span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-zinc-400">收得率</span>
                      <p className={`text-lg font-bold ${record.yield_rate >= 80 ? 'text-green-400' : record.yield_rate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                        {record.yield_rate}%
                      </p>
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