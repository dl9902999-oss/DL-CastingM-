import { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoldingBatch, WorkOrder } from '@/lib/types';
import { getMoldingBatches, createMoldingBatch, updateMoldingBatch, deleteMoldingBatch, getWorkOrders } from '@/lib/store';
import { Plus, QrCode, Search, Image, X, Edit, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '@/hooks/use-toast';

function MoldingImageUpload({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) {
          onChange([...images, result]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div>
      <Label className="text-zinc-300 flex items-center gap-1.5 mb-1.5">
        <Image className="w-4 h-4 text-blue-400" />造模相片
      </Label>
      <div className="flex flex-wrap gap-2 mb-2">
        {images.map((img, idx) => (
          <div key={idx} className="relative w-16 h-16 rounded-md overflow-hidden border border-zinc-600 group">
            <img src={img} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => removeImage(idx)}
              className="absolute top-0 right-0 bg-red-500 rounded-bl-md p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} className="border-zinc-600 text-zinc-300 hover:bg-zinc-700">
        <Plus className="w-3 h-3 mr-1" />上傳照片
      </Button>
    </div>
  );
}

export default function Molding() {
  const [batches, setBatches] = useState<MoldingBatch[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [qrBatch, setQrBatch] = useState<MoldingBatch | null>(null);
  const [viewPhotos, setViewPhotos] = useState<string[] | null>(null);
  const [editBatch, setEditBatch] = useState<MoldingBatch | null>(null);
  const { toast } = useToast();

  const [woSearch, setWoSearch] = useState('');
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null);
  const [form, setForm] = useState({
    quantity_planned: 0,
    estimated_pouring_weight: 0,
    molding_photos: [] as string[],
  });

  useEffect(() => {
    const allWo = getWorkOrders();
    setAllWorkOrders(allWo);
    setWorkOrders(allWo.filter(o => o.status !== 'Cancelled'));
    setBatches(getMoldingBatches());
  }, []);

  // Helper: get work order info for a batch (fallback when batch fields are empty)
  const getWoInfo = (batch: MoldingBatch) => {
    const wo = allWorkOrders.find(w => w.id === batch.work_order_id);
    return {
      customer: batch.customer || wo?.customer || '-',
      product_name: batch.product_name || wo?.product_name || '-',
      material: batch.material || wo?.material || '-',
    };
  };

  // Filter work orders by customer or product_name
  const filteredWo = woSearch.trim()
    ? workOrders.filter(wo =>
        wo.customer.toLowerCase().includes(woSearch.toLowerCase()) ||
        wo.product_name.toLowerCase().includes(woSearch.toLowerCase())
      )
    : workOrders;

  const handleSelectWo = (wo: WorkOrder) => {
    setSelectedWo(wo);
    setWoSearch('');
  };

  const handleCreate = () => {
    if (!selectedWo || form.quantity_planned <= 0) {
      toast({ title: '請選擇工單並填寫數量', variant: 'destructive' });
      return;
    }
    // Check cumulative quantity does not exceed work order quantity
    const existingQty = batches.filter(b => b.work_order_id === selectedWo.id).reduce((sum, b) => sum + b.quantity_planned, 0);
    if (existingQty + form.quantity_planned > selectedWo.quantity) {
      toast({ title: `累計數量不能大於工單數量（工單數量: ${selectedWo.quantity}，已開工: ${existingQty}，可用餘量: ${selectedWo.quantity - existingQty}）`, variant: 'destructive' });
      return;
    }
    createMoldingBatch({
      work_order_id: selectedWo.id,
      order_no: selectedWo.order_no,
      customer: selectedWo.customer,
      product_name: selectedWo.product_name,
      material: selectedWo.material,
      quantity_planned: form.quantity_planned,
      estimated_pouring_weight: form.estimated_pouring_weight,
      molding_photos: form.molding_photos,
    });
    setBatches(getMoldingBatches());
    setIsCreateOpen(false);
    setSelectedWo(null);
    setForm({ quantity_planned: 0, estimated_pouring_weight: 0, molding_photos: [] });
    toast({ title: '造模批次已建立' });
  };

  const handleUpdateQuantity = (batch: MoldingBatch, qty: number) => {
    updateMoldingBatch(batch.id, { quantity_completed: qty, status: qty >= batch.quantity_planned ? 'Completed' : 'In Progress' });
    setBatches(getMoldingBatches());
  };

  const handleEditSave = () => {
    if (!editBatch) return;
    updateMoldingBatch(editBatch.id, {
      quantity_planned: editBatch.quantity_planned,
      quantity_completed: editBatch.quantity_completed,
      estimated_pouring_weight: editBatch.estimated_pouring_weight,
      molding_photos: editBatch.molding_photos,
      status: editBatch.status,
    });
    setBatches(getMoldingBatches());
    setEditBatch(null);
    toast({ title: '批次已更新' });
  };

  const handleDeleteBatch = (batch: MoldingBatch) => {
    if (!window.confirm(`確定要刪除批次 ${batch.batch_no} 嗎？`)) return;
    deleteMoldingBatch(batch.id);
    setBatches(getMoldingBatches());
    toast({ title: '批次已刪除' });
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">批次造模</h1>
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) { setSelectedWo(null); setWoSearch(''); } }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
                <Plus className="w-4 h-4 mr-2" />新增批次
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-zinc-100">新增造模批次</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {/* Work Order Search */}
                <div>
                  <Label className="text-zinc-300">工單（以客戶或品名搜尋）</Label>
                  {selectedWo ? (
                    <div className="p-3 bg-zinc-700/50 rounded-md mt-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-amber-400">{selectedWo.order_no}</p>
                          <p className="text-xs text-zinc-400">客戶: {selectedWo.customer} | 品名: {selectedWo.product_name} | 材質: {selectedWo.material}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedWo(null)} className="text-zinc-400 hover:text-zinc-100 h-6 px-2">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative mt-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <Input
                        value={woSearch}
                        onChange={e => setWoSearch(e.target.value)}
                        placeholder="輸入客戶名稱或品名搜尋..."
                        className="pl-10 bg-zinc-700 border-zinc-600 text-zinc-100"
                      />
                      {woSearch.trim() && filteredWo.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-zinc-700 border border-zinc-600 rounded-md max-h-40 overflow-y-auto">
                          {filteredWo.map(wo => (
                            <button
                              key={wo.id}
                              onClick={() => handleSelectWo(wo)}
                              className="w-full text-left px-3 py-2 hover:bg-zinc-600 transition-colors"
                            >
                              <p className="text-sm text-amber-400">{wo.order_no}</p>
                              <p className="text-xs text-zinc-400">{wo.customer} - {wo.product_name} ({wo.material})</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {woSearch.trim() && filteredWo.length === 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-zinc-700 border border-zinc-600 rounded-md p-3">
                          <p className="text-xs text-zinc-400 text-center">無符合的工單</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-zinc-300">計劃數量</Label>
                  <Input type="number" value={form.quantity_planned} onChange={e => setForm({ ...form, quantity_planned: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">預估澆注重量 (kg)</Label>
                  <Input type="number" value={form.estimated_pouring_weight} onChange={e => setForm({ ...form, estimated_pouring_weight: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <MoldingImageUpload
                  images={form.molding_photos}
                  onChange={(imgs) => setForm({ ...form, molding_photos: imgs })}
                />
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
                        }`}>{batch.status === 'Pending' ? '待處理' : batch.status === 'In Progress' ? '進行中' : '已完成'}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-zinc-400">
                        <span>工單: <span className="text-zinc-200">{batch.order_no}</span></span>
                        <span>客戶: <span className="text-zinc-200">{getWoInfo(batch).customer}</span></span>
                        <span>品名: <span className="text-zinc-200">{getWoInfo(batch).product_name}</span></span>
                        <span>材質: <span className="text-zinc-200">{getWoInfo(batch).material}</span></span>
                        <span>數量: <span className="text-zinc-200">{batch.quantity_completed}/{batch.quantity_planned}</span></span>
                        {batch.estimated_pouring_weight > 0 && (
                          <span>預估澆注: <span className="text-zinc-200">{batch.estimated_pouring_weight}kg</span></span>
                        )}
                      </div>
                      {/* Photo indicator */}
                      {batch.molding_photos && batch.molding_photos.length > 0 && (
                        <button
                          onClick={() => setViewPhotos(batch.molding_photos)}
                          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1.5"
                        >
                          <Image className="w-3 h-3" />造模相片 ({batch.molding_photos.length})
                        </button>
                      )}
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
                      <Button variant="ghost" size="icon" onClick={() => setEditBatch({ ...batch, molding_photos: batch.molding_photos || [] })} className="text-zinc-400 hover:text-zinc-100">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteBatch(batch)} className="text-zinc-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
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

        {/* Edit Batch Dialog */}
        <Dialog open={!!editBatch} onOpenChange={(open) => !open && setEditBatch(null)}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">編輯造模批次</DialogTitle>
            </DialogHeader>
            {editBatch && (
              <div className="space-y-3">
                <div className="p-3 bg-zinc-700/50 rounded-md">
                  <p className="text-sm font-medium text-amber-400">{editBatch.batch_no}</p>
                  <p className="text-xs text-zinc-400">工單: {editBatch.order_no} | 客戶: {getWoInfo(editBatch).customer} | 品名: {getWoInfo(editBatch).product_name} | 材質: {getWoInfo(editBatch).material}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">計劃數量</Label>
                    <Input type="number" value={editBatch.quantity_planned} onChange={e => setEditBatch({ ...editBatch, quantity_planned: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">完成數量</Label>
                    <Input type="number" value={editBatch.quantity_completed} onChange={e => setEditBatch({ ...editBatch, quantity_completed: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-300">預估澆注重量 (kg)</Label>
                  <Input type="number" value={editBatch.estimated_pouring_weight || 0} onChange={e => setEditBatch({ ...editBatch, estimated_pouring_weight: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">狀態</Label>
                  <Select value={editBatch.status} onValueChange={val => setEditBatch({ ...editBatch, status: val as MoldingBatch['status'] })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      <SelectItem value="Pending">待處理</SelectItem>
                      <SelectItem value="In Progress">進行中</SelectItem>
                      <SelectItem value="Completed">已完成</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <MoldingImageUpload
                  images={editBatch.molding_photos || []}
                  onChange={(imgs) => setEditBatch({ ...editBatch, molding_photos: imgs })}
                />
                <Button onClick={handleEditSave} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">更新</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

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

        {/* View Photos Dialog */}
        <Dialog open={!!viewPhotos} onOpenChange={(open) => !open && setViewPhotos(null)}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">造模相片</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-2">
              {viewPhotos?.map((img, idx) => (
                <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-zinc-600">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}