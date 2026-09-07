import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { useSyncTrigger } from '@/hooks/useSyncedData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WarehouseEntry, MoldingBatch } from '@/lib/types';
import {
  dsGetWarehouseEntries, dsCreateWarehouseEntry, dsUpdateWarehouseEntry, dsDeleteWarehouseEntry,
  dsGetMoldingBatches,
} from '@/lib/dataService';
import { Plus, Package, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function WarehousePage() {
  const [entries, setEntries] = useState<WarehouseEntry[]>([]);
  const [batches, setBatches] = useState<MoldingBatch[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // 非空字串代表正在編輯既有入庫紀錄，null 代表新增
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({ batch_id: '', location: '', quantity: 0 });

  const syncTrigger = useSyncTrigger();

  const loadData = async () => {
    const [e, b] = await Promise.all([dsGetWarehouseEntries(), dsGetMoldingBatches()]);
    setEntries(e);
    setBatches(b);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [e, b] = await Promise.all([dsGetWarehouseEntries(), dsGetMoldingBatches()]);
        if (!cancelled) { setEntries(e); setBatches(b); }
      } catch { /* handled */ }
    })();
    return () => { cancelled = true; };
  }, [syncTrigger]);

  // 開啟新增對話框
  const openCreate = () => {
    setEditingId(null);
    setForm({ batch_id: '', location: '', quantity: 0 });
    setIsDialogOpen(true);
  };

  // 開啟編輯對話框並回填既有資料
  const openEdit = (entry: WarehouseEntry) => {
    setEditingId(entry.id);
    setForm({ batch_id: entry.batch_id || '', location: entry.location || '', quantity: entry.quantity || 0 });
    setIsDialogOpen(true);
  };

  const handleError = (err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Warehouse] operation failed:', err);
    if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
      toast({ title: '權限不足，操作失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
    } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
      toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
    } else {
      toast({ title: fallback, variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    if (!form.batch_id || !form.location.trim() || form.quantity <= 0) {
      toast({ title: '請填寫所有必要欄位', variant: 'destructive' });
      return;
    }
    const batch = batches.find(b => b.id === form.batch_id);
    setSubmitting(true);
    try {
      if (editingId) {
        await dsUpdateWarehouseEntry(editingId, {
          batch_id: form.batch_id,
          batch_no: batch?.batch_no || '',
          location: form.location.trim(),
          quantity: form.quantity,
        });
        toast({ title: '入庫紀錄已更新' });
      } else {
        await dsCreateWarehouseEntry({
          batch_id: form.batch_id,
          batch_no: batch?.batch_no || '',
          location: form.location.trim(),
          quantity: form.quantity,
        });
        toast({ title: '入庫紀錄已建立' });
      }
      await loadData();
      setIsDialogOpen(false);
      setEditingId(null);
      setForm({ batch_id: '', location: '', quantity: 0 });
    } catch (err: unknown) {
      handleError(err, editingId ? '更新失敗，請稍後再試' : '建立失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dsDeleteWarehouseEntry(id);
      await loadData();
      toast({ title: '入庫紀錄已刪除' });
    } catch (err: unknown) {
      handleError(err, '刪除失敗，請稍後再試');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">入庫管理</h1>
          <Button onClick={openCreate} className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
            <Plus className="w-4 h-4 mr-2" />新增入庫
          </Button>
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Package className="w-5 h-5 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">{entry.batch_no || '-'}</p>
                        <p className="text-xs text-zinc-400">
                          庫位: {entry.location || '-'}
                          {entry.created_at && (
                            <span className="ml-2">{new Date(entry.created_at).toLocaleDateString('zh-TW')}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-lg font-bold text-zinc-100">{entry.quantity}</p>
                        <p className="text-xs text-zinc-400">件</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="編輯修改"
                          className="text-blue-400 hover:text-blue-300"
                          onClick={() => openEdit(entry)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="刪除"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
                {editingId ? '編輯入庫紀錄' : '新增入庫紀錄'}
              </DialogTitle>
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
                <Input
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  className="bg-zinc-700 border-zinc-600 text-zinc-100"
                  placeholder="例: A-01-03"
                />
              </div>
              <div>
                <Label className="text-zinc-300">數量</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: Number(e.target.value) })}
                  className="bg-zinc-700 border-zinc-600 text-zinc-100"
                />
              </div>
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