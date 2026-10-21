import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import WorkOrderImportDialog from '@/components/WorkOrderImportDialog';
import { orderItems, itemMatches } from '@/lib/workOrderItems';
import { useSyncTrigger } from '@/hooks/useSyncedData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { WorkOrder, MoldingBatch, MoldSupply, MoldType, HeatTreatment, Pattern, Customer } from '@/lib/types';
import { dsGetCustomers, dsGetWorkOrders, dsCreateWorkOrder, dsUpdateWorkOrder, dsDeleteWorkOrder, dsGetMoldingBatches, dsGetPatterns, dsGetMeltRecords } from '@/lib/dataService';
import { Plus, Search, Edit, Image, FileImage, X, Trash2, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { onWorkOrderChange, WorkOrderChangeEvent } from '@/lib/realtimeSync';

const MOLD_SUPPLY_OPTIONS: MoldSupply[] = ['客戶提供', '公司自有', '代客製作'];
const MOLD_TYPE_OPTIONS: MoldType[] = ['上下模', '單面模', '現板模', '保模', '中板模', '砂心模', '其他'];
const HEAT_TREATMENT_OPTIONS: HeatTreatment[] = ['退火', '淬火', '回火', '正常化', '調質', '其他'];

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

function PatternAutocomplete({ value, onChange, patterns, onAddPattern }: {
  value: string;
  onChange: (patternId: string, patternType?: string) => void;
  patterns: Pattern[];
  onAddPattern: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Display selected pattern info
  const selectedPattern = patterns.find(p => p.id === value);

  useEffect(() => {
    if (selectedPattern) {
      setInputValue(`${selectedPattern.pattern_no} - ${selectedPattern.name}`);
    } else if (!value || value === '__none__') {
      setInputValue('');
    }
  }, [value, selectedPattern]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availablePatterns = patterns.filter(p => p.status === '可生產');
  const filtered = availablePatterns.filter(p => {
    if (!inputValue.trim()) return true;
    const term = inputValue.toLowerCase();
    return p.pattern_no.toLowerCase().includes(term) ||
      p.name.toLowerCase().includes(term) ||
      p.pattern_type.toLowerCase().includes(term) ||
      (p.customer && p.customer.toLowerCase().includes(term));
  });

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="輸入模具編號、名稱或客戶搜尋..."
          className="bg-zinc-700 border-zinc-600 text-zinc-100 flex-1"
        />
        {value && value !== '__none__' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              onChange('__none__');
              setInputValue('');
            }}
            className="text-zinc-400 hover:text-zinc-100 shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-600 rounded-md shadow-lg max-h-56 overflow-y-auto">
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-700"
            onClick={() => {
              onChange('__none__');
              setInputValue('');
              setOpen(false);
            }}
          >
            不帶入
          </button>
          {filtered.length > 0 ? (
            filtered.map(p => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex justify-between items-center"
                onClick={() => {
                  onChange(p.id, p.pattern_type);
                  setInputValue(`${p.pattern_no} - ${p.name}`);
                  setOpen(false);
                }}
              >
                <span className="flex flex-col">
                  <span>{p.pattern_no} - {p.name}</span>
                  <span className="text-xs text-zinc-500">{p.pattern_type}{p.customer ? ` | ${p.customer}` : ''}</span>
                </span>
                <span className="text-zinc-500 text-xs">{p.pattern_type}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-zinc-400">找不到符合的模具</div>
          )}
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-amber-400 hover:bg-zinc-700 flex items-center gap-1.5 border-t border-zinc-700"
            onClick={() => {
              setOpen(false);
              onAddPattern();
            }}
          >
            <Plus className="w-3.5 h-3.5" />新增模具
          </button>
        </div>
      )}
    </div>
  );
}

function CustomerAutocomplete({ value, onChange, customers, onAddCustomer }: {
  value: string;
  onChange: (val: string) => void;
  customers: Customer[];
  onAddCustomer: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = customers.filter(c => {
    if (!inputValue.trim()) return true;
    const term = inputValue.toLowerCase();
    return c.name.toLowerCase().includes(term) || c.short_name.toLowerCase().includes(term) || c.customer_no.toLowerCase().includes(term);
  });

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={inputValue}
        onChange={e => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="輸入客戶名稱搜尋..."
        className="bg-zinc-700 border-zinc-600 text-zinc-100"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex justify-between items-center"
                onClick={() => {
                  onChange(c.name);
                  setInputValue(c.name);
                  setOpen(false);
                }}
              >
                <span>{c.name}</span>
                <span className="text-zinc-500 text-xs">{c.customer_no}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-zinc-400">找不到符合的客戶</div>
          )}
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-amber-400 hover:bg-zinc-700 flex items-center gap-1.5 border-t border-zinc-700"
            onClick={() => {
              setOpen(false);
              onAddCustomer();
            }}
          >
            <UserPlus className="w-3.5 h-3.5" />新增客戶
          </button>
        </div>
      )}
    </div>
  );
}

export default function WorkOrders() {
  const navigate = useNavigate();
  const [itemDialog, setItemDialog] = useState<{ mode: 'pdf' | 'manual' | 'edit'; order?: WorkOrder } | null>(null);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [batches, setBatches] = useState<MoldingBatch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<WorkOrder | null>(null);
  const [viewImages, setViewImages] = useState<{ title: string; images: string[] } | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    customer: '',
    product_name: '',
    material: '',
    quantity: 0,
    estimated_weight: 0,
    mold_supply: '' as MoldSupply | '',
    mold_type: '' as MoldType | '',
    pattern_id: '',
    heat_treatment: '' as HeatTreatment | '',
    due_date: '',
    remarks: '',
    mold_photos: [] as string[],
    drawing_photos: [] as string[],
  });
  const [patternList, setPatternList] = useState<Pattern[]>([]);

  const syncTrigger = useSyncTrigger();

  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Stable reload function - mirrors the pattern used in Customers.tsx
  const loadWorkOrders = useCallback(async () => {
    try {
      const [wo, mb, pl, cl] = await Promise.all([
        dsGetWorkOrders(),
        dsGetMoldingBatches(),
        dsGetPatterns(),
        dsGetCustomers(),
      ]);
      setOrders(wo);
      setBatches(mb);
      setPatternList(pl);
      setCustomers(cl);
    } catch {
      // fallback already handled inside dataService
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      try {
        await loadWorkOrders();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [syncTrigger, loadWorkOrders]);

  // Cross-device work order change notification
  useEffect(() => {
    const unsubscribe = onWorkOrderChange((event: WorkOrderChangeEvent) => {
      const orderNo = (event.newRecord?.order_no || event.oldRecord?.order_no || '') as string;
      const label = orderNo ? ` (${orderNo})` : '';
      if (event.eventType === 'INSERT') {
        toast({ title: `📥 其他裝置新增了工單${label}`, description: '列表已自動更新' });
      } else if (event.eventType === 'UPDATE') {
        toast({ title: `📝 其他裝置更新了工單${label}`, description: '列表已自動更新' });
      } else if (event.eventType === 'DELETE') {
        toast({ title: `🗑️ 其他裝置刪除了工單${label}`, description: '列表已自動更新' });
      }
      // Simple reload - mirrors Customers.tsx pattern
      loadWorkOrders();
    });
    return unsubscribe;
  }, [toast, loadWorkOrders]);

  const getStartedQty = (orderId: string) => {
    return batches.filter(b => b.work_order_id === orderId).reduce((sum, b) => sum + b.quantity_planned, 0);
  };

  const [meltRecordsCache, setMeltRecordsCache] = useState<Array<{ id: string }>>([]);

  // Load melt records for pouring status check
  useEffect(() => {
    dsGetMeltRecords().then(records => setMeltRecordsCache(records)).catch(() => {});
  }, [syncTrigger]);

  // Check if a batch has pouring records (from melt_pouring_* localStorage)
  const getBatchPouringStatus = (batchId: string): 'none' | 'partial' | 'full' => {
    for (const record of meltRecordsCache) {
      const pouringKey = `melt_pouring_${record.id}`;
      const savedPouring = localStorage.getItem(pouringKey);
      if (savedPouring) {
        try {
          const pouringData = JSON.parse(savedPouring) as Array<{
            batch_id: string;
            pouring_weights: number[];
            quantity: number;
          }>;
          const batchPouring = pouringData.find(p => p.batch_id === batchId);
          if (batchPouring) {
            const filledWeights = batchPouring.pouring_weights.filter(w => w > 0).length;
            if (filledWeights >= batchPouring.quantity) return 'full';
            if (filledWeights > 0) return 'partial';
          }
        } catch { /* ignore parse errors */ }
      }
    }
    return 'none';
  };

  // Derive display status based on batch quantities and pouring status
  const getDisplayStatus = (order: WorkOrder) => {
    const startedQty = getStartedQty(order.id);
    if (order.status === 'Cancelled') return { label: '已取消', cls: 'bg-zinc-600 text-zinc-300' };

    // Check if all batches cover the order quantity (fully started)
    if (order.status === 'Completed' || startedQty >= order.quantity) {
      // Get all batches for this order
      const orderBatches = batches.filter(b => b.work_order_id === order.id);
      if (orderBatches.length === 0) return { label: '已完成', cls: 'bg-green-500/20 text-green-400' };

      // Check pouring status for each batch
      let allPoured = true;
      let anyPoured = false;
      for (const batch of orderBatches) {
        const pouringStatus = getBatchPouringStatus(batch.id);
        if (pouringStatus === 'full') {
          anyPoured = true;
        } else if (pouringStatus === 'partial') {
          anyPoured = true;
          allPoured = false;
        } else {
          allPoured = false;
        }
      }

      if (allPoured && anyPoured) return { label: '全部澆注', cls: 'bg-emerald-500/20 text-emerald-400' };
      if (anyPoured) return { label: '部分澆注', cls: 'bg-purple-500/20 text-purple-400' };

      // Check if all batches have closing_photos (合模完成)
      const allMoldClosed = orderBatches.every(b => b.closing_photos && b.closing_photos.length > 0);
      if (allMoldClosed) return { label: '合模完成', cls: 'bg-teal-500/20 text-teal-400' };

      return { label: '已完成', cls: 'bg-green-500/20 text-green-400' };
    }

    if (startedQty > 0) return { label: '部分造模', cls: 'bg-cyan-500/20 text-cyan-400' };
    if (order.status === 'Partial') return { label: '部分造模', cls: 'bg-cyan-500/20 text-cyan-400' };
    if (order.status === 'In Progress') return { label: '造模中', cls: 'bg-amber-500/20 text-amber-400' };
    return { label: '待造模', cls: 'bg-blue-500/20 text-blue-400' };
  };

  const resetForm = () => setForm({
    customer: '', product_name: '', material: '', quantity: 0,
    estimated_weight: 0, mold_supply: '', mold_type: '', pattern_id: '', heat_treatment: '',
    due_date: '', remarks: '', mold_photos: [], drawing_photos: []
  });

  const validateWorkOrderForm = (): string | null => {
    // 必填欄位檢查
    if (!form.customer.trim()) return '請選擇或輸入客戶名稱';
    if (!form.product_name.trim()) return '請輸入產品名稱';
    if (!form.material.trim()) return '請輸入材質';
    if (!form.quantity || form.quantity <= 0) return '數量必須大於 0';
    if (form.quantity > 99999) return '數量不可超過 99,999';
    if (!Number.isInteger(form.quantity)) return '數量必須為整數';

    // 客戶名稱長度檢查
    if (form.customer.trim().length > 50) return '客戶名稱不可超過 50 字';

    // 產品名稱長度檢查
    if (form.product_name.trim().length > 100) return '產品名稱不可超過 100 字';

    // 材質長度檢查
    if (form.material.trim().length > 50) return '材質名稱不可超過 50 字';

    // 預估重量驗證（若有填寫）
    if (form.estimated_weight && form.estimated_weight < 0) return '預估重量不可為負數';
    if (form.estimated_weight && form.estimated_weight > 999999) return '預估重量數值過大';

    // 交期驗證（若有填寫）
    if (form.due_date) {
      const dueDate = new Date(form.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(dueDate.getTime())) return '交期日期格式不正確';
      if (dueDate < today) return '交期不可早於今天';
    }

    // 備註長度檢查
    if (form.remarks && form.remarks.length > 500) return '備註不可超過 500 字';

    // 客戶存在性檢查（警告但不阻擋）
    const customerExists = customers.some(
      c => c.name === form.customer.trim() || c.short_name === form.customer.trim()
    );
    if (!customerExists && customers.length > 0) {
      // 不阻擋建立，但在後續流程中會使用預設客戶代碼
      console.warn('[WorkOrders] 客戶不在系統中，將使用預設代碼');
    }

    return null; // 驗證通過
  };

  const handleCreate = async () => {
    const validationError = validateWorkOrderForm();
    if (validationError) {
      toast({ title: validationError, variant: 'destructive' });
      return;
    }
    if (isSaving) return;
    setIsSaving(true);

    try {
      // 清理表單資料
      const cleanedData = {
        ...form,
        customer: form.customer.trim(),
        product_name: form.product_name.trim(),
        material: form.material.trim(),
        remarks: form.remarks?.trim() || '',
        quantity: Math.floor(form.quantity),
        estimated_weight: form.estimated_weight || 0,
      };

      const result = await dsCreateWorkOrder(cleanedData);
      if (result) {
        await loadWorkOrders();
        setIsCreateOpen(false);
        resetForm();
        toast({ title: '✅ 工單已新增' });
      } else {
        toast({ title: '新增失敗，請重試', variant: 'destructive' });
      }
    } catch (err: unknown) {
      console.error('[WorkOrders] 建立工單失敗:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '資料庫權限不足，請聯繫管理員執行 RLS 修正腳本', variant: 'destructive' });
      } else if (msg.includes('duplicate') || msg.includes('unique')) {
        toast({ title: '工單編號重複，請稍後再試', variant: 'destructive' });
      } else if (msg.includes('timeout')) {
        toast({ title: '連線逾時，已儲存至本地', variant: 'destructive' });
      } else {
        toast({ title: '建立失敗，請稍後再試', variant: 'destructive', description: msg || undefined });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editOrder) return;
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await dsUpdateWorkOrder(editOrder.id, editOrder);
      if (result) {
        await loadWorkOrders();
        setEditOrder(null);
        toast({ title: '✅ 工單資料已更新' });
      } else {
        toast({ title: '更新失敗，請重試', variant: 'destructive' });
      }
    } catch (err: unknown) {
      console.error('[WorkOrders] Update failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '資料庫權限不足，請聯繫管理員執行 RLS 修正腳本', variant: 'destructive' });
      } else if (msg.includes('timeout')) {
        toast({ title: '連線逾時，已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '更新失敗，請稍後再試', variant: 'destructive', description: msg || undefined });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (order: WorkOrder) => {
    if (!window.confirm(`確定要刪除工單 ${order.order_no} 嗎？此操作無法復原。`)) return;
    try {
      await dsDeleteWorkOrder(order.id);
      await loadWorkOrders();
      toast({ title: '✅ 工單已刪除' });
    } catch (err: unknown) {
      console.error('[WorkOrders] Delete failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，無法刪除此工單', variant: 'destructive' });
      } else if (msg.includes('timeout')) {
        toast({ title: '連線逾時，請重試', variant: 'destructive' });
      } else if (msg.includes('foreign') || msg.includes('constraint') || msg.includes('referenced')) {
        toast({ title: '此工單有關聯的造模批次或其他資料，無法刪除', description: '請先刪除相關批次後再試', variant: 'destructive' });
      } else {
        toast({ title: '刪除失敗，請重試', description: msg, variant: 'destructive' });
      }
    }
  };

  const filtered = orders.filter(o => {
    // Text search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchText = o.order_no.toLowerCase().includes(term) ||
        o.customer.toLowerCase().includes(term) ||
        o.product_name.toLowerCase().includes(term);
      if (!matchText) return false;
    }
    // Customer filter
    if (filterCustomer && filterCustomer !== '__all__' && o.customer !== filterCustomer) return false;
    // Status filter
    if (filterStatus && filterStatus !== '__all__') {
      const status = getDisplayStatus(o);
      if (status.label !== filterStatus) return false;
    }
    // Date range filter
    if (filterDateFrom) {
      const orderDate = o.created_at.slice(0, 10);
      if (orderDate < filterDateFrom) return false;
    }
    if (filterDateTo) {
      const orderDate = o.created_at.slice(0, 10);
      if (orderDate > filterDateTo) return false;
    }
    return true;
  });

  return (
    <AppLayout>
      {itemDialog && <WorkOrderImportDialog {...itemDialog} onClose={() => setItemDialog(null)} onSaved={loadWorkOrders} />}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">工單管理</h1>
          <div className="flex flex-wrap gap-2"><Button className="bg-zinc-700 text-zinc-100" onClick={() => setItemDialog({ mode: 'pdf' })}>批量匯入 PDF</Button><Button className="bg-amber-500 text-zinc-900" onClick={() => setItemDialog({ mode: 'manual' })}>新增多品項工單</Button></div>
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
                  <CustomerAutocomplete
                    value={form.customer}
                    onChange={(val) => setForm({ ...form, customer: val })}
                    customers={customers}
                    onAddCustomer={() => navigate('/customers')}
                  />
                </div>
                <div>
                  <Label className="text-zinc-300">品名</Label>
                  <Input value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">材質</Label>
                  <Input value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">數量</Label>
                    <Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">預估重量 (kg)</Label>
                    <Input type="number" value={form.estimated_weight} onChange={e => setForm({ ...form, estimated_weight: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-300">模具供給</Label>
                  <Select value={form.mold_supply} onValueChange={val => setForm({ ...form, mold_supply: val as MoldSupply })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇模具供給方式" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {MOLD_SUPPLY_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">模具型式</Label>
                  <Select value={form.mold_type} onValueChange={val => setForm({ ...form, mold_type: val as MoldType })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇模具型式" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {MOLD_TYPE_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">帶入模具</Label>
                  <PatternAutocomplete
                    value={form.pattern_id}
                    onChange={(patternId, patternType) => {
                      if (patternType) {
                        setForm({ ...form, pattern_id: patternId, mold_type: patternType as MoldType });
                      } else {
                        setForm({ ...form, pattern_id: patternId === '__none__' ? '' : patternId });
                      }
                    }}
                    patterns={patternList}
                    onAddPattern={() => navigate('/mold-management')}
                  />
                </div>
                <div>
                  <Label className="text-zinc-300">熱處理</Label>
                  <Select value={form.heat_treatment} onValueChange={val => setForm({ ...form, heat_treatment: val as HeatTreatment })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇熱處理方式" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {HEAT_TREATMENT_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Button onClick={handleCreate} disabled={isSaving} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">{isSaving ? '儲存中...' : '建立'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search & Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="搜尋工單號、客戶、品名..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-zinc-400 text-xs mb-1 block">客戶篩選</Label>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9">
                  <SelectValue placeholder="全部客戶" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="__all__" className="text-zinc-200">全部客戶</SelectItem>
                  {[...new Set(orders.map(o => o.customer))].filter(Boolean).sort().map(c => (
                    <SelectItem key={c} value={c} className="text-zinc-200">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <Label className="text-zinc-400 text-xs mb-1 block">狀態篩選</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9">
                  <SelectValue placeholder="全部狀態" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="__all__" className="text-zinc-200">全部狀態</SelectItem>
                  <SelectItem value="待造模" className="text-zinc-200">待造模</SelectItem>
                  <SelectItem value="部分造模" className="text-zinc-200">部分造模</SelectItem>
                  <SelectItem value="造模中" className="text-zinc-200">造模中</SelectItem>
                  <SelectItem value="合模完成" className="text-zinc-200">合模完成</SelectItem>
                  <SelectItem value="部分澆注" className="text-zinc-200">部分澆注</SelectItem>
                  <SelectItem value="全部澆注" className="text-zinc-200">全部澆注</SelectItem>
                  <SelectItem value="已完成" className="text-zinc-200">已完成</SelectItem>
                  <SelectItem value="已取消" className="text-zinc-200">已取消</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[130px]">
              <Label className="text-zinc-400 text-xs mb-1 block">起始日期</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
              />
            </div>
            <div className="flex-1 min-w-[130px]">
              <Label className="text-zinc-400 text-xs mb-1 block">結束日期</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 h-9"
              onClick={() => { setFilterCustomer(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); }}
            >
              清除篩選
            </Button>
          </div>
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
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getDisplayStatus(order).cls}`}>{getDisplayStatus(order).label}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-400">
                        <span>客戶: <span className="text-zinc-200">{order.customer}</span></span>
                        <span>品名: <span className="text-zinc-200">{order.product_name}</span></span>
                        <span>材質: <span className="text-zinc-200">{order.material}</span></span>
                        <span>訂單數量: <span className="text-zinc-200">{order.quantity}</span></span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-400 mt-1">
                        <span>已開工數量: <span className="text-zinc-200">{getStartedQty(order.id)}</span></span>
                        <span>餘剩數量: <span className={`${order.quantity - getStartedQty(order.id) <= 0 ? 'text-green-400' : 'text-amber-300'}`}>{order.quantity - getStartedQty(order.id)}</span></span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-400 mt-1">
                        {!order.items?.length && order.estimated_weight > 0 && <span>預估重量: <span className="text-zinc-200">{order.estimated_weight}kg</span></span>}
                        {!order.items?.length && order.mold_supply && <span>模具供給: <span className="text-zinc-200">{order.mold_supply}</span></span>}
                        {!order.items?.length && order.mold_type && <span>模具型式: <span className="text-zinc-200">{order.mold_type}</span></span>}
                        {!order.items?.length && order.heat_treatment && <span>熱處理: <span className="text-zinc-200">{order.heat_treatment}</span></span>}
                      </div>
                      {!!order.items?.length && <div className="mt-3 space-y-2">{orderItems(order).map(item => {
                        const related = batches.filter(batch => batch.work_order_id === order.id && itemMatches(order, item, batch.work_order_item_id));
                        const started = related.reduce((sum,batch) => sum + batch.quantity_planned, 0);
                        const completed = related.reduce((sum,batch) => sum + batch.quantity_completed, 0);
                        return <div key={item.id} className="rounded border border-zinc-600 p-2 text-xs text-zinc-300"><p className="text-amber-300">項次 {item.line_no} · {item.product_name} · {item.material}</p><p className="mt-1">{item.quantity} 件 × {item.estimated_weight} kg／件 · 總重 {(item.quantity * item.estimated_weight).toLocaleString('zh-TW')} kg</p><p>可開工 {Math.max(0,item.quantity-started)} 件 · 未完成 {Math.max(0,item.quantity-completed)} 件</p><p>{item.mold_supply} · {item.mold_type} · {item.heat_treatment} · 組別 {item.group || '—'}</p>{item.remarks && <p>{item.remarks}</p>}</div>;
                      })}<p className="text-xs text-zinc-400">訂貨日期 {order.order_date || '—'} · 送貨地址 {order.delivery_address || '—'}</p>{order.remarks && <p className="text-xs text-zinc-400 whitespace-pre-wrap">交貨備註：{order.remarks}</p>}</div>}
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
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => order.items?.length ? setItemDialog({ mode: 'edit', order }) : setEditOrder({ ...order, mold_photos: order.mold_photos || [], drawing_photos: order.drawing_photos || [] })} className="text-zinc-400 hover:text-zinc-100">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(order)} className="text-zinc-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
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
                  <CustomerAutocomplete
                    value={editOrder.customer}
                    onChange={(val) => setEditOrder({ ...editOrder, customer: val })}
                    customers={customers}
                    onAddCustomer={() => navigate('/customers')}
                  />
                </div>
                <div>
                  <Label className="text-zinc-300">品名</Label>
                  <Input value={editOrder.product_name} onChange={e => setEditOrder({ ...editOrder, product_name: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">材質</Label>
                  <Input value={editOrder.material} onChange={e => setEditOrder({ ...editOrder, material: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">數量</Label>
                    <Input type="number" value={editOrder.quantity} onChange={e => setEditOrder({ ...editOrder, quantity: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">預估重量 (kg)</Label>
                    <Input type="number" value={editOrder.estimated_weight || 0} onChange={e => setEditOrder({ ...editOrder, estimated_weight: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-300">模具供給</Label>
                  <Select value={editOrder.mold_supply || ''} onValueChange={val => setEditOrder({ ...editOrder, mold_supply: val as MoldSupply })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇模具供給方式" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {MOLD_SUPPLY_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">模具型式</Label>
                  <Select value={editOrder.mold_type || ''} onValueChange={val => setEditOrder({ ...editOrder, mold_type: val as MoldType })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇模具型式" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {MOLD_TYPE_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">帶入模具</Label>
                  <PatternAutocomplete
                    value={editOrder.pattern_id || ''}
                    onChange={(patternId, patternType) => {
                      if (patternType) {
                        setEditOrder({ ...editOrder, pattern_id: patternId, mold_type: patternType as MoldType });
                      } else {
                        setEditOrder({ ...editOrder, pattern_id: patternId === '__none__' ? '' : patternId });
                      }
                    }}
                    patterns={patternList}
                    onAddPattern={() => navigate('/mold-management')}
                  />
                </div>
                <div>
                  <Label className="text-zinc-300">熱處理</Label>
                  <Select value={editOrder.heat_treatment || ''} onValueChange={val => setEditOrder({ ...editOrder, heat_treatment: val as HeatTreatment })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇熱處理方式" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {HEAT_TREATMENT_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      <SelectItem value="Open">待造模</SelectItem>
                      <SelectItem value="Partial">部分造模</SelectItem>
                      <SelectItem value="In Progress">造模中</SelectItem>
                      <SelectItem value="Completed">已完成</SelectItem>
                      <SelectItem value="Cancelled">已取消</SelectItem>
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
                <Button onClick={handleUpdate} disabled={isSaving} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">{isSaving ? '儲存中...' : '更新'}</Button>
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