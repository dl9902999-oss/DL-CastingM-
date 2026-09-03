import { useState, useMemo, useEffect } from 'react';
import { useSyncTrigger } from '@/hooks/useSyncedData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Plus, Search, ClipboardCheck, AlertTriangle, TrendingUp, FileText,
  CheckCircle2, XCircle, AlertCircle, Eye, Trash2, BarChart3, Check, ChevronsUpDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import AppLayout from '@/components/layout/AppLayout';
import {
  dsGetQualityInspections, dsCreateQualityInspection, dsDeleteQualityInspection,
  dsGetDefectRecords, dsCreateDefectRecord,
  dsGetCAPARecords, dsCreateCAPARecord, dsUpdateCAPARecord,
  dsGetMoldingBatches, dsGetWorkOrders, dsGetMeltingRecords,
} from '@/lib/dataService';

// Alias ds* to legacy names used in this file
const getQualityInspections = dsGetQualityInspections as unknown as (...args: Parameters<typeof dsGetQualityInspections>) => Awaited<ReturnType<typeof dsGetQualityInspections>>;
const createQualityInspection = dsCreateQualityInspection as unknown as (...args: Parameters<typeof dsCreateQualityInspection>) => Awaited<ReturnType<typeof dsCreateQualityInspection>>;
const deleteQualityInspection = dsDeleteQualityInspection as unknown as (...args: Parameters<typeof dsDeleteQualityInspection>) => Awaited<ReturnType<typeof dsDeleteQualityInspection>>;
const getDefectRecords = dsGetDefectRecords as unknown as (...args: Parameters<typeof dsGetDefectRecords>) => Awaited<ReturnType<typeof dsGetDefectRecords>>;
const createDefectRecord = dsCreateDefectRecord as unknown as (...args: Parameters<typeof dsCreateDefectRecord>) => Awaited<ReturnType<typeof dsCreateDefectRecord>>;
const getCAPARecords = dsGetCAPARecords as unknown as (...args: Parameters<typeof dsGetCAPARecords>) => Awaited<ReturnType<typeof dsGetCAPARecords>>;
const createCAPARecord = dsCreateCAPARecord as unknown as (...args: Parameters<typeof dsCreateCAPARecord>) => Awaited<ReturnType<typeof dsCreateCAPARecord>>;
const updateCAPARecord = dsUpdateCAPARecord as unknown as (...args: Parameters<typeof dsUpdateCAPARecord>) => Awaited<ReturnType<typeof dsUpdateCAPARecord>>;
const getMoldingBatches = dsGetMoldingBatches as unknown as (...args: Parameters<typeof dsGetMoldingBatches>) => Awaited<ReturnType<typeof dsGetMoldingBatches>>;
const getWorkOrders = dsGetWorkOrders as unknown as (...args: Parameters<typeof dsGetWorkOrders>) => Awaited<ReturnType<typeof dsGetWorkOrders>>;
const getMeltingRecords = dsGetMeltingRecords as unknown as (...args: Parameters<typeof dsGetMeltingRecords>) => Awaited<ReturnType<typeof dsGetMeltingRecords>>;
import {
  type QualityInspection, type InspectionType, type InspectionResult,
  type DefectRecord, type CAPARecord, type CAPAStatus, type DefectDisposition,
  type InspectionItemResult,
  DEFECT_CODES, INSPECTION_ITEMS_FAI, INSPECTION_ITEMS_IPQC,
  INSPECTION_ITEMS_FQC, INSPECTION_ITEMS_OQC
} from '@/lib/types';

// Helper functions
function getInspectionItems(type: InspectionType): readonly string[] {
  switch (type) {
    case 'FAI': return INSPECTION_ITEMS_FAI;
    case 'IPQC': return INSPECTION_ITEMS_IPQC;
    case 'FQC': return INSPECTION_ITEMS_FQC;
    case 'OQC': return INSPECTION_ITEMS_OQC;
  }
}

function getTypeLabel(type: InspectionType): string {
  switch (type) {
    case 'FAI': return '首件檢驗';
    case 'IPQC': return '製程檢驗';
    case 'FQC': return '最終檢驗';
    case 'OQC': return '出貨檢驗';
  }
}

function getResultBadge(result: InspectionResult) {
  switch (result) {
    case 'PASS': return <Badge className="bg-green-600 text-white">合格</Badge>;
    case 'FAIL': return <Badge className="bg-red-600 text-white">不合格</Badge>;
    case 'CONDITIONAL': return <Badge className="bg-yellow-600 text-white">條件放行</Badge>;
  }
}

function getCAPAStatusBadge(status: CAPAStatus) {
  const map: Record<CAPAStatus, { label: string; className: string }> = {
    'OPEN': { label: '開立', className: 'bg-red-600 text-white' },
    'ANALYZING': { label: '分析中', className: 'bg-orange-600 text-white' },
    'IMPLEMENTING': { label: '實施中', className: 'bg-blue-600 text-white' },
    'VERIFYING': { label: '驗證中', className: 'bg-purple-600 text-white' },
    'CLOSED': { label: '已結案', className: 'bg-green-600 text-white' },
  };
  const info = map[status];
  return <Badge className={info.className}>{info.label}</Badge>;
}

// 可檢索的造模批次下拉選單（支援批次號、客戶、品名檢索）
function BatchCombobox({ batches, value, onSelect, placeholder, emptyText }: {
  batches: any[];
  value: string;
  onSelect: (batchId: string) => void;
  placeholder: string;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = batches.find(b => b.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 hover:text-slate-100 font-normal"
        >
          <span className="truncate">
            {selected
              ? `${selected.batch_no}｜${selected.customer || '-'}｜${selected.product_name || '-'}`
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0 bg-slate-800 border-slate-700" align="start">
        <Command className="bg-slate-800">
          <CommandInput placeholder="搜尋批次號 / 客戶 / 品名..." className="text-slate-200" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-sm text-slate-400">{emptyText}</CommandEmpty>
            <CommandGroup>
              {batches.map(b => (
                <CommandItem
                  key={b.id}
                  value={`${b.batch_no || ''} ${b.customer || ''} ${b.product_name || ''} ${b.order_no || ''}`}
                  onSelect={() => { onSelect(b.id); setOpen(false); }}
                  className="text-slate-200 aria-selected:bg-slate-700"
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === b.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-mono truncate">{b.batch_no}</span>
                    <span className="text-xs text-slate-400 truncate">
                      {b.customer || '-'}｜{b.product_name || '-'}｜{b.quantity_completed || b.quantity_planned || b.quantity || 0}件
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// 檢驗項目判定：OK 合格、NG 不合格、X 不適用／未檢驗
type ItemVerdict = 'OK' | 'NG' | 'X';

function getVerdictTriggerClass(v: ItemVerdict): string {
  switch (v) {
    case 'OK': return 'bg-green-900/30 border-green-700 text-green-300';
    case 'NG': return 'bg-red-900/30 border-red-700 text-red-300';
    default: return 'bg-slate-700 border-slate-600 text-slate-300';
  }
}

function getVerdictBadgeClass(v: ItemVerdict): string {
  switch (v) {
    case 'OK': return 'bg-green-600 text-white';
    case 'NG': return 'bg-red-600 text-white';
    default: return 'bg-slate-600 text-slate-100';
  }
}

function getDispositionLabel(d: DefectDisposition): string {
  switch (d) {
    case 'REWORK': return '返工';
    case 'SCRAP': return '報廢';
    case 'CONCESSION': return '特採';
    case 'RETURN': return '退回';
  }
}

export default function Quality() {
  const [activeTab, setActiveTab] = useState('inspections');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<string>('ALL');

  // Inspection dialog state
  const [showInspectionDialog, setShowInspectionDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<QualityInspection | null>(null);

  // Defect dialog state
  const [showDefectDialog, setShowDefectDialog] = useState(false);

  // CAPA dialog state
  const [showCAPADialog, setShowCAPADialog] = useState(false);
  const [showCAPADetailDialog, setShowCAPADetailDialog] = useState(false);
  const [selectedCAPA, setSelectedCAPA] = useState<CAPARecord | null>(null);

  // Form state for new inspection
  const [inspForm, setInspForm] = useState({
    type: 'FAI' as InspectionType,
    batch_id: '',
    batch_no: '',
    work_order_id: '',
    order_no: '',
    customer: '',
    product_name: '',
    material: '',
    heat_no: '',
    inspector: '',
    inspected_quantity: 0,
    pass_quantity: 0,
    sampling_method: '全檢',
    remarks: '',
  });
  const [itemResults, setItemResults] = useState<InspectionItemResult[]>([]);

  // Form state for defect
  const [defectForm, setDefectForm] = useState({
    batch_id: '',
    batch_no: '',
    defect_code: '',
    defect_label: '',
    quantity: 1,
    cause: '',
    responsible_station: '',
    disposition: 'REWORK' as DefectDisposition,
    remarks: '',
  });

  // Form state for CAPA
  const [capaForm, setCapaForm] = useState({
    inspection_id: '',
    defect_id: '',
    problem_description: '',
    five_why: '',
    root_cause: '',
    corrective_action: '',
    preventive_action: '',
    responsible_person: '',
    due_date: '',
  });

  // Data refresh - also triggered by real-time sync from other devices
  const syncTrigger = useSyncTrigger();
  const [inspections, setInspections] = useState<any[]>([]);
  const [defectRecords, setDefectRecords] = useState<any[]>([]);
  const [capaRecords, setCapaRecords] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [meltingRecords, setMeltingRecords] = useState<any[]>([]);

  const loadAllData = async () => {
    const [insp, def, capa, bat, wo, melt] = await Promise.all([
      getQualityInspections(),
      getDefectRecords(),
      getCAPARecords(),
      getMoldingBatches(),
      getWorkOrders(),
      getMeltingRecords(),
    ]);
    setInspections(insp);
    setDefectRecords(def);
    setCapaRecords(capa);
    setBatches(bat);
    setWorkOrders(wo);
    setMeltingRecords(melt);
  };

  const refresh = () => { loadAllData(); };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadAllData();
    })();
    return () => { cancelled = true; };
  }, [syncTrigger]);

  // Filtered inspections
  const filteredInspections = useMemo(() => {
    return inspections.filter(i => {
      if (typeFilter !== 'ALL' && i.type !== typeFilter) return false;
      if (resultFilter !== 'ALL' && i.result !== resultFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          i.inspection_no.toLowerCase().includes(term) ||
          i.batch_no.toLowerCase().includes(term) ||
          i.heat_no.toLowerCase().includes(term) ||
          (i.customer || '').toLowerCase().includes(term) ||
          (i.product_name || '').toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [inspections, typeFilter, resultFilter, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const total = inspections.length;
    const passed = inspections.filter(i => i.result === 'PASS').length;
    const failed = inspections.filter(i => i.result === 'FAIL').length;
    const conditional = inspections.filter(i => i.result === 'CONDITIONAL').length;
    const avgYield = total > 0 ? inspections.reduce((sum, i) => sum + (i.yield_rate || 0), 0) / total : 0;
    const totalDefects = defectRecords.reduce((sum, d) => sum + d.quantity, 0);
    const openCAPAs = capaRecords.filter(c => c.status !== 'CLOSED').length;
    return { total, passed, failed, conditional, avgYield, totalDefects, openCAPAs };
  }, [inspections, defectRecords, capaRecords]);

  // Open new inspection dialog
  const openNewInspection = (type: InspectionType = 'FAI') => {
    setInspForm({
      type,
      batch_id: '',
      batch_no: '',
      work_order_id: '',
      order_no: '',
      customer: '',
      product_name: '',
      material: '',
      heat_no: '',
      inspector: '',
      inspected_quantity: 0,
      pass_quantity: 0,
      sampling_method: type === 'OQC' ? '抽檢 AQL 2.5' : '全檢',
      remarks: '',
    });
    const items = getInspectionItems(type);
    setItemResults(items.map(item => ({ item, result: 'OK' as const })));
    setShowInspectionDialog(true);
  };

  // 首件檢驗只可選擇「已完成」狀態之造模批次；其他檢驗類型維持全部批次
  const selectableBatches = useMemo(() => {
    const sorted = [...batches].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    if (inspForm.type === 'FAI') return sorted.filter(b => b.status === 'Completed');
    return sorted;
  }, [batches, inspForm.type]);

  // Select batch for inspection
  const selectBatch = (batchId: string) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const wo = workOrders.find(w => w.id === batch.work_order_id);
    const melting = meltingRecords.find(m => m.batch_id === batchId);
    setInspForm(prev => ({
      ...prev,
      batch_id: batch.id,
      batch_no: batch.batch_no,
      work_order_id: wo?.id || '',
      order_no: wo?.order_no || '',
      customer: wo?.customer || '',
      product_name: wo?.product_name || '',
      material: wo?.material || '',
      heat_no: melting?.heat_no || '',
      inspected_quantity: batch.quantity_completed || batch.quantity_planned || batch.quantity || 0,
      pass_quantity: batch.quantity_completed || batch.quantity_planned || batch.quantity || 0,
    }));
  };

  // 檢驗項目：更新單列欄位
  const updateInspectionItem = (idx: number, patch: Partial<InspectionItemResult>) => {
    setItemResults(prev => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  // 檢驗項目：新增一列（可自行輸入項目名稱）
  const addInspectionItem = () => {
    setItemResults(prev => [...prev, { item: '', result: 'OK' as ItemVerdict, measured_value: '', standard_value: '', remarks: '' }]);
  };

  // 檢驗項目：刪除一列
  const removeInspectionItem = (idx: number) => {
    setItemResults(prev => prev.filter((_, i) => i !== idx));
  };

  // Submit inspection
  const submitInspection = async () => {
    // 濾除未填項目名稱的空白列；量測值／標準值／備註皆可不填
    const validItems = itemResults.filter(r => (r.item || '').trim() !== '');
    const ngCount = validItems.filter(r => r.result === 'NG').length;
    const defectCount = inspForm.inspected_quantity - inspForm.pass_quantity;
    const yieldRate = inspForm.inspected_quantity > 0
      ? (inspForm.pass_quantity / inspForm.inspected_quantity) * 100
      : 0;
    let result: InspectionResult = 'PASS';
    if (ngCount > 0 || defectCount > 0) {
      result = defectCount > inspForm.inspected_quantity * 0.1 ? 'FAIL' : 'CONDITIONAL';
    }

    try {
      await createQualityInspection({
        type: inspForm.type,
        batch_id: inspForm.batch_id,
        batch_no: inspForm.batch_no,
        work_order_id: inspForm.work_order_id,
        order_no: inspForm.order_no,
        customer: inspForm.customer,
        product_name: inspForm.product_name,
        material: inspForm.material,
        heat_no: inspForm.heat_no,
        inspection_date: new Date().toISOString(),
        inspector: inspForm.inspector,
        result,
        inspected_quantity: inspForm.inspected_quantity,
        pass_quantity: inspForm.pass_quantity,
        defect_count: defectCount,
        yield_rate: Math.round(yieldRate * 100) / 100,
        sampling_method: inspForm.sampling_method,
        item_results: validItems,
        defects: [],
        remarks: inspForm.remarks,
      });
      setShowInspectionDialog(false);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Quality] submitInspection failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，檢驗紀錄儲存失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '檢驗紀錄儲存失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  // Submit defect
  const submitDefect = async () => {
    try {
      await createDefectRecord({
        batch_id: defectForm.batch_id,
        batch_no: defectForm.batch_no,
        defect_code: defectForm.defect_code,
        defect_label: defectForm.defect_label,
        quantity: defectForm.quantity,
        cause: defectForm.cause,
        responsible_station: defectForm.responsible_station,
        disposition: defectForm.disposition,
        remarks: defectForm.remarks,
      });
      setShowDefectDialog(false);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Quality] submitDefect failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，缺陷紀錄儲存失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '缺陷紀錄儲存失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  // Submit CAPA
  const submitCAPA = async () => {
    try {
      await createCAPARecord({
        inspection_id: capaForm.inspection_id,
        defect_id: capaForm.defect_id,
        status: 'OPEN',
        problem_description: capaForm.problem_description,
        five_why: capaForm.five_why,
        root_cause: capaForm.root_cause,
        corrective_action: capaForm.corrective_action,
        preventive_action: capaForm.preventive_action,
        responsible_person: capaForm.responsible_person,
        due_date: capaForm.due_date,
      });
      setShowCAPADialog(false);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Quality] submitCAPA failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，CAPA 儲存失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: 'CAPA 儲存失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  // Update CAPA status
  const advanceCAPAStatus = async (capa: CAPARecord) => {
    const statusFlow: CAPAStatus[] = ['OPEN', 'ANALYZING', 'IMPLEMENTING', 'VERIFYING', 'CLOSED'];
    const currentIdx = statusFlow.indexOf(capa.status);
    if (currentIdx < statusFlow.length - 1) {
      try {
        await updateCAPARecord(capa.id, { status: statusFlow[currentIdx + 1] });
        refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Quality] advanceCAPAStatus failed:', err);
        if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
          toast({ title: '權限不足，CAPA 狀態更新失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
        } else {
          toast({ title: 'CAPA 狀態更新失敗，請稍後再試', variant: 'destructive' });
        }
      }
    }
  };

  return (
    <AppLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">品質檢驗管理</h1>
          <p className="text-slate-400 text-sm mt-1">製程品質追蹤、缺陷管理、矯正預防措施</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-slate-400">總檢驗數</p>
            <p className="text-xl font-bold text-slate-100">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-slate-400">合格</p>
            <p className="text-xl font-bold text-green-400">{stats.passed}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-slate-400">不合格</p>
            <p className="text-xl font-bold text-red-400">{stats.failed}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-slate-400">條件放行</p>
            <p className="text-xl font-bold text-yellow-400">{stats.conditional}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-slate-400">平均良率</p>
            <p className="text-xl font-bold text-blue-400">{stats.avgYield.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-slate-400">缺陷總數</p>
            <p className="text-xl font-bold text-orange-400">{stats.totalDefects}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-slate-400">未結CAPA</p>
            <p className="text-xl font-bold text-purple-400">{stats.openCAPAs}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="inspections" className="data-[state=active]:bg-slate-700">
            <ClipboardCheck className="w-4 h-4 mr-1" />檢驗紀錄
          </TabsTrigger>
          <TabsTrigger value="defects" className="data-[state=active]:bg-slate-700">
            <AlertTriangle className="w-4 h-4 mr-1" />缺陷管理
          </TabsTrigger>
          <TabsTrigger value="capa" className="data-[state=active]:bg-slate-700">
            <FileText className="w-4 h-4 mr-1" />CAPA
          </TabsTrigger>
          <TabsTrigger value="analysis" className="data-[state=active]:bg-slate-700">
            <BarChart3 className="w-4 h-4 mr-1" />品質分析
          </TabsTrigger>
        </TabsList>

        {/* Inspections Tab */}
        <TabsContent value="inspections" className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="搜尋檢驗單號/批次/客戶..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 w-60 bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue placeholder="檢驗類型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部類型</SelectItem>
                  <SelectItem value="FAI">首件檢驗</SelectItem>
                  <SelectItem value="FQC">最終檢驗</SelectItem>
                  <SelectItem value="OQC">出貨檢驗</SelectItem>
                </SelectContent>
              </Select>
              <Select value={resultFilter} onValueChange={setResultFilter}>
                <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue placeholder="檢驗結果" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部結果</SelectItem>
                  <SelectItem value="PASS">合格</SelectItem>
                  <SelectItem value="FAIL">不合格</SelectItem>
                  <SelectItem value="CONDITIONAL">條件放行</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => openNewInspection('FAI')} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-1" />首件檢驗
              </Button>
              <Button size="sm" onClick={() => openNewInspection('FQC')} className="bg-orange-600 hover:bg-orange-700">
                <Plus className="w-4 h-4 mr-1" />最終檢驗
              </Button>
              <Button size="sm" onClick={() => openNewInspection('OQC')} className="bg-purple-600 hover:bg-purple-700">
                <Plus className="w-4 h-4 mr-1" />出貨檢驗
              </Button>
            </div>
          </div>

          {/* Inspection List */}
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 hover:bg-slate-750">
                      <TableHead className="text-slate-300">檢驗單號</TableHead>
                      <TableHead className="text-slate-300">類型</TableHead>
                      <TableHead className="text-slate-300">批次號</TableHead>
                      <TableHead className="text-slate-300">客戶</TableHead>
                      <TableHead className="text-slate-300">品名</TableHead>
                      <TableHead className="text-slate-300">檢驗數</TableHead>
                      <TableHead className="text-slate-300">良率</TableHead>
                      <TableHead className="text-slate-300">結果</TableHead>
                      <TableHead className="text-slate-300">檢驗員</TableHead>
                      <TableHead className="text-slate-300">日期</TableHead>
                      <TableHead className="text-slate-300">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInspections.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-slate-400 py-8">
                          尚無檢驗紀錄
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInspections.map(insp => (
                        <TableRow key={insp.id} className="border-slate-700 hover:bg-slate-750">
                          <TableCell className="text-slate-200 font-mono text-sm">{insp.inspection_no}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{getTypeLabel(insp.type)}</Badge>
                          </TableCell>
                          <TableCell className="text-slate-300">{insp.batch_no}</TableCell>
                          <TableCell className="text-slate-300">{insp.customer || '-'}</TableCell>
                          <TableCell className="text-slate-300">{insp.product_name || '-'}</TableCell>
                          <TableCell className="text-slate-300">{insp.inspected_quantity}</TableCell>
                          <TableCell className="text-slate-300">{insp.yield_rate?.toFixed(1)}%</TableCell>
                          <TableCell>{getResultBadge(insp.result)}</TableCell>
                          <TableCell className="text-slate-300">{insp.inspector}</TableCell>
                          <TableCell className="text-slate-400 text-sm">
                            {new Date(insp.created_at).toLocaleDateString('zh-TW')}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setSelectedInspection(insp); setShowDetailDialog(true); }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-400 hover:text-red-300"
                                onClick={async () => { try { await deleteQualityInspection(insp.id); refresh(); } catch (e) { const m = e instanceof Error ? e.message : ''; console.error('[Quality] delete failed:', e); toast({ title: m.includes('policy') || m.includes('permission') ? '權限不足，刪除失敗' : '刪除失敗，請稍後再試', variant: 'destructive' }); } }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Defects Tab */}
        <TabsContent value="defects" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-200">缺陷紀錄</h3>
            <Button size="sm" onClick={() => {
              setDefectForm({ batch_id: '', batch_no: '', defect_code: '', defect_label: '', quantity: 1, cause: '', responsible_station: '', disposition: 'REWORK', remarks: '' });
              setShowDefectDialog(true);
            }} className="bg-red-600 hover:bg-red-700">
              <Plus className="w-4 h-4 mr-1" />新增缺陷
            </Button>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-300">批次號</TableHead>
                      <TableHead className="text-slate-300">缺陷代碼</TableHead>
                      <TableHead className="text-slate-300">缺陷描述</TableHead>
                      <TableHead className="text-slate-300">數量</TableHead>
                      <TableHead className="text-slate-300">原因</TableHead>
                      <TableHead className="text-slate-300">責任工站</TableHead>
                      <TableHead className="text-slate-300">處置</TableHead>
                      <TableHead className="text-slate-300">日期</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {defectRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                          尚無缺陷紀錄
                        </TableCell>
                      </TableRow>
                    ) : (
                      defectRecords.map(d => (
                        <TableRow key={d.id} className="border-slate-700 hover:bg-slate-750">
                          <TableCell className="text-slate-200">{d.batch_no || '-'}</TableCell>
                          <TableCell className="text-slate-300 font-mono">{d.defect_code}</TableCell>
                          <TableCell className="text-slate-300">{d.defect_label}</TableCell>
                          <TableCell className="text-red-400 font-bold">{d.quantity}</TableCell>
                          <TableCell className="text-slate-300">{d.cause || '-'}</TableCell>
                          <TableCell className="text-slate-300">{d.responsible_station || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {getDispositionLabel(d.disposition)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-400 text-sm">
                            {new Date(d.created_at).toLocaleDateString('zh-TW')}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Defect Summary by Code */}
          {defectRecords.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-300">缺陷柏拉圖分析</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(() => {
                    const grouped = defectRecords.reduce((acc, d) => {
                      acc[d.defect_code] = (acc[d.defect_code] || 0) + d.quantity;
                      return acc;
                    }, {} as Record<string, number>);
                    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
                    const total = sorted.reduce((sum, [, v]) => sum + v, 0);
                    let cumulative = 0;
                    return sorted.map(([code, qty]) => {
                      cumulative += qty;
                      const pct = (qty / total) * 100;
                      const cumPct = (cumulative / total) * 100;
                      const label = DEFECT_CODES.find(dc => dc.code === code)?.label || code;
                      return (
                        <div key={code} className="flex items-center gap-3">
                          <span className="text-slate-300 w-20 text-sm">{label}</span>
                          <div className="flex-1 bg-slate-700 rounded-full h-4 relative">
                            <div
                              className="bg-red-500 h-4 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-slate-400 text-sm w-16 text-right">{qty} ({pct.toFixed(0)}%)</span>
                          <span className="text-slate-500 text-xs w-12 text-right">{cumPct.toFixed(0)}%</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* CAPA Tab */}
        <TabsContent value="capa" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-200">矯正預防措施 (CAPA)</h3>
            <Button size="sm" onClick={() => {
              setCapaForm({ inspection_id: '', defect_id: '', problem_description: '', five_why: '', root_cause: '', corrective_action: '', preventive_action: '', responsible_person: '', due_date: '' });
              setShowCAPADialog(true);
            }} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 mr-1" />新增CAPA
            </Button>
          </div>

          <div className="grid gap-4">
            {capaRecords.length === 0 ? (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="py-8 text-center text-slate-400">
                  尚無CAPA紀錄
                </CardContent>
              </Card>
            ) : (
              capaRecords.map(capa => (
                <Card key={capa.id} className="bg-slate-800 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-slate-200">{capa.capa_no}</span>
                          {getCAPAStatusBadge(capa.status)}
                        </div>
                        <p className="text-slate-300 text-sm">{capa.problem_description}</p>
                        <div className="flex gap-4 text-xs text-slate-400">
                          <span>負責人: {capa.responsible_person}</span>
                          <span>到期: {capa.due_date || '-'}</span>
                          <span>建立: {new Date(capa.created_at).toLocaleDateString('zh-TW')}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setSelectedCAPA(capa); setShowCAPADetailDialog(true); }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {capa.status !== 'CLOSED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-400 hover:text-green-300"
                            onClick={() => advanceCAPAStatus(capa)}
                          >
                            <TrendingUp className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Yield by Type */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-300">各類型檢驗良率</CardTitle>
              </CardHeader>
              <CardContent>
                {(['FAI', 'FQC', 'OQC'] as InspectionType[]).map(type => {
                  const typeInsp = inspections.filter(i => i.type === type);
                  const avg = typeInsp.length > 0
                    ? typeInsp.reduce((sum, i) => sum + (i.yield_rate || 0), 0) / typeInsp.length
                    : 0;
                  return (
                    <div key={type} className="flex items-center gap-3 mb-3">
                      <span className="text-slate-300 w-20 text-sm">{getTypeLabel(type)}</span>
                      <div className="flex-1 bg-slate-700 rounded-full h-5 relative">
                        <div
                          className={`h-5 rounded-full ${avg >= 95 ? 'bg-green-500' : avg >= 80 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${avg}%` }}
                        />
                      </div>
                      <span className="text-slate-200 text-sm w-16 text-right font-bold">{avg.toFixed(1)}%</span>
                      <span className="text-slate-500 text-xs w-10">({typeInsp.length}件)</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Recent Trend */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-300">近期檢驗趨勢</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const recent = [...inspections]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, 10);
                  if (recent.length === 0) {
                    return <p className="text-slate-400 text-sm">尚無數據</p>;
                  }
                  return (
                    <div className="space-y-2">
                      {recent.map(insp => (
                        <div key={insp.id} className="flex items-center gap-2 text-sm">
                          {insp.result === 'PASS' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                          ) : insp.result === 'FAIL' ? (
                            <XCircle className="w-4 h-4 text-red-400" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-yellow-400" />
                          )}
                          <span className="text-slate-300 flex-1 truncate">{insp.batch_no}</span>
                          <span className="text-slate-400">{insp.yield_rate?.toFixed(0)}%</span>
                          <Badge variant="outline" className="text-xs">{getTypeLabel(insp.type)}</Badge>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Disposition Summary */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-300">缺陷處置分佈</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const dispositions: DefectDisposition[] = ['REWORK', 'SCRAP', 'CONCESSION', 'RETURN'];
                  const total = defectRecords.reduce((sum, d) => sum + d.quantity, 0);
                  if (total === 0) return <p className="text-slate-400 text-sm">尚無數據</p>;
                  return dispositions.map(disp => {
                    const qty = defectRecords.filter(d => d.disposition === disp).reduce((sum, d) => sum + d.quantity, 0);
                    const pct = (qty / total) * 100;
                    const colors: Record<DefectDisposition, string> = {
                      REWORK: 'bg-blue-500', SCRAP: 'bg-red-500', CONCESSION: 'bg-yellow-500', RETURN: 'bg-orange-500'
                    };
                    return (
                      <div key={disp} className="flex items-center gap-3 mb-2">
                        <span className="text-slate-300 w-16 text-sm">{getDispositionLabel(disp)}</span>
                        <div className="flex-1 bg-slate-700 rounded-full h-4">
                          <div className={`${colors[disp]} h-4 rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-slate-400 text-sm w-20 text-right">{qty} ({pct.toFixed(0)}%)</span>
                      </div>
                    );
                  });
                })()}
              </CardContent>
            </Card>

            {/* CAPA Status Summary */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-300">CAPA狀態分佈</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const statuses: CAPAStatus[] = ['OPEN', 'ANALYZING', 'IMPLEMENTING', 'VERIFYING', 'CLOSED'];
                  const labels: Record<CAPAStatus, string> = {
                    OPEN: '開立', ANALYZING: '分析中', IMPLEMENTING: '實施中', VERIFYING: '驗證中', CLOSED: '已結案'
                  };
                  const colors: Record<CAPAStatus, string> = {
                    OPEN: 'bg-red-500', ANALYZING: 'bg-orange-500', IMPLEMENTING: 'bg-blue-500', VERIFYING: 'bg-purple-500', CLOSED: 'bg-green-500'
                  };
                  if (capaRecords.length === 0) return <p className="text-slate-400 text-sm">尚無數據</p>;
                  return statuses.map(status => {
                    const count = capaRecords.filter(c => c.status === status).length;
                    return (
                      <div key={status} className="flex items-center gap-3 mb-2">
                        <span className="text-slate-300 w-16 text-sm">{labels[status]}</span>
                        <div className={`w-6 h-6 rounded-full ${colors[status]} flex items-center justify-center`}>
                          <span className="text-white text-xs font-bold">{count}</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* New Inspection Dialog */}
      <Dialog open={showInspectionDialog} onOpenChange={setShowInspectionDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              新增{getTypeLabel(inspForm.type)}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Batch Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">
                  選擇批次{inspForm.type === 'FAI' ? '（僅已完成造模批次）' : ''}
                </Label>
                <BatchCombobox
                  batches={selectableBatches}
                  value={inspForm.batch_id}
                  onSelect={selectBatch}
                  placeholder="選擇造模批次（可搜尋客戶／品名）"
                  emptyText={inspForm.type === 'FAI' ? '查無已完成的造模批次' : '查無符合的造模批次'}
                />
                {inspForm.type === 'FAI' && selectableBatches.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1">目前沒有狀態為「已完成」的造模批次可供首件檢驗</p>
                )}
              </div>
              <div>
                <Label className="text-slate-300">檢驗員</Label>
                <Input
                  value={inspForm.inspector}
                  onChange={e => setInspForm(prev => ({ ...prev, inspector: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-slate-200"
                  placeholder="輸入檢驗員姓名"
                />
              </div>
            </div>

            {/* Auto-filled info */}
            {inspForm.batch_no && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-750 rounded-lg border border-slate-600">
                <div>
                  <span className="text-xs text-slate-400">工單號</span>
                  <p className="text-sm text-slate-200">{inspForm.order_no || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">客戶</span>
                  <p className="text-sm text-slate-200">{inspForm.customer || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">品名</span>
                  <p className="text-sm text-slate-200">{inspForm.product_name || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">材質</span>
                  <p className="text-sm text-slate-200">{inspForm.material || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Heat No</span>
                  <p className="text-sm text-slate-200">{inspForm.heat_no || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">抽樣方式</span>
                  <Input
                    value={inspForm.sampling_method}
                    onChange={e => setInspForm(prev => ({ ...prev, sampling_method: e.target.value }))}
                    className="bg-slate-700 border-slate-600 text-slate-200 h-7 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">檢驗數量</Label>
                <Input
                  type="number"
                  value={inspForm.inspected_quantity}
                  onChange={e => setInspForm(prev => ({ ...prev, inspected_quantity: Number(e.target.value) }))}
                  className="bg-slate-700 border-slate-600 text-slate-200"
                />
              </div>
              <div>
                <Label className="text-slate-300">合格數量</Label>
                <Input
                  type="number"
                  value={inspForm.pass_quantity}
                  onChange={e => setInspForm(prev => ({ ...prev, pass_quantity: Number(e.target.value) }))}
                  className="bg-slate-700 border-slate-600 text-slate-200"
                />
              </div>
            </div>

            {/* Inspection Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-300">
                  檢驗項目
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    判定：OK 合格／NG 不合格／X 不適用；量測值、標準值、備註可不填
                  </span>
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addInspectionItem}
                  className="h-7 text-xs bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 hover:text-slate-100"
                >
                  <Plus className="w-3 h-3 mr-1" />新增項目
                </Button>
              </div>
              <div className="border border-slate-600 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-600">
                      <TableHead className="text-slate-300 w-40">項目</TableHead>
                      <TableHead className="text-slate-300 w-24">判定</TableHead>
                      <TableHead className="text-slate-300">量測值</TableHead>
                      <TableHead className="text-slate-300">標準值</TableHead>
                      <TableHead className="text-slate-300">備註</TableHead>
                      <TableHead className="text-slate-300 w-12 text-center">刪除</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemResults.length === 0 ? (
                      <TableRow className="border-slate-600">
                        <TableCell colSpan={6} className="text-center text-sm text-slate-400 py-4">
                          尚無檢驗項目，請點擊右上方「新增項目」
                        </TableCell>
                      </TableRow>
                    ) : itemResults.map((item, idx) => (
                      <TableRow key={idx} className="border-slate-600">
                        <TableCell>
                          <Input
                            value={item.item}
                            onChange={e => updateInspectionItem(idx, { item: e.target.value })}
                            className="bg-slate-700 border-slate-600 text-slate-200 h-8 text-sm"
                            placeholder="檢驗項目名稱"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.result}
                            onValueChange={(val: ItemVerdict) => updateInspectionItem(idx, { result: val })}
                          >
                            <SelectTrigger className={`w-20 h-8 text-xs ${getVerdictTriggerClass(item.result)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="OK">OK</SelectItem>
                              <SelectItem value="NG">NG</SelectItem>
                              <SelectItem value="X">X</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.measured_value || ''}
                            onChange={e => updateInspectionItem(idx, { measured_value: e.target.value })}
                            className="bg-slate-700 border-slate-600 text-slate-200 h-8 text-sm"
                            placeholder="可不填"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.standard_value || ''}
                            onChange={e => updateInspectionItem(idx, { standard_value: e.target.value })}
                            className="bg-slate-700 border-slate-600 text-slate-200 h-8 text-sm"
                            placeholder="可不填"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.remarks || ''}
                            onChange={e => updateInspectionItem(idx, { remarks: e.target.value })}
                            className="bg-slate-700 border-slate-600 text-slate-200 h-8 text-sm"
                            placeholder="可不填"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeInspectionItem(idx)}
                            className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-900/20"
                            title="刪除此檢驗項目"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <Label className="text-slate-300">備註</Label>
              <Textarea
                value={inspForm.remarks}
                onChange={e => setInspForm(prev => ({ ...prev, remarks: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-slate-200"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInspectionDialog(false)}>取消</Button>
            <Button onClick={submitInspection} disabled={!inspForm.batch_id || !inspForm.inspector}>
              提交檢驗
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspection Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              檢驗詳情 - {selectedInspection?.inspection_no}
            </DialogTitle>
          </DialogHeader>
          {selectedInspection && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-xs text-slate-400">類型</span>
                  <p className="text-sm text-slate-200">{getTypeLabel(selectedInspection.type)}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">批次號</span>
                  <p className="text-sm text-slate-200">{selectedInspection.batch_no}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">結果</span>
                  <div className="mt-0.5">{getResultBadge(selectedInspection.result)}</div>
                </div>
                <div>
                  <span className="text-xs text-slate-400">客戶</span>
                  <p className="text-sm text-slate-200">{selectedInspection.customer || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">品名</span>
                  <p className="text-sm text-slate-200">{selectedInspection.product_name || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">材質</span>
                  <p className="text-sm text-slate-200">{selectedInspection.material || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Heat No</span>
                  <p className="text-sm text-slate-200">{selectedInspection.heat_no || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">檢驗數 / 合格數</span>
                  <p className="text-sm text-slate-200">{selectedInspection.inspected_quantity} / {selectedInspection.pass_quantity}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">良率</span>
                  <p className="text-sm text-slate-200 font-bold">{selectedInspection.yield_rate?.toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">檢驗員</span>
                  <p className="text-sm text-slate-200">{selectedInspection.inspector}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">抽樣方式</span>
                  <p className="text-sm text-slate-200">{selectedInspection.sampling_method || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">日期</span>
                  <p className="text-sm text-slate-200">{new Date(selectedInspection.created_at).toLocaleString('zh-TW')}</p>
                </div>
              </div>

              {/* Item Results */}
              {selectedInspection.item_results && selectedInspection.item_results.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">檢驗項目明細</h4>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-600">
                        <TableHead className="text-slate-400 text-xs">項目</TableHead>
                        <TableHead className="text-slate-400 text-xs">判定</TableHead>
                        <TableHead className="text-slate-400 text-xs">量測值</TableHead>
                        <TableHead className="text-slate-400 text-xs">標準值</TableHead>
                        <TableHead className="text-slate-400 text-xs">備註</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInspection.item_results.map((item, idx) => (
                        <TableRow key={idx} className="border-slate-600">
                          <TableCell className="text-slate-200 text-sm">{item.item}</TableCell>
                          <TableCell>
                            <Badge className={getVerdictBadgeClass(item.result)}>
                              {item.result}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-300 text-sm">{item.measured_value || '-'}</TableCell>
                          <TableCell className="text-slate-300 text-sm">{item.standard_value || '-'}</TableCell>
                          <TableCell className="text-slate-300 text-sm">{item.remarks || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {selectedInspection.remarks && (
                <div>
                  <span className="text-xs text-slate-400">備註</span>
                  <p className="text-sm text-slate-200 mt-1">{selectedInspection.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Defect Dialog */}
      <Dialog open={showDefectDialog} onOpenChange={setShowDefectDialog}>
        <DialogContent className="max-w-lg bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">新增缺陷紀錄</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">關聯批次</Label>
              <Select
                value={defectForm.batch_id}
                onValueChange={val => {
                  const batch = batches.find(b => b.id === val);
                  setDefectForm(prev => ({ ...prev, batch_id: val, batch_no: batch?.batch_no || '' }));
                }}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="選擇批次" />
                </SelectTrigger>
                <SelectContent>
                  {batches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.batch_no}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">缺陷代碼</Label>
                <Select
                  value={defectForm.defect_code}
                  onValueChange={val => {
                    const dc = DEFECT_CODES.find(d => d.code === val);
                    setDefectForm(prev => ({ ...prev, defect_code: val, defect_label: dc?.label || '' }));
                  }}
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                    <SelectValue placeholder="選擇缺陷" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFECT_CODES.map(dc => (
                      <SelectItem key={dc.code} value={dc.code}>{dc.code} - {dc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">數量</Label>
                <Input
                  type="number"
                  min={1}
                  value={defectForm.quantity}
                  onChange={e => setDefectForm(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                  className="bg-slate-700 border-slate-600 text-slate-200"
                />
              </div>
            </div>
            <div>
              <Label className="text-slate-300">原因分析</Label>
              <Input
                value={defectForm.cause}
                onChange={e => setDefectForm(prev => ({ ...prev, cause: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-slate-200"
                placeholder="描述缺陷原因"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">責任工站</Label>
                <Select
                  value={defectForm.responsible_station}
                  onValueChange={val => setDefectForm(prev => ({ ...prev, responsible_station: val }))}
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                    <SelectValue placeholder="選擇工站" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="造模">造模</SelectItem>
                    <SelectItem value="熔煉">熔煉</SelectItem>
                    <SelectItem value="澆注">澆注</SelectItem>
                    <SelectItem value="清理">清理</SelectItem>
                    <SelectItem value="加工">加工</SelectItem>
                    <SelectItem value="組裝">組裝</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">處置方式</Label>
                <Select
                  value={defectForm.disposition}
                  onValueChange={(val: DefectDisposition) => setDefectForm(prev => ({ ...prev, disposition: val }))}
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REWORK">返工</SelectItem>
                    <SelectItem value="SCRAP">報廢</SelectItem>
                    <SelectItem value="CONCESSION">特採</SelectItem>
                    <SelectItem value="RETURN">退回</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-slate-300">備註</Label>
              <Textarea
                value={defectForm.remarks}
                onChange={e => setDefectForm(prev => ({ ...prev, remarks: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-slate-200"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDefectDialog(false)}>取消</Button>
            <Button onClick={submitDefect} disabled={!defectForm.defect_code} className="bg-red-600 hover:bg-red-700">
              確認新增
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New CAPA Dialog */}
      <Dialog open={showCAPADialog} onOpenChange={setShowCAPADialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">新增CAPA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">問題描述 *</Label>
              <Textarea
                value={capaForm.problem_description}
                onChange={e => setCapaForm(prev => ({ ...prev, problem_description: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-slate-200"
                rows={3}
                placeholder="詳細描述問題現象"
              />
            </div>
            <div>
              <Label className="text-slate-300">5 Why 分析</Label>
              <Textarea
                value={capaForm.five_why}
                onChange={e => setCapaForm(prev => ({ ...prev, five_why: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-slate-200"
                rows={3}
                placeholder="Why 1: ...\nWhy 2: ...\nWhy 3: ..."
              />
            </div>
            <div>
              <Label className="text-slate-300">根本原因</Label>
              <Input
                value={capaForm.root_cause}
                onChange={e => setCapaForm(prev => ({ ...prev, root_cause: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-slate-200"
              />
            </div>
            <div>
              <Label className="text-slate-300">矯正措施</Label>
              <Textarea
                value={capaForm.corrective_action}
                onChange={e => setCapaForm(prev => ({ ...prev, corrective_action: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-slate-200"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-slate-300">預防措施</Label>
              <Textarea
                value={capaForm.preventive_action}
                onChange={e => setCapaForm(prev => ({ ...prev, preventive_action: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-slate-200"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">負責人 *</Label>
                <Input
                  value={capaForm.responsible_person}
                  onChange={e => setCapaForm(prev => ({ ...prev, responsible_person: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-slate-200"
                />
              </div>
              <div>
                <Label className="text-slate-300">到期日</Label>
                <Input
                  type="date"
                  value={capaForm.due_date}
                  onChange={e => setCapaForm(prev => ({ ...prev, due_date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-slate-200"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCAPADialog(false)}>取消</Button>
            <Button
              onClick={submitCAPA}
              disabled={!capaForm.problem_description || !capaForm.responsible_person}
              className="bg-purple-600 hover:bg-purple-700"
            >
              建立CAPA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CAPA Detail Dialog */}
      <Dialog open={showCAPADetailDialog} onOpenChange={setShowCAPADetailDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              CAPA詳情 - {selectedCAPA?.capa_no}
            </DialogTitle>
          </DialogHeader>
          {selectedCAPA && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-sm">狀態:</span>
                {getCAPAStatusBadge(selectedCAPA.status)}
              </div>
              <div>
                <span className="text-xs text-slate-400">問題描述</span>
                <p className="text-sm text-slate-200 mt-1 whitespace-pre-wrap">{selectedCAPA.problem_description}</p>
              </div>
              {selectedCAPA.five_why && (
                <div>
                  <span className="text-xs text-slate-400">5 Why 分析</span>
                  <p className="text-sm text-slate-200 mt-1 whitespace-pre-wrap">{selectedCAPA.five_why}</p>
                </div>
              )}
              {selectedCAPA.root_cause && (
                <div>
                  <span className="text-xs text-slate-400">根本原因</span>
                  <p className="text-sm text-slate-200 mt-1">{selectedCAPA.root_cause}</p>
                </div>
              )}
              {selectedCAPA.corrective_action && (
                <div>
                  <span className="text-xs text-slate-400">矯正措施</span>
                  <p className="text-sm text-slate-200 mt-1 whitespace-pre-wrap">{selectedCAPA.corrective_action}</p>
                </div>
              )}
              {selectedCAPA.preventive_action && (
                <div>
                  <span className="text-xs text-slate-400">預防措施</span>
                  <p className="text-sm text-slate-200 mt-1 whitespace-pre-wrap">{selectedCAPA.preventive_action}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-slate-400">負責人</span>
                  <p className="text-sm text-slate-200">{selectedCAPA.responsible_person}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">到期日</span>
                  <p className="text-sm text-slate-200">{selectedCAPA.due_date || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">建立日期</span>
                  <p className="text-sm text-slate-200">{new Date(selectedCAPA.created_at).toLocaleDateString('zh-TW')}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </AppLayout>
  );
}