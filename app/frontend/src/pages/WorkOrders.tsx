import { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { WorkOrder } from '@/lib/types';
import { getWorkOrders, createWorkOrder, updateWorkOrder } from '@/lib/store';
import { Plus, Search, Edit, Image, FileImage, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function ImageUpload({ label, images, onChange, icon }: { label: string; images: string[]; onChange: (imgs: string[]) => void; icon: React.ReactNode }) {
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
      <Label className="text-zinc-300 flex items-center gap-1.5 mb-1.5">{icon}{label}</Label>
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

export default function WorkOrders() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<WorkOrder | null>(null);
  const [viewImages, setViewImages] = useState<{ title: string; images: string[] } | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    customer: '',
    product_name: '',
    material: '',
    quantity: 0,
    due_date: '',
    remarks: '',
    mold_photos: [] as string[],
    drawing_photos: [] as string[],
  });

  useEffect(() => {
    setOrders(getWorkOrders());
  }, []);

  const resetForm = () => setForm({ customer: '', product_name: '', material: '', quantity: 0, due_date: '', remarks: '', mold_photos: [], drawing_photos: [] });

  const handleCreate = () => {
    if (!form.customer || !form.product_name || !form.material || form.quantity <= 0) {
      toast({ title: '請填寫必要欄位', variant: 'destructive' });
      return;
    }
    createWorkOrder(form);
    setOrders(getWorkOrders());
    setIsCreateOpen(false);
    resetForm();
    toast({ title: '工單已建立' });
  };

  const handleUpdate = () => {
    if (!editOrder) return;
    updateWorkOrder(editOrder.id, editOrder);
    setOrders(getWorkOrders());
    setEditOrder(null);
    toast({ title: '工單已更新' });
  };

  const filtered = orders.filter(o =>
    o.order_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.product_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">工單管理</h1>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
                <Plus className="w-4 h-4 mr-2" />新增工單
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-800 border-zinc-700 max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-zinc-100">新增工單</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-300">客戶</Label>
                  <Input value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">品名</Label>
                  <Input value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">材質</Label>
                  <Input value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">數量</Label>
                  <Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">交期</Label>
                  <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">備註</Label>
                  <Textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <ImageUpload
                  label="模具照片"
                  images={form.mold_photos}
                  onChange={(imgs) => setForm({ ...form, mold_photos: imgs })}
                  icon={<Image className="w-4 h-4 text-blue-400" />}
                />
                <ImageUpload
                  label="圖面照片"
                  images={form.drawing_photos}
                  onChange={(imgs) => setForm({ ...form, drawing_photos: imgs })}
                  icon={<FileImage className="w-4 h-4 text-green-400" />}
                />
                <Button onClick={handleCreate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">建立</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="搜尋工單號、客戶、品名..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        {/* Orders List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardContent className="p-8 text-center text-zinc-400">尚無工單資料</CardContent>
            </Card>
          ) : (
            filtered.map(order => (
              <Card key={order.id} className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-amber-400">{order.order_no}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          order.status === 'Open' ? 'bg-blue-500/20 text-blue-400' :
                          order.status === 'In Progress' ? 'bg-amber-500/20 text-amber-400' :
                          order.status === 'Completed' ? 'bg-green-500/20 text-green-400' :
                          'bg-zinc-600 text-zinc-300'
                        }`}>{order.status}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-400">
                        <span>客戶: <span className="text-zinc-200">{order.customer}</span></span>
                        <span>品名: <span className="text-zinc-200">{order.product_name}</span></span>
                        <span>材質: <span className="text-zinc-200">{order.material}</span></span>
                        <span>數量: <span className="text-zinc-200">{order.quantity}</span></span>
                      </div>
                      {order.due_date && <p className="text-xs text-zinc-500 mt-1">交期: {order.due_date}</p>}
                      {/* Photo indicators */}
                      <div className="flex items-center gap-3 mt-2">
                        {order.mold_photos && order.mold_photos.length > 0 && (
                          <button
                            onClick={() => setViewImages({ title: '模具照片', images: order.mold_photos })}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                          >
                            <Image className="w-3 h-3" />模具 ({order.mold_photos.length})
                          </button>
                        )}
                        {order.drawing_photos && order.drawing_photos.length > 0 && (
                          <button
                            onClick={() => setViewImages({ title: '圖面照片', images: order.drawing_photos })}
                            className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
                          >
                            <FileImage className="w-3 h-3" />圖面 ({order.drawing_photos.length})
                          </button>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setEditOrder({ ...order, mold_photos: order.mold_photos || [], drawing_photos: order.drawing_photos || [] })} className="text-zinc-400 hover:text-zinc-100">
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editOrder} onOpenChange={(open) => !open && setEditOrder(null)}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">編輯工單</DialogTitle>
            </DialogHeader>
            {editOrder && (
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-300">客戶</Label>
                  <Input value={editOrder.customer} onChange={e => setEditOrder({ ...editOrder, customer: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">品名</Label>
                  <Input value={editOrder.product_name} onChange={e => setEditOrder({ ...editOrder, product_name: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">材質</Label>
                  <Input value={editOrder.material} onChange={e => setEditOrder({ ...editOrder, material: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">數量</Label>
                  <Input type="number" value={editOrder.quantity} onChange={e => setEditOrder({ ...editOrder, quantity: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">交期</Label>
                  <Input type="date" value={editOrder.due_date} onChange={e => setEditOrder({ ...editOrder, due_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">狀態</Label>
                  <Select value={editOrder.status} onValueChange={(val) => setEditOrder({ ...editOrder, status: val as WorkOrder['status'] })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">備註</Label>
                  <Textarea value={editOrder.remarks} onChange={e => setEditOrder({ ...editOrder, remarks: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <ImageUpload
                  label="模具照片"
                  images={editOrder.mold_photos || []}
                  onChange={(imgs) => setEditOrder({ ...editOrder, mold_photos: imgs })}
                  icon={<Image className="w-4 h-4 text-blue-400" />}
                />
                <ImageUpload
                  label="圖面照片"
                  images={editOrder.drawing_photos || []}
                  onChange={(imgs) => setEditOrder({ ...editOrder, drawing_photos: imgs })}
                  icon={<FileImage className="w-4 h-4 text-green-400" />}
                />
                <Button onClick={handleUpdate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">更新</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* View Images Dialog */}
        <Dialog open={!!viewImages} onOpenChange={(open) => !open && setViewImages(null)}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">{viewImages?.title}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-2">
              {viewImages?.images.map((img, idx) => (
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