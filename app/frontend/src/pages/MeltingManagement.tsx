import { useState, useEffect, useMemo } from 'react';
import { calculateSequences, compareMelts, formatHeat, furnaceBody, loadSequenceRecords, saveSequenceRecord } from '@/lib/meltSequence';
import { useSyncTrigger } from '@/hooks/useSyncedData';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { MeltRecord, MeltMaterial, MeltChemistry, SampleStage, MoldingBatch, WorkOrder } from '@/lib/types';
import {
  dsGetMeltRecords, dsCreateMeltRecord, dsUpdateMeltRecord, dsDeleteMeltRecord,
  dsGetMeltMaterials, dsCreateMeltMaterial, dsDeleteMeltMaterial,
  dsGetMeltChemistry, dsCreateMeltChemistry, dsDeleteMeltChemistry,
  dsRecalcMeltRecord, dsGetMeltTargetRange, dsSaveMeltTargetRange, dsDeleteMeltTargetRange,
  dsGetMoldingBatches, dsGetWorkOrders,
  dsGetMeltPourings, dsCreateMeltPouring, dsUpdateMeltPouring, dsDeleteMeltPouring,
  dsGetMeltPresetRecipes, dsCreateMeltPresetRecipe, dsUpdateMeltPresetRecipe, dsDeleteMeltPresetRecipe,
  dsGetMeltMaterialSpecs, dsCreateMeltMaterialSpec, dsUpdateMeltMaterialSpec, dsDeleteMeltMaterialSpec,
  dsGetMeltMaterialOptions, dsCreateMeltMaterialOption, dsDeleteMeltMaterialOption,
} from '@/lib/dataService';
import type { MeltMaterialSpec, MeltPresetRecipe, MeltMaterialOption } from '@/lib/supabaseStore';
import { beginEditTransaction, endEditTransaction } from '@/lib/store';

// Alias ds* functions to legacy names used throughout this file (sync-compatible wrappers)
const getMeltRecords = dsGetMeltRecords as unknown as (...args: Parameters<typeof dsGetMeltRecords>) => Awaited<ReturnType<typeof dsGetMeltRecords>>;
const createMeltRecord = dsCreateMeltRecord as unknown as (...args: Parameters<typeof dsCreateMeltRecord>) => Awaited<ReturnType<typeof dsCreateMeltRecord>>;
const updateMeltRecord = dsUpdateMeltRecord as unknown as (...args: Parameters<typeof dsUpdateMeltRecord>) => Awaited<ReturnType<typeof dsUpdateMeltRecord>>;
const deleteMeltRecord = dsDeleteMeltRecord as unknown as (...args: Parameters<typeof dsDeleteMeltRecord>) => Awaited<ReturnType<typeof dsDeleteMeltRecord>>;
const getMeltMaterials = dsGetMeltMaterials as unknown as (...args: Parameters<typeof dsGetMeltMaterials>) => Awaited<ReturnType<typeof dsGetMeltMaterials>>;
const createMeltMaterial = dsCreateMeltMaterial as unknown as (...args: Parameters<typeof dsCreateMeltMaterial>) => Awaited<ReturnType<typeof dsCreateMeltMaterial>>;
const deleteMeltMaterial = dsDeleteMeltMaterial as unknown as (...args: Parameters<typeof dsDeleteMeltMaterial>) => Awaited<ReturnType<typeof dsDeleteMeltMaterial>>;
const getMeltChemistry = dsGetMeltChemistry as unknown as (...args: Parameters<typeof dsGetMeltChemistry>) => Awaited<ReturnType<typeof dsGetMeltChemistry>>;
const createMeltChemistry = dsCreateMeltChemistry as unknown as (...args: Parameters<typeof dsCreateMeltChemistry>) => Awaited<ReturnType<typeof dsCreateMeltChemistry>>;
const deleteMeltChemistry = dsDeleteMeltChemistry as unknown as (...args: Parameters<typeof dsDeleteMeltChemistry>) => Awaited<ReturnType<typeof dsDeleteMeltChemistry>>;
const recalcMeltRecord = dsRecalcMeltRecord as unknown as (...args: Parameters<typeof dsRecalcMeltRecord>) => Awaited<ReturnType<typeof dsRecalcMeltRecord>>;
const getMeltTargetRange = dsGetMeltTargetRange as unknown as (...args: Parameters<typeof dsGetMeltTargetRange>) => Awaited<ReturnType<typeof dsGetMeltTargetRange>>;
const saveMeltTargetRange = dsSaveMeltTargetRange as unknown as (...args: Parameters<typeof dsSaveMeltTargetRange>) => Awaited<ReturnType<typeof dsSaveMeltTargetRange>>;
const deleteMeltTargetRange = dsDeleteMeltTargetRange as unknown as (...args: Parameters<typeof dsDeleteMeltTargetRange>) => Awaited<ReturnType<typeof dsDeleteMeltTargetRange>>;
const getMoldingBatches = dsGetMoldingBatches as unknown as (...args: Parameters<typeof dsGetMoldingBatches>) => Awaited<ReturnType<typeof dsGetMoldingBatches>>;
const getWorkOrders = dsGetWorkOrders as unknown as (...args: Parameters<typeof dsGetWorkOrders>) => Awaited<ReturnType<typeof dsGetWorkOrders>>;
import { Plus, Flame, Pencil, Trash2, FlaskConical, Layers, Zap, Clock, Thermometer, ChevronDown, ChevronUp, Copy, Search, Download, FileText, Package, Settings, Warehouse, Droplets, Gauge } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import InventoryManager from '@/components/melting/InventoryManager';
import EnergyBaseline from '@/components/melting/EnergyBaseline';

const SAMPLE_STAGE_LABELS: Record<SampleStage, string> = {
  TARGET: '目標',
  IN_FURNACE: '爐中',
  AFTER_FURNACE: '爐後',
};

const CHEMISTRY_ELEMENTS = ['C', 'Si', 'Mn', 'P', 'S', 'Ni', 'Cr', 'Mo', 'Cu', 'Fe'] as const;

/** 重量統一取小數 3 位，避免浮點累加產生 0.30000000000000004 之類的殘差 */
const roundWeight = (value: number): number => Math.round((Number(value) || 0) * 1000) / 1000;

/**
 * 自動合併投料明細中的重複原料。
 *
 * 同名原料（去除前後空白後比對）只保留第一次出現的位置，
 * 後續同名項目的首次投料與二次添加重量累加至該筆，並回報被合併的原料名稱。
 */
function mergeDuplicateMaterials<T extends { raw_material: string; charge_weight: number; secondary_weight: number }>(
  rows: T[],
): { merged: T[]; mergedNames: string[] } {
  const indexByName = new Map<string, number>();
  const merged: T[] = [];
  const mergedNames: string[] = [];

  rows.forEach(row => {
    const name = (row.raw_material || '').trim();
    if (!name) return;
    const existingIdx = indexByName.get(name);
    if (existingIdx === undefined) {
      indexByName.set(name, merged.length);
      merged.push({
        ...row,
        raw_material: name,
        charge_weight: roundWeight(row.charge_weight),
        secondary_weight: roundWeight(row.secondary_weight),
      });
      return;
    }
    const target = merged[existingIdx];
    merged[existingIdx] = {
      ...target,
      charge_weight: roundWeight(target.charge_weight + (Number(row.charge_weight) || 0)),
      secondary_weight: roundWeight(target.secondary_weight + (Number(row.secondary_weight) || 0)),
    };
    if (!mergedNames.includes(name)) mergedNames.push(name);
  });

  return { merged, mergedNames };
}

// 原料下拉清單已改為持久化主檔（雲端表 melt_material_options）：
// 使用者自行輸入的新原料會自動記錄，下次免重新輸入；不再使用硬編碼清單。
// 初始預設項目由 dataService 於首次讀取時自動補進雲端表。

const FURNACE_OPTIONS = ['1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4', '3-1', '3-2', '3-3', '3-4', '3-5'];

/**
 * 可搜尋的原料選擇器（Popover + Command）。
 * - 支援關鍵字搜尋與自行輸入新原料：輸入後按「新增」即自動寫入原料主檔，下次免重新輸入。
 * - 每個選項右側提供刪除鈕，可移除不再使用的原料（僅移除主檔項目，不影響既有投料紀錄）。
 */
function MaterialCombobox({
  value, onChange, options, placeholder = '選擇或搜尋原料', className = '', onCreate, onDelete, usedOptions = [], testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  onCreate?: (name: string) => void;
  onDelete?: (name: string) => void;
  /** 已存在於目前清單的原料名稱：下拉中標示「已加入」，再次選取時由呼叫端自動合併重量 */
  usedOptions?: string[];
  /** 供自動化回歸腳本穩定定位觸發按鈕 */
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const trimmed = keyword.trim();
  const canCreate = trimmed.length > 0 && !options.some(o => o === trimmed);

  const select = (v: string) => {
    onChange(v);
    // 自行輸入的新原料自動記錄至原料主檔，下次開啟即可直接選取
    if (!options.some(o => o === v)) onCreate?.(v);
    setKeyword('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          data-testid={testId}
          aria-expanded={open}
          className={`w-full justify-between bg-zinc-700 border-zinc-600 !bg-zinc-700 hover:!bg-zinc-600 text-zinc-100 font-normal ${className}`}
        >
          <span className={value ? 'truncate' : 'truncate text-zinc-400'}>{value || placeholder}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={12}
        className="p-0 bg-zinc-800 border-zinc-600 w-[--radix-popover-trigger-width] min-w-[220px]"
      >
        <Command className="bg-zinc-800">
          <CommandInput
            value={keyword}
            onValueChange={setKeyword}
            placeholder="輸入關鍵字搜尋或新增"
            className="text-zinc-100 h-9"
          />
          <CommandList className="max-h-[240px] overflow-y-auto">
            <CommandEmpty className="py-3 text-xs text-zinc-400 text-center">
              無相符原料，可直接使用下方新增
            </CommandEmpty>
            <CommandGroup>
              {options.map(m => {
                const used = usedOptions.includes(m);
                return (
                <CommandItem
                  key={m}
                  value={m}
                  onSelect={() => select(m)}
                  className="text-zinc-100 text-xs aria-selected:bg-zinc-700 gap-2"
                >
                  <span className="truncate">{m}</span>
                  {used && <span className="ml-auto shrink-0 text-[10px] text-amber-400">已加入·將合併</span>}
                  {onDelete && !used && (
                    <button
                      type="button"
                      title={`刪除原料「${m}」`}
                      aria-label={`刪除原料「${m}」`}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(m);
                        setOpen(true);
                      }}
                      className="ml-auto shrink-0 rounded p-0.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </CommandItem>
                );
              })}
              {canCreate && (
                <CommandItem
                  value={`__create__${trimmed}`}
                  onSelect={() => select(trimmed)}
                  className="text-amber-400 text-xs aria-selected:bg-zinc-700"
                >
                  <Plus className="w-3 h-3 mr-1" />新增「{trimmed}」
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// === Preset Recipe Types & Cloud Storage ===
// 預設配比改由雲端資料層存取以支援跨裝置同步；
// 離線或權限受限時 dataService 會自動退回本地暫存並排入待同步佇列，連線恢復後自動補傳。
type PresetRecipe = MeltPresetRecipe;
type PresetMaterialRow = { raw_material: string; charge_weight: number; secondary_weight: number };

async function getPresetRecipes(): Promise<PresetRecipe[]> {
  try {
    return await dsGetMeltPresetRecipes();
  } catch (err: unknown) {
    console.error('[PresetRecipe] load failed:', err);
    return [];
  }
}

async function createPresetRecipe(name: string, materials: PresetMaterialRow[]): Promise<PresetRecipe> {
  return dsCreateMeltPresetRecipe({ name, materials });
}

async function updatePresetRecipeMaterials(id: string, materials: PresetMaterialRow[]): Promise<PresetRecipe | null> {
  return dsUpdateMeltPresetRecipe(id, { materials });
}

async function deletePresetRecipe(id: string): Promise<boolean> {
  return dsDeleteMeltPresetRecipe(id);
}

// === Material Spec (材質規範) Types & Storage ===
// 每個材質規範保存各元素的成分範圍（min/max），新增熔解批次選擇材質後自動代入「目標」列
type MaterialSpec = MeltMaterialSpec;

const SPEC_ELEMENTS = ['C', 'Si', 'Mn', 'P', 'S', 'Ni', 'Cr', 'Mo', 'Cu'] as const;

// 材質下拉選單中「新增材質規範」的特殊選項值
const ADD_SPEC_OPTION = '__add_material_spec__';

function emptySpecRanges(): Record<string, number> {
  const ranges: Record<string, number> = {};
  SPEC_ELEMENTS.forEach(el => { ranges[`${el}_min`] = 0; ranges[`${el}_max`] = 0; });
  return ranges;
}

// 材質規範改由雲端資料層存取以支援跨裝置同步；
// 離線或權限受限時 dataService 會自動退回本地暫存並排入待同步佇列，連線恢復後自動補傳。
async function getMaterialSpecs(): Promise<MaterialSpec[]> {
  try {
    return await dsGetMeltMaterialSpecs();
  } catch (err: unknown) {
    console.error('[MaterialSpec] load failed:', err);
    return [];
  }
}

async function createMaterialSpec(name: string, ranges: Record<string, number>, remark: string): Promise<MaterialSpec> {
  return dsCreateMeltMaterialSpec({ name, ranges: { ...emptySpecRanges(), ...ranges }, remark });
}

async function updateMaterialSpec(
  id: string,
  patch: { name?: string; ranges?: Record<string, number>; remark?: string }
): Promise<MaterialSpec | null> {
  return dsUpdateMeltMaterialSpec(id, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.remark !== undefined ? { remark: patch.remark } : {}),
    ...(patch.ranges !== undefined ? { ranges: { ...emptySpecRanges(), ...patch.ranges } } : {}),
  });
}

async function deleteMaterialSpec(id: string): Promise<boolean> {
  return dsDeleteMeltMaterialSpec(id);
}

// === Material Options (投料原料主檔) ===
// 原料下拉清單改由雲端主檔提供：使用者自行輸入的新原料會自動記錄，
// 下次（含其他裝置）開啟下拉即可直接選取；項目亦可刪除（僅移除主檔，不影響既有投料紀錄）。
async function getMaterialOptions(): Promise<MeltMaterialOption[]> {
  try {
    return await dsGetMeltMaterialOptions();
  } catch (err: unknown) {
    console.error('[MaterialOption] load failed:', err);
    return [];
  }
}

function formatSpecRange(ranges: Record<string, number>, el: string): string {
  const min = ranges[`${el}_min`] || 0;
  const max = ranges[`${el}_max`] || 0;
  if (min <= 0 && max <= 0) return '-';
  if (min > 0 && max > 0) return `${min} ~ ${max}`;
  return min > 0 ? `≥ ${min}` : `≤ ${max}`;
}

export default function MeltingManagement() {
  const [records, setRecords] = useState<MeltRecord[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MeltRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 每次儲存／刪除後遞增，強制清單卡片重新載入投料與成份明細，
  // 避免編輯時刪除的投料仍以舊資料顯示（畫面亂跳／資料復活）。
  const [detailVersion, setDetailVersion] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterFurnace, setFilterFurnace] = useState('');
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [showSpecManager, setShowSpecManager] = useState(false);
  const [showInventoryManager, setShowInventoryManager] = useState(false);
  const [showEnergyBaseline, setShowEnergyBaseline] = useState(false);
  const [materialSpecs, setMaterialSpecs] = useState<MaterialSpec[]>([]);
  const [materialOptions, setMaterialOptions] = useState<MeltMaterialOption[]>([]);
  const { toast } = useToast();

  const syncTrigger = useSyncTrigger();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 熔解紀錄、材質規範與原料主檔一併由雲端載入，syncTrigger 變動時自動重新拉取
      const [data, specs, options] = await Promise.all([
        getMeltRecords(), getMaterialSpecs(), getMaterialOptions(),
      ]);
      if (!cancelled) { setRecords(data); setMaterialSpecs(specs); setMaterialOptions(options); }
    })();
    return () => { cancelled = true; };
  }, [syncTrigger]);

  const refreshRecords = async () => {
    setRecords(await getMeltRecords());
    // 父紀錄重載後同步遞增版本，讓卡片明細重新向資料層取最新結果
    setDetailVersion(v => v + 1);
  };

  // 原料下拉清單（主檔名稱）
  const materialOptionNames = [...new Set(materialOptions.map(o => o.name))].filter(Boolean);

  /** 使用者自行輸入新原料時自動寫入主檔，下次開啟下拉即可直接選取 */
  const handleCreateMaterialOption = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || materialOptionNames.includes(trimmed)) return;
    try {
      const created = await dsCreateMeltMaterialOption(trimmed);
      setMaterialOptions(prev => (prev.some(o => o.name === created.name) ? prev : [...prev, created]));
      toast({ title: `已新增原料「${created.name}」`, description: '下次可直接從清單選取' });
    } catch (err: unknown) {
      console.error('[MaterialOption] create failed:', err);
      toast({
        title: '原料已填入，但記錄失敗',
        description: '連線恢復後將自動同步至雲端',
        variant: 'destructive',
      });
    }
  };

  /** 刪除原料主檔項目（僅移除選單項目，不影響既有投料紀錄） */
  const handleDeleteMaterialOption = async (name: string) => {
    const target = materialOptions.find(o => o.name === name);
    if (!target) return;
    if (!window.confirm(`確定要從原料清單刪除「${name}」嗎？\n既有投料紀錄不會受影響。`)) return;
    try {
      await dsDeleteMeltMaterialOption(target.id);
      setMaterialOptions(prev => prev.filter(o => o.id !== target.id));
      toast({ title: `已刪除原料「${name}」` });
    } catch (err: unknown) {
      console.error('[MaterialOption] delete failed:', err);
      toast({ title: '刪除失敗，請稍後再試', variant: 'destructive' });
    }
  };

  const handleDelete = async (record: MeltRecord) => {
    if (!window.confirm(`確定要刪除熔解紀錄 ${record.melt_no} 嗎？`)) return;
    try {
      await deleteMeltRecord(record.id);
      await refreshRecords();
      toast({ title: '熔解紀錄已刪除' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MeltingManagement] Delete failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，刪除失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('foreign') || msg.includes('constraint')) {
        toast({ title: '此熔解紀錄有關聯資料，無法刪除', variant: 'destructive' });
      } else {
        toast({ title: '刪除失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  const handleCopyLast = async () => {
    const sorted = [...records].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (sorted.length === 0) {
      toast({ title: '無可複製的紀錄', variant: 'destructive' });
      return;
    }
    const last = sorted[0];
    try {
      const newRecord = await createMeltRecord({
        melt_date: new Date().toISOString().slice(0, 10),
        material_grade: last.material_grade,
        furnace_no: last.furnace_no,
        power_kwh: last.power_kwh,
        power_start_time: '',
        tap_time: '',
        tap_temp: last.tap_temp,
        created_by: last.created_by,
        remark: `複製自 ${last.melt_no}`,
        residual_weight: 0,
      });
      const lastMaterials = await getMeltMaterials(last.id);
      for (const m of lastMaterials) {
        await createMeltMaterial({ melt_id: newRecord.id, raw_material: m.raw_material, charge_weight: m.charge_weight, secondary_weight: m.secondary_weight });
      }
      const lastChemistry = await getMeltChemistry(last.id);
      for (const c of lastChemistry) {
        await createMeltChemistry({ melt_id: newRecord.id, sample_stage: c.sample_stage, C: c.C, Si: c.Si, Mn: c.Mn, P: c.P, S: c.S, Ni: c.Ni, Cr: c.Cr, Mo: c.Mo, Cu: c.Cu, Fe: c.Fe });
      }
      await refreshRecords();
      toast({ title: `已複製上一爐 ${last.melt_no} 的資料` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MeltingManagement] CopyLast failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，複製失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '複製失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  const handleExport = () => {
    if (filteredRecords.length === 0) {
      toast({ title: '無資料可匯出', variant: 'destructive' });
      return;
    }
    const headers = ['熔解編號', '日期', '材質', '爐號', '開始送電', '出湯時間', '熔解時間(分)', '耗電(kWh)', '總投料(kg)', '殘湯(kg)', '能耗(kWh/kg)', '出爐溫度(℃)', '建立人', '備註'];
    const rows = filteredRecords.map(r => [
      r.melt_no, r.melt_date, r.material_grade, r.furnace_no,
      r.power_start_time, r.tap_time, r.melt_minutes,
      r.power_kwh, r.total_charge_weight, r.residual_weight || 0, r.specific_energy,
      r.tap_temp, r.created_by, r.remark,
    ]);
    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `熔解紀錄_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Excel 匯出完成' });
  };

  const handlePrint = () => { window.print(); };

  const filteredRecords = records.filter(r => {
    const matchSearch = !searchQuery || r.melt_no.includes(searchQuery) || r.material_grade.includes(searchQuery) || r.furnace_no.includes(searchQuery) || r.created_by.includes(searchQuery);
    const matchMaterial = !filterMaterial || r.material_grade === filterMaterial;
    const matchFurnace = !filterFurnace || r.furnace_no === filterFurnace;
    return matchSearch && matchMaterial && matchFurnace;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));

  const uniqueMaterials = [...new Set(records.map(r => r.material_grade))].filter(Boolean);
  const uniqueFurnaces = [...new Set(records.map(r => r.furnace_no))].filter(Boolean);

  return (
    <AppLayout>
      <div className="space-y-4 print:space-y-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">熔解管理</h1>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowPresetManager(true)} variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 text-xs h-8">
              <Settings className="w-3.5 h-3.5 mr-1" />預設配比
            </Button>
            <Button onClick={() => setShowSpecManager(true)} variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 text-xs h-8">
              <FlaskConical className="w-3.5 h-3.5 mr-1" />材質規範
            </Button>
            <Button onClick={() => setShowEnergyBaseline(true)} variant="outline" className="border-sky-600/60 text-sky-300 hover:bg-sky-900/30 text-xs h-8">
              <Gauge className="w-3.5 h-3.5 mr-1" />能耗基線
            </Button>
            <Button onClick={() => setShowInventoryManager(true)} variant="outline" className="border-emerald-600/60 text-emerald-300 hover:bg-emerald-900/30 text-xs h-8">
              <Warehouse className="w-3.5 h-3.5 mr-1" />庫存管理
            </Button>
            <Button onClick={handleCopyLast} variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 text-xs h-8">
              <Copy className="w-3.5 h-3.5 mr-1" />複製上一爐
            </Button>
            <Button onClick={handleExport} variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 text-xs h-8">
              <Download className="w-3.5 h-3.5 mr-1" />Excel匯出
            </Button>
            <Button onClick={handlePrint} variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 text-xs h-8">
              <FileText className="w-3.5 h-3.5 mr-1" />列印
            </Button>
            <Button onClick={() => { setEditingRecord(null); setIsFormOpen(true); }} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 text-xs h-8">
              <Plus className="w-3.5 h-3.5 mr-1" />新增熔解批次
            </Button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-2 print:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 w-4 h-4 text-zinc-500" />
            <Input data-testid="melt-search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜尋編號、材質、爐號、建立人..." className="bg-zinc-800 border-zinc-700 text-zinc-100 pl-9 h-9" />
          </div>
          <Select value={filterMaterial} onValueChange={v => setFilterMaterial(v === 'all' ? '' : v)}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 w-full sm:w-36 h-9">
              <SelectValue placeholder="材質篩選" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="all" className="text-zinc-100">全部材質</SelectItem>
              {uniqueMaterials.map(m => (<SelectItem key={m} value={m} className="text-zinc-100">{m}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={filterFurnace} onValueChange={v => setFilterFurnace(v === 'all' ? '' : v)}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 w-full sm:w-32 h-9">
              <SelectValue placeholder="爐號篩選" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="all" className="text-zinc-100">全部爐號</SelectItem>
              {uniqueFurnaces.map(f => (<SelectItem key={f} value={f} className="text-zinc-100">{f}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-zinc-500">共 {filteredRecords.length} 筆紀錄</p>

        {/* Records List */}
        <div className="space-y-3" data-testid="melt-list">
          {filteredRecords.length === 0 ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardContent className="p-8 text-center text-zinc-400">
                {records.length === 0 ? '尚無熔解紀錄，點擊「新增熔解」開始記錄' : '無符合條件的紀錄'}
              </CardContent>
            </Card>
          ) : (
            filteredRecords.map(record => (
              <MeltRecordCard
                key={record.id}
                record={record}
                expanded={expandedId === record.id}
                detailVersion={detailVersion}
                onToggle={() => setExpandedId(expandedId === record.id ? null : record.id)}
                onEdit={() => { setEditingRecord(record); setIsFormOpen(true); }}
                onDelete={() => handleDelete(record)}
              />
            ))
          )}
        </div>

        {/* Single Page Form Dialog */}
        <MeltFormDialog
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          editRecord={editingRecord}
          onSaved={() => { refreshRecords(); }}
          onSavedAndNew={() => { refreshRecords(); setEditingRecord(null); }}
          existingMaterials={uniqueMaterials}
          materialSpecs={materialSpecs}
          materialOptionNames={materialOptionNames}
          onCreateMaterialOption={handleCreateMaterialOption}
          onDeleteMaterialOption={handleDeleteMaterialOption}
          onRequestAddSpec={() => setShowSpecManager(true)}
        />

        {/* Preset Recipe Manager Dialog */}
        <PresetRecipeManager
          open={showPresetManager}
          onOpenChange={setShowPresetManager}
          materialOptionNames={materialOptionNames}
          onCreateMaterialOption={handleCreateMaterialOption}
          onDeleteMaterialOption={handleDeleteMaterialOption}
        />

        {/* Material Spec Manager Dialog */}
        <MaterialSpecManager
          open={showSpecManager}
          onOpenChange={setShowSpecManager}
          onChanged={async () => setMaterialSpecs(await getMaterialSpecs())}
        />

        {/* Energy Baseline Dialog */}
        <Dialog open={showEnergyBaseline} onOpenChange={setShowEnergyBaseline}>
          <DialogContent className="bg-zinc-900 border-zinc-700 max-w-5xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-zinc-100 flex items-center gap-2">
                <Gauge className="w-5 h-5 text-sky-400" />
                能耗基線
              </DialogTitle>
            </DialogHeader>
            <EnergyBaseline records={filteredRecords} detailVersion={detailVersion} />
          </DialogContent>
        </Dialog>

        {/* Raw Material Inventory Manager Dialog */}
        <InventoryManager
          open={showInventoryManager}
          onOpenChange={setShowInventoryManager}
          materialOptions={[...new Set([...materialOptionNames, ...uniqueMaterials])]}
          syncTrigger={syncTrigger}
        />
      </div>
    </AppLayout>
  );
}

// Helper: format minutes to HH:mm
function formatMeltMinutes(minutes: number): string {
  if (minutes <= 0) return '0:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

// === Record Card (list view) ===
function MeltRecordCard({ record, expanded, detailVersion, onToggle, onEdit, onDelete }: {
  record: MeltRecord; expanded: boolean; detailVersion: number; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [materials, setMaterials] = useState<MeltMaterial[]>([]);
  const [chemistry, setChemistry] = useState<MeltChemistry[]>([]);
  const [targetRangeData, setTargetRangeData] = useState<Record<string, number> | null>(null);
  const [cardBatches, setCardBatches] = useState<MoldingBatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mats, chem] = await Promise.all([getMeltMaterials(record.id), getMeltChemistry(record.id)]);
      if (!cancelled) { setMaterials(mats); setChemistry(chem); }
    })();
    return () => { cancelled = true; };
    // detailVersion 於每次儲存後遞增，確保編輯刪除明細後卡片不會再顯示舊資料
  }, [record.id, detailVersion]);

  // 總投料／能耗一律由投料明細即時推導，避免歷史紀錄殘留的舊值與明細小計不一致
  const derivedTotalCharge = materials.reduce(
    (sum, m) => sum + (Number(m.charge_weight) || 0) + (Number(m.secondary_weight) || 0), 0,
  );
  const derivedSpecificEnergy = derivedTotalCharge > 0
    ? Number(((Number(record.power_kwh) || 0) / derivedTotalCharge).toFixed(3))
    : 0;

  // 偵測到卡片值與明細不符時，靜默重算修正資料來源（本機＋雲端）
  useEffect(() => {
    if (materials.length === 0) return;
    const stale = Math.abs((Number(record.total_charge_weight) || 0) - derivedTotalCharge) > 0.001;
    if (!stale) return;
    let cancelled = false;
    (async () => {
      try {
        await recalcMeltRecord(record.id);
      } catch (err) {
        if (!cancelled) console.warn('[MeltRecordCard] recalc failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [record.id, record.total_charge_weight, derivedTotalCharge, materials.length]);

  useEffect(() => {
    if (!expanded) { setTargetRangeData(null); return; }
    let cancelled = false;
    (async () => {
      const [tr, batches] = await Promise.all([getMeltTargetRange(record.id), getMoldingBatches()]);
      if (!cancelled) { setTargetRangeData(tr); setCardBatches(batches); }
    })();
    return () => { cancelled = true; };
  }, [expanded, record.id, detailVersion]);

  return (
    <Card className="bg-zinc-800 border-zinc-700" data-testid="melt-card" data-melt-no={record.melt_no}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="font-mono text-sm font-semibold text-amber-400">{record.melt_no}</span>
              <span className="text-xs text-zinc-500">{record.melt_date}</span>
            </div>
            {/* 兩列濃縮版面：第一列為材質／爐號／重量類，第二列為能耗／時間／溫度／建立人 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1 text-xs text-zinc-400">
              <span className="whitespace-nowrap">材質: <span className="text-zinc-200">{record.material_grade}</span></span>
              <span className="min-w-0 break-words">爐號: <span className="text-zinc-200">{record.furnace_no}</span> · {furnaceBody(record)}號爐體 / {formatHeat(record.heat_sequence)} 次{record.rebuild ? '（築爐）' : ''}</span>
              <span className="whitespace-nowrap">總投料: <span className="text-zinc-200" data-testid="melt-card-total-charge">{derivedTotalCharge}</span></span>
              <span className="whitespace-nowrap">殘湯: <span className="text-violet-300 font-medium">{record.residual_weight || 0} kg</span></span>
              <span className="flex items-center gap-1 whitespace-nowrap"><Zap className="w-3 h-3" />耗電: <span className="text-zinc-200">{record.power_kwh} kWh</span></span>
              <span className="whitespace-nowrap">能耗: <span className={`font-bold ${derivedSpecificEnergy > 1 ? 'text-red-400' : 'text-green-400'}`}>{derivedSpecificEnergy} kWh/kg</span></span>
              <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="w-3 h-3" />時間: <span className="text-zinc-200">{(() => {
                if (record.power_start_time && record.tap_time) {
                  const [sh, sm] = record.power_start_time.split(':').map(Number);
                  const [eh, em] = record.tap_time.split(':').map(Number);
                  let diff = (eh * 60 + em) - (sh * 60 + sm);
                  if (diff < 0) diff += 24 * 60;
                  return formatMeltMinutes(diff);
                }
                return formatMeltMinutes(record.melt_minutes);
              })()}</span></span>
              <span className="flex items-center gap-1 whitespace-nowrap"><Thermometer className="w-3 h-3" />出爐溫度: <span className="text-zinc-200">{record.tap_temp}℃</span></span>
              <span className="whitespace-nowrap">建立人: <span className="text-zinc-200">{record.created_by || '-'}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-1 print:hidden">
            <Button variant="ghost" size="icon" data-testid="melt-card-toggle" onClick={onToggle} className="text-zinc-400 hover:text-zinc-100 h-7 w-7">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" data-testid="melt-card-edit" onClick={onEdit} className="text-zinc-400 hover:text-amber-400 h-7 w-7">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" data-testid="melt-card-delete" onClick={onDelete} className="text-zinc-400 hover:text-red-400 h-7 w-7">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-zinc-700 space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-zinc-300" data-testid="melt-card-materials-count">投料明細 ({materials.length} 筆)</span>
              </div>
              {materials.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="melt-card-materials-table">
                    <thead><tr className="text-zinc-500 border-b border-zinc-700"><th className="text-left py-1 pr-3">原料</th><th className="text-right py-1 pr-3">首次投料(kg)</th><th className="text-right py-1 pr-3">二次添加(kg)</th><th className="text-right py-1">小計(kg)</th></tr></thead>
                    <tbody>
                      {materials.map(m => (<tr key={m.id} className="text-zinc-300 border-b border-zinc-700/50"><td className="py-1 pr-3">{m.raw_material}</td><td className="text-right py-1 pr-3">{m.charge_weight}</td><td className="text-right py-1 pr-3">{m.secondary_weight}</td><td className="text-right py-1 font-medium">{m.subtotal}</td></tr>))}
                      <tr className="text-zinc-200 font-medium border-t border-zinc-600"><td className="py-1 pr-3">合計</td><td className="text-right py-1 pr-3">{materials.reduce((s, m) => s + m.charge_weight, 0)}</td><td className="text-right py-1 pr-3">{materials.reduce((s, m) => s + m.secondary_weight, 0)}</td><td className="text-right py-1 text-amber-400">{materials.reduce((s, m) => s + m.subtotal, 0)}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-medium text-zinc-300" data-testid="melt-card-chemistry-count">成份紀錄 ({chemistry.length} 筆)</span>
              </div>
              {chemistry.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="melt-card-chemistry-table">
                    <thead><tr className="text-zinc-500 border-b border-zinc-700"><th className="text-left py-1 pr-2">階段</th>{CHEMISTRY_ELEMENTS.map(el => (<th key={el} className="text-right py-1 px-1">{el}</th>))}</tr></thead>
                    <tbody>
                      {[...chemistry].sort((a, b) => { const o: Record<SampleStage, number> = { TARGET: 0, IN_FURNACE: 1, AFTER_FURNACE: 2 }; return o[a.sample_stage] - o[b.sample_stage]; }).map(c => (
                        <tr key={c.id} className="text-zinc-300 border-b border-zinc-700/50">
                          <td className="py-1 pr-2 font-medium">{SAMPLE_STAGE_LABELS[c.sample_stage]}</td>
                          {CHEMISTRY_ELEMENTS.map(el => {
                            if (el === 'Fe') return <td key={el} className="text-right py-1 px-1"><span className="text-zinc-500">Bal</span></td>;
                            if (c.sample_stage === 'TARGET' && targetRangeData) {
                              return (
                                <td key={el} className="text-right py-1 px-1">
                                  <span className="text-zinc-300 text-[10px] whitespace-nowrap">
                                    {(targetRangeData[`${el}_min`] || 0).toFixed(3)}~{(targetRangeData[`${el}_max`] || 0).toFixed(3)}
                                  </span>
                                </td>
                              );
                            }
                            // For IN_FURNACE and AFTER_FURNACE, check against target range
                            const val = (c[el as keyof MeltChemistry] as number) || 0;
                            let isOutOfRange = false;
                            if (targetRangeData && (c.sample_stage === 'IN_FURNACE' || c.sample_stage === 'AFTER_FURNACE')) {
                              const minVal = targetRangeData[`${el}_min`] || 0;
                              const maxVal = targetRangeData[`${el}_max`] || 0;
                              if (minVal > 0 || maxVal > 0) {
                                isOutOfRange = val < minVal || val > maxVal;
                              }
                            }
                            return (
                              <td key={el} className="text-right py-1 px-1">
                                <span className={isOutOfRange ? 'text-red-400 font-bold' : 'text-zinc-300'}>{val.toFixed(3)}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Pouring summary */}
            {(() => {
              const pouringKey = `melt_pouring_${record.id}`;
              const savedPouring = localStorage.getItem(pouringKey);
              if (!savedPouring) return null;
              try {
                const pouringData = JSON.parse(savedPouring) as Array<{
                  batch_id: string; batch_no: string; customer: string; product_name: string;
                  material: string; quantity: number; estimated_weight: number; estimated_pouring_weight?: number; pouring_weights: number[];
                }>;
                if (pouringData.length === 0) return null;
                const currentBatches = cardBatches;
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-xs font-medium text-zinc-300">澆注紀錄 ({pouringData.length} 批次)</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-zinc-500 border-b border-zinc-700"><th className="text-left py-1 pr-2">批次</th><th className="text-left py-1 pr-2">客戶</th><th className="text-left py-1 pr-2">品名</th><th className="text-left py-1 pr-2">材質</th><th className="text-right py-1 pr-2">數量</th><th className="text-right py-1 pr-2">預估成品重量(kg)</th><th className="text-right py-1 pr-2">預計澆注重量(kg)</th><th className="text-right py-1 pr-2">平均實際澆注重量(kg)</th><th className="text-right py-1 pr-2">總澆注重量(kg)</th><th className="text-right py-1">平均成品率</th></tr></thead>
                        <tbody>
                          {pouringData.map(p => {
                            const totalW = p.pouring_weights.reduce((s, w) => s + w, 0);
                            const currentBatch = currentBatches.find(b => b.id === p.batch_id);
                            const estPouringTotal = currentBatch ? currentBatch.estimated_pouring_weight : (p.estimated_pouring_weight || 0);
                            const validWeights = p.pouring_weights.filter(w => w > 0);
                            const avgActualPouring = validWeights.length > 0
                              ? (validWeights.reduce((s, w) => s + w, 0) / validWeights.length).toFixed(1)
                              : '-';
                            const avgRate = totalW > 0 && p.estimated_weight > 0
                              ? ((p.estimated_weight * p.quantity / totalW) * 100).toFixed(1)
                              : '0.0';
                            return (
                              <tr key={p.batch_id} className="text-zinc-300 border-b border-zinc-700/50">
                                <td className="py-1 pr-2 font-mono text-amber-400">{p.batch_no}</td>
                                <td className="py-1 pr-2">{p.customer}</td>
                                <td className="py-1 pr-2">{p.product_name}</td>
                                <td className="py-1 pr-2">{p.material}</td>
                                <td className="text-right py-1 pr-2">{p.quantity}</td>
                                <td className="text-right py-1 pr-2">{p.estimated_weight}</td>
                                <td className="text-right py-1 pr-2">{estPouringTotal || '-'}</td>
                                <td className="text-right py-1 pr-2">{avgActualPouring}</td>
                                <td className="text-right py-1 pr-2">{totalW}</td>
                                <td className={`text-right py-1 font-bold ${Number(avgRate) >= 80 ? 'text-green-400' : Number(avgRate) >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{avgRate}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          {(() => {
                            const sumQty = pouringData.reduce((s, p) => s + p.quantity, 0);
                            const sumEstProduct = pouringData.reduce((s, p) => s + (p.estimated_weight * p.quantity), 0);
                            const sumEstPouring = pouringData.reduce((s, p) => {
                              const batch = currentBatches.find(b => b.id === p.batch_id);
                              return s + (batch ? batch.estimated_pouring_weight : (p.estimated_pouring_weight || 0));
                            }, 0);
                            const sumActualPouring = pouringData.reduce((s, p) => s + p.pouring_weights.reduce((a, w) => a + w, 0), 0);
                            return (
                              <tr className="text-amber-300 font-bold border-t-2 border-zinc-600">
                                <td className="py-1.5 pr-2" colSpan={4}>合計</td>
                                <td className="text-right py-1.5 pr-2">{sumQty}</td>
                                <td className="text-right py-1.5 pr-2">{sumEstProduct}</td>
                                <td className="text-right py-1.5 pr-2">{sumEstPouring || '-'}</td>
                                <td className="text-right py-1.5 pr-2">-</td>
                                <td className="text-right py-1.5 pr-2">{sumActualPouring}</td>
                                <td className="text-right py-1.5">-</td>
                              </tr>
                            );
                          })()}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}
            {record.remark && <p className="text-xs text-zinc-400">備註: {record.remark}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// === Preset Recipe Manager ===
function PresetRecipeManager({ open, onOpenChange, materialOptionNames, onCreateMaterialOption, onDeleteMaterialOption }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materialOptionNames: string[];
  onCreateMaterialOption: (name: string) => void;
  onDeleteMaterialOption: (name: string) => void;
}) {
  const [recipes, setRecipes] = useState<PresetRecipe[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMaterials, setNewMaterials] = useState<Array<{ raw_material: string; charge_weight: number; secondary_weight: number }>>([]);
  const [addRow, setAddRow] = useState({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editingMaterials, setEditingMaterials] = useState<Array<{ raw_material: string; charge_weight: number; secondary_weight: number }>>([]);
  // 已展開的配比 id：預設全部收折，僅顯示名稱與彙總
  const [expandedRecipeIds, setExpandedRecipeIds] = useState<string[]>([]);
  // 編輯既有配比時，用於新增原料項目的暫存列
  const [editAddRow, setEditAddRow] = useState({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const cloudRecipes = await getPresetRecipes();
      if (!cancelled) setRecipes(cloudRecipes);
    })();
    return () => { cancelled = true; };
  }, [open]);

  // 統一的錯誤提示：區分權限、連線與其他失敗
  const notifyError = (err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PresetRecipe] operation failed:', err);
    if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
      toast({ title: '權限不足，已暫存本地', description: '連線恢復後將自動同步至雲端', variant: 'destructive' });
    } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
      toast({ title: '連線異常，已暫存本地', description: '連線恢復後將自動同步至雲端', variant: 'destructive' });
    } else {
      toast({ title: fallback, variant: 'destructive' });
    }
  };

  const handleAddMaterialRow = () => {
    const name = addRow.raw_material.trim();
    if (!name) { toast({ title: '請選擇或輸入原料', variant: 'destructive' }); return; }
    if (newMaterials.some(m => m.raw_material === name)) {
      toast({ title: '此配比已有相同原料', description: '請直接修改該項數量', variant: 'destructive' });
      return;
    }
    setNewMaterials([...newMaterials, { raw_material: name, charge_weight: addRow.charge_weight, secondary_weight: addRow.secondary_weight }]);
    setAddRow({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
  };

  const handleSaveRecipe = async () => {
    if (!newName.trim()) { toast({ title: '請輸入配比名稱', variant: 'destructive' }); return; }
    if (newMaterials.length === 0) { toast({ title: '請至少新增一項原料', variant: 'destructive' }); return; }
    if (recipes.some(r => r.name.trim() === newName.trim())) {
      toast({ title: '此配比名稱已存在', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createPresetRecipe(newName.trim(), newMaterials);
      setRecipes(await getPresetRecipes());
      setNewName('');
      setNewMaterials([]);
      setIsAdding(false);
      toast({ title: '預設配比已建立', description: '已同步至雲端，其他裝置可看到此配比' });
    } catch (err: unknown) {
      notifyError(err, '建立失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecipe = async (id: string) => {
    if (!window.confirm('確定要刪除此預設配比？')) return;
    try {
      await deletePresetRecipe(id);
      setRecipes(await getPresetRecipes());
      toast({ title: '預設配比已刪除' });
    } catch (err: unknown) {
      notifyError(err, '刪除失敗，請稍後再試');
    }
  };

  const handleStartEdit = (recipe: PresetRecipe) => {
    setEditingRecipeId(recipe.id);
    setEditingMaterials(recipe.materials.map(m => ({ ...m })));
    setEditAddRow({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
    // 進入編輯時自動展開，避免使用者看不到可編輯的原料列
    setExpandedRecipeIds(prev => (prev.includes(recipe.id) ? prev : [...prev, recipe.id]));
  };

  /** 切換單一配比的原料明細展開／收折 */
  const toggleRecipeExpanded = (recipeId: string) => {
    setExpandedRecipeIds(prev => (
      prev.includes(recipeId) ? prev.filter(id => id !== recipeId) : [...prev, recipeId]
    ));
  };

  const handleCancelEdit = () => {
    setEditingRecipeId(null);
    setEditingMaterials([]);
    setEditAddRow({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
  };

  /** 編輯既有配比時新增一項原料 */
  const handleAddEditMaterialRow = () => {
    const name = editAddRow.raw_material.trim();
    if (!name) { toast({ title: '請選擇或輸入原料', variant: 'destructive' }); return; }
    if (editingMaterials.some(m => m.raw_material === name)) {
      toast({ title: '此配比已有相同原料', description: '請直接修改該項數量', variant: 'destructive' });
      return;
    }
    setEditingMaterials([...editingMaterials, {
      raw_material: name,
      charge_weight: editAddRow.charge_weight,
      secondary_weight: editAddRow.secondary_weight,
    }]);
    setEditAddRow({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
  };

  /** 編輯既有配比時刪除一項原料 */
  const handleRemoveEditMaterialRow = (index: number) => {
    setEditingMaterials(editingMaterials.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    if (!editingRecipeId) return;
    if (editingMaterials.length === 0) {
      toast({ title: '請至少保留一項原料', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updatePresetRecipeMaterials(editingRecipeId, editingMaterials);
      setRecipes(await getPresetRecipes());
      setEditingRecipeId(null);
      setEditingMaterials([]);
      setEditAddRow({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
      toast({ title: '配比已更新', description: '已同步至雲端' });
    } catch (err: unknown) {
      notifyError(err, '更新失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const handleEditMaterialChange = (index: number, field: 'charge_weight' | 'secondary_weight', value: number) => {
    const updated = [...editingMaterials];
    updated[index] = { ...updated[index], [field]: value };
    setEditingMaterials(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-800 border-zinc-700 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            預設投料配比管理
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing Recipes */}
          {recipes.length === 0 && !isAdding && (
            <p className="text-sm text-zinc-400 text-center py-4">尚無預設配比，點擊下方按鈕新增</p>
          )}

          {/* 批次展開／收折控制 */}
          {recipes.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500">共 {recipes.length} 組配比，點擊名稱可展開原料明細</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setExpandedRecipeIds(recipes.map(r => r.id))}
                  className="text-zinc-400 hover:text-zinc-100 h-6 px-2 text-xs">全部展開</Button>
                <Button size="sm" variant="ghost" onClick={() => setExpandedRecipeIds(editingRecipeId ? [editingRecipeId] : [])}
                  className="text-zinc-400 hover:text-zinc-100 h-6 px-2 text-xs">全部收折</Button>
              </div>
            </div>
          )}

          {recipes.map(recipe => {
            const isEditing = editingRecipeId === recipe.id;
            const isExpanded = expandedRecipeIds.includes(recipe.id);
            const displayMaterials = isEditing ? editingMaterials : recipe.materials;
            const totalWeight = displayMaterials.reduce((s, m) => s + m.charge_weight + m.secondary_weight, 0);
            return (
            <Card key={recipe.id} className="bg-zinc-700/30 border-zinc-700">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  {/* 標題列可點擊收折／展開原料明細 */}
                  <button
                    type="button"
                    onClick={() => toggleRecipeExpanded(recipe.id)}
                    aria-expanded={isExpanded}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                  >
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />}
                    <span className="text-sm font-medium text-amber-400 truncate">{recipe.name}</span>
                    <span className="text-[11px] text-zinc-500 shrink-0">
                      {displayMaterials.length} 項 · {totalWeight} kg
                    </span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {isEditing ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="text-zinc-400 hover:text-zinc-200 h-6 px-2 text-xs">取消</Button>
                        <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 h-6 px-2 text-xs">儲存</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleStartEdit(recipe)} title="編輯原料項目" className="text-zinc-400 hover:text-blue-400 h-6 w-6 p-0">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteRecipe(recipe.id)} title="刪除此配比" className="text-zinc-400 hover:text-red-400 h-6 w-6 p-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-zinc-500 border-b border-zinc-700"><th className="text-left py-1">原料</th><th className="text-right py-1">首次(kg)</th><th className="text-right py-1">二次(kg)</th><th className="text-right py-1">小計</th><th className="w-6"></th></tr></thead>
                    <tbody>
                      {isEditing ? (
                        editingMaterials.length === 0 ? (
                          <tr><td colSpan={5} className="py-2 text-center text-zinc-500">已無原料，請於下方加入至少一項</td></tr>
                        ) : (
                        editingMaterials.map((m, i) => (
                          <tr key={i} className="text-zinc-300 border-b border-zinc-700/50">
                            <td className="py-1">{m.raw_material}</td>
                            <td className="text-right py-1">
                              <Input type="number" min="0" value={m.charge_weight || ''} onChange={e => handleEditMaterialChange(i, 'charge_weight', Math.max(0, Number(e.target.value)))} className="bg-zinc-600 border-zinc-500 text-zinc-100 h-6 text-xs w-20 ml-auto text-right" />
                            </td>
                            <td className="text-right py-1">
                              <Input type="number" min="0" value={m.secondary_weight || ''} onChange={e => handleEditMaterialChange(i, 'secondary_weight', Math.max(0, Number(e.target.value)))} className="bg-zinc-600 border-zinc-500 text-zinc-100 h-6 text-xs w-20 ml-auto text-right" />
                            </td>
                            <td className="text-right py-1 font-medium">{m.charge_weight + m.secondary_weight}</td>
                            <td className="py-1 pl-1">
                              <Button size="sm" variant="ghost" onClick={() => handleRemoveEditMaterialRow(i)} title="移除此原料"
                                className="text-zinc-400 hover:text-red-400 h-5 w-5 p-0">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </td>
                          </tr>
                        ))
                        )
                      ) : (
                        recipe.materials.map((m, i) => (
                          <tr key={i} className="text-zinc-300 border-b border-zinc-700/50"><td className="py-1">{m.raw_material}</td><td className="text-right py-1">{m.charge_weight}</td><td className="text-right py-1">{m.secondary_weight}</td><td className="text-right py-1 font-medium">{m.charge_weight + m.secondary_weight}</td><td /></tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                )}
                {/* 編輯既有配比時可再新增原料項目 */}
                {isEditing && isExpanded && (
                  <div className="mt-2 pt-2 border-t border-dashed border-zinc-600 space-y-2">
                    <p className="text-[11px] text-zinc-400">新增原料項目至此配比</p>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                      <div className="flex-1 min-w-0">
                        <MaterialCombobox
                          value={editAddRow.raw_material}
                          onChange={v => setEditAddRow({ ...editAddRow, raw_material: v })}
                          options={materialOptionNames}
                          onCreate={onCreateMaterialOption}
                          onDelete={onDeleteMaterialOption}
                          className="h-7 text-xs"
                        />
                      </div>
                      <Input type="number" min="0" value={editAddRow.charge_weight || ''}
                        onChange={e => setEditAddRow({ ...editAddRow, charge_weight: Math.max(0, Number(e.target.value)) })}
                        placeholder="首次(kg)" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs w-full sm:w-24" />
                      <Input type="number" min="0" value={editAddRow.secondary_weight || ''}
                        onChange={e => setEditAddRow({ ...editAddRow, secondary_weight: Math.max(0, Number(e.target.value)) })}
                        placeholder="二次(kg)" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs w-full sm:w-24" />
                      <Button size="sm" onClick={handleAddEditMaterialRow} className="bg-blue-500 hover:bg-blue-600 text-white h-7 text-xs shrink-0">
                        <Plus className="w-3 h-3 mr-1" />加入
                      </Button>
                    </div>
                    <p className="text-[10px] text-zinc-500">加入或移除後請按右上角「儲存」才會寫入雲端。</p>
                  </div>
                )}
                {isExpanded && (
                  <p className="text-xs text-zinc-500 mt-1">總重: {totalWeight} kg</p>
                )}
              </CardContent>
            </Card>
            );
          })}

          {/* Add New Recipe */}
          {isAdding ? (
            <Card className="bg-zinc-700/20 border-zinc-600 border-dashed">
              <CardContent className="p-3 space-y-3">
                <div>
                  <Label className="text-zinc-400 text-xs">配比名稱 *</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="例: SCM440 標準配比" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
                </div>

                {newMaterials.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-zinc-500 border-b border-zinc-700"><th className="text-left py-1">原料</th><th className="text-right py-1">首次(kg)</th><th className="text-right py-1">二次(kg)</th><th className="text-right py-1">小計</th><th className="w-6"></th></tr></thead>
                      <tbody>
                        {newMaterials.map((m, i) => (
                          <tr key={i} className="text-zinc-300 border-b border-zinc-700/50">
                            <td className="py-1">{m.raw_material}</td>
                            <td className="text-right py-1">{m.charge_weight}</td>
                            <td className="text-right py-1">{m.secondary_weight}</td>
                            <td className="text-right py-1 font-medium">{m.charge_weight + m.secondary_weight}</td>
                            <td className="py-1"><Button size="sm" variant="ghost" onClick={() => setNewMaterials(newMaterials.filter((_, idx) => idx !== i))} className="text-zinc-400 hover:text-red-400 h-5 w-5 p-0"><Trash2 className="w-3 h-3" /></Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add material to recipe */}
                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div className="flex-1 min-w-0">
                    <MaterialCombobox
                      value={addRow.raw_material}
                      onChange={v => setAddRow({ ...addRow, raw_material: v })}
                      options={materialOptionNames}
                      onCreate={onCreateMaterialOption}
                      onDelete={onDeleteMaterialOption}
                      className="h-7 text-xs"
                    />
                  </div>
                  <Input type="number" min="0" value={addRow.charge_weight || ''} onChange={e => setAddRow({ ...addRow, charge_weight: Math.max(0, Number(e.target.value)) })} placeholder="首次(kg)" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs w-full sm:w-24" />
                  <Input type="number" min="0" value={addRow.secondary_weight || ''} onChange={e => setAddRow({ ...addRow, secondary_weight: Math.max(0, Number(e.target.value)) })} placeholder="二次(kg)" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs w-full sm:w-24" />
                  <Button size="sm" onClick={handleAddMaterialRow} className="bg-blue-500 hover:bg-blue-600 text-white h-7 text-xs shrink-0">
                    <Plus className="w-3 h-3 mr-1" />加入
                  </Button>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => { setIsAdding(false); setNewName(''); setNewMaterials([]); }} className="text-zinc-400 h-7 text-xs">取消</Button>
                  <Button size="sm" onClick={handleSaveRecipe} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 h-7 text-xs">儲存配比</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button onClick={() => setIsAdding(true)} variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 w-full h-9">
              <Plus className="w-4 h-4 mr-2" />新增預設配比
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// === Material Spec Manager (材質規範管理) ===
function MaterialSpecManager({ open, onOpenChange, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [specs, setSpecs] = useState<MaterialSpec[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftRemark, setDraftRemark] = useState('');
  const [draftRanges, setDraftRanges] = useState<Record<string, number>>(emptySpecRanges());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsAdding(false);
    setEditingId(null);
    setDraftName('');
    setDraftRemark('');
    setDraftRanges(emptySpecRanges());
    (async () => {
      const cloudSpecs = await getMaterialSpecs();
      if (!cancelled) setSpecs(cloudSpecs);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const refresh = async () => {
    setSpecs(await getMaterialSpecs());
    onChanged();
  };

  // 統一的錯誤提示：區分權限、連線與其他失敗
  const notifyError = (err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[MaterialSpec] operation failed:', err);
    if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
      toast({ title: '權限不足，已暫存本地', description: '連線恢復後將自動同步至雲端', variant: 'destructive' });
    } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
      toast({ title: '連線異常，已暫存本地', description: '連線恢復後將自動同步至雲端', variant: 'destructive' });
    } else {
      toast({ title: fallback, variant: 'destructive' });
    }
  };

  const resetDraft = () => {
    setIsAdding(false);
    setEditingId(null);
    setDraftName('');
    setDraftRemark('');
    setDraftRanges(emptySpecRanges());
  };

  const validateDraft = (): string | null => {
    if (!draftName.trim()) return '請輸入材質名稱';
    const hasRange = SPEC_ELEMENTS.some(el => (draftRanges[`${el}_min`] || 0) > 0 || (draftRanges[`${el}_max`] || 0) > 0);
    if (!hasRange) return '請至少填寫一項成分範圍';
    for (const el of SPEC_ELEMENTS) {
      const min = draftRanges[`${el}_min`] || 0;
      const max = draftRanges[`${el}_max`] || 0;
      if (min > 0 && max > 0 && min > max) return `${el} 的下限不可大於上限`;
    }
    return null;
  };

  const handleSaveNew = async () => {
    const error = validateDraft();
    if (error) { toast({ title: error, variant: 'destructive' }); return; }
    if (specs.some(s => s.name.trim() === draftName.trim())) {
      toast({ title: '此材質規範名稱已存在', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createMaterialSpec(draftName.trim(), draftRanges, draftRemark.trim());
      await refresh();
      resetDraft();
      toast({ title: '材質規範已建立', description: '已同步至雲端，其他裝置可看到此規範' });
    } catch (err: unknown) {
      notifyError(err, '建立失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (spec: MaterialSpec) => {
    setIsAdding(false);
    setEditingId(spec.id);
    setDraftName(spec.name);
    setDraftRemark(spec.remark || '');
    setDraftRanges({ ...emptySpecRanges(), ...spec.ranges });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const error = validateDraft();
    if (error) { toast({ title: error, variant: 'destructive' }); return; }
    if (specs.some(s => s.id !== editingId && s.name.trim() === draftName.trim())) {
      toast({ title: '此材質規範名稱已存在', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updateMaterialSpec(editingId, { name: draftName.trim(), ranges: draftRanges, remark: draftRemark.trim() });
      await refresh();
      resetDraft();
      toast({ title: '材質規範已更新', description: '已同步至雲端' });
    } catch (err: unknown) {
      notifyError(err, '更新失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (spec: MaterialSpec) => {
    if (!window.confirm(`確定要刪除材質規範「${spec.name}」？`)) return;
    try {
      await deleteMaterialSpec(spec.id);
      await refresh();
      if (editingId === spec.id) resetDraft();
      toast({ title: '材質規範已刪除' });
    } catch (err: unknown) {
      notifyError(err, '刪除失敗，請稍後再試');
    }
  };

  const renderRangeEditor = () => (
    <div className="space-y-2">
      <div>
        <Label className="text-zinc-400 text-xs">材質名稱 *</Label>
        <Input value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="例: SCM440、316L、FCD450" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
      </div>
      <div>
        <Label className="text-zinc-400 text-xs">成分規範（%）</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          {SPEC_ELEMENTS.map(el => (
            <div key={el} className="bg-zinc-800/60 border border-zinc-600 rounded-md p-1.5">
              <p className="text-[11px] font-medium text-purple-300 mb-1">{el}</p>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={draftRanges[`${el}_min`] || ''}
                  onChange={e => setDraftRanges({ ...draftRanges, [`${el}_min`]: Math.max(0, Number(e.target.value)) })}
                  placeholder="min"
                  className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-[10px] text-center px-1"
                />
                <span className="text-[10px] text-zinc-500">~</span>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={draftRanges[`${el}_max`] || ''}
                  onChange={e => setDraftRanges({ ...draftRanges, [`${el}_max`]: Math.max(0, Number(e.target.value)) })}
                  placeholder="max"
                  className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-[10px] text-center px-1"
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">Fe 為餘量（Bal），無須輸入。</p>
      </div>
      <div>
        <Label className="text-zinc-400 text-xs">備註</Label>
        <Input value={draftRemark} onChange={e => setDraftRemark(e.target.value)} placeholder="例: 客戶指定規範 / 依 JIS 標準" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-800 border-zinc-700 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-purple-400" />
            材質規範管理
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            建立各材質的成分規範後，新增熔解批次時選擇材質，最下方「成份紀錄」的目標值會自動代入，無須每次手動輸入。
          </p>

          {specs.length === 0 && !isAdding && (
            <p className="text-sm text-zinc-400 text-center py-4">尚無材質規範，點擊下方按鈕新增</p>
          )}

          {specs.map(spec => (
            <Card key={spec.id} className="bg-zinc-700/30 border-zinc-700">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-purple-300">{spec.name}</span>
                  <div className="flex items-center gap-1">
                    {editingId === spec.id ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={resetDraft} className="text-zinc-400 hover:text-zinc-200 h-6 px-2 text-xs">取消</Button>
                        <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 h-6 px-2 text-xs">儲存</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleStartEdit(spec)} className="text-zinc-400 hover:text-blue-400 h-6 w-6 p-0">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(spec)} className="text-zinc-400 hover:text-red-400 h-6 w-6 p-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {editingId === spec.id ? renderRangeEditor() : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-zinc-500 border-b border-zinc-700">
                            {SPEC_ELEMENTS.map(el => (<th key={el} className="text-center py-1 px-1">{el}</th>))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="text-zinc-300">
                            {SPEC_ELEMENTS.map(el => (
                              <td key={el} className="text-center py-1 px-1 whitespace-nowrap">{formatSpecRange(spec.ranges, el)}</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {spec.remark && <p className="text-xs text-zinc-500 mt-1">備註: {spec.remark}</p>}
                  </>
                )}
              </CardContent>
            </Card>
          ))}

          {isAdding ? (
            <Card className="bg-zinc-700/20 border-zinc-600 border-dashed">
              <CardContent className="p-3 space-y-3">
                {renderRangeEditor()}
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={resetDraft} className="text-zinc-400 h-7 text-xs">取消</Button>
                  <Button size="sm" onClick={handleSaveNew} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 h-7 text-xs">儲存材質規範</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button onClick={() => { resetDraft(); setIsAdding(true); }} variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 w-full h-9">
              <Plus className="w-4 h-4 mr-2" />新增材質規範
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// === Single Page Form Dialog (No Tabs) ===
function MeltFormDialog({
  open, onOpenChange, editRecord, onSaved, onSavedAndNew, existingMaterials, materialSpecs,
  materialOptionNames, onCreateMaterialOption, onDeleteMaterialOption, onRequestAddSpec,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRecord: MeltRecord | null;
  onSaved: () => void;
  onSavedAndNew: () => void;
  existingMaterials: string[];
  materialSpecs: MaterialSpec[];
  materialOptionNames: string[];
  onCreateMaterialOption: (name: string) => void;
  onDeleteMaterialOption: (name: string) => void;
  onRequestAddSpec: () => void;
}) {
  const isEdit = !!editRecord;
  const { toast } = useToast();

  // Basic info form
  const [form, setForm] = useState({
    melt_no: '',
    melt_date: new Date().toISOString().slice(0, 10),
    material_grade: '',
    furnace_no: '',
    power_kwh: 0,
    power_start_time: '',
    tap_time: '',
    tap_temp: 0,
    created_by: '',
    remark: '',
  });
  const [timeError, setTimeError] = useState('');
  const [sequenceRecords, setSequenceRecords] = useState<MeltRecord[]>([]);
  const [sequenceError, setSequenceError] = useState('');
  const [body, setBody] = useState(1);
  const [rebuild, setRebuild] = useState(false);
  const [heatInput, setHeatInput] = useState('');
  const [heatChanged, setHeatChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    setDraftId(editRecord?.id || crypto.randomUUID());
    setBody(editRecord ? furnaceBody(editRecord) || 1 : 1);
    setRebuild(Boolean(editRecord?.rebuild));
    setHeatInput(editRecord?.heat_sequence ? String(editRecord.heat_sequence) : '');
    setHeatChanged(false);
    setSequenceError('爐次資料載入中…');
    let active = true;
    loadSequenceRecords().then(rows => {
      if (active) { setSequenceRecords(rows); setSequenceError(''); }
    }).catch(error => { if (active) setSequenceError(error.message); });
    return () => { active = false; };
  }, [open, editRecord]);

  const sequencePreview = useMemo(() => {
    const base = form.melt_no.trim() || `ML-${form.melt_date.replace(/-/g, '')}-${form.furnace_no || 'NA'}`;
    let meltNo = base;
    let suffix = 2;
    while (!form.melt_no.trim() && sequenceRecords.some(r => r.melt_no === meltNo && r.id !== draftId)) meltNo = `${base}-${suffix++}`;
    const candidate = { ...editRecord, ...form, id: draftId, melt_no: meltNo, furnace_body: body, rebuild,
      heat_anchor: rebuild ? 1 : heatChanged ? (heatInput ? Number(heatInput) : null) : editRecord?.heat_anchor ?? null,
      sequence_updated_at: heatChanged || body !== furnaceBody(editRecord || { furnace_no: '', furnace_body: 1 }) || rebuild !== Boolean(editRecord?.rebuild) ? '9999' : editRecord?.sequence_updated_at,
    } as MeltRecord;
    const calculated = calculateSequences([...sequenceRecords.filter(r => r.id !== draftId), candidate]);
    const current = calculated.find(r => r.id === draftId)!;
    const affected = calculated.filter(r => r.furnace_body === body && r.cycle_id === current.cycle_id);
    const invalid = affected.some(r => !Number.isInteger(r.heat_sequence) || r.heat_sequence! < 1 || (r.cycle_number! > 0 && r.heat_sequence !== affected.indexOf(r) + 1));
    return { current, affected, invalid };
  }, [form, editRecord, draftId, body, rebuild, heatInput, heatChanged, sequenceRecords]);
  // 編輯既有紀錄時，明細（投料／成份）尚未回填完成前不得儲存，
  // 否則會把空白表單寫回雲端，並被必填驗證誤擋。
  const [loadingRecord, setLoadingRecord] = useState(false);

  // Materials state
  const [materials, setMaterials] = useState<Array<{ id?: string; raw_material: string; charge_weight: number; secondary_weight: number }>>([]);
  const [newMaterialRow, setNewMaterialRow] = useState({ raw_material: '', charge_weight: 0, secondary_weight: 0 });

  // Chemistry state - TARGET uses min/max range, others use single value
  // TARGET stores as: { C_min, C_max, Si_min, Si_max, ... }
  const [targetRange, setTargetRange] = useState<Record<string, number>>({
    C_min: 0, C_max: 0, Si_min: 0, Si_max: 0, Mn_min: 0, Mn_max: 0,
    P_min: 0, P_max: 0, S_min: 0, S_max: 0, Ni_min: 0, Ni_max: 0,
    Cr_min: 0, Cr_max: 0, Mo_min: 0, Mo_max: 0, Cu_min: 0, Cu_max: 0,
  });
  const [chemRows, setChemRows] = useState<Record<'IN_FURNACE' | 'AFTER_FURNACE', Record<string, number>>>({
    IN_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
    AFTER_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
  });
  const [autoCalcFe, setAutoCalcFe] = useState(true);

  // 材質規範：下拉選單選項（規範名稱 + 歷史材質），以及選取後自動代入目標值
  const materialGradeOptions = [...new Set([
    ...materialSpecs.map(s => s.name),
    ...existingMaterials,
    ...(form.material_grade ? [form.material_grade] : []),
  ])].filter(Boolean);
  const selectedSpec = materialSpecs.find(s => s.name === form.material_grade) || null;

  const applySpecToTargetRange = (spec: MaterialSpec) => {
    const applied: Record<string, number> = {
      C_min: 0, C_max: 0, Si_min: 0, Si_max: 0, Mn_min: 0, Mn_max: 0,
      P_min: 0, P_max: 0, S_min: 0, S_max: 0, Ni_min: 0, Ni_max: 0,
      Cr_min: 0, Cr_max: 0, Mo_min: 0, Mo_max: 0, Cu_min: 0, Cu_max: 0,
    };
    SPEC_ELEMENTS.forEach(el => {
      applied[`${el}_min`] = spec.ranges[`${el}_min`] || 0;
      applied[`${el}_max`] = spec.ranges[`${el}_max`] || 0;
    });
    setTargetRange(applied);
  };

  const handleMaterialGradeChange = (value: string) => {
    if (value === ADD_SPEC_OPTION) {
      onOpenChange(false);
      onRequestAddSpec();
      return;
    }
    setForm(prev => ({ ...prev, material_grade: value }));
    const spec = materialSpecs.find(s => s.name === value);
    if (spec) {
      applySpecToTargetRange(spec);
      toast({ title: `已套用材質規範「${spec.name}」`, description: '成份紀錄的目標值已自動代入' });
    }
  };

  // Collapsible states
  const [materialsOpen, setMaterialsOpen] = useState(true);
  const [chemistryOpen, setChemistryOpen] = useState(true);
  const [pouringOpen, setPouringOpen] = useState(true);
  const [residualOpen, setResidualOpen] = useState(true);
  // 澆注殘湯重量（以字串保存輸入過程，存檔時轉為數值寫入 melt_records.residual_weight）
  const [residualWeight, setResidualWeight] = useState('');

  // Preset recipes
  const [presetRecipes, setPresetRecipes] = useState<PresetRecipe[]>([]);

  // Pouring section - select completed molding batches
  const [allBatches, setAllBatches] = useState<MoldingBatch[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  const [pouringBatchSearch, setPouringBatchSearch] = useState('');
  const [selectedPouringBatches, setSelectedPouringBatches] = useState<Array<{
    batch_id: string;
    batch_no: string;
    customer: string;
    product_name: string;
    material: string;
    quantity: number;
    estimated_weight: number;
    estimated_pouring_weight: number;
    pouring_weights: number[];
  }>>([]);

  // Load data when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // 編輯既有紀錄時必須「先回填主表單與明細」再載入配比／批次／工單等輔助資料。
      // 先前把慢速輔助查詢排在最前面，導致對話框開啟後數秒內材質與爐號仍為空，
      // 使用者此時按儲存會被必填驗證誤擋（且看起來像「儲存沒反應」）。
      if (editRecord) {
        setLoadingRecord(true);
        setForm({
          melt_no: editRecord.melt_no,
          melt_date: editRecord.melt_date,
          material_grade: editRecord.material_grade,
          furnace_no: editRecord.furnace_no,
          power_kwh: editRecord.power_kwh,
          power_start_time: editRecord.power_start_time,
          tap_time: editRecord.tap_time,
          tap_temp: editRecord.tap_temp,
          created_by: editRecord.created_by,
          remark: editRecord.remark,
        });
        setResidualWeight(editRecord.residual_weight ? String(editRecord.residual_weight) : '');
        // Load pouring data
        const pouringKey = `melt_pouring_${editRecord.id}`;
        const savedPouring = localStorage.getItem(pouringKey);
        if (savedPouring) {
          try { setSelectedPouringBatches(JSON.parse(savedPouring)); } catch { setSelectedPouringBatches([]); }
        } else {
          setSelectedPouringBatches([]);
        }
        try {
          const [mats, chem, savedRange] = await Promise.all([
            getMeltMaterials(editRecord.id),
            getMeltChemistry(editRecord.id),
            getMeltTargetRange(editRecord.id),
          ]);
          if (cancelled) return;
          setMaterials(mats.map(m => ({ id: m.id, raw_material: m.raw_material, charge_weight: m.charge_weight, secondary_weight: m.secondary_weight })));
          const loadedChemRows: Record<'IN_FURNACE' | 'AFTER_FURNACE', Record<string, number>> = {
            IN_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
            AFTER_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
          };
          let loadedTarget: Record<string, number> = {
            C_min: 0, C_max: 0, Si_min: 0, Si_max: 0, Mn_min: 0, Mn_max: 0,
            P_min: 0, P_max: 0, S_min: 0, S_max: 0, Ni_min: 0, Ni_max: 0,
            Cr_min: 0, Cr_max: 0, Mo_min: 0, Mo_max: 0, Cu_min: 0, Cu_max: 0,
          };
          if (savedRange) {
            loadedTarget = savedRange;
          }
          chem.forEach(c => {
            if (c.sample_stage === 'TARGET' && !savedRange) {
              // Fallback: load from old format (use value as both min and max)
              const elements = ['C', 'Si', 'Mn', 'P', 'S', 'Ni', 'Cr', 'Mo', 'Cu'] as const;
              elements.forEach(el => {
                const val = c[el as keyof MeltChemistry] as number;
                loadedTarget[`${el}_min`] = val;
                loadedTarget[`${el}_max`] = val;
              });
            } else if (c.sample_stage === 'IN_FURNACE' || c.sample_stage === 'AFTER_FURNACE') {
              loadedChemRows[c.sample_stage] = { C: c.C, Si: c.Si, Mn: c.Mn, P: c.P, S: c.S, Ni: c.Ni, Cr: c.Cr, Mo: c.Mo, Cu: c.Cu };
            }
          });
          setTargetRange(loadedTarget);
          setChemRows(loadedChemRows);
        } finally {
          if (!cancelled) setLoadingRecord(false);
        }
      } else {
        resetFormState();
      }
      setTimeError('');
      // 輔助資料（預設配比／造模批次／工單）與主表單無關，平行載入避免拖慢回填
      const [recipes, batches, orders] = await Promise.all([getPresetRecipes(), getMoldingBatches(), getWorkOrders()]);
      if (cancelled) return;
      setPresetRecipes(recipes);
      setAllBatches(batches);
      setAllWorkOrders(orders);
    })();
    return () => { cancelled = true; };
  }, [open, editRecord]);

  const resetFormState = () => {
    setForm({
      melt_no: '',
      melt_date: new Date().toISOString().slice(0, 10),
      material_grade: '',
      furnace_no: '',
      power_kwh: 0,
      power_start_time: '',
      tap_time: '',
      tap_temp: 0,
      created_by: '',
      remark: '',
    });
    setMaterials([]);
    setTargetRange({
      C_min: 0, C_max: 0, Si_min: 0, Si_max: 0, Mn_min: 0, Mn_max: 0,
      P_min: 0, P_max: 0, S_min: 0, S_max: 0, Ni_min: 0, Ni_max: 0,
      Cr_min: 0, Cr_max: 0, Mo_min: 0, Mo_max: 0, Cu_min: 0, Cu_max: 0,
    });
    setChemRows({
      IN_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
      AFTER_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
    });
    setSelectedPouringBatches([]);
    setPouringBatchSearch('');
    setResidualWeight('');
    setTimeError('');
    setLoadingRecord(false);
    setDraftId(crypto.randomUUID());
    setHeatInput('');
    setHeatChanged(false);
    setRebuild(false);
  };

  const validateTime = (startTime: string, tapTime: string): boolean => {
    if (!startTime || !tapTime) { setTimeError(''); return true; }
    const start = new Date(`2000-01-01T${startTime}`).getTime();
    const end = new Date(`2000-01-01T${tapTime}`).getTime();
    if (end <= start) { setTimeError('出湯時間不可早於或等於開始送電時間'); return false; }
    setTimeError('');
    return true;
  };

  // Calculated fields
  const calcMeltMinutes = (): number => {
    if (!form.power_start_time || !form.tap_time || timeError) return 0;
    const [sh, sm] = form.power_start_time.split(':').map(Number);
    const [eh, em] = form.tap_time.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60; // cross midnight
    return diff;
  };
  const meltMinutes = calcMeltMinutes();
  const totalChargeWeight = materials.reduce((s, m) => s + m.charge_weight + m.secondary_weight, 0);
  const specificEnergy = totalChargeWeight > 0 ? Math.round((form.power_kwh / totalChargeWeight) * 1000) / 1000 : 0;
  // 總出湯重量：彙總「澆注紀錄」各選取批次的實際澆注重量，供殘湯率即時試算
  const totalPouringWeight = selectedPouringBatches.reduce((s, sp) => s + sp.pouring_weights.reduce((a, w) => a + w, 0), 0);

  const calcFe = (row: Record<string, number>): number => {
    const sum = (row.C || 0) + (row.Si || 0) + (row.Mn || 0) + (row.P || 0) + (row.S || 0) + (row.Ni || 0) + (row.Cr || 0) + (row.Mo || 0) + (row.Cu || 0);
    return Math.round((100 - sum) * 1000) / 1000;
  };

  // Add material row
  const addMaterialRow = () => {
    const name = newMaterialRow.raw_material.trim();
    if (!name) { toast({ title: '請選擇或輸入原料名稱', variant: 'destructive' }); return; }
    // 自動修正重複原料：同名原料不再另起一列，直接把重量累加到既有那一筆
    const existingIdx = materials.findIndex(m => m.raw_material.trim() === name);
    if (existingIdx >= 0) {
      const merged = materials.map((m, i) => (i === existingIdx ? {
        ...m,
        raw_material: name,
        charge_weight: roundWeight((Number(m.charge_weight) || 0) + (Number(newMaterialRow.charge_weight) || 0)),
        secondary_weight: roundWeight((Number(m.secondary_weight) || 0) + (Number(newMaterialRow.secondary_weight) || 0)),
      } : m));
      setMaterials(merged);
      setNewMaterialRow({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
      toast({
        title: `已自動合併重複原料「${name}」`,
        description: `重量已累加至既有該筆：首次 ${merged[existingIdx].charge_weight} kg、二次 ${merged[existingIdx].secondary_weight} kg。`,
      });
      return;
    }
    setMaterials([...materials, { raw_material: name, charge_weight: newMaterialRow.charge_weight, secondary_weight: newMaterialRow.secondary_weight }]);
    setNewMaterialRow({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
  };

  const loadPresetRecipe = (recipeId: string) => {
    const recipe = presetRecipes.find(r => r.id === recipeId);
    if (!recipe) return;
    // 自動修正重複原料：配比中與現有清單同名的原料直接累加重量，不再跳過也不重複新增
    const { merged, mergedNames } = mergeDuplicateMaterials([
      ...materials,
      ...recipe.materials
        .filter(m => m.raw_material.trim())
        .map(m => ({ raw_material: m.raw_material.trim(), charge_weight: m.charge_weight, secondary_weight: m.secondary_weight })),
    ]);
    setMaterials(merged);
    toast({
      title: `已載入配比「${recipe.name}」`,
      description: mergedNames.length > 0
        ? `重複原料（${mergedNames.join('、')}）已自動合併並累加重量。`
        : undefined,
    });
  };

  const removeMaterialRow = (idx: number) => {
    setMaterials(materials.filter((_, i) => i !== idx));
  };

  const updateMaterialRow = (idx: number, field: string, value: number | string) => {
    const updated = [...materials];
    (updated[idx] as Record<string, unknown>)[field] = value;
    setMaterials(updated);
  };

  // Save
  const handleSave = async (andNew: boolean) => {
    if (saving) return;
    if (sequenceError || sequencePreview.invalid || (heatChanged && heatInput && !Number.isInteger(Number(heatInput)))) {
      toast({ title: '無法儲存爐次校正', description: sequenceError || '爐次必須是正整數；築爐週期必須從001連續累計。', variant: 'destructive' });
      return;
    }
    if (loadingRecord) {
      toast({ title: '明細載入中，請稍候再儲存', variant: 'destructive' });
      return;
    }
    if (!form.material_grade || !form.furnace_no) {
      toast({ title: '請填寫材質與爐號', variant: 'destructive' });
      return;
    }
    const trimmedMeltNo = form.melt_no.trim();
    if (isEdit && !trimmedMeltNo) {
      toast({ title: '熔解編號不可空白', variant: 'destructive' });
      return;
    }
    if (trimmedMeltNo && trimmedMeltNo.length > 40) {
      toast({ title: '熔解編號長度不可超過 40 字', variant: 'destructive' });
      return;
    }
    // 檢查熔解編號是否與其他紀錄重複
    if (trimmedMeltNo) {
      const allRecords = await getMeltRecords();
      const duplicated = allRecords.some(r => r.melt_no === trimmedMeltNo && r.id !== editRecord?.id);
      if (duplicated) {
        toast({ title: `熔解編號「${trimmedMeltNo}」已存在，請改用其他編號`, variant: 'destructive' });
        return;
      }
    }
    if (form.power_start_time && form.tap_time && !validateTime(form.power_start_time, form.tap_time)) {
      toast({ title: '出湯時間不可早於開始送電時間', variant: 'destructive' });
      return;
    }
    // 自動修正重複原料：儲存前最後防線，同名原料自動合併為一筆並累加重量
    const { merged: mergedMaterials, mergedNames: autoMergedNames } = mergeDuplicateMaterials(materials);
    if (autoMergedNames.length > 0) {
      setMaterials(mergedMaterials);
      toast({
        title: `已自動合併重複原料（${autoMergedNames.join('、')}）`,
        description: '同名原料已併為一筆並累加重量，總投料與能耗依合併後結果計算。',
      });
    }
    const materialsToSave = mergedMaterials;

    // 編輯交易鎖：整個「更新父紀錄 → 逐一刪除舊明細 → 重建新明細 → 重算」流程期間，
    // 暫停 melt_records／melt_materials／melt_chemistry 的背景整表同步，
    // 避免過期快照把剛刪除的列寫回雲端（復活）或以中間狀態蓋掉最終重算的衍生欄位。
    const editTxTables = ['melt_records', 'melt_materials', 'melt_chemistry'] as const;
    try {
      setSaving(true);
      await beginEditTransaction([...editTxTables]);
      const saved = await saveSequenceRecord({
        ...form, id: draftId, melt_no: sequencePreview.current.melt_no,
        melt_minutes: meltMinutes, residual_weight: Number(residualWeight) || 0,
      }, body, rebuild, sequencePreview.current.heat_anchor ?? null);
      const recordId = saved.id;
      if (isEdit && editRecord) {
        const oldMats = await getMeltMaterials(recordId);
        for (const m of oldMats) { await deleteMeltMaterial(m.id); }
        const oldChem = await getMeltChemistry(recordId);
        for (const c of oldChem) { await deleteMeltChemistry(c.id); }
      }

      for (const m of materialsToSave) {
        await createMeltMaterial({ melt_id: recordId, raw_material: m.raw_material, charge_weight: m.charge_weight, secondary_weight: m.secondary_weight });
      }

      // Save TARGET as range (store max values for compatibility, min/max in separate storage)
      const targetHasData = Object.values(targetRange).some(v => v > 0);
      if (targetHasData) {
        // Store TARGET using max values in the standard fields (for backward compat)
        const elements = ['C', 'Si', 'Mn', 'P', 'S', 'Ni', 'Cr', 'Mo', 'Cu'] as const;
        const targetRow: Record<string, number> = {};
        elements.forEach(el => { targetRow[el] = targetRange[`${el}_max`] || 0; });
        const fe = autoCalcFe ? calcFe(targetRow) : 0;
        await createMeltChemistry({
          melt_id: recordId,
          sample_stage: 'TARGET',
          C: targetRow.C, Si: targetRow.Si, Mn: targetRow.Mn,
          P: targetRow.P, S: targetRow.S, Ni: targetRow.Ni,
          Cr: targetRow.Cr, Mo: targetRow.Mo, Cu: targetRow.Cu,
          Fe: fe,
        });
        // Save the full min/max range separately
        await saveMeltTargetRange(recordId, targetRange);
      } else {
        // 目標值全部清空代表不再需要成份紀錄：除了不重建雲端列，
        // 也必須清掉本機暫存的目標範圍，否則下次開啟會把舊值回填而讓資料復活。
        await deleteMeltTargetRange(recordId);
      }

      // Save IN_FURNACE and AFTER_FURNACE
      const otherStages: Array<'IN_FURNACE' | 'AFTER_FURNACE'> = ['IN_FURNACE', 'AFTER_FURNACE'];
      for (const stage of otherStages) {
        const row = chemRows[stage];
        const hasData = Object.values(row).some(v => v > 0);
        if (hasData) {
          const fe = autoCalcFe ? calcFe(row) : 0;
          await createMeltChemistry({
            melt_id: recordId,
            sample_stage: stage,
            C: row.C || 0, Si: row.Si || 0, Mn: row.Mn || 0,
            P: row.P || 0, S: row.S || 0, Ni: row.Ni || 0,
            Cr: row.Cr || 0, Mo: row.Mo || 0, Cu: row.Cu || 0,
            Fe: fe,
          });
        }
      }

      // Save pouring batches data
      const pouringKey = `melt_pouring_${recordId}`;
      if (selectedPouringBatches.length > 0) {
        localStorage.setItem(pouringKey, JSON.stringify(selectedPouringBatches));
      } else {
        localStorage.removeItem(pouringKey);
      }

      await recalcMeltRecord(recordId);
      setSequenceRecords(await loadSequenceRecords());
      toast({ title: isEdit ? '熔解紀錄已更新' : '熔解紀錄已建立' });

      if (andNew) {
        resetFormState();
        onSavedAndNew();
      } else {
        onOpenChange(false);
        onSaved();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MeltingManagement] Save failed:', err);
      if (msg.includes('CLOUD_DELETE_NOT_APPLIED')) {
        // 舊明細未真的從雲端刪除時必須中止，避免雲端留著舊投料而在下次讀取時復活
        toast({
          title: '雲端舊明細刪除未生效，已中止儲存',
          description: '請確認 Supabase 的 DELETE 權限後重新儲存；本次刪除已排入待同步重試。',
          variant: 'destructive',
        });
      } else if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，儲存未完成', description: '爐次校正未排入離線同步；請確認權限後再儲存。', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，請重新載入確認儲存結果', description: '爐次校正不採離線儲存，請恢復連線後再試。', variant: 'destructive' });
      } else {
        toast({ title: '儲存未完成', description: msg, variant: 'destructive' });
      }
    } finally {
      // 無論儲存成功或失敗都必須解鎖；解鎖會補一次以上傳當下最新狀態為準的最終同步
      endEditTransaction([...editTxTables]);
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-800 border-zinc-700 max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-2 border-b border-zinc-700 sticky top-0 bg-zinc-800 z-10">
          <DialogTitle className="text-zinc-100 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" />
            {isEdit ? `編輯熔解紀錄 - ${editRecord?.melt_no}` : '新增熔解紀錄'}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* 區塊一：基本資料 */}
          <Card className="bg-zinc-700/20 border-zinc-700">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />基本資料
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-zinc-400 text-xs">熔解編號{isEdit ? ' *（可修改）' : '（可留空自動產生）'}</Label>
                  <Input
                    value={form.melt_no}
                    onChange={e => setForm({ ...form, melt_no: e.target.value })}
                    className="bg-zinc-700 border-zinc-600 text-amber-400 font-mono h-8"
                    placeholder="例：ML-20260915-1-1"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">
                    {isEdit
                      ? '可直接改寫此爐的熔解編號，儲存後清單與追溯查詢會同步更新（不可與其他爐重複）。'
                      : '留空時自動依「ML-日期-爐號」規則產生；亦可自行輸入自訂編號。'}
                  </p>
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">日期 *</Label>
                  <Input type="date" value={form.melt_date} onChange={e => setForm({ ...form, melt_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">材質 *（來自材質規範）</Label>
                  <Select value={form.material_grade} onValueChange={handleMaterialGradeChange}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8"><SelectValue placeholder="選擇材質規範" /></SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {materialGradeOptions.length === 0 && (
                        <SelectItem value="__none__" disabled className="text-zinc-400">尚無材質規範</SelectItem>
                      )}
                      {materialGradeOptions.map(name => (
                        <SelectItem key={name} value={name} className="text-zinc-100">
                          {name}{materialSpecs.some(s => s.name === name) ? '' : '（無規範）'}
                        </SelectItem>
                      ))}
                      <SelectItem value={ADD_SPEC_OPTION} className="text-purple-300">＋ 新增材質規範</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedSpec ? (
                    <p className="text-[11px] text-purple-300 mt-1">
                      已套用「{selectedSpec.name}」規範，成份紀錄目標值已自動代入
                    </p>
                  ) : form.material_grade ? (
                    <p className="text-[11px] text-zinc-500 mt-1">此材質尚無成分規範，目標值請手動輸入</p>
                  ) : null}
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">爐號 *</Label>
                  <Select value={form.furnace_no} onValueChange={v => setForm({ ...form, furnace_no: v })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8"><SelectValue placeholder="選擇爐號" /></SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">{FURNACE_OPTIONS.map(f => (<SelectItem key={f} value={f} className="text-zinc-100">{f}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">出爐溫度 (℃)</Label>
                  <Input type="number" value={form.tap_temp || ''} onChange={e => setForm({ ...form, tap_temp: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" placeholder="1600" />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">開始送電時間 * (24小時制)</Label>
                  <Input type="time" value={form.power_start_time} onChange={e => { setForm({ ...form, power_start_time: e.target.value }); validateTime(e.target.value, form.tap_time); }} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">出湯時間 * (24小時制)</Label>
                  <Input type="time" value={form.tap_time} onChange={e => { setForm({ ...form, tap_time: e.target.value }); validateTime(form.power_start_time, e.target.value); }} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
                </div>
              </div>
              <fieldset disabled={saving} className="mt-3 rounded border border-zinc-600 p-3 space-y-3">
                <legend className="px-1 text-sm text-zinc-200">爐體與累計爐次</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="furnace-body" className="text-zinc-300">爐體</Label>
                    <select id="furnace-body" data-testid="furnace-body" value={body} onChange={e => setBody(Number(e.target.value))} className="w-full rounded border border-zinc-600 bg-zinc-700 p-2 text-zinc-100">
                      {[1,2,3].map(n => <option key={n} value={n}>{n} 號爐體</option>)}
                    </select>
                  </div>
                  <div><Label htmlFor="heat-sequence" className="text-zinc-300">累計爐次（可校正）</Label>
                    <Input id="heat-sequence" data-testid="heat-sequence" type="number" min={1} step={1} disabled={rebuild} value={rebuild ? '1' : heatChanged ? heatInput : String(sequencePreview.current.heat_sequence || '')} placeholder={String(sequencePreview.current.heat_sequence || 1)} onChange={e => { setHeatInput(e.target.value); setHeatChanged(true); }} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-200"><input data-testid="heat-rebuild" type="checkbox" checked={rebuild} onChange={e => setRebuild(e.target.checked)} />本批為重新築爐後第一批（001）</label>
                <p className="text-xs text-zinc-300">依日期及熔解編號數字順序校正（ML-2 → ML-9 → ML-10），僅調整同爐體、同築爐週期。每日第一批另行判定。</p>
                <p data-testid="heat-preview" className="text-sm text-amber-300">預計爐次 {formatHeat(sequencePreview.current.heat_sequence)} · {sequencePreview.current.cycle_number ? `築爐週期 ${sequencePreview.current.cycle_number}` : '既有週期（未標記築爐）'} · 每日第 {sequencePreview.current.daily_sequence} 批</p>
                {(sequenceError || sequencePreview.invalid) && <p role="alert" className="text-sm text-red-300">{sequenceError || '校正後不得出現零或負爐次；已築爐週期必須由001連續累計。'}</p>}
                <details className="text-xs text-zinc-300"><summary className="cursor-pointer">查看同週期校正預覽（{sequencePreview.affected.length} 批）</summary><div className="max-h-40 overflow-y-auto mt-2">{sequencePreview.affected.map(r => <div key={r.id} className="flex justify-between gap-2 py-1"><span>{r.melt_date} · {r.melt_no}</span><span>{formatHeat(sequenceRecords.find(old => old.id === r.id)?.heat_sequence)} → {formatHeat(r.heat_sequence)}</span></div>)}</div></details>
              </fieldset>
              {timeError && <p className="text-xs text-red-400 mt-2">⚠️ {timeError}</p>}

              {/* Auto-calculated fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <Label className="text-zinc-400 text-xs">熔解時間（自動）</Label>
                  <div className="h-8 flex items-center px-3 bg-zinc-900/50 border border-zinc-600 rounded-md text-amber-400 font-bold text-sm">
                    {meltMinutes > 0 ? formatMeltMinutes(meltMinutes) : '--:--'}
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">耗電度數 (kWh)</Label>
                  <Input type="number" value={form.power_kwh || ''} onChange={e => setForm({ ...form, power_kwh: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" placeholder="1850" />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">總投料重量（自動）</Label>
                  <div className="h-8 flex items-center px-3 bg-zinc-900/50 border border-zinc-600 rounded-md text-amber-400 font-bold text-sm">
                    {totalChargeWeight} kg
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">能耗（自動）</Label>
                  <div className="h-8 flex items-center px-3 bg-zinc-900/50 border border-zinc-600 rounded-md text-amber-400 font-bold text-sm">
                    {specificEnergy > 0 ? `${specificEnergy} kWh/kg` : '-- kWh/kg'}
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">建立人</Label>
                  <Input value={form.created_by} onChange={e => setForm({ ...form, created_by: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" placeholder="操作員姓名" />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">備註</Label>
                  <Input value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 區塊二：投料明細 (Collapsible) */}
          <Collapsible open={materialsOpen} onOpenChange={setMaterialsOpen}>
            <Card className="bg-zinc-700/20 border-zinc-700">
              <CollapsibleTrigger asChild>
                <CardHeader className="p-3 pb-2 cursor-pointer hover:bg-zinc-700/30 rounded-t-lg">
                  <CardTitle className="text-sm text-zinc-300 flex items-center justify-between">
                    <span className="flex items-center gap-2"><Layers className="w-4 h-4 text-blue-400" />投料明細</span>
                    {materialsOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0 space-y-2">
                  {/* Load preset recipe */}
                  {presetRecipes.length > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      <Label className="text-zinc-400 text-xs whitespace-nowrap">載入配比：</Label>
                      <Select onValueChange={loadPresetRecipe}>
                        <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs flex-1"><SelectValue placeholder="選擇預設配比" /></SelectTrigger>
                        <SelectContent className="bg-zinc-700 border-zinc-600">
                          {presetRecipes.map(r => (<SelectItem key={r.id} value={r.id} className="text-zinc-100">{r.name} ({r.materials.length}項)</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Materials table */}
                  {materials.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" data-testid="dlg-materials-table">
                        <thead>
                          <tr className="text-zinc-500 border-b border-zinc-700">
                            <th className="text-left py-1.5 pr-2">原料</th>
                            <th className="text-right py-1.5 pr-2 w-24">首次投料(kg)</th>
                            <th className="text-right py-1.5 pr-2 w-24">二次添加(kg)</th>
                            <th className="text-right py-1.5 pr-2 w-16">小計</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {materials.map((m, idx) => (
                            <tr key={idx} className="text-zinc-300 border-b border-zinc-700/50" data-testid="dlg-material-row" data-material={m.raw_material}>
                              <td className="py-1 pr-2">{m.raw_material}</td>
                              <td className="text-right py-1 pr-2">
                                <Input type="number" min="0" disabled={loadingRecord} value={m.charge_weight || ''} onChange={e => updateMaterialRow(idx, 'charge_weight', Math.max(0, Number(e.target.value)))} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-xs w-20 ml-auto" />
                              </td>
                              <td className="text-right py-1 pr-2">
                                <Input type="number" min="0" disabled={loadingRecord} value={m.secondary_weight || ''} onChange={e => updateMaterialRow(idx, 'secondary_weight', Math.max(0, Number(e.target.value)))} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-xs w-20 ml-auto" />
                              </td>
                              <td className="text-right py-1 pr-2 font-medium text-zinc-200">{m.charge_weight + m.secondary_weight}</td>
                              <td className="py-1">
                                <Button size="sm" variant="ghost" data-testid="dlg-material-remove" disabled={loadingRecord} onClick={() => removeMaterialRow(idx)} className="text-zinc-400 hover:text-red-400 h-5 w-5 p-0 disabled:opacity-40"><Trash2 className="w-3 h-3" /></Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Total */}
                  <div className="flex justify-end text-xs font-medium text-amber-400 pr-10" data-testid="dlg-total-charge">
                    總投料重量：{totalChargeWeight} kg
                  </div>

                  {/* Add row */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1 min-w-0">
                      <MaterialCombobox
                        value={newMaterialRow.raw_material}
                        onChange={v => setNewMaterialRow({ ...newMaterialRow, raw_material: v })}
                        options={materialOptionNames}
                        onCreate={onCreateMaterialOption}
                        onDelete={onDeleteMaterialOption}
                        usedOptions={materials.map(m => m.raw_material.trim())}
                        className="h-7 text-xs"
                        testId="dlg-new-material-combobox"
                      />
                    </div>
                    <Input type="number" min="0" disabled={loadingRecord} value={newMaterialRow.charge_weight || ''} onChange={e => setNewMaterialRow({ ...newMaterialRow, charge_weight: Math.max(0, Number(e.target.value)) })} placeholder="首次(kg)" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs w-full sm:w-24" />
                    <Input type="number" min="0" disabled={loadingRecord} value={newMaterialRow.secondary_weight || ''} onChange={e => setNewMaterialRow({ ...newMaterialRow, secondary_weight: Math.max(0, Number(e.target.value)) })} placeholder="二次(kg)" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs w-full sm:w-24" />
                    <Button size="sm" data-testid="dlg-add-material" disabled={loadingRecord} onClick={addMaterialRow} className="bg-blue-500 hover:bg-blue-600 text-white h-7 text-xs whitespace-nowrap shrink-0 disabled:opacity-50">
                      <Plus className="w-3 h-3 mr-1" />新增
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* 區塊二之一：澆注殘湯重量 (Collapsible) — 位於投料明細下方獨立呈現 */}
          <Collapsible open={residualOpen} onOpenChange={setResidualOpen}>
            <Card className="bg-zinc-700/20 border-zinc-700">
              <CollapsibleTrigger asChild>
                <CardHeader className="p-3 pb-2 cursor-pointer hover:bg-zinc-700/30 rounded-t-lg">
                  <CardTitle className="text-sm text-zinc-300 flex items-center justify-between">
                    <span className="flex items-center gap-2"><Droplets className="w-4 h-4 text-violet-400" />澆注殘湯重量</span>
                    {residualOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0 space-y-2">
                  <div>
                    <Label className="text-zinc-400 text-xs">本爐殘湯重量 (kg)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={residualWeight}
                      onChange={e => setResidualWeight(e.target.value)}
                      className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs mt-1"
                      placeholder="澆注結束後爐內剩餘鐵水，可不填"
                    />
                    {Number(residualWeight) > 0 && totalPouringWeight > 0 && (
                      <p className="text-xs text-zinc-400 mt-1">
                        殘湯率: <span className="text-violet-300 font-bold">{((Number(residualWeight) / totalPouringWeight) * 100).toFixed(1)}%</span>
                        （殘湯 {Number(residualWeight)} kg ÷ 總出湯 {totalPouringWeight} kg × 100%）
                      </p>
                    )}
                    {Number(residualWeight) > 0 && totalPouringWeight <= 0 && (
                      <p className="text-xs text-zinc-500 mt-1">提示：於下方「澆注紀錄」選取批次並填寫實際澆注重量後，即可試算殘湯率。</p>
                    )}
                    <p className="text-[11px] text-zinc-500 mt-1">殘湯重量隨熔解紀錄儲存並同步至雲端；殘湯率 = 殘湯重量 ÷ 總出湯重量 × 100%。</p>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* 區塊三：澆注紀錄 (Collapsible) - Select completed batches */}
          <Collapsible open={pouringOpen} onOpenChange={setPouringOpen}>
            <Card className="bg-zinc-700/20 border-zinc-700">
              <CollapsibleTrigger asChild>
                <CardHeader className="p-3 pb-2 cursor-pointer hover:bg-zinc-700/30 rounded-t-lg">
                  <CardTitle className="text-sm text-zinc-300 flex items-center justify-between">
                    <span className="flex items-center gap-2"><Flame className="w-4 h-4 text-orange-400" />澆注紀錄（已完成造模批次）</span>
                    {pouringOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0 space-y-3">
                  {/* Search completed batches */}
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs">搜尋已完成造模批次（客戶、材質、品名）</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-zinc-500" />
                      <Input
                        value={pouringBatchSearch}
                        onChange={e => setPouringBatchSearch(e.target.value)}
                        placeholder="輸入客戶、材質或品名搜尋..."
                        className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs pl-7"
                      />
                    </div>
                    {pouringBatchSearch && (() => {
                      const keyword = pouringBatchSearch.toLowerCase();
                      const completedBatches = allBatches.filter(b =>
                        b.status === 'Completed' &&
                        !selectedPouringBatches.some(sp => sp.batch_id === b.id) &&
                        (
                          (b.customer || '').toLowerCase().includes(keyword) ||
                          (b.material || '').toLowerCase().includes(keyword) ||
                          (b.product_name || '').toLowerCase().includes(keyword) ||
                          b.batch_no.toLowerCase().includes(keyword)
                        )
                      );
                      return completedBatches.length > 0 ? (
                        <div className="max-h-32 overflow-y-auto border border-zinc-600 rounded-md p-1 space-y-0.5">
                          {completedBatches.map(b => {
                            const wo = allWorkOrders.find(w => w.id === b.work_order_id);
                            const estWeight = wo?.estimated_weight || 0;
                            return (
                              <button
                                key={b.id}
                                onClick={() => {
                                  setSelectedPouringBatches([...selectedPouringBatches, {
                                    batch_id: b.id,
                                    batch_no: b.batch_no,
                                    customer: b.customer || '',
                                    product_name: b.product_name || '',
                                    material: b.material || '',
                                    quantity: b.quantity_planned,
                                    estimated_weight: estWeight,
                                    estimated_pouring_weight: b.estimated_pouring_weight || 0,
                                    pouring_weights: new Array(b.quantity_planned).fill(0),
                                  }]);
                                  setPouringBatchSearch('');
                                }}
                                className="w-full text-left p-1.5 rounded hover:bg-zinc-600 text-xs"
                              >
                                <span className="font-mono text-amber-400">{b.batch_no}</span>
                                <span className="text-zinc-400 ml-2">客戶: {b.customer || '-'} | 品名: {b.product_name || '-'} | 材質: {b.material || '-'} | 數量: {b.quantity_planned} | 預估成品重量: {estWeight}kg | 預計澆注: {b.estimated_pouring_weight || 0}kg</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 p-2 text-center border border-zinc-600 rounded-md">無符合的已完成批次</p>
                      );
                    })()}
                  </div>

                  {/* Selected batches with pouring weight inputs */}
                  {selectedPouringBatches.length > 0 && (
                    <div className="space-y-3">
                      {selectedPouringBatches.map((sp, spIdx) => (
                        <Card key={sp.batch_id} className="bg-zinc-700/30 border-zinc-600">
                          <CardContent className="p-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-xs">
                                <span className="font-mono text-amber-400">{sp.batch_no}</span>
                                <span className="text-zinc-400 ml-2">客戶: {sp.customer} | 品名: {sp.product_name} | 材質: {sp.material}</span>
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => setSelectedPouringBatches(selectedPouringBatches.filter((_, i) => i !== spIdx))} className="text-zinc-400 hover:text-red-400 h-5 w-5 p-0">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="text-xs text-zinc-400">
                              數量: <span className="text-zinc-200">{sp.quantity}</span> | 預估成品重量: <span className="text-zinc-200">{sp.estimated_weight} kg</span> | 預計澆注重量: <span className="text-zinc-200">{sp.estimated_pouring_weight} kg</span>
                            </div>
                            <div className="space-y-1">
                              {sp.pouring_weights.map((w, wIdx) => {
                                const yieldRate = w > 0 && sp.estimated_weight > 0 ? ((sp.estimated_weight / w) * 100).toFixed(1) : '0.0';
                                return (
                                  <div key={wIdx} className="flex items-center gap-2">
                                    <span className="text-[10px] text-zinc-400 w-12">第{wIdx + 1}件</span>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      value={w || ''}
                                      onChange={e => {
                                        const updated = [...selectedPouringBatches];
                                        updated[spIdx].pouring_weights[wIdx] = Math.max(0, Number(e.target.value));
                                        setSelectedPouringBatches(updated);
                                      }}
                                      placeholder="實際澆注(kg)"
                                      className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-xs w-24"
                                    />
                                    <span className={`text-[10px] font-bold ${Number(yieldRate) >= 80 ? 'text-green-400' : Number(yieldRate) >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                                      成品率: {yieldRate}%
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            {/* Summary for this batch */}
                            {(() => {
                              const totalPouring = sp.pouring_weights.reduce((s, w) => s + w, 0);
                              const avgRate = totalPouring > 0 && sp.estimated_weight > 0
                                ? ((sp.estimated_weight * sp.quantity / totalPouring) * 100).toFixed(1)
                                : '0.0';
                              return (
                                <div className="flex gap-3 text-[10px] text-zinc-400 pt-1 border-t border-zinc-600/50">
                                  <span>總澆注重量: <span className="text-zinc-200 font-medium">{totalPouring} kg</span></span>
                                  <span>平均成品率: <span className={`font-bold ${Number(avgRate) >= 80 ? 'text-green-400' : Number(avgRate) >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{avgRate}%</span></span>
                                </div>
                              );
                            })()}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {selectedPouringBatches.length === 0 && (
                    <p className="text-xs text-zinc-500 text-center py-2">尚未選取批次，請搜尋並選取已完成的造模批次</p>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* 區塊四：成份紀錄 (Collapsible) */}
          <Collapsible open={chemistryOpen} onOpenChange={setChemistryOpen}>
            <Card className="bg-zinc-700/20 border-zinc-700">
              <CollapsibleTrigger asChild>
                <CardHeader className="p-3 pb-2 cursor-pointer hover:bg-zinc-700/30 rounded-t-lg">
                  <CardTitle className="text-sm text-zinc-300 flex items-center justify-between">
                    <span className="flex items-center gap-2"><FlaskConical className="w-4 h-4 text-purple-400" />成份紀錄</span>
                    {chemistryOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                      <input type="checkbox" checked={autoCalcFe} onChange={e => setAutoCalcFe(e.target.checked)} className="rounded border-zinc-600" />
                      Fe 自動計算 (100 - 其他元素總和)
                    </label>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" data-testid="dlg-chemistry-table">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-700">
                          <th className="text-left py-1.5 pr-2 w-12">階段</th>
                          {CHEMISTRY_ELEMENTS.map(el => (
                            <th key={el} className="text-center py-1.5 px-0.5 w-14">{el}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* TARGET row - range inputs (min~max) */}
                        <tr className="border-b border-zinc-700/50">
                          <td className="py-1.5 pr-2 text-amber-400 font-medium whitespace-nowrap">目標</td>
                          {CHEMISTRY_ELEMENTS.map(el => (
                            <td key={el} className="py-1 px-0.5">
                              {el === 'Fe' ? (
                                <div className="h-10 flex items-center justify-center text-zinc-500 text-xs bg-zinc-900/30 rounded border border-zinc-700">
                                  Bal
                                </div>
                              ) : (
                                <div className="flex flex-col gap-0.5">
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    data-testid={`dlg-chem-TARGET-${el}-min`}
                                    disabled={loadingRecord}
                                    value={targetRange[`${el}_min`] || ''}
                                    onChange={e => setTargetRange({ ...targetRange, [`${el}_min`]: Number(e.target.value) })}
                                    placeholder="min"
                                    className="bg-zinc-700 border-zinc-600 text-zinc-100 h-5 text-[10px] text-center w-full px-0.5"
                                  />
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    data-testid={`dlg-chem-TARGET-${el}-max`}
                                    disabled={loadingRecord}
                                    value={targetRange[`${el}_max`] || ''}
                                    onChange={e => setTargetRange({ ...targetRange, [`${el}_max`]: Number(e.target.value) })}
                                    placeholder="max"
                                    className="bg-zinc-700 border-zinc-600 text-zinc-100 h-5 text-[10px] text-center w-full px-0.5"
                                  />
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                        {/* IN_FURNACE and AFTER_FURNACE rows - single value */}
                        {(['IN_FURNACE', 'AFTER_FURNACE'] as const).map(stage => (
                          <tr key={stage} className="border-b border-zinc-700/50" data-testid={`dlg-chem-row-${stage}`}>
                            <td className="py-1.5 pr-2 text-amber-400 font-medium whitespace-nowrap">{SAMPLE_STAGE_LABELS[stage]}</td>
                            {CHEMISTRY_ELEMENTS.map(el => (
                              <td key={el} className="py-1 px-0.5">
                                {el === 'Fe' ? (
                                  <div className="h-6 flex items-center justify-center text-zinc-500 text-xs bg-zinc-900/30 rounded border border-zinc-700">
                                    {autoCalcFe ? calcFe(chemRows[stage]).toFixed(3) : 'Bal'}
                                  </div>
                                ) : (
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    data-testid={`dlg-chem-${stage}-${el}`}
                                    disabled={loadingRecord}
                                    value={chemRows[stage][el] || ''}
                                    onChange={e => {
                                      const newRows = { ...chemRows };
                                      newRows[stage] = { ...newRows[stage], [el]: Number(e.target.value) };
                                      setChemRows(newRows);
                                    }}
                                    className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-xs text-center w-full px-1"
                                  />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>

        {/* Fixed bottom action bar */}
        <div className="sticky bottom-0 p-4 pt-3 border-t border-zinc-700 bg-zinc-800 flex flex-col sm:flex-row gap-2 justify-end">
          <Button variant="ghost" data-testid="dlg-cancel" onClick={() => onOpenChange(false)} className="text-zinc-400 hover:text-zinc-200">
            取消
          </Button>
          <Button data-testid="dlg-save" onClick={() => handleSave(false)} disabled={!!timeError || loadingRecord || saving || !!sequenceError || sequencePreview.invalid} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 disabled:opacity-50">
            儲存
          </Button>
          {!isEdit && (
            <Button onClick={() => handleSave(true)} disabled={!!timeError || loadingRecord || saving || !!sequenceError || sequencePreview.invalid} className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
              儲存並新增下一爐
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}