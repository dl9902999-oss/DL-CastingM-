import { useState, useMemo, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { dsGetCustomers, dsCreateCustomer, dsUpdateCustomer, dsDeleteCustomer } from '@/lib/dataService';
import { Customer, CustomerType, CustomerStatus } from '@/lib/types';
import { Plus, Search, Edit, Trash2, Users, X, Upload, RefreshCw } from 'lucide-react';
import BatchImportDialog from '@/components/BatchImportDialog';
import { useDataConnection } from '@/contexts/DataContext';

const CUSTOMER_TYPES: CustomerType[] = ['產業機械', '砂石產業', '營造工程', '汽車模具', '鑄造廠', '加工廠', '貿易商', '其他'];
const CUSTOMER_STATUSES: CustomerStatus[] = ['啟用', '停用'];

interface FormState {
  name: string;
  short_name: string;
  type: CustomerType | '';
  address: string;
  delivery_addresses: string[];
  phone: string;
  email: string;
  contact1_name: string;
  contact1_phone: string;
  contact2_name: string;
  contact2_phone: string;
  status: CustomerStatus;
  remarks: string;
}

const emptyForm: FormState = {
  name: '',
  short_name: '',
  type: '',
  address: '',
  delivery_addresses: [''],
  phone: '',
  email: '',
  contact1_name: '',
  contact1_phone: '',
  contact2_name: '',
  contact2_phone: '',
  status: '啟用',
  remarks: '',
};

export default function Customers() {
  const { toast } = useToast();
  const { lastSyncTime } = useDataConnection();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load customers from dataService (routes to Supabase when connected)
  const loadCustomers = useCallback(async () => {
    try {
      const data = await dsGetCustomers();
      setCustomers(data);
    } catch (err) {
      console.error('[Customers] Failed to load:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Re-load when sync event occurs (another device changed data)
  useEffect(() => {
    if (lastSyncTime > 0) {
      loadCustomers();
    }
  }, [lastSyncTime, loadCustomers]);

  // Manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadCustomers();
      toast({ title: '資料已刷新' });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Batch import state
  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.short_name.toLowerCase().includes(q) ||
      c.customer_no.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: '請輸入客戶名稱', variant: 'destructive' });
      return;
    }
    if (!form.type) {
      toast({ title: '請選擇客戶類型', variant: 'destructive' });
      return;
    }
    if (!form.contact1_name.trim()) {
      toast({ title: '請輸入聯絡人1姓名', variant: 'destructive' });
      return;
    }
    if (!form.contact1_phone.trim()) {
      toast({ title: '請輸入聯絡人1手機', variant: 'destructive' });
      return;
    }
    try {
      await dsCreateCustomer({
        name: form.name,
        short_name: form.short_name,
        type: form.type,
        address: form.address,
        delivery_addresses: form.delivery_addresses.filter(a => a.trim() !== ''),
        phone: form.phone,
        email: form.email,
        contact1_name: form.contact1_name,
        contact1_phone: form.contact1_phone,
        contact2_name: form.contact2_name,
        contact2_phone: form.contact2_phone,
        status: form.status,
        remarks: form.remarks,
      });
      await loadCustomers();
      setIsCreateOpen(false);
      setForm(emptyForm);
      toast({ title: '客戶已新增' });
    } catch (err) {
      console.error('[Customers] Create failed:', err);
      toast({ title: '新增失敗，請重試', variant: 'destructive' });
    }
  };

  const handleEditOpen = (customer: Customer) => {
    setEditCustomer(customer);
    const addresses = customer.delivery_addresses && customer.delivery_addresses.length > 0
      ? customer.delivery_addresses
      : [''];
    setForm({
      name: customer.name,
      short_name: customer.short_name,
      type: customer.type,
      address: customer.address,
      delivery_addresses: addresses,
      phone: customer.phone,
      email: customer.email,
      contact1_name: customer.contact1_name,
      contact1_phone: customer.contact1_phone,
      contact2_name: customer.contact2_name,
      contact2_phone: customer.contact2_phone,
      status: customer.status,
      remarks: customer.remarks,
    });
  };

  const handleEditSave = async () => {
    if (!editCustomer) return;
    if (!form.name.trim()) {
      toast({ title: '請輸入客戶名稱', variant: 'destructive' });
      return;
    }
    if (!form.type) {
      toast({ title: '請選擇客戶類型', variant: 'destructive' });
      return;
    }
    if (!form.contact1_name.trim()) {
      toast({ title: '請輸入聯絡人1姓名', variant: 'destructive' });
      return;
    }
    if (!form.contact1_phone.trim()) {
      toast({ title: '請輸入聯絡人1手機', variant: 'destructive' });
      return;
    }
    try {
      await dsUpdateCustomer(editCustomer.id, {
        name: form.name,
        short_name: form.short_name,
        type: form.type,
        address: form.address,
        delivery_addresses: form.delivery_addresses.filter(a => a.trim() !== ''),
        phone: form.phone,
        email: form.email,
        contact1_name: form.contact1_name,
        contact1_phone: form.contact1_phone,
        contact2_name: form.contact2_name,
        contact2_phone: form.contact2_phone,
        status: form.status,
        remarks: form.remarks,
      });
      await loadCustomers();
      setEditCustomer(null);
      setForm(emptyForm);
      toast({ title: '客戶已更新' });
    } catch (err) {
      console.error('[Customers] Update failed:', err);
      toast({ title: '更新失敗，請重試', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此客戶？')) return;
    try {
      await dsDeleteCustomer(id);
      await loadCustomers();
      toast({ title: '客戶已刪除' });
    } catch (err) {
      console.error('[Customers] Delete failed:', err);
      toast({ title: '刪除失敗，請重試', variant: 'destructive' });
    }
  };

  const addDeliveryAddress = () => {
    setForm({ ...form, delivery_addresses: [...form.delivery_addresses, ''] });
  };

  const updateDeliveryAddress = (index: number, value: string) => {
    const updated = [...form.delivery_addresses];
    updated[index] = value;
    setForm({ ...form, delivery_addresses: updated });
  };

  const removeDeliveryAddress = (index: number) => {
    if (form.delivery_addresses.length <= 1) return;
    const updated = form.delivery_addresses.filter((_, i) => i !== index);
    setForm({ ...form, delivery_addresses: updated });
  };

  const formContent = (
    <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>客戶名稱 <span className="text-red-400">*</span></Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-zinc-800 border-zinc-600" />
        </div>
        <div>
          <Label>客戶簡稱</Label>
          <Input value={form.short_name} onChange={e => setForm({ ...form, short_name: e.target.value })} className="bg-zinc-800 border-zinc-600" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>客戶類型 <span className="text-red-400">*</span></Label>
          <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as CustomerType })}>
            <SelectTrigger className="bg-zinc-800 border-zinc-600"><SelectValue placeholder="選擇類型" /></SelectTrigger>
            <SelectContent>
              {CUSTOMER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>狀態</Label>
          <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as CustomerStatus })}>
            <SelectTrigger className="bg-zinc-800 border-zinc-600"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CUSTOMER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>公司地址</Label>
        <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="bg-zinc-800 border-zinc-600" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>送貨地址</Label>
          <Button type="button" size="sm" variant="ghost" onClick={addDeliveryAddress} className="h-6 px-2 text-xs text-amber-400 hover:text-amber-300">
            <Plus className="w-3 h-3 mr-1" /> 新增地址
          </Button>
        </div>
        <div className="space-y-2">
          {form.delivery_addresses.map((addr, idx) => (
            <div key={idx} className="flex gap-2">
              <Input
                value={addr}
                onChange={e => updateDeliveryAddress(idx, e.target.value)}
                placeholder={`送貨地址 ${idx + 1}`}
                className="bg-zinc-800 border-zinc-600 flex-1"
              />
              {form.delivery_addresses.length > 1 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => removeDeliveryAddress(idx)} className="h-9 px-2 text-red-400 hover:text-red-300">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>公司電話</Label>
          <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="bg-zinc-800 border-zinc-600" />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="bg-zinc-800 border-zinc-600" />
        </div>
      </div>
      <div className="border-t border-zinc-700 pt-3">
        <Label className="text-amber-400 font-semibold">聯絡人 1 <span className="text-red-400">*</span></Label>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <Label>姓名 <span className="text-red-400">*</span></Label>
            <Input value={form.contact1_name} onChange={e => setForm({ ...form, contact1_name: e.target.value })} className="bg-zinc-800 border-zinc-600" />
          </div>
          <div>
            <Label>手機 <span className="text-red-400">*</span></Label>
            <Input value={form.contact1_phone} onChange={e => setForm({ ...form, contact1_phone: e.target.value })} className="bg-zinc-800 border-zinc-600" />
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-700 pt-3">
        <Label className="text-amber-400 font-semibold">聯絡人 2</Label>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <Label>姓名</Label>
            <Input value={form.contact2_name} onChange={e => setForm({ ...form, contact2_name: e.target.value })} className="bg-zinc-800 border-zinc-600" />
          </div>
          <div>
            <Label>手機</Label>
            <Input value={form.contact2_phone} onChange={e => setForm({ ...form, contact2_phone: e.target.value })} className="bg-zinc-800 border-zinc-600" />
          </div>
        </div>
      </div>
      <div>
        <Label>備註</Label>
        <Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="bg-zinc-800 border-zinc-600" />
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-500" />
            客戶資料
          </h1>
          <div className="flex gap-2">
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="icon"
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
              disabled={isRefreshing}
              title="重新刷新資料"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => setIsBatchImportOpen(true)} variant="outline" className="border-amber-600 text-amber-400 hover:bg-amber-600/10">
              <Upload className="w-4 h-4 mr-1" /> 批次匯入
            </Button>
            <Button onClick={() => { setForm(emptyForm); setIsCreateOpen(true); }} className="bg-amber-600 hover:bg-amber-700">
              <Plus className="w-4 h-4 mr-1" /> 新增客戶
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="搜尋客戶名稱、簡稱或編號..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-600"
          />
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="text-center py-8 text-zinc-400">載入中...</div>
        ) : (
          /* Customer List */
          <div className="overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800">
                <tr>
                  <th className="px-3 py-2 text-left text-zinc-300">客戶編號</th>
                  <th className="px-3 py-2 text-left text-zinc-300">客戶名稱</th>
                  <th className="px-3 py-2 text-left text-zinc-300">簡稱</th>
                  <th className="px-3 py-2 text-left text-zinc-300">類型</th>
                  <th className="px-3 py-2 text-left text-zinc-300">電話</th>
                  <th className="px-3 py-2 text-left text-zinc-300">聯絡人</th>
                  <th className="px-3 py-2 text-left text-zinc-300">狀態</th>
                  <th className="px-3 py-2 text-left text-zinc-300">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-500">無客戶資料</td></tr>
                ) : (
                  filteredCustomers.map(c => (
                    <tr key={c.id} className="border-t border-zinc-700 hover:bg-zinc-800/50">
                      <td className="px-3 py-2 text-zinc-300 font-mono text-xs">{c.customer_no}</td>
                      <td className="px-3 py-2 text-zinc-100">{c.name}</td>
                      <td className="px-3 py-2 text-zinc-300">{c.short_name}</td>
                      <td className="px-3 py-2 text-zinc-300">{c.type || '-'}</td>
                      <td className="px-3 py-2 text-zinc-300">{c.phone || '-'}</td>
                      <td className="px-3 py-2 text-zinc-300">{c.contact1_name || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.status === '啟用' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEditOpen(c)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-300">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>新增客戶</DialogTitle></DialogHeader>
          {formContent}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} className="bg-amber-600 hover:bg-amber-700">新增</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editCustomer} onOpenChange={open => { if (!open) { setEditCustomer(null); setForm(emptyForm); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>編輯客戶</DialogTitle></DialogHeader>
          {formContent}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setEditCustomer(null); setForm(emptyForm); }}>取消</Button>
            <Button onClick={handleEditSave} className="bg-amber-600 hover:bg-amber-700">儲存</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Import Dialog */}
      <BatchImportDialog
        open={isBatchImportOpen}
        onOpenChange={setIsBatchImportOpen}
        onImportComplete={() => loadCustomers()}
      />
    </AppLayout>
  );
}