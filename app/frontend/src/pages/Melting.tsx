import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MeltingRecord, MoldingBatch, WorkOrder } from '@/lib/types';
import { getMeltingRecords, createMeltingRecord, updateMeltingRecord, deleteMeltingRecord, getMoldingBatches, getWorkOrders } from '@/lib/store';
import { Plus, Flame, Search, X, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Melting() {
  const [records, setRecords] = useState<MeltingRecord[]>([]);
  const [batches, setBatches] = useState<MoldingBatch[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MeltingRecord | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({ batch_id: '', furnace_no: '', pouring_weight: 0 });
  const [editForm, setEditForm] = useState({ furnace_no: '', pouring_weight: 0 });
  const [batchSearch, setBatchSearch] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<MoldingBatch | null>(null);

  useEffect(() => {
    setRecords(getMeltingRecords());
    setBatches(getMoldingBatches());
    setWorkOrders(getWorkOrders());
  }, []);

  const filteredBatches = batches.filter(b => {
    if (!batchSearch) return true;
    const keyword = batchSearch.toLowerCase();
    return (
      b.batch_no.toLowerCase().includes(keyword) ||
      (b.customer || '').toLowerCase().includes(keyword) ||
      (b.product_name || '').toLowerCase().includes(keyword) ||
      (b.material || '').toLowerCase().includes(keyword) ||
      (b.order_no || '').toLowerCase().includes(keyword)
    );
  });

  // Get work order estimated weight for the selected batch
  const getEstimatedWeight = (batch: MoldingBatch | null): number => {
    if (!batch) return 0;
    const wo = workOrders.find(w => w.id === batch.work_order_id);
    return wo?.estimated_weight || 0;
  };

  const getEstimatedWeightByBatchId = (batchId: string): number => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return 0;
    const wo = workOrders.find(w => w.id === batch.work_order_id);
    return wo?.estimated_weight || 0;
  };

  const handleCreate = () => {
    if (!form.batch_id || !form.furnace_no || form.pouring_weight <= 0) {
      toast({ title: '請填寫所有必要欄位', variant: 'destructive' });
      return;
    }
    const batch = batches.find(b => b.id === form.batch_id);
    if (!batch) return;
    const estimatedWeight = getEstimatedWeight(batch);
    createMeltingRecord({
      batch_id: form.batch_id,
      batch_no: batch.batch_no,
      furnace_no: form.furnace_no,
      melting_weight: estimatedWeight,
      pouring_weight: form.pouring_weight,
    });
    setRecords(getMeltingRecords());
    setIsCreateOpen(false);
    setForm({ batch_id: '', furnace_no: '', pouring_weight: 0 });
    setSelectedBatch(null);
    setBatchSearch('');
    toast({ title: '澆注紀錄已建立' });
  };

  const handleEdit = (record: MeltingRecord) => {
    setEditingRecord(record);
    setEditForm({ furnace_no: record.furnace_no, pouring_weight: record.pouring_weight });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingRecord) return;
    if (!editForm.furnace_no || editForm.pouring_weight <= 0) {
      toast({ title: '請填寫所有必要欄位', variant: 'destructive' });
      return;
    }
    const estimatedWeight = getEstimatedWeightByBatchId(editingRecord.batch_id);
    updateMeltingRecord(editingRecord.id, {
      furnace_no: editForm.furnace_no,
      pouring_weight: editForm.pouring_weight,
      melting_weight: estimatedWeight,
    });
    setRecords(getMeltingRecords());
    setIsEditOpen(false);
    setEditingRecord(null);
    toast({ title: '澆注紀錄已更新' });
  };

  const handleDelete = (record: MeltingRecord) => {
    if (!window.confirm(`確定要刪除澆注紀錄 ${record.heat_no} 嗎？`)) return;
    deleteMeltingRecord(record.id);
    setRecords(getMeltingRecords());
    toast({ title: '澆注紀錄已刪除' });
  };

  const estimatedWeight = getEstimatedWeight(selectedBatch);
  const yieldRate = form.pouring_weight > 0 && estimatedWeight > 0 ? ((estimatedWeight / form.pouring_weight) * 100).toFixed(1) : '0.0';

  const editEstimatedWeight = editingRecord ? getEstimatedWeightByBatchId(editingRecord.batch_id) : 0;
  const editYieldRate = editForm.pouring_weight > 0 && editEstimatedWeight > 0 ? ((editEstimatedWeight / editForm.pouring_weight) * 100).toFixed(1) : '0.0';

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">批次澆注</h1>
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) { setSelectedBatch(null); setBatchSearch(''); } }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
                <Plus className="w-4 h-4 mr-2" />新增澆注
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-zinc-100">新增澆注紀錄</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-300">批次（以客戶、產品、材質搜尋）</Label>
                  {selectedBatch ? (
                    <div className="flex items-center gap-2 p-2 bg-zinc-700 rounded-md border border-zinc-600">
                      <div className="flex-1 text-sm text-zinc-100">
                        <span className="font-mono text-amber-400">{selectedBatch.batch_no}</span>
                        <span className="text-zinc-400 ml-2">客戶: {selectedBatch.customer || '-'} | 品名: {selectedBatch.product_name || '-'} | 材質: {selectedBatch.material || '-'}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedBatch(null); setForm({ ...form, batch_id: '' }); setBatchSearch(''); }} className="text-zinc-400 hover:text-zinc-100 h-6 w-6">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 w-4 h-4 text-zinc-400" />
                        <Input
                          value={batchSearch}
                          onChange={e => setBatchSearch(e.target.value)}
                          className="bg-zinc-700 border-zinc-600 text-zinc-100 pl-8"
                          placeholder="輸入客戶、產品名稱或材質搜尋..."
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1 border border-zinc-600 rounded-md p-1">
                        {filteredBatches.length === 0 ? (
                          <p className="text-xs text-zinc-500 p-2 text-center">無符合批次</p>
                        ) : (
                          filteredBatches.map(b => (
                            <button
                              key={b.id}
                              onClick={() => { setSelectedBatch(b); setForm({ ...form, batch_id: b.id }); setBatchSearch(''); }}
                              className="w-full text-left p-2 rounded hover:bg-zinc-600 text-sm"
                            >
                              <span className="font-mono text-amber-400">{b.batch_no}</span>
                              <span className="text-zinc-400 ml-2 text-xs">客戶: {b.customer || '-'} | 品名: {b.product_name || '-'} | 材質: {b.material || '-'}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-zinc-300">爐號</Label>
                  <Input value={form.furnace_no} onChange={e => setForm({ ...form, furnace_no: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" placeholder="例: F-01" />
                </div>
                {selectedBatch && (
                  <div className="p-3 bg-zinc-700/30 rounded-md border border-zinc-600">
                    <Label className="text-zinc-400 text-xs">工單預估重量</Label>
                    <p className="text-sm font-medium text-zinc-100">{estimatedWeight > 0 ? `${estimatedWeight} kg` : '未填寫'}</p>
                  </div>
                )}
                <div>
                  <Label className="text-zinc-300">實際澆注重量 (kg)</Label>
                  <Input type="number" value={form.pouring_weight} onChange={e => setForm({ ...form, pouring_weight: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="p-3 bg-zinc-700/50 rounded-md">
                  <span className="text-sm text-zinc-400">預估得料率: </span>
                  <span className="text-lg font-bold text-amber-400">{yieldRate}%</span>
                  {estimatedWeight > 0 && form.pouring_weight > 0 && (
                    <span className="text-xs text-zinc-500 ml-2">({estimatedWeight} / {form.pouring_weight} × 100%)</span>
                  )}
                </div>
                <Button onClick={handleCreate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">建立</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingRecord(null); }}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">編輯澆注紀錄 - {editingRecord?.heat_no}</DialogTitle>
            </DialogHeader>
            {editingRecord && (
              <div className="space-y-3">
                <div className="p-3 bg-zinc-700/30 rounded-md border border-zinc-600">
                  <Label className="text-zinc-400 text-xs">批次</Label>
                  <p className="text-sm font-medium text-zinc-100">{editingRecord.batch_no}</p>
                </div>
                <div>
                  <Label className="text-zinc-300">爐號</Label>
                  <Input value={editForm.furnace_no} onChange={e => setEditForm({ ...editForm, furnace_no: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="p-3 bg-zinc-700/30 rounded-md border border-zinc-600">
                  <Label className="text-zinc-400 text-xs">工單預估重量</Label>
                  <p className="text-sm font-medium text-zinc-100">{editEstimatedWeight > 0 ? `${editEstimatedWeight} kg` : '未填寫'}</p>
                </div>
                <div>
                  <Label className="text-zinc-300">實際澆注重量 (kg)</Label>
                  <Input type="number" value={editForm.pouring_weight} onChange={e => setEditForm({ ...editForm, pouring_weight: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="p-3 bg-zinc-700/50 rounded-md">
                  <span className="text-sm text-zinc-400">預估得料率: </span>
                  <span className="text-lg font-bold text-amber-400">{editYieldRate}%</span>
                  {editEstimatedWeight > 0 && editForm.pouring_weight > 0 && (
                    <span className="text-xs text-zinc-500 ml-2">({editEstimatedWeight} / {editForm.pouring_weight} × 100%)</span>
                  )}
                </div>
                <Button onClick={handleUpdate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">儲存</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Records List */}
        <div className="space-y-3">
          {records.length === 0 ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardContent className="p-8 text-center text-zinc-400">尚無熔煉紀錄</CardContent>
            </Card>
          ) : (
            records.map(record => {
              const batch = batches.find(b => b.id === record.batch_id);
              return (
              <Card key={record.id} className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Flame className="w-4 h-4 text-orange-400" />
                        <span className="font-mono text-sm font-semibold text-amber-400">{record.heat_no}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-zinc-400">
                        <span>批次: <span className="text-zinc-200">{record.batch_no}</span></span>
                        <span>客戶: <span className="text-zinc-200">{batch?.customer || '-'}</span></span>
                        <span>品名: <span className="text-zinc-200">{batch?.product_name || '-'}</span></span>
                        <span>材質: <span className="text-zinc-200">{batch?.material || '-'}</span></span>
                        <span>數量: <span className="text-zinc-200">{batch?.quantity_planned || '-'}</span></span>
                        <span>爐號: <span className="text-zinc-200">{record.furnace_no}</span></span>
                        <span>實際澆注: <span className="text-zinc-200">{record.pouring_weight}kg</span></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-xs text-zinc-400">預估得料率</span>
                        <p className={`text-lg font-bold ${record.yield_rate >= 80 ? 'text-green-400' : record.yield_rate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                          {record.yield_rate}%
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(record)} className="text-zinc-400 hover:text-amber-400 h-7 w-7">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(record)} className="text-zinc-400 hover:text-red-400 h-7 w-7">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })
          )}
        </div>
      </div>
    </AppLayout>
  );
}