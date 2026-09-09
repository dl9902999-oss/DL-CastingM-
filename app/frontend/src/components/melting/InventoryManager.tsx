import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Download, PackagePlus, BarChart3, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  dsGetRawMaterialReceipts, dsCreateRawMaterialReceipt,
  dsUpdateRawMaterialReceipt, dsDeleteRawMaterialReceipt,
  dsGetMeltRecords, dsGetMeltMaterials,
} from '@/lib/dataService';
import type { RawMaterialReceipt, RawMaterialReceiptInput } from '@/lib/supabaseStore';
import type { MeltRecord, MeltMaterial } from '@/lib/types';

/** 原料入庫可登錄的成分規格元素 */
const SPEC_ELEMENTS = ['C', 'Si', 'Mn', 'P', 'S', 'Ni', 'Cr', 'Mo', 'Cu'] as const;

/**
 * 回爐料（廠內自產循環料）關鍵字。
 * 回爐料屬於廠內循環使用，非外購進料，因此投料統計需與外購原料分開計算，
 * 也不納入外購原料的占比分母。
 */
const RETURN_MATERIAL_KEYWORDS = ['回爐', '回料', '澆道', '冒口', '自產'];

/** 判斷原料名稱是否屬於回爐料 */
function isReturnMaterial(name: string): boolean {
  const n = (name || '').trim();
  if (!n) return false;
  return RETURN_MATERIAL_KEYWORDS.some(k => n.includes(k));
}

interface ConsumptionRow {
  raw_material: string;
  charge_weight: number;
  secondary_weight: number;
  total: number;
  melt_count: number;
  ratio: number;
  /** true 表示回爐料，統計時與外購原料分開呈現 */
  is_return: boolean;
}

interface ReceiptFormState {
  receipt_date: string;
  raw_material: string;
  weight: string;
  unit_price: string;
  supplier: string;
  lot_no: string;
  remark: string;
  created_by: string;
  spec: Record<string, string>;
}

function emptyForm(materialOptions: string[]): ReceiptFormState {
  const spec: Record<string, string> = {};
  SPEC_ELEMENTS.forEach(el => { spec[el] = ''; });
  return {
    receipt_date: new Date().toISOString().slice(0, 10),
    raw_material: materialOptions[0] || '',
    weight: '',
    unit_price: '',
    supplier: '',
    lot_no: '',
    remark: '',
    created_by: '',
    spec,
  };
}

/** 取得本月第一天，作為日期區間預設起始 */
function defaultStartDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function round(n: number, digits = 2): number {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

export default function InventoryManager({
  open, onOpenChange, materialOptions, syncTrigger,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  materialOptions: string[];
  syncTrigger?: number;
}) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [receipts, setReceipts] = useState<RawMaterialReceipt[]>([]);
  const [meltRecords, setMeltRecords] = useState<MeltRecord[]>([]);
  const [meltMaterials, setMeltMaterials] = useState<MeltMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ReceiptFormState>(() => emptyForm(materialOptions));
  const [tab, setTab] = useState<'consumption' | 'receipts'>('consumption');
  const [materialFilter, setMaterialFilter] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rs, records, mats] = await Promise.all([
        dsGetRawMaterialReceipts(),
        dsGetMeltRecords(),
        dsGetMeltMaterials(),
      ]);
      setReceipts(rs);
      setMeltRecords(records);
      setMeltMaterials(mats);
    } catch (err) {
      console.error('[InventoryManager] load failed:', err);
      toast({ title: '載入庫存資料失敗', description: '請確認網路連線後重試', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, syncTrigger, loadData]);

  /** melt_id -> 熔解日期，用於投料統計的日期區間過濾 */
  const meltDateMap = useMemo(() => {
    const map: Record<string, string> = {};
    meltRecords.forEach(r => { map[r.id] = r.melt_date; });
    return map;
  }, [meltRecords]);

  const inRange = useCallback((date: string): boolean => {
    if (!date) return false;
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  }, [startDate, endDate]);

  /**
   * 日期區間內各原料投料統計。
   * 回爐料另外計算：占比分別以「外購原料合計」與「回爐料合計」為各自分母，
   * 避免回爐料稀釋外購原料的配比分析。
   */
  const consumptionRows = useMemo<ConsumptionRow[]>(() => {
    const acc: Record<string, { charge: number; secondary: number; melts: Set<string> }> = {};
    meltMaterials.forEach(m => {
      const date = meltDateMap[m.melt_id];
      if (!inRange(date)) return;
      const key = m.raw_material || '(未命名)';
      if (!acc[key]) acc[key] = { charge: 0, secondary: 0, melts: new Set() };
      acc[key].charge += Number(m.charge_weight) || 0;
      acc[key].secondary += Number(m.secondary_weight) || 0;
      acc[key].melts.add(m.melt_id);
    });
    const rows: ConsumptionRow[] = Object.entries(acc).map(([raw_material, v]) => ({
      raw_material,
      charge_weight: round(v.charge),
      secondary_weight: round(v.secondary),
      total: round(v.charge + v.secondary),
      melt_count: v.melts.size,
      ratio: 0,
      is_return: isReturnMaterial(raw_material),
    }));
    const purchasedSum = rows.filter(r => !r.is_return).reduce((s, r) => s + r.total, 0);
    const returnSum = rows.filter(r => r.is_return).reduce((s, r) => s + r.total, 0);
    rows.forEach(r => {
      const base = r.is_return ? returnSum : purchasedSum;
      r.ratio = base > 0 ? round((r.total / base) * 100, 1) : 0;
    });
    return rows.sort((a, b) => b.total - a.total);
  }, [meltMaterials, meltDateMap, inRange]);

  /** 外購原料投料明細（不含回爐料） */
  const purchasedRows = useMemo(() => consumptionRows.filter(r => !r.is_return), [consumptionRows]);
  /** 回爐料投料明細（廠內循環料，獨立統計） */
  const returnRows = useMemo(() => consumptionRows.filter(r => r.is_return), [consumptionRows]);

  const purchasedTotal = round(purchasedRows.reduce((s, r) => s + r.total, 0));
  const returnTotal = round(returnRows.reduce((s, r) => s + r.total, 0));
  /** 全部投料（外購 + 回爐），用於回爐料使用率計算 */
  const totalConsumption = round(purchasedTotal + returnTotal);
  /** 回爐料占全部投料的比率，是現場關注的「回爐料使用率」 */
  const returnUsageRate = totalConsumption > 0 ? round((returnTotal / totalConsumption) * 100, 1) : 0;

  /** 日期區間內的入庫紀錄 */
  const rangeReceipts = useMemo(
    () => receipts
      .filter(r => inRange(r.receipt_date))
      .filter(r => !materialFilter || r.raw_material === materialFilter)
      .sort((a, b) => b.receipt_date.localeCompare(a.receipt_date)),
    [receipts, inRange, materialFilter]
  );

  const totalReceiptWeight = round(rangeReceipts.reduce((s, r) => s + (Number(r.weight) || 0), 0));
  const totalReceiptAmount = round(
    rangeReceipts.reduce((s, r) => s + (Number(r.weight) || 0) * (Number(r.unit_price) || 0), 0)
  );

  /** 區間內各原料的入庫量 vs 投料量結算（回爐料以獨立分類標示） */
  const balanceRows = useMemo(() => {
    const receiptAcc: Record<string, number> = {};
    receipts.forEach(r => {
      if (!inRange(r.receipt_date)) return;
      const key = r.raw_material || '(未命名)';
      receiptAcc[key] = (receiptAcc[key] || 0) + (Number(r.weight) || 0);
    });
    const names = new Set<string>([...Object.keys(receiptAcc), ...consumptionRows.map(r => r.raw_material)]);
    return [...names].map(name => {
      const received = round(receiptAcc[name] || 0);
      const used = consumptionRows.find(r => r.raw_material === name)?.total || 0;
      return {
        raw_material: name,
        received,
        used: round(used),
        balance: round(received - used),
        is_return: isReturnMaterial(name),
      };
    }).sort((a, b) => b.received - a.received);
  }, [receipts, consumptionRows, inRange]);

  /** 外購原料結算列 */
  const purchasedBalanceRows = useMemo(() => balanceRows.filter(r => !r.is_return), [balanceRows]);
  /** 回爐料結算列（廠內循環料，另外計算） */
  const returnBalanceRows = useMemo(() => balanceRows.filter(r => r.is_return), [balanceRows]);

  const materialSelectOptions = useMemo(() => {
    const set = new Set<string>(materialOptions);
    receipts.forEach(r => { if (r.raw_material) set.add(r.raw_material); });
    return [...set];
  }, [materialOptions, receipts]);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm(materialSelectOptions));
    setShowReceiptForm(true);
  };

  const openEditForm = (receipt: RawMaterialReceipt) => {
    const spec: Record<string, string> = {};
    SPEC_ELEMENTS.forEach(el => {
      const v = receipt.spec?.[el];
      spec[el] = v === undefined || v === null ? '' : String(v);
    });
    setEditingId(receipt.id);
    setForm({
      receipt_date: receipt.receipt_date || new Date().toISOString().slice(0, 10),
      raw_material: receipt.raw_material,
      weight: receipt.weight ? String(receipt.weight) : '',
      unit_price: receipt.unit_price ? String(receipt.unit_price) : '',
      supplier: receipt.supplier || '',
      lot_no: receipt.lot_no || '',
      remark: receipt.remark || '',
      created_by: receipt.created_by || '',
      spec,
    });
    setShowReceiptForm(true);
  };

  const handleSubmit = async () => {
    if (!form.raw_material.trim()) {
      toast({ title: '請選擇或輸入原料名稱', variant: 'destructive' });
      return;
    }
    const weight = Number(form.weight);
    if (!form.weight.trim() || Number.isNaN(weight) || weight <= 0) {
      toast({ title: '請輸入大於 0 的入庫重量', variant: 'destructive' });
      return;
    }
    if (!form.supplier.trim()) {
      toast({ title: '請輸入供應商', variant: 'destructive' });
      return;
    }
    if (!form.receipt_date) {
      toast({ title: '請選擇入庫日期', variant: 'destructive' });
      return;
    }

    const spec: Record<string, number> = {};
    SPEC_ELEMENTS.forEach(el => {
      const raw = form.spec[el];
      if (raw !== undefined && raw !== '') {
        const num = Number(raw);
        if (!Number.isNaN(num)) spec[el] = num;
      }
    });

    const payload: RawMaterialReceiptInput = {
      receipt_date: form.receipt_date,
      raw_material: form.raw_material.trim(),
      weight,
      unit_price: Number(form.unit_price) || 0,
      supplier: form.supplier.trim(),
      lot_no: form.lot_no.trim(),
      spec,
      remark: form.remark.trim(),
      created_by: form.created_by.trim(),
    };

    setSaving(true);
    try {
      if (editingId) {
        await dsUpdateRawMaterialReceipt(editingId, payload);
        toast({ title: '原料入庫紀錄已更新' });
      } else {
        await dsCreateRawMaterialReceipt(payload);
        toast({ title: '原料入庫已新增' });
      }
      setShowReceiptForm(false);
      setEditingId(null);
      await loadData();
      setTab('receipts');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[InventoryManager] save failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，儲存失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '儲存失敗，請稍後再試', variant: 'destructive' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (receipt: RawMaterialReceipt) => {
    if (!window.confirm(`確定要刪除入庫紀錄 ${receipt.receipt_no} 嗎？`)) return;
    try {
      await dsDeleteRawMaterialReceipt(receipt.id);
      await loadData();
      toast({ title: '入庫紀錄已刪除' });
    } catch (err) {
      console.error('[InventoryManager] delete failed:', err);
      toast({ title: '刪除失敗，請稍後再試', variant: 'destructive' });
    }
  };

  const handleExport = () => {
    const isConsumption = tab === 'consumption';
    if ((isConsumption ? consumptionRows.length : rangeReceipts.length) === 0) {
      toast({ title: '無資料可匯出', variant: 'destructive' });
      return;
    }
    let headers: string[];
    let body: (string | number)[][];
    if (isConsumption) {
      headers = ['分類', '原料', '首次投料(kg)', '二次添加(kg)', '合計(kg)', '使用爐次', '占比(%)'];
      body = [
        ...purchasedRows.map(r => ['外購原料', r.raw_material, r.charge_weight, r.secondary_weight, r.total, r.melt_count, r.ratio]),
        ['外購原料', '外購合計', round(purchasedRows.reduce((s, r) => s + r.charge_weight, 0)), round(purchasedRows.reduce((s, r) => s + r.secondary_weight, 0)), purchasedTotal, '', 100],
        ...returnRows.map(r => ['回爐料', r.raw_material, r.charge_weight, r.secondary_weight, r.total, r.melt_count, r.ratio]),
        ['回爐料', '回爐料合計', round(returnRows.reduce((s, r) => s + r.charge_weight, 0)), round(returnRows.reduce((s, r) => s + r.secondary_weight, 0)), returnTotal, '', 100],
        ['彙總', '全部投料', '', '', totalConsumption, '', 100],
        ['彙總', '回爐料使用率(%)', '', '', returnUsageRate, '', ''],
      ];
    } else {
      headers = ['入庫單號', '入庫日期', '原料', '重量(kg)', '單價', '金額', '供應商', '批號', '成分規格', '登錄人', '備註'];
      body = rangeReceipts.map(r => [
        r.receipt_no, r.receipt_date, r.raw_material, r.weight, r.unit_price,
        round(r.weight * r.unit_price), r.supplier, r.lot_no,
        SPEC_ELEMENTS.filter(el => r.spec?.[el] !== undefined).map(el => `${el}:${r.spec[el]}`).join(' '),
        r.created_by, r.remark,
      ]);
    }
    const csv = '\uFEFF' + [headers.join(','), ...body.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${isConsumption ? '原料投料統計' : '原料入庫紀錄'}_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Excel 匯出完成' });
  };

  const setQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-emerald-400" />原料庫存管理
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Card className="bg-zinc-800 border-zinc-700">
              <CardContent className="p-3">
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-zinc-400 text-xs">開始日期</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      className="bg-zinc-900 border-zinc-700 text-zinc-100 h-9" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-zinc-400 text-xs">結束日期</Label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                      className="bg-zinc-900 border-zinc-700 text-zinc-100 h-9" />
                  </div>
                  <div className="flex gap-1">
                    <Button onClick={() => setQuickRange(7)} variant="outline"
                      className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 h-9 text-xs">近7天</Button>
                    <Button onClick={() => setQuickRange(30)} variant="outline"
                      className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 h-9 text-xs">近30天</Button>
                    <Button onClick={() => { setStartDate(defaultStartDate()); setEndDate(new Date().toISOString().slice(0, 10)); }}
                      variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 h-9 text-xs">本月</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">外購投料</p>
                  <p className="text-lg font-bold text-amber-400">{purchasedTotal} kg</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-cyan-900/50">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">回爐料投料</p>
                  <p className="text-lg font-bold text-cyan-300">{returnTotal} kg</p>
                  <p className="text-[10px] text-zinc-500">使用率 {returnUsageRate}%</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">區間總入庫</p>
                  <p className="text-lg font-bold text-emerald-400">{totalReceiptWeight} kg</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">入庫金額</p>
                  <p className="text-lg font-bold text-blue-400">{totalReceiptAmount.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">原料種類</p>
                  <p className="text-lg font-bold text-zinc-100">{balanceRows.length}</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex gap-1">
                <Button onClick={() => setTab('consumption')}
                  className={tab === 'consumption'
                    ? 'bg-amber-500 hover:bg-amber-600 text-zinc-900 h-8 text-xs'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 h-8 text-xs'}>
                  <BarChart3 className="w-3.5 h-3.5 mr-1" />投料統計
                </Button>
                <Button onClick={() => setTab('receipts')}
                  className={tab === 'receipts'
                    ? 'bg-amber-500 hover:bg-amber-600 text-zinc-900 h-8 text-xs'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 h-8 text-xs'}>
                  <PackagePlus className="w-3.5 h-3.5 mr-1" />入庫紀錄
                </Button>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleExport} variant="outline"
                  className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 h-8 text-xs">
                  <Download className="w-3.5 h-3.5 mr-1" />匯出
                </Button>
                <Button onClick={openCreateForm} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" />新增原料入庫
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="py-10 text-center text-zinc-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />載入中...
              </div>
            ) : tab === 'consumption' ? (
              <div className="space-y-4">
                {consumptionRows.length === 0 ? (
                  <Card className="bg-zinc-800 border-zinc-700">
                    <CardContent className="p-6 text-center text-zinc-400 text-sm">此日期區間內無投料紀錄</CardContent>
                  </Card>
                ) : (
                  <>
                    {/* 外購原料投料統計（不含回爐料，占比以外購合計為分母） */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-zinc-300">
                          外購原料投料統計（{startDate} ~ {endDate}）
                        </p>
                        <span className="text-[11px] text-zinc-500">占比分母：外購原料合計</span>
                      </div>
                      {purchasedRows.length === 0 ? (
                        <Card className="bg-zinc-800 border-zinc-700">
                          <CardContent className="p-4 text-center text-zinc-400 text-xs">此區間內無外購原料投料</CardContent>
                        </Card>
                      ) : (
                        <div className="overflow-x-auto border border-zinc-700 rounded">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-zinc-400 bg-zinc-800 border-b border-zinc-700">
                                <th className="text-left py-2 px-3">原料</th>
                                <th className="text-right py-2 px-3">首次投料(kg)</th>
                                <th className="text-right py-2 px-3">二次添加(kg)</th>
                                <th className="text-right py-2 px-3">合計(kg)</th>
                                <th className="text-right py-2 px-3">使用爐次</th>
                                <th className="text-right py-2 px-3">占比</th>
                              </tr>
                            </thead>
                            <tbody>
                              {purchasedRows.map(r => (
                                <tr key={r.raw_material} className="text-zinc-300 border-b border-zinc-700/50">
                                  <td className="py-2 px-3 font-medium">{r.raw_material}</td>
                                  <td className="text-right py-2 px-3">{r.charge_weight}</td>
                                  <td className="text-right py-2 px-3">{r.secondary_weight}</td>
                                  <td className="text-right py-2 px-3 font-semibold text-amber-400">{r.total}</td>
                                  <td className="text-right py-2 px-3">{r.melt_count}</td>
                                  <td className="text-right py-2 px-3">
                                    <div className="flex items-center justify-end gap-2">
                                      <div className="w-16 h-1.5 bg-zinc-700 rounded overflow-hidden">
                                        <div className="h-full bg-amber-500" style={{ width: `${Math.min(r.ratio, 100)}%` }} />
                                      </div>
                                      <span className="w-10 text-right">{r.ratio}%</span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              <tr className="text-zinc-100 font-semibold bg-zinc-800">
                                <td className="py-2 px-3">外購合計</td>
                                <td className="text-right py-2 px-3">{round(purchasedRows.reduce((s, r) => s + r.charge_weight, 0))}</td>
                                <td className="text-right py-2 px-3">{round(purchasedRows.reduce((s, r) => s + r.secondary_weight, 0))}</td>
                                <td className="text-right py-2 px-3 text-amber-400">{purchasedTotal}</td>
                                <td className="text-right py-2 px-3">-</td>
                                <td className="text-right py-2 px-3">100%</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 回爐料另外計算：廠內循環料獨立統計，不併入外購原料 */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-cyan-300">
                          回爐料投料統計（廠內循環料，另外計算）
                        </p>
                        <span className="text-[11px] text-zinc-500">占比分母：回爐料合計</span>
                      </div>
                      {returnRows.length === 0 ? (
                        <Card className="bg-zinc-800 border-cyan-900/40">
                          <CardContent className="p-4 text-center text-zinc-400 text-xs">此區間內無回爐料投料</CardContent>
                        </Card>
                      ) : (
                        <div className="overflow-x-auto border border-cyan-900/50 rounded">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-cyan-200/70 bg-cyan-950/40 border-b border-cyan-900/50">
                                <th className="text-left py-2 px-3">回爐料項目</th>
                                <th className="text-right py-2 px-3">首次投料(kg)</th>
                                <th className="text-right py-2 px-3">二次添加(kg)</th>
                                <th className="text-right py-2 px-3">合計(kg)</th>
                                <th className="text-right py-2 px-3">使用爐次</th>
                                <th className="text-right py-2 px-3">占比</th>
                              </tr>
                            </thead>
                            <tbody>
                              {returnRows.map(r => (
                                <tr key={r.raw_material} className="text-zinc-300 border-b border-cyan-900/30">
                                  <td className="py-2 px-3 font-medium">{r.raw_material}</td>
                                  <td className="text-right py-2 px-3">{r.charge_weight}</td>
                                  <td className="text-right py-2 px-3">{r.secondary_weight}</td>
                                  <td className="text-right py-2 px-3 font-semibold text-cyan-300">{r.total}</td>
                                  <td className="text-right py-2 px-3">{r.melt_count}</td>
                                  <td className="text-right py-2 px-3">
                                    <div className="flex items-center justify-end gap-2">
                                      <div className="w-16 h-1.5 bg-zinc-700 rounded overflow-hidden">
                                        <div className="h-full bg-cyan-500" style={{ width: `${Math.min(r.ratio, 100)}%` }} />
                                      </div>
                                      <span className="w-10 text-right">{r.ratio}%</span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              <tr className="text-zinc-100 font-semibold bg-cyan-950/40">
                                <td className="py-2 px-3">回爐料合計</td>
                                <td className="text-right py-2 px-3">{round(returnRows.reduce((s, r) => s + r.charge_weight, 0))}</td>
                                <td className="text-right py-2 px-3">{round(returnRows.reduce((s, r) => s + r.secondary_weight, 0))}</td>
                                <td className="text-right py-2 px-3 text-cyan-300">{returnTotal}</td>
                                <td className="text-right py-2 px-3">-</td>
                                <td className="text-right py-2 px-3">100%</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="text-[11px] text-zinc-500 mt-1">
                        回爐料為廠內澆道、冒口等自產循環料，已與外購原料分開統計，不計入外購原料占比分母。
                      </p>
                    </div>

                    {/* 外購 vs 回爐彙總對照 */}
                    <div className="overflow-x-auto border border-zinc-700 rounded">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-zinc-400 bg-zinc-800 border-b border-zinc-700">
                            <th className="text-left py-2 px-3">分類</th>
                            <th className="text-right py-2 px-3">投料合計(kg)</th>
                            <th className="text-right py-2 px-3">項目數</th>
                            <th className="text-right py-2 px-3">占全部投料</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="text-zinc-300 border-b border-zinc-700/50">
                            <td className="py-2 px-3 font-medium">外購原料</td>
                            <td className="text-right py-2 px-3 text-amber-400 font-semibold">{purchasedTotal}</td>
                            <td className="text-right py-2 px-3">{purchasedRows.length}</td>
                            <td className="text-right py-2 px-3">{round(100 - returnUsageRate, 1)}%</td>
                          </tr>
                          <tr className="text-zinc-300 border-b border-zinc-700/50">
                            <td className="py-2 px-3 font-medium">回爐料</td>
                            <td className="text-right py-2 px-3 text-cyan-300 font-semibold">{returnTotal}</td>
                            <td className="text-right py-2 px-3">{returnRows.length}</td>
                            <td className="text-right py-2 px-3">{returnUsageRate}%</td>
                          </tr>
                          <tr className="text-zinc-100 font-semibold bg-zinc-800">
                            <td className="py-2 px-3">全部投料</td>
                            <td className="text-right py-2 px-3">{totalConsumption}</td>
                            <td className="text-right py-2 px-3">{consumptionRows.length}</td>
                            <td className="text-right py-2 px-3">100%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-300 mb-1">外購原料入庫／投料結算（區間內）</p>
                    {purchasedBalanceRows.length === 0 ? (
                      <Card className="bg-zinc-800 border-zinc-700">
                        <CardContent className="p-4 text-center text-zinc-400 text-xs">此日期區間內無外購原料資料</CardContent>
                      </Card>
                    ) : (
                      <div className="overflow-x-auto border border-zinc-700 rounded">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-zinc-400 bg-zinc-800 border-b border-zinc-700">
                              <th className="text-left py-2 px-3">原料</th>
                              <th className="text-right py-2 px-3">入庫(kg)</th>
                              <th className="text-right py-2 px-3">投料(kg)</th>
                              <th className="text-right py-2 px-3">差額(kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {purchasedBalanceRows.map(r => (
                              <tr key={r.raw_material} className="text-zinc-300 border-b border-zinc-700/50">
                                <td className="py-2 px-3 font-medium">{r.raw_material}</td>
                                <td className="text-right py-2 px-3 text-emerald-400">{r.received}</td>
                                <td className="text-right py-2 px-3 text-amber-400">{r.used}</td>
                                <td className={`text-right py-2 px-3 font-semibold ${r.balance < 0 ? 'text-red-400' : 'text-zinc-100'}`}>{r.balance}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium text-cyan-300 mb-1">回爐料結算（廠內循環料，另外計算）</p>
                    {returnBalanceRows.length === 0 ? (
                      <Card className="bg-zinc-800 border-cyan-900/40">
                        <CardContent className="p-4 text-center text-zinc-400 text-xs">此日期區間內無回爐料資料</CardContent>
                      </Card>
                    ) : (
                      <div className="overflow-x-auto border border-cyan-900/50 rounded">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-cyan-200/70 bg-cyan-950/40 border-b border-cyan-900/50">
                              <th className="text-left py-2 px-3">回爐料項目</th>
                              <th className="text-right py-2 px-3">入庫(kg)</th>
                              <th className="text-right py-2 px-3">投料(kg)</th>
                              <th className="text-right py-2 px-3">差額(kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {returnBalanceRows.map(r => (
                              <tr key={r.raw_material} className="text-zinc-300 border-b border-cyan-900/30">
                                <td className="py-2 px-3 font-medium">{r.raw_material}</td>
                                <td className="text-right py-2 px-3 text-emerald-400">{r.received}</td>
                                <td className="text-right py-2 px-3 text-cyan-300">{r.used}</td>
                                <td className={`text-right py-2 px-3 font-semibold ${r.balance < 0 ? 'text-red-400' : 'text-zinc-100'}`}>{r.balance}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500">差額為負值表示區間內投料量大於入庫量（使用了先前庫存）；回爐料多為廠內自產，通常無入庫紀錄故差額為負屬正常。</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Select value={materialFilter || 'all'} onValueChange={v => setMaterialFilter(v === 'all' ? '' : v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 w-44 h-8 text-xs">
                      <SelectValue placeholder="原料篩選" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="all" className="text-zinc-100">全部原料</SelectItem>
                      {materialSelectOptions.map(m => (
                        <SelectItem key={m} value={m} className="text-zinc-100">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-zinc-500">共 {rangeReceipts.length} 筆入庫紀錄</span>
                </div>

                {rangeReceipts.length === 0 ? (
                  <Card className="bg-zinc-800 border-zinc-700">
                    <CardContent className="p-6 text-center text-zinc-400 text-sm">
                      此日期區間內無入庫紀錄，點擊「新增原料入庫」開始登錄
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {rangeReceipts.map(r => (
                      <Card key={r.id} className="bg-zinc-800 border-zinc-700">
                        <CardContent className="p-3">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-semibold text-emerald-400">{r.receipt_no}</span>
                                <span className="text-xs text-zinc-500">{r.receipt_date}</span>
                                <span className="text-sm font-medium text-zinc-100">{r.raw_material}</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-zinc-400">
                                <span>重量: <span className="text-zinc-200 font-medium">{r.weight} kg</span></span>
                                <span>單價: <span className="text-zinc-200">{r.unit_price || '-'}</span></span>
                                <span>金額: <span className="text-zinc-200">{round(r.weight * r.unit_price).toLocaleString()}</span></span>
                                <span>供應商: <span className="text-zinc-200">{r.supplier || '-'}</span></span>
                                <span>批號: <span className="text-zinc-200">{r.lot_no || '-'}</span></span>
                                <span>登錄人: <span className="text-zinc-200">{r.created_by || '-'}</span></span>
                              </div>
                              {SPEC_ELEMENTS.some(el => r.spec?.[el] !== undefined) && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {SPEC_ELEMENTS.filter(el => r.spec?.[el] !== undefined).map(el => (
                                    <span key={el} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-purple-300 font-mono">
                                      {el} {r.spec[el]}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {r.remark && <p className="text-xs text-zinc-500">備註: {r.remark}</p>}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditForm(r)} title="編輯修改"
                                className="text-zinc-400 hover:text-amber-400 h-7 w-7">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(r)} title="刪除"
                                className="text-zinc-400 hover:text-red-400 h-7 w-7">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 原料入庫新增／編輯表單 */}
      <Dialog open={showReceiptForm} onOpenChange={v => { setShowReceiptForm(v); if (!v) setEditingId(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">{editingId ? '編輯原料入庫' : '新增原料入庫'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">入庫日期 *</Label>
                <Input type="date" value={form.receipt_date}
                  onChange={e => setForm({ ...form, receipt_date: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">原料名稱 *</Label>
                <Select value={form.raw_material} onValueChange={v => setForm({ ...form, raw_material: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9">
                    <SelectValue placeholder="選擇原料" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {materialSelectOptions.map(m => (
                      <SelectItem key={m} value={m} className="text-zinc-100">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">入庫重量 (kg) *</Label>
                <Input type="number" step="0.01" value={form.weight} placeholder="例如 1200"
                  onChange={e => setForm({ ...form, weight: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">單價（元/kg，可不填）</Label>
                <Input type="number" step="0.01" value={form.unit_price} placeholder="可不填"
                  onChange={e => setForm({ ...form, unit_price: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">供應商 *</Label>
                <Input value={form.supplier} placeholder="供應商名稱"
                  onChange={e => setForm({ ...form, supplier: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">供應商批號（可不填）</Label>
                <Input value={form.lot_no} placeholder="可不填"
                  onChange={e => setForm({ ...form, lot_no: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
              </div>
            </div>

            <div>
              <Label className="text-zinc-400 text-xs">成分規格（%，可只填需管控的元素）</Label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-1">
                {SPEC_ELEMENTS.map(el => (
                  <div key={el}>
                    <Label className="text-[10px] text-zinc-500">{el}</Label>
                    <Input type="number" step="0.001" value={form.spec[el] || ''} placeholder="-"
                      onChange={e => setForm({ ...form, spec: { ...form.spec, [el]: e.target.value } })}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">登錄人（可不填）</Label>
                <Input value={form.created_by} placeholder="可不填"
                  onChange={e => setForm({ ...form, created_by: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">備註（可不填）</Label>
                <Input value={form.remark} placeholder="可不填"
                  onChange={e => setForm({ ...form, remark: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowReceiptForm(false); setEditingId(null); }}
                className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 h-9 text-xs">取消</Button>
              <Button onClick={handleSubmit} disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs">
                {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                {editingId ? '儲存修改' : '確認入庫'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
