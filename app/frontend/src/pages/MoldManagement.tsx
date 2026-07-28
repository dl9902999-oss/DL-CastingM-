import { useState, useEffect, useRef } from 'react';
import { useSyncTrigger } from '@/hooks/useSyncedData';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Pattern, PatternType, PatternStatus, PatternLocationStatus, MaintenanceType,
  PatternMaintenance, PatternHistory, PatternLoan, Customer,
} from '@/lib/types';
import {
  dsGetPatterns, dsCreatePattern, dsUpdatePattern, dsDeletePattern,
  dsGetPatternHistory, dsGetPatternMaintenance, dsCreatePatternMaintenance,
  dsGetPatternLoans, dsCreatePatternLoan, dsReturnPatternLoan,
  dsGetCustomers,
} from '@/lib/dataService';

// Alias ds* to legacy names used in this file
const getPatterns = dsGetPatterns as unknown as (...args: Parameters<typeof dsGetPatterns>) => Awaited<ReturnType<typeof dsGetPatterns>>;
const createPattern = dsCreatePattern as unknown as (...args: Parameters<typeof dsCreatePattern>) => Awaited<ReturnType<typeof dsCreatePattern>>;
const updatePattern = dsUpdatePattern as unknown as (...args: Parameters<typeof dsUpdatePattern>) => Awaited<ReturnType<typeof dsUpdatePattern>>;
const deletePattern = dsDeletePattern as unknown as (...args: Parameters<typeof dsDeletePattern>) => Awaited<ReturnType<typeof dsDeletePattern>>;
const getPatternHistory = dsGetPatternHistory as unknown as (...args: Parameters<typeof dsGetPatternHistory>) => Awaited<ReturnType<typeof dsGetPatternHistory>>;
const getPatternMaintenance = dsGetPatternMaintenance as unknown as (...args: Parameters<typeof dsGetPatternMaintenance>) => Awaited<ReturnType<typeof dsGetPatternMaintenance>>;
const createPatternMaintenance = dsCreatePatternMaintenance as unknown as (...args: Parameters<typeof dsCreatePatternMaintenance>) => Awaited<ReturnType<typeof dsCreatePatternMaintenance>>;
const getPatternLoans = dsGetPatternLoans as unknown as (...args: Parameters<typeof dsGetPatternLoans>) => Awaited<ReturnType<typeof dsGetPatternLoans>>;
const createPatternLoan = dsCreatePatternLoan as unknown as (...args: Parameters<typeof dsCreatePatternLoan>) => Awaited<ReturnType<typeof dsCreatePatternLoan>>;
const returnPatternLoan = dsReturnPatternLoan as unknown as (...args: Parameters<typeof dsReturnPatternLoan>) => Awaited<ReturnType<typeof dsReturnPatternLoan>>;
const getCustomers = dsGetCustomers as unknown as (...args: Parameters<typeof dsGetCustomers>) => Awaited<ReturnType<typeof dsGetCustomers>>;
import { Plus, Search, Edit, Trash2, Wrench, History, MapPin, ArrowLeftRight, BarChart3, AlertTriangle, Image as ImageIcon, X } from 'lucide-react';

function MoldImageUpload({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) onChange([...images, result]);
      };
      reader.readAsDataURL(file);
    });
    if (inputRef.current) inputRef.current.value = '';
  };
  return (
    <div className="space-y-1">
      <Label className="text-zinc-300 text-xs flex items-center gap-1"><ImageIcon className="w-3 h-3 text-blue-400" />模具照片</Label>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-1">
          {images.map((img, i) => (
            <div key={i} className="relative w-16 h-16 rounded border border-zinc-600 overflow-hidden group">
              <img src={img} alt="" className="w-full h-full object-cover" />
              <button onClick={() => onChange(images.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-600/80 rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 h-7 text-xs">
        <Plus className="w-3 h-3 mr-1" />上傳照片
      </Button>
    </div>
  );
}

const PATTERN_TYPES: PatternType[] = ['上下模', '單面模', '現板模', '保模', '中板模', '砂心模', '其他'];
const PATTERN_STATUSES: PatternStatus[] = ['待驗收', '可生產', '維修中', '停用', '報廢'];
const LOCATION_STATUSES: PatternLocationStatus[] = ['在庫', '借出', '維修', '使用中'];
const MAINTENANCE_TYPES: MaintenanceType[] = ['清潔', '補修', '加工', '翻修', '更換'];

const STATUS_COLORS: Record<PatternStatus, string> = {
  '待驗收': 'bg-blue-500/20 text-blue-400',
  '可生產': 'bg-green-500/20 text-green-400',
  '維修中': 'bg-amber-500/20 text-amber-400',
  '停用': 'bg-zinc-500/20 text-zinc-400',
  '報廢': 'bg-red-500/20 text-red-400',
};

const LIFE_COLOR = (remaining: number, total: number) => {
  if (total <= 0) return 'text-zinc-400';
  const pct = (remaining / total) * 100;
  if (pct > 50) return 'text-green-400';
  if (pct >= 20) return 'text-amber-400';
  return 'text-red-400';
};

export default function MoldManagement() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [history, setHistory] = useState<PatternHistory[]>([]);
  const [maintenance, setMaintenance] = useState<PatternMaintenance[]>([]);
  const [loans, setLoans] = useState<PatternLoan[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPattern, setEditPattern] = useState<Pattern | null>(null);
  const [maintDialogOpen, setMaintDialogOpen] = useState(false);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const { toast } = useToast();

  const [form, setForm] = useState({
    customer: '',
    name: '',
    product_no: '',
    pattern_type: '上下模' as PatternType,
    material: '',
    cavities: 0,
    template_count: 0,
    sand_core_count: 0,
    dimensions: '',
    weight: 0,
    photos: [] as string[],
    open_date: '',
    supplier: '',
    cost: 0,
    lifetime_count: 0,
    status: '可生產' as PatternStatus,
    location_warehouse: '',
    location_area: '',
    location_shelf: '',
    location_status: '在庫' as PatternLocationStatus,
    remarks: '',
  });

  const [maintForm, setMaintForm] = useState({
    maintenance_date: new Date().toISOString().slice(0, 10),
    type: '清潔' as MaintenanceType,
    content: '',
    cost: 0,
    next_maintenance_date: '',
    created_by: '',
  });

  const [loanForm, setLoanForm] = useState({
    borrower: '',
    borrow_date: new Date().toISOString().slice(0, 10),
    purpose: '',
  });

  const syncTrigger = useSyncTrigger();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, c, h, m, l] = await Promise.all([
        getPatterns(),
        getCustomers(),
        getPatternHistory(),
        getPatternMaintenance(),
        getPatternLoans(),
      ]);
      if (!cancelled) {
        setPatterns(p);
        setCustomers(c);
        setHistory(h);
        setMaintenance(m);
        setLoans(l);
      }
    })();
    return () => { cancelled = true; };
  }, [syncTrigger]);

  const loadData = async () => {
    const [p, c, h, m, l] = await Promise.all([
      getPatterns(),
      getCustomers(),
      getPatternHistory(),
      getPatternMaintenance(),
      getPatternLoans(),
    ]);
    setPatterns(p);
    setCustomers(c);
    setHistory(h);
    setMaintenance(m);
    setLoans(l);
  };

  const filteredPatterns = patterns.filter(p => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.pattern_no.toLowerCase().includes(term) ||
      p.name.toLowerCase().includes(term) ||
      p.product_no.toLowerCase().includes(term) ||
      p.customer.toLowerCase().includes(term) ||
      p.material.toLowerCase().includes(term)
    );
  });

  const handleOpenCreate = () => {
    setEditPattern(null);
    setForm({
      customer: '', name: '', product_no: '', pattern_type: '上下模', material: '',
      cavities: 0, template_count: 0, sand_core_count: 0, dimensions: '', weight: 0,
      photos: [], open_date: '', supplier: '', cost: 0,
      lifetime_count: 0, status: '可生產', location_warehouse: '', location_area: '',
      location_shelf: '', location_status: '在庫', remarks: '',
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (p: Pattern) => {
    setEditPattern(p);
    setForm({
      customer: p.customer, name: p.name, product_no: p.product_no,
      pattern_type: p.pattern_type, material: p.material, cavities: p.cavities,
      template_count: p.template_count || 0, sand_core_count: p.sand_core_count || 0,
      dimensions: p.dimensions, weight: p.weight, photos: p.photos || [],
      open_date: p.open_date, supplier: p.supplier, cost: p.cost,
      lifetime_count: p.lifetime_count, status: p.status,
      location_warehouse: p.location_warehouse, location_area: p.location_area,
      location_shelf: p.location_shelf, location_status: p.location_status,
      remarks: p.remarks,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: '請輸入模具名稱', variant: 'destructive' });
      return;
    }
    try {
      if (editPattern) {
        await updatePattern(editPattern.id, form);
        toast({ title: '模具已更新' });
      } else {
        await createPattern(form);
        toast({ title: '模具已建立' });
      }
      setDialogOpen(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MoldManagement] Save failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，模具儲存失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '模具儲存失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  const handleDelete = async (p: Pattern) => {
    if (!window.confirm(`確定要刪除模具 ${p.pattern_no} - ${p.name} 嗎？`)) return;
    try {
      await deletePattern(p.id);
      await loadData();
      toast({ title: '模具已刪除' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MoldManagement] Delete failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，刪除失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('foreign') || msg.includes('constraint')) {
        toast({ title: '此模具有關聯資料，無法刪除', variant: 'destructive' });
      } else {
        toast({ title: '刪除失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  const handleMaintSave = async () => {
    if (!selectedPatternId || !maintForm.content.trim()) {
      toast({ title: '請填寫保養內容', variant: 'destructive' });
      return;
    }
    try {
      await createPatternMaintenance({ pattern_id: selectedPatternId, ...maintForm });
      setMaintDialogOpen(false);
      await loadData();
      toast({ title: '保養紀錄已建立' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MoldManagement] MaintSave failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，保養紀錄儲存失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '保養紀錄儲存失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  const handleLoanSave = async () => {
    if (!selectedPatternId || !loanForm.borrower.trim()) {
      toast({ title: '請填寫借出人', variant: 'destructive' });
      return;
    }
    try {
      await createPatternLoan({ pattern_id: selectedPatternId, return_date: '', ...loanForm });
      setLoanDialogOpen(false);
      await loadData();
      toast({ title: '借出紀錄已建立' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MoldManagement] LoanSave failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，借出紀錄儲存失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '借出紀錄儲存失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  const handleReturn = async (loanId: string) => {
    try {
      await returnPatternLoan(loanId);
      await loadData();
      toast({ title: '模具已歸還' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MoldManagement] Return failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，歸還操作失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '歸還操作失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  // KPI calculations
  const totalPatterns = patterns.length;
  const activePatterns = patterns.filter(p => p.status === '可生產').length;
  const inRepair = patterns.filter(p => p.status === '維修中').length;
  const lowLife = patterns.filter(p => p.lifetime_count > 0 && (p.lifetime_count - p.usage_count) / p.lifetime_count < 0.2).length;
  const pendingLoans = loans.filter(l => !l.return_date).length;

  // Top 10 usage
  const top10Usage = [...patterns].sort((a, b) => b.usage_count - a.usage_count).slice(0, 10);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">模具管理</h1>
          <Button onClick={handleOpenCreate} className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
            <Plus className="w-4 h-4 mr-2" />新增模具
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="搜尋模具編號、名稱、產品料號、客戶..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-zinc-800 border border-zinc-700 w-full flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900 text-zinc-300 text-xs sm:text-sm">模具總覽</TabsTrigger>
            <TabsTrigger value="list" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900 text-zinc-300 text-xs sm:text-sm">模具清單</TabsTrigger>
            <TabsTrigger value="maintenance" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900 text-zinc-300 text-xs sm:text-sm">模具保養</TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900 text-zinc-300 text-xs sm:text-sm">模具履歷</TabsTrigger>
            <TabsTrigger value="inventory" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900 text-zinc-300 text-xs sm:text-sm">模具庫存</TabsTrigger>
            <TabsTrigger value="analysis" className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-900 text-zinc-300 text-xs sm:text-sm">模具分析</TabsTrigger>
          </TabsList>

          {/* Tab: 模具總覽 (KPI Dashboard) */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-amber-400">{totalPatterns}</p>
                  <p className="text-xs text-zinc-400">模具總數</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">{activePatterns}</p>
                  <p className="text-xs text-zinc-400">可生產</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-amber-400">{inRepair}</p>
                  <p className="text-xs text-zinc-400">維修中</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-red-400">{lowLife}</p>
                  <p className="text-xs text-zinc-400">壽命不足</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-blue-400">{pendingLoans}</p>
                  <p className="text-xs text-zinc-400">借出中</p>
                </CardContent>
              </Card>
            </div>

            {/* Top 10 Usage */}
            <Card className="bg-zinc-800 border-zinc-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-zinc-100 text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />模具使用排行 Top 10
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {top10Usage.length === 0 ? (
                  <p className="text-zinc-500 text-sm text-center">尚無資料</p>
                ) : (
                  <div className="space-y-2">
                    {top10Usage.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-amber-400 w-6">{i + 1}</span>
                        <span className="text-sm text-zinc-200 flex-1 truncate">{p.pattern_no} - {p.name}</span>
                        <div className="w-32 bg-zinc-700 rounded-full h-2">
                          <div
                            className="bg-amber-500 h-2 rounded-full"
                            style={{ width: `${top10Usage[0].usage_count > 0 ? (p.usage_count / top10Usage[0].usage_count) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-400 w-12 text-right">{p.usage_count}次</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Life Warnings */}
            {lowLife > 0 && (
              <Card className="bg-zinc-800 border-zinc-700 border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-zinc-100 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />壽命不足警示（剩餘&lt;20%）
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    {patterns.filter(p => p.lifetime_count > 0 && (p.lifetime_count - p.usage_count) / p.lifetime_count < 0.2).map(p => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-200">{p.pattern_no} - {p.name}</span>
                        <span className="text-red-400 font-mono">剩餘 {p.lifetime_count - p.usage_count} 次</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: 模具清單 */}
          <TabsContent value="list" className="space-y-3 mt-4">
            {filteredPatterns.length === 0 ? (
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-8 text-center text-zinc-400">尚無模具資料</CardContent>
              </Card>
            ) : (
              filteredPatterns.map(p => {
                const remaining = p.lifetime_count - p.usage_count;
                return (
                  <Card key={p.id} className="bg-zinc-800 border-zinc-700">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-amber-400">{p.pattern_no}</span>
                            <span className="text-sm font-medium text-zinc-100">{p.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>{p.status}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                            <span>客戶: {p.customer || '-'}</span>
                            <span>類型: {p.pattern_type}</span>
                            <span>產品: {p.product_no || '-'}</span>
                            {p.material && <span>材質: {p.material}</span>}
                            {p.cavities > 0 && <span>模穴: {p.cavities}件/模</span>}
                            {p.template_count > 0 && <span>模板: {p.template_count}</span>}
                            <span>砂心: {p.sand_core_count ?? 0}</span>
                            {p.cost >= 0 && <span>成本: NT${p.cost.toLocaleString()}</span>}
                          </div>
                          {p.photos && p.photos.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {p.photos.slice(0, 4).map((img, i) => (
                                <div key={i} className="w-10 h-10 rounded border border-zinc-600 overflow-hidden">
                                  <img src={img} alt="" className="w-full h-full object-cover" />
                                </div>
                              ))}
                              {p.photos.length > 4 && <span className="text-xs text-zinc-500 self-center">+{p.photos.length - 4}</span>}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                            <span>使用: <span className="text-zinc-200 font-medium">{p.usage_count}</span> 次</span>
                            {p.lifetime_count > 0 && (
                              <span>剩餘壽命: <span className={`font-medium ${LIFE_COLOR(remaining, p.lifetime_count)}`}>{remaining} 次 ({Math.round((remaining / p.lifetime_count) * 100)}%)</span></span>
                            )}
                            <span>位置: {p.location_warehouse || '-'}{p.location_area ? `/${p.location_area}` : ''}{p.location_shelf ? `/${p.location_shelf}` : ''}</span>
                            <span className={`${p.location_status === '借出' ? 'text-red-400' : ''}`}>庫存: {p.location_status}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(p)} className="text-zinc-400 hover:text-zinc-100 h-8 px-2">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedPatternId(p.id); setMaintDialogOpen(true); }} className="text-zinc-400 hover:text-zinc-100 h-8 px-2">
                            <Wrench className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedPatternId(p.id); setLoanDialogOpen(true); }} className="text-zinc-400 hover:text-zinc-100 h-8 px-2">
                            <ArrowLeftRight className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(p)} className="text-red-400 hover:text-red-300 h-8 px-2">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Tab: 模具保養 */}
          <TabsContent value="maintenance" className="space-y-3 mt-4">
            <div className="flex justify-end">
              <Button onClick={() => { setSelectedPatternId(patterns[0]?.id || ''); setMaintDialogOpen(true); }} className="bg-amber-500 hover:bg-amber-600 text-zinc-900" disabled={patterns.length === 0}>
                <Plus className="w-4 h-4 mr-2" />新增保養紀錄
              </Button>
            </div>
            {maintenance.length === 0 ? (
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-8 text-center text-zinc-400">尚無保養紀錄</CardContent>
              </Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700 text-zinc-400">
                      <th className="text-left p-2">模具</th>
                      <th className="text-left p-2">日期</th>
                      <th className="text-left p-2">類型</th>
                      <th className="text-left p-2">內容</th>
                      <th className="text-right p-2">費用</th>
                      <th className="text-left p-2">下次保養</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenance.sort((a, b) => b.maintenance_date.localeCompare(a.maintenance_date)).map(m => {
                      const pat = patterns.find(p => p.id === m.pattern_id);
                      return (
                        <tr key={m.id} className="border-b border-zinc-700/50 text-zinc-200">
                          <td className="p-2 text-amber-400 font-mono text-xs">{pat?.pattern_no || '-'} {pat?.name || ''}</td>
                          <td className="p-2">{m.maintenance_date}</td>
                          <td className="p-2">{m.type}</td>
                          <td className="p-2 max-w-[200px] truncate">{m.content}</td>
                          <td className="p-2 text-right">{m.cost > 0 ? `NT$${m.cost.toLocaleString()}` : '-'}</td>
                          <td className="p-2">{m.next_maintenance_date || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Tab: 模具履歷 */}
          <TabsContent value="history" className="space-y-3 mt-4">
            {history.length === 0 ? (
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-8 text-center text-zinc-400">尚無生產履歷（批次造模完成後自動累積）</CardContent>
              </Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700 text-zinc-400">
                      <th className="text-left p-2">模具</th>
                      <th className="text-left p-2">日期</th>
                      <th className="text-left p-2">工單</th>
                      <th className="text-left p-2">產品</th>
                      <th className="text-right p-2">數量</th>
                      <th className="text-right p-2">造模數</th>
                      <th className="text-left p-2">操作員</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.sort((a, b) => b.date.localeCompare(a.date)).map(h => {
                      const pat = patterns.find(p => p.id === h.pattern_id);
                      return (
                        <tr key={h.id} className="border-b border-zinc-700/50 text-zinc-200">
                          <td className="p-2 text-amber-400 font-mono text-xs">{pat?.pattern_no || '-'}</td>
                          <td className="p-2">{h.date}</td>
                          <td className="p-2 font-mono text-xs">{h.order_no}</td>
                          <td className="p-2">{h.product_name}</td>
                          <td className="p-2 text-right">{h.quantity}</td>
                          <td className="p-2 text-right">{h.molding_count}</td>
                          <td className="p-2">{h.operator || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Tab: 模具庫存 */}
          <TabsContent value="inventory" className="space-y-3 mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-zinc-400">
                    <th className="text-left p-2">模具編號</th>
                    <th className="text-left p-2">名稱</th>
                    <th className="text-left p-2">倉庫</th>
                    <th className="text-left p-2">區域</th>
                    <th className="text-left p-2">貨架</th>
                    <th className="text-left p-2">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatterns.map(p => (
                    <tr key={p.id} className="border-b border-zinc-700/50 text-zinc-200">
                      <td className="p-2 text-amber-400 font-mono text-xs">{p.pattern_no}</td>
                      <td className="p-2">{p.name}</td>
                      <td className="p-2">{p.location_warehouse || '-'}</td>
                      <td className="p-2">{p.location_area || '-'}</td>
                      <td className="p-2">{p.location_shelf || '-'}</td>
                      <td className="p-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.location_status === '借出' ? 'bg-red-500/20 text-red-400' : p.location_status === '使用中' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                          {p.location_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Loan Records */}
            <Card className="bg-zinc-800 border-zinc-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-zinc-100 text-sm flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-amber-400" />借出紀錄
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {loans.length === 0 ? (
                  <p className="text-zinc-500 text-sm text-center">尚無借出紀錄</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-700 text-zinc-400">
                          <th className="text-left p-2">模具</th>
                          <th className="text-left p-2">借出人</th>
                          <th className="text-left p-2">借出日期</th>
                          <th className="text-left p-2">歸還日期</th>
                          <th className="text-left p-2">用途</th>
                          <th className="text-left p-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loans.sort((a, b) => b.borrow_date.localeCompare(a.borrow_date)).map(l => {
                          const pat = patterns.find(p => p.id === l.pattern_id);
                          return (
                            <tr key={l.id} className={`border-b border-zinc-700/50 ${!l.return_date ? 'text-red-300' : 'text-zinc-200'}`}>
                              <td className="p-2 text-amber-400 font-mono text-xs">{pat?.pattern_no || '-'}</td>
                              <td className="p-2">{l.borrower}</td>
                              <td className="p-2">{l.borrow_date}</td>
                              <td className="p-2">{l.return_date || <span className="text-red-400 font-medium">未歸還</span>}</td>
                              <td className="p-2">{l.purpose || '-'}</td>
                              <td className="p-2">
                                {!l.return_date && (
                                  <Button size="sm" variant="outline" onClick={() => handleReturn(l.id)} className="h-6 text-xs border-green-600 text-green-400 hover:bg-green-500/10">
                                    歸還
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: 模具分析 */}
          <TabsContent value="analysis" className="space-y-4 mt-4">
            <Card className="bg-zinc-800 border-zinc-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-zinc-100 text-sm">模具成本分析（單次成本 = 採購成本 ÷ 累積使用次數）</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700 text-zinc-400">
                        <th className="text-left p-2">模具</th>
                        <th className="text-right p-2">採購成本</th>
                        <th className="text-right p-2">使用次數</th>
                        <th className="text-right p-2">單次成本</th>
                        <th className="text-left p-2">壽命狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patterns.filter(p => p.cost >= 0).sort((a, b) => {
                        const costA = a.usage_count > 0 ? a.cost / a.usage_count : a.cost;
                        const costB = b.usage_count > 0 ? b.cost / b.usage_count : b.cost;
                        return costB - costA;
                      }).map(p => {
                        const unitCost = p.usage_count > 0 ? p.cost / p.usage_count : p.cost;
                        const remaining = p.lifetime_count - p.usage_count;
                        const lifePct = p.lifetime_count > 0 ? Math.round((remaining / p.lifetime_count) * 100) : -1;
                        return (
                          <tr key={p.id} className="border-b border-zinc-700/50 text-zinc-200">
                            <td className="p-2">
                              <span className="text-amber-400 font-mono text-xs">{p.pattern_no}</span>
                              <span className="ml-2">{p.name}</span>
                            </td>
                            <td className="p-2 text-right">NT${p.cost.toLocaleString()}</td>
                            <td className="p-2 text-right">{p.usage_count}</td>
                            <td className="p-2 text-right font-medium">NT${Math.round(unitCost).toLocaleString()}</td>
                            <td className="p-2">
                              {lifePct >= 0 ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-zinc-700 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${lifePct > 50 ? 'bg-green-500' : lifePct >= 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                                      style={{ width: `${Math.max(lifePct, 2)}%` }}
                                    />
                                  </div>
                                  <span className={`text-xs ${LIFE_COLOR(remaining, p.lifetime_count)}`}>{lifePct}%</span>
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-500">未設定</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {patterns.length === 0 && (
                    <p className="text-zinc-500 text-sm text-center py-4">尚無模具資料</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create/Edit Pattern Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">{editPattern ? '編輯模具' : '新增模具'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">客戶名稱 *</Label>
                  <Select value={form.customer} onValueChange={v => setForm({ ...form, customer: v })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇客戶" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.name} className="text-zinc-100">
                          {c.customer_no} - {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">模具名稱 *</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" placeholder="模具名稱" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">產品料號</Label>
                  <Input value={form.product_no} onChange={e => setForm({ ...form, product_no: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" placeholder="產品料號" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">模具類型 *</Label>
                  <Select value={form.pattern_type} onValueChange={v => setForm({ ...form, pattern_type: v as PatternType })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {PATTERN_TYPES.map(t => <SelectItem key={t} value={t} className="text-zinc-100">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">材質</Label>
                  <Input value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">模穴數(件/模)</Label>
                  <Input type="number" value={form.cavities || ''} onChange={e => setForm({ ...form, cavities: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">模板數</Label>
                  <Input type="number" value={form.template_count || ''} onChange={e => setForm({ ...form, template_count: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">砂心數</Label>
                  <Input type="number" min={0} value={form.sand_core_count} onChange={e => setForm({ ...form, sand_core_count: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">重量(kg)</Label>
                  <Input type="number" value={form.weight || ''} onChange={e => setForm({ ...form, weight: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">尺寸</Label>
                  <Input value={form.dimensions} onChange={e => setForm({ ...form, dimensions: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" placeholder="長x寬x高" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">開模日期</Label>
                  <Input type="date" value={form.open_date} onChange={e => setForm({ ...form, open_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">供應商</Label>
                  <Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">採購成本 (NT)</Label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">NT$</span>
                    <Input type="number" min={0} value={form.cost} onChange={e => setForm({ ...form, cost: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 pl-10" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">壽命次數</Label>
                  <Input type="number" value={form.lifetime_count || ''} onChange={e => setForm({ ...form, lifetime_count: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">狀態 *</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as PatternStatus })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {PATTERN_STATUSES.map(s => <SelectItem key={s} value={s} className="text-zinc-100">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">倉庫</Label>
                  <Input value={form.location_warehouse} onChange={e => setForm({ ...form, location_warehouse: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" placeholder="A倉" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">區域</Label>
                  <Input value={form.location_area} onChange={e => setForm({ ...form, location_area: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" placeholder="3區" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">貨架</Label>
                  <Input value={form.location_shelf} onChange={e => setForm({ ...form, location_shelf: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" placeholder="A-02" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-zinc-300 text-xs">庫存狀態</Label>
                <Select value={form.location_status} onValueChange={v => setForm({ ...form, location_status: v as PatternLocationStatus })}>
                  <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-700 border-zinc-600">
                    {LOCATION_STATUSES.map(s => <SelectItem key={s} value={s} className="text-zinc-100">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <MoldImageUpload images={form.photos} onChange={(imgs) => setForm({ ...form, photos: imgs })} />
              <div className="space-y-1">
                <Label className="text-zinc-300 text-xs">備註</Label>
                <Textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" rows={2} />
              </div>
              <Button onClick={handleSave} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">
                {editPattern ? '更新' : '建立'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Maintenance Dialog */}
        <Dialog open={maintDialogOpen} onOpenChange={setMaintDialogOpen}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">新增保養紀錄</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-zinc-300 text-xs">選擇模具</Label>
                <Select value={selectedPatternId} onValueChange={setSelectedPatternId}>
                  <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100"><SelectValue placeholder="選擇模具" /></SelectTrigger>
                  <SelectContent className="bg-zinc-700 border-zinc-600">
                    {patterns.map(p => <SelectItem key={p.id} value={p.id} className="text-zinc-100">{p.pattern_no} - {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">保養日期</Label>
                  <Input type="date" value={maintForm.maintenance_date} onChange={e => setMaintForm({ ...maintForm, maintenance_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">類型</Label>
                  <Select value={maintForm.type} onValueChange={v => setMaintForm({ ...maintForm, type: v as MaintenanceType })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {MAINTENANCE_TYPES.map(t => <SelectItem key={t} value={t} className="text-zinc-100">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-zinc-300 text-xs">保養內容 *</Label>
                <Textarea value={maintForm.content} onChange={e => setMaintForm({ ...maintForm, content: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">費用</Label>
                  <Input type="number" value={maintForm.cost || ''} onChange={e => setMaintForm({ ...maintForm, cost: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">下次保養日期</Label>
                  <Input type="date" value={maintForm.next_maintenance_date} onChange={e => setMaintForm({ ...maintForm, next_maintenance_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
              </div>
              <Button onClick={handleMaintSave} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">建立</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Loan Dialog */}
        <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">模具借出</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-zinc-300 text-xs">選擇模具</Label>
                <Select value={selectedPatternId} onValueChange={setSelectedPatternId}>
                  <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100"><SelectValue placeholder="選擇模具" /></SelectTrigger>
                  <SelectContent className="bg-zinc-700 border-zinc-600">
                    {patterns.map(p => <SelectItem key={p.id} value={p.id} className="text-zinc-100">{p.pattern_no} - {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">借出人 *</Label>
                  <Input value={loanForm.borrower} onChange={e => setLoanForm({ ...loanForm, borrower: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">借出日期</Label>
                  <Input type="date" value={loanForm.borrow_date} onChange={e => setLoanForm({ ...loanForm, borrow_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-zinc-300 text-xs">用途</Label>
                <Input value={loanForm.purpose} onChange={e => setLoanForm({ ...loanForm, purpose: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" placeholder="借出用途" />
              </div>
              <Button onClick={handleLoanSave} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">確認借出</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}