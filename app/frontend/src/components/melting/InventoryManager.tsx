import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Download, PackagePlus, BarChart3, Loader2, Flame } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  dsGetRawMaterialReceipts, dsCreateRawMaterialReceipt,
  dsUpdateRawMaterialReceipt, dsDeleteRawMaterialReceipt,
  dsGetMeltRecords, dsGetMeltMaterials, dsGetMeltingRecords,
} from '@/lib/dataService';
import type { RawMaterialReceipt, RawMaterialReceiptInput } from '@/lib/supabaseStore';
import type { MeltRecord, MeltMaterial, MeltingRecord } from '@/lib/types';
import ResidualStatistics from './ResidualStatistics';
import { buildMeltResidualRows, buildPourResidualRows, buildPreviousResidualRows, isResidualMaterial, residualExportRows, summarizeResidual } from '@/lib/residualStatistics';

/** 原料入庫可登錄的成分規格元素 */
const SPEC_ELEMENTS = ['C', 'Si', 'Mn', 'P', 'S', 'Ni', 'Cr', 'Mo', 'Cu'] as const;

/**
 * 投料分類：
 * - PURCHASED 外購原料：向供應商採購的進料
 * - RETURN    回爐料：澆道、冒口等廠內自產循環固態料
 * - RESIDUAL  殘湯：上一爐留在爐內／取湯後剩餘的液態鐵水，性質與回爐料不同，需獨立計算
 */
type MaterialCategory = 'PURCHASED' | 'RETURN' | 'RESIDUAL';

/** 回爐料（廠內自產固態循環料）關鍵字 */
const RETURN_MATERIAL_KEYWORDS = ['回爐', '回料', '澆道', '冒口', '澆冒', '自產'];

/**
 * 依原料名稱判定投料分類。
 * 殘湯先判定，避免「回爐殘湯」之類名稱被誤歸入回爐料。
 */
function categorizeMaterial(name: string): MaterialCategory {
  const n = (name || '').trim();
  if (!n) return 'PURCHASED';
  if (isResidualMaterial(n)) return 'RESIDUAL';
  if (RETURN_MATERIAL_KEYWORDS.some(k => n.includes(k))) return 'RETURN';
  return 'PURCHASED';
}

/** 各分類的顯示樣式與文案 */
const CATEGORY_META: Record<MaterialCategory, {
  label: string;
  itemLabel: string;
  note: string;
  titleText: string;
  valueText: string;
  bar: string;
  border: string;
  headBg: string;
  headText: string;
  rowBorder: string;
  totalBg: string;
}> = {
  PURCHASED: {
    label: '外購原料',
    itemLabel: '原料',
    note: '向供應商採購的進料，占比以外購原料合計為分母。',
    titleText: 'text-zinc-300',
    valueText: 'text-amber-400',
    bar: 'bg-amber-500',
    border: 'border-zinc-700',
    headBg: 'bg-zinc-800',
    headText: 'text-zinc-400',
    rowBorder: 'border-zinc-700/50',
    totalBg: 'bg-zinc-800',
  },
  RETURN: {
    label: '回爐料',
    itemLabel: '回爐料項目',
    note: '澆道、冒口等廠內自產固態循環料，已排除前爐殘湯；依使用當爐的材質分開統計，同名回爐料不跨材質合併。舊料投料比例 = 該材質回爐料總重 ÷ 該材質溶解投料總重 × 100%。',
    titleText: 'text-cyan-300',
    valueText: 'text-cyan-300',
    bar: 'bg-cyan-500',
    border: 'border-cyan-900/50',
    headBg: 'bg-cyan-950/40',
    headText: 'text-cyan-200/70',
    rowBorder: 'border-cyan-900/30',
    totalBg: 'bg-cyan-950/40',
  },
  RESIDUAL: {
    label: '前爐殘湯',
    itemLabel: '前爐殘湯項目',
    note: '僅加總投料明細中的前爐殘湯（首次投料＋二次添加），不含本爐產生的殘湯；前爐殘湯利用率 = 前爐殘湯投料總重 ÷ 總熔湯重 × 100%。',
    titleText: 'text-violet-300',
    valueText: 'text-violet-300',
    bar: 'bg-violet-500',
    border: 'border-violet-900/50',
    headBg: 'bg-violet-950/40',
    headText: 'text-violet-200/70',
    rowBorder: 'border-violet-900/30',
    totalBg: 'bg-violet-950/40',
  },
};

const CATEGORY_ORDER: MaterialCategory[] = ['PURCHASED', 'RETURN', 'RESIDUAL'];

/** 各分類投料統計表最後一欄的欄位名稱（分母依分類而異） */
const RATIO_LABEL: Record<MaterialCategory, string> = {
  PURCHASED: '占比',
  RETURN: '舊料投料比例',
  RESIDUAL: '前爐殘湯利用率',
};

interface ConsumptionRow {
  raw_material: string;
  charge_weight: number;
  secondary_weight: number;
  total: number;
  melt_count: number;
  /**
   * 最後一欄比例，分母依分類而異：
   * - PURCHASED 外購原料：外購原料合計
   * - RETURN    回爐料：該原料所屬材質的「溶解投料總重」（舊料投料比例）
   * - RESIDUAL  殘湯：全部爐次的「總熔湯重」（前爐殘湯利用率）
   */
  ratio: number;
  category: MaterialCategory;
  /** 所屬材質（取自熔解紀錄的 material_grade），回爐料依此分開統計 */
  grade: string;
  /** 該材質的溶解投料總重(kg)，作為舊料投料比例的分母 */
  grade_melt_total: number;
}

/** 回爐料依材質分組後的小計 */
interface ReturnGradeGroup {
  grade: string;
  rows: ConsumptionRow[];
  charge: number;
  secondary: number;
  total: number;
  /** 該材質的溶解投料總重(kg) */
  melt_total: number;
  /** 舊料投料比例 = 該材質回爐料總重 ÷ 該材質溶解投料總重 × 100% */
  ratio: number;
}

/** 材質名稱正規化，空值統一歸為「未分類材質」 */
function normalizeGrade(grade: string | undefined | null): string {
  return (grade || '').trim() || '未分類材質';
}

/**
 * 將回爐料投料列依材質分組。
 * 舊料投料比例 = 該材質回爐料總重 ÷ 該材質溶解投料總重 × 100%。
 */
function buildReturnGradeGroups(rows: ConsumptionRow[]): ReturnGradeGroup[] {
  const map = new Map<string, ConsumptionRow[]>();
  rows.forEach(r => {
    const list = map.get(r.grade) || [];
    list.push(r);
    map.set(r.grade, list);
  });
  return [...map.entries()]
    .map(([grade, list]) => {
      const total = round(list.reduce((s, r) => s + r.total, 0));
      const meltTotal = round(list[0]?.grade_melt_total || 0);
      return {
        grade,
        rows: [...list].sort((a, b) => b.total - a.total),
        charge: round(list.reduce((s, r) => s + r.charge_weight, 0)),
        secondary: round(list.reduce((s, r) => s + r.secondary_weight, 0)),
        total,
        melt_total: meltTotal,
        ratio: meltTotal > 0 ? round((total / meltTotal) * 100, 1) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

interface BalanceRow {
  raw_material: string;
  received: number;
  used: number;
  balance: number;
  category: MaterialCategory;
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

/** 單一分類的投料統計表格 */
function ConsumptionTable({ rows, category, total, groups, meltWeight }: {
  rows: ConsumptionRow[];
  category: MaterialCategory;
  total: number;
  /** 回爐料專用：依材質分組的小計 */
  groups?: ReturnGradeGroup[];
  /** 區間總熔湯重(kg)，作為前爐殘湯利用率的分母 */
  meltWeight?: number;
}) {
  const meta = CATEGORY_META[category];
  if (rows.length === 0) {
    return (
      <Card className={`bg-zinc-800 ${meta.border}`}>
        <CardContent className="p-4 text-center text-zinc-400 text-xs">此區間內無{meta.label}投料</CardContent>
      </Card>
    );
  }
  const chargeSum = round(rows.reduce((s, r) => s + r.charge_weight, 0));
  const secondarySum = round(rows.reduce((s, r) => s + r.secondary_weight, 0));
  const ratioLabel = RATIO_LABEL[category];
  const isReturn = category === 'RETURN' && !!groups && groups.length > 0;
  /** 回爐料：各材質溶解投料總重合計 */
  const groupMeltTotal = round((groups || []).reduce((s, g) => s + g.melt_total, 0));
  /** 合計列的比例：外購為 100%，回爐料為舊料投料比例，殘湯為總殘湯率 */
  const totalRatio = category === 'PURCHASED'
    ? 100
    : category === 'RETURN'
      ? (groupMeltTotal > 0 ? round((total / groupMeltTotal) * 100, 1) : 0)
      : ((meltWeight || 0) > 0 ? round((total / (meltWeight || 1)) * 100, 1) : 0);
  /** 合計列的比例分母說明 */
  const totalRatioNote = category === 'PURCHASED'
    ? '占比'
    : category === 'RETURN'
      ? `溶解 ${groupMeltTotal} kg`
      : `總熔湯 ${meltWeight || 0} kg`;
  const renderRow = (r: ConsumptionRow) => (
    <tr key={r.raw_material} className={`text-zinc-300 border-b ${meta.rowBorder}`}>
      <td className="py-2 px-3 font-medium">
        {r.raw_material}
        {category !== 'RETURN' && r.grade && r.grade !== '未分類材質' && (
          <span className="ml-1 text-[10px] text-zinc-500">（{r.grade}）</span>
        )}
      </td>
      <td className="text-right py-2 px-3">{r.charge_weight}</td>
      <td className="text-right py-2 px-3">{r.secondary_weight}</td>
      <td className={`text-right py-2 px-3 font-semibold ${meta.valueText}`}>{r.total}</td>
      <td className="text-right py-2 px-3">{r.melt_count}</td>
      <td className="text-right py-2 px-3">
        <div className="flex items-center justify-end gap-2">
          {category === 'RETURN' && (
            <span className="text-[10px] text-zinc-500">溶解 {r.grade_melt_total} kg</span>
          )}
          <div className="w-16 h-1.5 bg-zinc-700 rounded overflow-hidden">
            <div className={`h-full ${meta.bar}`} style={{ width: `${Math.min(r.ratio, 100)}%` }} />
          </div>
          <span className="w-12 text-right">{r.ratio}%</span>
        </div>
      </td>
    </tr>
  );
  return (
    <div className={`overflow-x-auto border ${meta.border} rounded`}>
      <table className="w-full text-xs">
        <thead>
          <tr className={`${meta.headText} ${meta.headBg} border-b ${meta.border}`}>
            <th className="text-left py-2 px-3">{meta.itemLabel}</th>
            <th className="text-right py-2 px-3">首次投料(kg)</th>
            <th className="text-right py-2 px-3">二次添加(kg)</th>
            <th className="text-right py-2 px-3">合計(kg)</th>
            <th className="text-right py-2 px-3">使用爐次</th>
            <th className="text-right py-2 px-3">{ratioLabel}</th>
          </tr>
        </thead>
        <tbody>
          {isReturn ? (
            (groups || []).map(g => (
              <Fragment key={g.grade}>
                {/* 材質小計列：各種材質回爐料分開統計 */}
                <tr className="text-cyan-200 bg-cyan-950/30 border-b border-cyan-900/40">
                  <td className="py-1.5 px-3 font-semibold">材質：{g.grade}</td>
                  <td className="text-right py-1.5 px-3">{g.charge}</td>
                  <td className="text-right py-1.5 px-3">{g.secondary}</td>
                  <td className="text-right py-1.5 px-3 font-semibold">{g.total}</td>
                  <td className="text-right py-1.5 px-3 text-[10px] text-cyan-200/70">{g.rows.length} 項</td>
                  <td className="text-right py-1.5 px-3">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[10px] text-cyan-200/60">溶解 {g.melt_total} kg</span>
                      <div className="w-16 h-1.5 bg-zinc-700 rounded overflow-hidden">
                        <div className={`h-full ${meta.bar}`} style={{ width: `${Math.min(g.ratio, 100)}%` }} />
                      </div>
                      <span className="w-12 text-right font-semibold">{g.ratio}%</span>
                    </div>
                  </td>
                </tr>
                {g.rows.map(renderRow)}
              </Fragment>
            ))
          ) : (
            rows.map(renderRow)
          )}
          <tr className={`text-zinc-100 font-semibold ${meta.totalBg}`}>
            <td className="py-2 px-3">{meta.label}合計</td>
            <td className="text-right py-2 px-3">{chargeSum}</td>
            <td className="text-right py-2 px-3">{secondarySum}</td>
            <td className={`text-right py-2 px-3 ${meta.valueText}`}>{total}</td>
            <td className="text-right py-2 px-3">-</td>
            <td className="text-right py-2 px-3">
              <div className="flex items-center justify-end gap-2">
                <span className="text-[10px] text-zinc-400">{totalRatioNote}</span>
                <span className={`w-12 text-right ${meta.valueText}`}>{totalRatio}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** 單一分類的入庫／投料結算表格 */
function BalanceTable({ rows, category }: { rows: BalanceRow[]; category: MaterialCategory }) {
  const meta = CATEGORY_META[category];
  if (rows.length === 0) {
    return (
      <Card className={`bg-zinc-800 ${meta.border}`}>
        <CardContent className="p-4 text-center text-zinc-400 text-xs">此日期區間內無{meta.label}資料</CardContent>
      </Card>
    );
  }
  return (
    <div className={`overflow-x-auto border ${meta.border} rounded`}>
      <table className="w-full text-xs">
        <thead>
          <tr className={`${meta.headText} ${meta.headBg} border-b ${meta.border}`}>
            <th className="text-left py-2 px-3">{meta.itemLabel}</th>
            <th className="text-right py-2 px-3">入庫(kg)</th>
            <th className="text-right py-2 px-3">投料(kg)</th>
            <th className="text-right py-2 px-3">差額(kg)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.raw_material} className={`text-zinc-300 border-b ${meta.rowBorder}`}>
              <td className="py-2 px-3 font-medium">{r.raw_material}</td>
              <td className="text-right py-2 px-3 text-emerald-400">{r.received}</td>
              <td className={`text-right py-2 px-3 ${meta.valueText}`}>{r.used}</td>
              <td className={`text-right py-2 px-3 font-semibold ${r.balance < 0 ? 'text-red-400' : 'text-zinc-100'}`}>{r.balance}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  /** 澆注紀錄（含各爐殘湯重量），用於爐次殘湯統計 */
  const [pourRecords, setPourRecords] = useState<MeltingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ReceiptFormState>(() => emptyForm(materialOptions));
  const [tab, setTab] = useState<'consumption' | 'receipts' | 'residual'>('consumption');
  const [materialFilter, setMaterialFilter] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rs, records, mats, pours] = await Promise.all([
        dsGetRawMaterialReceipts(),
        dsGetMeltRecords(),
        dsGetMeltMaterials(),
        dsGetMeltingRecords(),
      ]);
      setReceipts(rs);
      setMeltRecords(records);
      setMeltMaterials(mats);
      setPourRecords(pours);
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

  /** melt_id -> 材質，用於回爐料依材質分開統計 */
  const meltGradeMap = useMemo(() => {
    const map: Record<string, string> = {};
    meltRecords.forEach(r => { map[r.id] = normalizeGrade(r.material_grade); });
    return map;
  }, [meltRecords]);

  /** melt_id -> 投料明細加總重量，作為熔解紀錄總投料缺失時的回退值 */
  const meltChargeTotalMap = useMemo(() => {
    const map: Record<string, number> = {};
    meltMaterials.forEach(m => {
      map[m.melt_id] = (map[m.melt_id] || 0) + (Number(m.charge_weight) || 0) + (Number(m.secondary_weight) || 0);
    });
    return map;
  }, [meltMaterials]);

  /**
   * 各材質「溶解投料總重」：該材質在日期區間內所有爐次的總投料重。
   * 優先取熔解紀錄的 total_charge_weight，無值時以投料明細加總回退。
   */
  const gradeMeltWeight = useMemo(() => {
    const map: Record<string, number> = {};
    meltRecords.forEach(r => {
      if (!inRange(r.melt_date)) return;
      const grade = normalizeGrade(r.material_grade);
      const charge = Number(r.total_charge_weight) || meltChargeTotalMap[r.id] || 0;
      map[grade] = (map[grade] || 0) + charge;
    });
    return map;
  }, [meltRecords, meltChargeTotalMap, inRange]);

  /** 區間總熔湯重：全部爐次總投料重合計，作為前爐殘湯利用率／總殘湯率的分母 */
  const totalMeltWeight = useMemo(
    () => round(Object.values(gradeMeltWeight).reduce((s, v) => s + v, 0)),
    [gradeMeltWeight]
  );

  /**
   * 日期區間內各原料投料統計。
   * 外購原料、回爐料、殘湯三者分開計算，最後一欄比例分母依分類而異：
   * - 外購原料：外購原料合計
   * - 回爐料：該原料所屬材質的溶解投料總重（舊料投料比例）
   * - 殘湯：區間總熔湯重（前爐殘湯利用率）
   */
  const consumptionRows = useMemo<ConsumptionRow[]>(() => {
    const acc = new Map<string, { raw_material: string; charge: number; secondary: number; melts: Set<string>; grade: string }>();
    meltMaterials.forEach(m => {
      const date = meltDateMap[m.melt_id];
      if (!inRange(date)) return;
      const rawMaterial = (m.raw_material || '').trim() || '(未命名)';
      const grade = normalizeGrade(meltGradeMap[m.melt_id]);
      // 回爐料依使用當爐的材質分組，不能沿用同名原料第一筆的材質。
      const key = JSON.stringify([rawMaterial, categorizeMaterial(rawMaterial) === 'RETURN' ? grade : '']);
      let entry = acc.get(key);
      if (!entry) {
        entry = { raw_material: rawMaterial, charge: 0, secondary: 0, melts: new Set(), grade };
        acc.set(key, entry);
      }
      entry.charge += Number(m.charge_weight) || 0;
      entry.secondary += Number(m.secondary_weight) || 0;
      entry.melts.add(m.melt_id);
    });
    const rows: ConsumptionRow[] = [...acc.values()].map(v => ({
      raw_material: v.raw_material,
      charge_weight: round(v.charge),
      secondary_weight: round(v.secondary),
      total: round(v.charge + v.secondary),
      melt_count: v.melts.size,
      ratio: 0,
      category: categorizeMaterial(v.raw_material),
      grade: v.grade,
      grade_melt_total: round(gradeMeltWeight[v.grade] || 0),
    }));
    const sums: Record<MaterialCategory, number> = { PURCHASED: 0, RETURN: 0, RESIDUAL: 0 };
    rows.forEach(r => { sums[r.category] += r.total; });
    rows.forEach(r => {
      let base = sums[r.category];
      if (r.category === 'RETURN') base = r.grade_melt_total;
      if (r.category === 'RESIDUAL') base = totalMeltWeight;
      r.ratio = base > 0 ? round((r.total / base) * 100, 1) : 0;
    });
    return rows.sort((a, b) => b.total - a.total);
  }, [meltMaterials, meltDateMap, inRange, meltGradeMap, gradeMeltWeight, totalMeltWeight]);

  /** 依分類拆分的投料明細 */
  const rowsByCategory = useMemo<Record<MaterialCategory, ConsumptionRow[]>>(() => ({
    PURCHASED: consumptionRows.filter(r => r.category === 'PURCHASED'),
    RETURN: consumptionRows.filter(r => r.category === 'RETURN'),
    RESIDUAL: consumptionRows.filter(r => r.category === 'RESIDUAL'),
  }), [consumptionRows]);

  const purchasedTotal = round(rowsByCategory.PURCHASED.reduce((s, r) => s + r.total, 0));
  const returnTotal = round(rowsByCategory.RETURN.reduce((s, r) => s + r.total, 0));
  const residualTotal = round(rowsByCategory.RESIDUAL.reduce((s, r) => s + r.total, 0));
  const categoryTotals: Record<MaterialCategory, number> = {
    PURCHASED: purchasedTotal,
    RETURN: returnTotal,
    RESIDUAL: residualTotal,
  };
  /** 全部投料（外購 + 回爐料 + 殘湯），用於各分類使用率計算 */
  const totalConsumption = round(purchasedTotal + returnTotal + residualTotal);
  const rateOfTotal = (v: number) => (totalConsumption > 0 ? round((v / totalConsumption) * 100, 1) : 0);
  /** 回爐料使用率（不含殘湯） */
  const returnUsageRate = rateOfTotal(returnTotal);

  /** 回爐料依材質分開統計（各種材質獨立小計與舊料投料比例） */
  const returnGradeGroups = useMemo(
    () => buildReturnGradeGroups(rowsByCategory.RETURN),
    [rowsByCategory.RETURN]
  );
  /** 回爐料各材質溶解投料總重合計（回爐料合計列的比例分母） */
  const returnMeltTotal = round(returnGradeGroups.reduce((s, g) => s + g.melt_total, 0));

  /**
   * 前爐殘湯利用率 = 殘湯投料總重 ÷ 總熔湯重 × 100%
   * 此為「回爐料投料統計」區塊前爐殘湯最後一欄的計算方式。
   */
  const residualUtilizationRate = totalMeltWeight > 0
    ? round((residualTotal / totalMeltWeight) * 100, 1)
    : 0;
  const previousResidualRows = useMemo(
    () => buildPreviousResidualRows(meltRecords, meltMaterials, startDate, endDate),
    [meltRecords, meltMaterials, startDate, endDate]
  );
  const meltResidualRows = useMemo(
    () => buildMeltResidualRows(meltRecords, meltMaterials, startDate, endDate),
    [meltRecords, meltMaterials, startDate, endDate]
  );
  const meltResidualSummary = useMemo(() => summarizeResidual(meltResidualRows), [meltResidualRows]);
  const pourResidualRows = useMemo(
    () => buildPourResidualRows(pourRecords, startDate, endDate),
    [pourRecords, startDate, endDate]
  );

  const rangeReceipts = useMemo(
    () => receipts
      .filter(r => inRange(r.receipt_date))
      .filter(r => !materialFilter || r.raw_material === materialFilter)
      .sort((a, b) => b.receipt_date.localeCompare(a.receipt_date)),
    [receipts, inRange, materialFilter]
  );

  const totalReceiptWeight = round(rangeReceipts.reduce((s, r) => s + (Number(r.weight) || 0), 0));

  /** 區間內各原料的入庫量 vs 投料量結算（依三分類標示） */
  const balanceRows = useMemo<BalanceRow[]>(() => {
    const receiptAcc: Record<string, number> = {};
    receipts.forEach(r => {
      if (!inRange(r.receipt_date)) return;
      const key = (r.raw_material || '').trim() || '(未命名)';
      receiptAcc[key] = (receiptAcc[key] || 0) + (Number(r.weight) || 0);
    });
    const names = new Set<string>([...Object.keys(receiptAcc), ...consumptionRows.map(r => r.raw_material)]);
    return [...names].map(name => {
      const received = round(receiptAcc[name] || 0);
      // 入庫尚無材質欄位，原料結算須累加所有當爐材質的用量，避免只取第一組。
      const used = consumptionRows.filter(r => r.raw_material === name).reduce((sum, r) => sum + r.total, 0);
      return {
        raw_material: name,
        received,
        used: round(used),
        balance: round(received - used),
        category: categorizeMaterial(name),
      };
    }).sort((a, b) => b.received - a.received);
  }, [receipts, consumptionRows, inRange]);

  const balanceByCategory = useMemo<Record<MaterialCategory, BalanceRow[]>>(() => ({
    PURCHASED: balanceRows.filter(r => r.category === 'PURCHASED'),
    RETURN: balanceRows.filter(r => r.category === 'RETURN'),
    RESIDUAL: balanceRows.filter(r => r.category === 'RESIDUAL'),
  }), [balanceRows]);

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
    const isResidual = tab === 'residual';
    const rowCount = isResidual ? meltResidualRows.length + pourResidualRows.length : isConsumption ? consumptionRows.length : rangeReceipts.length;
    if (rowCount === 0) {
      toast({ title: '無資料可匯出', variant: 'destructive' });
      return;
    }
    let headers: string[];
    let body: (string | number)[][];
    if (isResidual) {
      headers = ['統計來源', '日期', '紀錄編號', '爐號', '材質／批次', '比例分母重量(kg)', '本爐殘湯重量(kg)', '殘湯率(%)'];
      body = [
        ...residualExportRows(meltResidualRows, '熔解爐次（分母：總熔湯重）'),
        ...residualExportRows(pourResidualRows, '批次澆注（分母：總出湯重）'),
      ];
    } else if (isConsumption) {
      headers = ['分類', '材質', '原料', '首次投料(kg)', '二次添加(kg)', '合計(kg)', '使用爐次', '比例欄位', '比例(%)', '比例分母(kg)'];
      body = [];
      CATEGORY_ORDER.forEach(cat => {
        const meta = CATEGORY_META[cat];
        const rows = rowsByCategory[cat];
        if (rows.length === 0) return;
        const ratioLabel = RATIO_LABEL[cat];
        rows.forEach(r => {
          const base = cat === 'PURCHASED' ? purchasedTotal : cat === 'RETURN' ? r.grade_melt_total : totalMeltWeight;
          body.push([
            meta.label, r.grade, r.raw_material, r.charge_weight, r.secondary_weight,
            r.total, r.melt_count, ratioLabel, r.ratio, base,
          ]);
        });
        const catBase = cat === 'PURCHASED' ? purchasedTotal : cat === 'RETURN' ? returnMeltTotal : totalMeltWeight;
        const catRatio = cat === 'PURCHASED'
          ? 100
          : catBase > 0 ? round((categoryTotals[cat] / catBase) * 100, 1) : 0;
        body.push([
          meta.label, '全部材質', `${meta.label}合計`,
          round(rows.reduce((s, r) => s + r.charge_weight, 0)),
          round(rows.reduce((s, r) => s + r.secondary_weight, 0)),
          categoryTotals[cat], '', ratioLabel, catRatio, catBase,
        ]);
        // 回爐料另列各材質小計（各種材質分開統計）
        if (cat === 'RETURN') {
          returnGradeGroups.forEach(g => {
            body.push([
              `${meta.label}-材質小計`, g.grade, `${g.grade} 回爐料小計`,
              g.charge, g.secondary, g.total, g.rows.length, ratioLabel, g.ratio, g.melt_total,
            ]);
          });
        }
      });
      body.push(['彙總', '', '全部投料', '', '', totalConsumption, '', '', 100, totalConsumption]);
      body.push(['彙總', '', '總熔湯重', '', '', totalMeltWeight, '', '分母', '', totalMeltWeight]);
      body.push(['彙總', '', '前爐殘湯利用率(%)', '', '', residualTotal, '', '前爐殘湯利用率', residualUtilizationRate, totalMeltWeight]);
      body.push(['彙總', '', '回爐料使用率(%)', '', '', returnTotal, '', '占全部投料', returnUsageRate, totalConsumption]);
    } else {
      headers = ['入庫單號', '入庫日期', '原料', '重量(kg)', '單價', '金額', '供應商', '批號', '成分規格', '登錄人', '備註'];
      body = rangeReceipts.map(r => [
        r.receipt_no, r.receipt_date, r.raw_material, r.weight, r.unit_price,
        round(r.weight * r.unit_price), r.supplier, r.lot_no,
        SPEC_ELEMENTS.filter(el => r.spec?.[el] !== undefined).map(el => `${el}:${r.spec[el]}`).join(' '),
        r.created_by, r.remark,
      ]);
    }
    const csvCell = (value: string | number) => '"' + String(value).replaceAll('"', '""') + '"';
    const csv = '\uFEFF' + [headers, ...body].map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${isResidual ? '爐次殘湯統計' : isConsumption ? '原料投料統計' : '原料入庫紀錄'}_${startDate}_${endDate}.csv`;
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
                    <Label htmlFor="inventory-start" className="text-zinc-400 text-xs">開始日期</Label>
                    <Input id="inventory-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      className="bg-zinc-900 border-zinc-700 text-zinc-100 h-9" />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="inventory-end" className="text-zinc-400 text-xs">結束日期</Label>
                    <Input id="inventory-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
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

            {tab !== 'residual' && <div data-testid="inventory-summary" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">總投料</p>
                  <p className="text-lg font-bold text-zinc-100">{round(purchasedTotal + returnTotal)} kg</p>
                  <p className="text-[10px] text-zinc-400">外購＋回爐料（不含前爐殘湯）</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">外購投料</p>
                  <p className="text-lg font-bold text-amber-400">{purchasedTotal} kg</p>
                  <p className="text-[10px] text-zinc-500">占比 {rateOfTotal(purchasedTotal)}%</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-cyan-900/50">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">回爐料投料</p>
                  <p className="text-lg font-bold text-cyan-300">{returnTotal} kg</p>
                  <p className="text-[10px] text-zinc-500">舊料投料比例 {returnMeltTotal > 0 ? round((returnTotal / returnMeltTotal) * 100, 1) : 0}%（分母：各材質溶解投料 {returnMeltTotal} kg）</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-violet-900/50">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">前爐殘湯投料</p>
                  <p className="text-lg font-bold text-violet-300">{residualTotal} kg</p>
                  <p className="text-[10px] text-zinc-500">前爐殘湯利用率 {residualUtilizationRate}%（分母：總熔湯重 {totalMeltWeight} kg）</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-violet-900/50">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">爐次澆注殘湯</p>
                  <p className="text-lg font-bold text-violet-300">{meltResidualSummary.residualWeight} kg</p>
                  <p className="text-[10px] text-zinc-400">殘湯率 {meltResidualSummary.rate}%（分母：總投料重 {meltResidualSummary.baseWeight} kg）</p>
                  <p className="text-[10px] text-zinc-400">本爐產生，不含前爐投料</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-3">
                  <p className="text-xs text-zinc-400">原料入庫總量</p>
                  <p className="text-lg font-bold text-emerald-400">{totalReceiptWeight} kg</p>
                </CardContent>
              </Card>
            </div>}

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
                <Button onClick={() => setTab('residual')}
                  className={tab === 'residual'
                    ? 'bg-violet-500 hover:bg-violet-600 text-white h-8 text-xs'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 h-8 text-xs'}>
                  <Flame className="w-3.5 h-3.5 mr-1" />爐次殘湯
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
                    {/* 三分類分開統計：外購原料／回爐料／殘湯，各自獨立占比分母 */}
                    {CATEGORY_ORDER.map(cat => {
                      if (cat === 'RESIDUAL') return <ResidualStatistics key={cat} rows={previousResidualRows} source="previous" />;
                      const meta = CATEGORY_META[cat];
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1">
                            <p className={`text-xs font-medium ${meta.titleText}`}>
                              {meta.label}投料統計
                              {cat === 'PURCHASED' && `（${startDate} ~ ${endDate}）`}
                              {cat === 'RETURN' && '（依當爐材質分組，各自獨立計算）'}
                            </p>
                            <span className="text-[11px] text-zinc-500">
                              {cat === 'PURCHASED' && '占比分母：外購原料合計'}
                              {cat === 'RETURN' && '舊料投料比例分母：各材質溶解投料總重'}
                            </span>
                          </div>
                          <ConsumptionTable
                            rows={rowsByCategory[cat]}
                            category={cat}
                            total={categoryTotals[cat]}
                            groups={cat === 'RETURN' ? returnGradeGroups : undefined}
                            meltWeight={totalMeltWeight}
                          />
                          <p className="text-[11px] text-zinc-500 mt-1">{meta.note}</p>
                        </div>
                      );
                    })}

                    {/* 本爐產生的殘湯獨立列示，不計入投料分類合計。 */}
                    <ResidualStatistics rows={meltResidualRows} source="melt" />

                    {/* 三分類彙總對照 */}
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
                          {CATEGORY_ORDER.map(cat => {
                            const meta = CATEGORY_META[cat];
                            return (
                              <tr key={cat} className="text-zinc-300 border-b border-zinc-700/50">
                                <td className="py-2 px-3 font-medium">{meta.label}</td>
                                <td className={`text-right py-2 px-3 font-semibold ${meta.valueText}`}>{categoryTotals[cat]}</td>
                                <td className="text-right py-2 px-3">{rowsByCategory[cat].length}</td>
                                <td className="text-right py-2 px-3">{rateOfTotal(categoryTotals[cat])}%</td>
                              </tr>
                            );
                          })}
                          <tr className="text-zinc-100 font-semibold bg-zinc-800">
                            <td className="py-2 px-3">全部投料</td>
                            <td className="text-right py-2 px-3">{totalConsumption}</td>
                            <td className="text-right py-2 px-3">{consumptionRows.length}</td>
                            <td className="text-right py-2 px-3">100%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      殘湯為液態剩湯，已獨立於回爐料另外計算；回爐料僅含澆道、冒口等固態自產循環料。
                    </p>
                  </>
                )}

                {consumptionRows.length === 0 && <>
                  <ResidualStatistics rows={previousResidualRows} source="previous" />
                  <ResidualStatistics rows={meltResidualRows} source="melt" />
                </>}

                <div className="space-y-3">
                  {CATEGORY_ORDER.map(cat => {
                    const meta = CATEGORY_META[cat];
                    return (
                      <div key={cat}>
                        <p className={`text-xs font-medium ${meta.titleText} mb-1`}>
                          {meta.label}入庫／投料結算（區間內{cat === 'PURCHASED' ? '' : '，獨立計算'}）
                        </p>
                        <BalanceTable rows={balanceByCategory[cat]} category={cat} />
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-zinc-500">
                    差額為負值表示區間內投料量大於入庫量（使用了先前庫存）；回爐料與殘湯多為廠內自產，通常無入庫紀錄故差額為負屬正常。
                  </p>
                </div>
              </div>
            ) : tab === 'residual' ? (
              <div className="space-y-4">
                <ResidualStatistics rows={meltResidualRows} source="melt" />
                <ResidualStatistics rows={pourResidualRows} source="pour" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Select value={materialFilter || 'all'} onValueChange={v => setMaterialFilter(v === 'all' ? '' : v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 w-44 h-8 text-xs">
                      <SelectValue placeholder="原料篩選" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 max-h-64">
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
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">
                                  {CATEGORY_META[categorizeMaterial(r.raw_material)].label}
                                </span>
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
                  <SelectContent className="bg-zinc-800 border-zinc-700 max-h-64">
                    {materialSelectOptions.map(m => (
                      <SelectItem key={m} value={m} className="text-zinc-100">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.raw_material && (
                  <p className="text-[10px] text-zinc-500 mt-1">
                    分類：{CATEGORY_META[categorizeMaterial(form.raw_material)].label}
                  </p>
                )}
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
