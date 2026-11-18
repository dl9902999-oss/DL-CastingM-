import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { dsGetSuppliers, dsCreateSupplier, dsUpdateSupplier, dsDeleteSupplier } from '@/lib/supplierService';
import { DuplicateSupplierError, findPossibleDuplicateSuppliers } from '@/lib/supplierDuplicates';
import { Supplier, SupplierType, SupplierStatus } from '@/lib/types';
import { Plus, Search, Edit, Trash2, Users, X, Upload, RefreshCw } from 'lucide-react';
import SupplierBatchImportDialog from '@/components/SupplierBatchImportDialog';
import BusinessCardOCR from '@/components/BusinessCardOCR';
import { useDataConnection } from '@/contexts/DataContext';

const SUPPLIER_TYPES: SupplierType[] = ['原料供應商', '耗材供應商', '設備供應商', '加工廠', '熱處理廠', '運輸商', '貿易商', '其他'];
const SUPPLIER_STATUSES: SupplierStatus[] = ['啟用', '停用'];
const FILTER_COLUMNS = [
  { key: 'supplier_no', label: '廠商編號' },
  { key: 'name', label: '廠商名稱' },
  { key: 'short_name', label: '簡稱' },
  { key: 'type', label: '類型' },
  { key: 'phone', label: '電話' },
  { key: 'contact1_name', label: '聯絡人' },
  { key: 'status', label: '狀態' },
] as const;
const EMPTY_FILTERS = { supplier_no: '', name: '', short_name: '', type: '', phone: '', contact1_name: '', status: '' };
const TABLE_COLUMNS = [...FILTER_COLUMNS, { key: 'actions', label: '操作' }] as const;
const DEFAULT_WIDTHS = [140, 240, 150, 150, 170, 150, 130, 110];
const WIDTHS_STORAGE_KEY = 'suppliers.columnWidths.v1';
const MIN_COLUMN_WIDTH = 100;
const MAX_COLUMN_WIDTH = 800;

function readColumnWidths(): number[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(WIDTHS_STORAGE_KEY) || 'null');
    if (Array.isArray(saved) && saved.length === DEFAULT_WIDTHS.length &&
      saved.every(value => typeof value === 'number' && Number.isFinite(value) && value >= MIN_COLUMN_WIDTH && value <= MAX_COLUMN_WIDTH)) return saved;
  } catch { /* Browser storage may be unavailable. */ }
  return [...DEFAULT_WIDTHS];
}

interface FormState {
  name: string;
  short_name: string;
  type: SupplierType | '';
  address: string;
  delivery_addresses: string[];
  phone: string;
  email: string;
  contact1_name: string;
  contact1_phone: string;
  contact2_name: string;
  contact2_phone: string;
  status: SupplierStatus;
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

export default function Suppliers() {
  const { toast } = useToast();
  const { lastSyncTime } = useDataConnection();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState(EMPTY_FILTERS);
  const [columnWidths, setColumnWidths] = useState(readColumnWidths);
  const columnDrag = useRef<{ index: number; x: number; width: number } | null>(null);
  useEffect(() => {
    try { localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths)); }
    catch { /* Resizing still works when browser storage is unavailable. */ }
  }, [columnWidths]);
  const resizeColumn = (index: number, width: number) => {
    setColumnWidths(previous => previous.map((value, i) => i === index ? Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, width)) : value));
  };
  const hasFilters = Boolean(searchQuery.trim()) || Object.values(columnFilters).some(value => value.trim());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const possibleDuplicates = useMemo(() => findPossibleDuplicateSuppliers(suppliers, form, editSupplier?.id), [suppliers, form, editSupplier]);
  const duplicateNotice = <div className="space-y-2 rounded border border-amber-500/40 p-3 text-sm" aria-live="polite">
    <p className="text-amber-300">可能重複廠商（依目前已載入清單比對）</p>
    {possibleDuplicates.length ? <div className="max-h-40 overflow-y-auto space-y-2">{possibleDuplicates.map(({supplier, reasons}) => <div key={supplier.id} className="border-t border-zinc-700 pt-2">
      <p>{supplier.supplier_no} · {supplier.name} {supplier.short_name && `（${supplier.short_name}）`} · {supplier.status}</p>
      <p className="text-amber-300">{reasons.join('、')}</p>
      <p className="text-zinc-400">{[supplier.phone, supplier.contact1_phone, supplier.address].filter(Boolean).join(' · ')}</p>
    </div>)}</div> : <p className="text-zinc-400">目前沒有符合的候選；不代表一定沒有重複。</p>}
    <p className="text-xs text-zinc-400">請核對既有資料；相似名稱或共用電話不一定是同一家公司。新增儲存時仍會檢查最新雲端的全名與簡稱。</p>
  </div>;

  // Load suppliers from dataService (routes to Supabase when connected)
  const loadSuppliers = useCallback(async () => {
    try {
      const data = await dsGetSuppliers();
      setSuppliers(data);
      setLoadError('');
      return true;
    } catch (err) {
      console.error('[Suppliers] Failed to load:', err);
      setLoadError(err instanceof Error ? err.message : '無法讀取廠商資料，請重試');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // Re-load when sync event occurs (another device changed data)
  useEffect(() => {
    if (lastSyncTime > 0) {
      loadSuppliers();
    }
  }, [lastSyncTime, loadSuppliers]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void loadSuppliers(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [loadSuppliers]);

  // Manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (await loadSuppliers()) toast({ title: '資料已刷新' });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Batch import state
  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return suppliers.filter(c =>
      (!q || c.name.toLowerCase().includes(q) ||
      c.short_name.toLowerCase().includes(q) ||
      c.supplier_no.toLowerCase().includes(q)) &&
      FILTER_COLUMNS.every(({ key }) => {
        const value = columnFilters[key].trim().toLowerCase();
        const actual = (c[key] || '').toLowerCase();
        if (!value) return true;
        if (key === 'type' || key === 'status') return actual === value;
        return actual.includes(value);
      })
    ).sort((a, b) => a.supplier_no.localeCompare(b.supplier_no, 'en', {
      numeric: true,
      sensitivity: 'base',
    }));
  }, [suppliers, searchQuery, columnFilters]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: '請輸入廠商名稱', variant: 'destructive' });
      return;
    }
    if (!form.type) {
      toast({ title: '請選擇廠商類型', variant: 'destructive' });
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
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await dsCreateSupplier({
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
      if (result) {
        await loadSuppliers();
        setIsCreateOpen(false);
        setForm(emptyForm);
        toast({ title: '廠商已新增' });
      } else {
        toast({ title: '新增失敗，請重試', variant: 'destructive' });
      }
    } catch (err: unknown) {
      console.error('[Suppliers] Create failed:', err);
      if (err instanceof DuplicateSupplierError) {
        toast({ title: '廠商已存在，未新增', description: err.message, variant: 'destructive' });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '資料庫權限不足，請聯繫管理員執行 RLS 修正腳本', variant: 'destructive' });
      } else if (msg.includes('duplicate') || msg.includes('unique')) {
        toast({ title: '廠商編號重複，請重試', variant: 'destructive' });
      } else if (msg.includes('timeout')) {
        toast({ title: '連線逾時，請確認廠商清單後再試', variant: 'destructive' });
      } else {
        toast({ title: '新增失敗', description: msg, variant: 'destructive' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditOpen = (supplier: Supplier) => {
    setEditSupplier(supplier);
    const addresses = supplier.delivery_addresses && supplier.delivery_addresses.length > 0
      ? supplier.delivery_addresses
      : [''];
    setForm({
      name: supplier.name,
      short_name: supplier.short_name,
      type: supplier.type,
      address: supplier.address,
      delivery_addresses: addresses,
      phone: supplier.phone,
      email: supplier.email,
      contact1_name: supplier.contact1_name,
      contact1_phone: supplier.contact1_phone,
      contact2_name: supplier.contact2_name,
      contact2_phone: supplier.contact2_phone,
      status: supplier.status,
      remarks: supplier.remarks,
    });
  };

  const handleEditSave = async () => {
    if (!editSupplier) return;
    if (!form.name.trim()) {
      toast({ title: '請輸入廠商名稱', variant: 'destructive' });
      return;
    }
    if (!form.type) {
      toast({ title: '請選擇廠商類型', variant: 'destructive' });
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
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await dsUpdateSupplier(editSupplier.id, {
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
      if (result) {
        await loadSuppliers();
        setEditSupplier(null);
        setForm(emptyForm);
        toast({ title: '✅ 廠商資料已更新' });
      } else {
        toast({ title: '更新失敗，請重試', variant: 'destructive' });
      }
    } catch (err: unknown) {
      console.error('[Suppliers] Update failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '資料庫權限不足，請聯繫管理員執行 RLS 修正腳本', variant: 'destructive' });
      } else if (msg.includes('timeout')) {
        toast({ title: '連線逾時，請刷新確認是否已儲存', variant: 'destructive' });
      } else if (msg.includes('not found') || msg.includes('404')) {
        toast({ title: '找不到此廠商資料，可能已被其他裝置刪除', variant: 'destructive' });
        await loadSuppliers();
        setEditSupplier(null);
        setForm(emptyForm);
      } else if (msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '網路連線異常，請刷新確認是否已儲存', variant: 'destructive' });
      } else {
        toast({ title: '更新失敗，請重試', description: msg, variant: 'destructive' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此廠商？此操作無法復原。')) return;
    try {
      await dsDeleteSupplier(id);
      await loadSuppliers();
      toast({ title: '✅ 廠商已刪除' });
    } catch (err: unknown) {
      console.error('[Suppliers] Delete failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，無法刪除此廠商', variant: 'destructive' });
      } else if (msg.includes('timeout')) {
        toast({ title: '連線逾時，請重試', variant: 'destructive' });
      } else if (msg.includes('foreign') || msg.includes('constraint') || msg.includes('referenced')) {
        toast({ title: '此廠商有關聯的工單或其他資料，無法刪除', description: '請先刪除相關工單後再試', variant: 'destructive' });
      } else {
        toast({ title: '刪除失敗，請重試', description: msg, variant: 'destructive' });
      }
    }
  };

  // Handle OCR result from business card recognition
  const handleOCRResult = (data: { company_name: string; short_name: string; contact_name: string; contact_title: string; phone: string; mobile: string; fax: string; email: string; address: string; website: string; tax_id?: string }) => {
    setForm(prev => ({
      ...prev,
      name: data.company_name || prev.name,
      short_name: data.short_name || prev.short_name,
      phone: data.phone || prev.phone,
      email: data.email || prev.email,
      address: data.address || prev.address,
      contact1_name: data.contact_name || prev.contact1_name,
      contact1_phone: data.mobile || prev.contact1_phone,
      remarks: [
        prev.remarks,
        data.contact_title ? `職稱: ${data.contact_title}` : '',
        data.tax_id ? `統一編號: ${data.tax_id}` : '',
        data.fax ? `傳真: ${data.fax}` : '',
        data.website ? `網站: ${data.website}` : '',
      ].filter(Boolean).join('\n'),
    }));
    // Open create dialog if not already open
    if (!isCreateOpen && !editSupplier) {
      setIsCreateOpen(true);
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
          <Label>廠商名稱 <span className="text-red-400">*</span></Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-zinc-800 border-zinc-600" />
        </div>
        <div>
          <Label>廠商簡稱</Label>
          <Input value={form.short_name} onChange={e => setForm({ ...form, short_name: e.target.value })} className="bg-zinc-800 border-zinc-600" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>廠商類型 <span className="text-red-400">*</span></Label>
          <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as SupplierType })}>
            <SelectTrigger className="bg-zinc-800 border-zinc-600"><SelectValue placeholder="選擇類型" /></SelectTrigger>
            <SelectContent>
              {SUPPLIER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>狀態</Label>
          <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as SupplierStatus })}>
            <SelectTrigger className="bg-zinc-800 border-zinc-600"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPLIER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
            廠商資料
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
            <BusinessCardOCR onResult={handleOCRResult} />
            <Button onClick={() => setIsBatchImportOpen(true)} variant="outline" className="border-amber-600 text-amber-400 hover:bg-amber-600/10">
              <Upload className="w-4 h-4 mr-1" /> 批次匯入
            </Button>
            <Button onClick={() => { setForm(emptyForm); setIsCreateOpen(true); }} className="bg-amber-600 hover:bg-amber-700">
              <Plus className="w-4 h-4 mr-1" /> 新增廠商
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="搜尋廠商名稱、簡稱或編號..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-600"
          />
        </div>

        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span aria-live="polite">{isLoading ? '載入中...' : `顯示 ${filteredSuppliers.length} / ${suppliers.length} 筆廠商`}</span>
          <span>拖曳欄位標題右側可調整寬度</span>
          <Button variant="ghost" size="sm" onClick={() => setColumnWidths([...DEFAULT_WIDTHS])}>重設欄寬</Button>
          {hasFilters && <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setColumnFilters(EMPTY_FILTERS); }}>
            <X className="w-4 h-4 mr-1" />清除篩選
          </Button>}
        </div>

        {loadError && <div role="alert" className="rounded border border-red-500/40 p-3 text-red-300">{loadError}</div>}
        {/* Loading state */}
        {isLoading ? (
          <div className="text-center py-8 text-zinc-400">載入中...</div>
        ) : (
          /* Supplier List */
          <div className="overflow-x-auto rounded-lg border border-zinc-700">
            <table className="table-fixed text-sm [&_td]:break-words" style={{ width: columnWidths.reduce((sum, width) => sum + width, 0) }}>
              <colgroup>{TABLE_COLUMNS.map((column, index) => <col key={column.key} style={{ width: columnWidths[index] }} />)}</colgroup>
              <thead className="bg-zinc-800">
                <tr>
                  {TABLE_COLUMNS.map((column, index) => <th key={column.key} scope="col" className="relative px-3 py-2 text-left text-zinc-300">
                    {column.label}
                    <div role="separator" aria-label={`調整${column.label}欄寬`} aria-orientation="vertical"
                      aria-valuemin={MIN_COLUMN_WIDTH} aria-valuemax={MAX_COLUMN_WIDTH} aria-valuenow={columnWidths[index]} tabIndex={0}
                      title="拖曳調整欄寬；方向鍵微調，雙擊還原"
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none border-r border-zinc-600 hover:bg-amber-500/40 focus:bg-amber-500/40 focus:outline-none"
                      onPointerDown={event => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        columnDrag.current = { index, x: event.clientX, width: columnWidths[index] };
                      }}
                      onPointerMove={event => {
                        const drag = columnDrag.current;
                        if (drag && drag.index === index) resizeColumn(index, drag.width + event.clientX - drag.x);
                      }}
                      onPointerUp={event => {
                        columnDrag.current = null;
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      }}
                      onPointerCancel={() => { columnDrag.current = null; }}
                      onLostPointerCapture={() => { columnDrag.current = null; }}
                      onDoubleClick={() => resizeColumn(index, DEFAULT_WIDTHS[index])}
                      onKeyDown={event => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                          event.preventDefault();
                          resizeColumn(index, columnWidths[index] + (event.key === 'ArrowRight' ? 10 : -10));
                        }
                      }} />
                  </th>)}
                </tr>
                <tr>
                  {FILTER_COLUMNS.map(({ key, label }) => (
                    <th key={key} className="px-3 pb-3 font-normal">
                      {key === 'type' || key === 'status' ? (
                        <Select value={columnFilters[key] || 'all'} onValueChange={value => setColumnFilters(prev => ({ ...prev, [key]: value === 'all' ? '' : value }))}>
                          <SelectTrigger aria-label={`篩選${label}`} className="h-8 w-full min-w-0 bg-zinc-900 border-zinc-600"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">全部{label}</SelectItem>
                            {(key === 'type' ? SUPPLIER_TYPES : SUPPLIER_STATUSES).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input aria-label={`篩選${label}`} placeholder={`篩選${label}`} value={columnFilters[key]}
                          onChange={event => setColumnFilters(prev => ({ ...prev, [key]: event.target.value }))}
                          className="h-8 w-full min-w-0 bg-zinc-900 border-zinc-600" />
                      )}
                    </th>
                  ))}
                  <th><span className="sr-only">操作欄無篩選</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-500">{loadError ? '廠商資料尚未載入' : hasFilters ? '沒有符合篩選條件的廠商' : '無廠商資料'}</td></tr>
                ) : (
                  filteredSuppliers.map(c => (
                    <tr key={c.id} className="border-t border-zinc-700 hover:bg-zinc-800/50">
                      <td className="px-3 py-2 text-zinc-300 font-mono text-xs">{c.supplier_no}</td>
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
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg max-h-[90vh] overflow-y-auto" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>新增廠商</DialogTitle></DialogHeader>
          {duplicateNotice}
          {formContent}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={isSaving} className="bg-amber-600 hover:bg-amber-700">
              {isSaving ? '儲存中...' : '新增'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editSupplier} onOpenChange={open => { if (!open) { setEditSupplier(null); setForm(emptyForm); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg max-h-[90vh] overflow-y-auto" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>編輯廠商</DialogTitle></DialogHeader>
          {duplicateNotice}
          {formContent}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setEditSupplier(null); setForm(emptyForm); }}>取消</Button>
            <Button onClick={handleEditSave} disabled={isSaving} className="bg-amber-600 hover:bg-amber-700">
              {isSaving ? '儲存中...' : '儲存'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Import Dialog */}
      <SupplierBatchImportDialog
        open={isBatchImportOpen}
        onOpenChange={setIsBatchImportOpen}
        onImportComplete={() => loadSuppliers()}
      />
    </AppLayout>
  );
}
