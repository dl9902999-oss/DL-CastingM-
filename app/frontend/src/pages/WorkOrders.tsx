import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { WorkOrder } from '@/lib/types';
import { getWorkOrders, createWorkOrder, updateWorkOrder } from '@/lib/store';
import { Plus, Search, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function WorkOrders() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<WorkOrder | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    customer: '',
    part_no: '',
    material: '',
    quantity: 0,
    due_date: '',
    remarks: '',
  });

  useEffect(() => {
    setOrders(getWorkOrders());
  }, []);

  const resetForm = () => setForm({ customer: '', part_no: '', material: '', quantity: 0, due_date: '', remarks: '' });

  const handleCreate = () => {
    if (!form.customer || !form.part_no || !form.material || form.quantity <= 0) {
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
    o.part_no.toLowerCase().includes(searchTerm.toLowerCase())
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
            <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-zinc-100">新增工單</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-300">客戶</Label>
                  <Input value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">料號</Label>
                  <Input value={form.part_no} onChange={e => setForm({ ...form, part_no: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
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
                <Button onClick={handleCreate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">建立</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="搜尋工單號、客戶、料號..."
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
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
                        <span>料號: <span className="text-zinc-200">{order.part_no}</span></span>
                        <span>材質: <span className="text-zinc-200">{order.material}</span></span>
                        <span>數量: <span className="text-zinc-200">{order.quantity}</span></span>
                      </div>
                      {order.due_date && <p className="text-xs text-zinc-500 mt-1">交期: {order.due_date}</p>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setEditOrder(order)} className="text-zinc-400 hover:text-zinc-100">
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
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
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
                  <Label className="text-zinc-300">料號</Label>
                  <Input value={editOrder.part_no} onChange={e => setEditOrder({ ...editOrder, part_no: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
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
                <Button onClick={handleUpdate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">更新</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}