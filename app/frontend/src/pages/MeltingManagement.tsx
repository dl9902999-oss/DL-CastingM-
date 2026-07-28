import { useState, useEffect } from 'react';
import { useSyncTrigger } from '@/hooks/useSyncedData';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MeltRecord, MeltMaterial, MeltChemistry, SampleStage, MoldingBatch, WorkOrder } from '@/lib/types';
import {
  dsGetMeltRecords, dsCreateMeltRecord, dsUpdateMeltRecord, dsDeleteMeltRecord,
  dsGetMeltMaterials, dsCreateMeltMaterial, dsDeleteMeltMaterial,
  dsGetMeltChemistry, dsCreateMeltChemistry, dsDeleteMeltChemistry,
  dsRecalcMeltRecord, dsGetMeltTargetRange, dsSaveMeltTargetRange,
  dsGetMoldingBatches, dsGetWorkOrders,
  dsGetMeltPourings, dsCreateMeltPouring, dsUpdateMeltPouring, dsDeleteMeltPouring,
  dsGetMeltPresetRecipes, dsCreateMeltPresetRecipe, dsUpdateMeltPresetRecipe, dsDeleteMeltPresetRecipe,
} from '@/lib/dataService';

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
const getMoldingBatches = dsGetMoldingBatches as unknown as (...args: Parameters<typeof dsGetMoldingBatches>) => Awaited<ReturnType<typeof dsGetMoldingBatches>>;
const getWorkOrders = dsGetWorkOrders as unknown as (...args: Parameters<typeof dsGetWorkOrders>) => Awaited<ReturnType<typeof dsGetWorkOrders>>;
import { Plus, Flame, Pencil, Trash2, FlaskConical, Layers, Zap, Clock, Thermometer, ChevronDown, ChevronUp, Copy, Search, Download, FileText, Package, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SAMPLE_STAGE_LABELS: Record<SampleStage, string> = {
  TARGET: '目標',
  IN_FURNACE: '爐中',
  AFTER_FURNACE: '爐後',
};

const CHEMISTRY_ELEMENTS = ['C', 'Si', 'Mn', 'P', 'S', 'Ni', 'Cr', 'Mo', 'Cu', 'Fe'] as const;

const MATERIAL_OPTIONS = ['回爐料', '廢鐵', '矽鐵', '高碳錳鐵', '增碳劑', '純鎳', '430', '鉬鐵', '廢鋼', 'FeSi', 'FeMn', 'FeCr', 'FeMo', '生鐵', '不鏽鋼廢料'];

const FURNACE_OPTIONS = ['1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4', '3-1', '3-2', '3-3', '3-4', '3-5'];

// === Preset Recipe Types & Storage ===
interface PresetRecipe {
  id: string;
  name: string;
  materials: Array<{ raw_material: string; charge_weight: number; secondary_weight: number }>;
  created_at: string;
}

const PRESET_RECIPES_KEY = 'melt_preset_recipes';

function getPresetRecipes(): PresetRecipe[] {
  const data = localStorage.getItem(PRESET_RECIPES_KEY);
  return data ? JSON.parse(data) : [];
}

function savePresetRecipes(recipes: PresetRecipe[]) {
  localStorage.setItem(PRESET_RECIPES_KEY, JSON.stringify(recipes));
}

function createPresetRecipe(name: string, materials: Array<{ raw_material: string; charge_weight: number; secondary_weight: number }>): PresetRecipe {
  const recipes = getPresetRecipes();
  const newRecipe: PresetRecipe = {
    id: crypto.randomUUID(),
    name,
    materials,
    created_at: new Date().toISOString(),
  };
  recipes.push(newRecipe);
  savePresetRecipes(recipes);
  return newRecipe;
}

function deletePresetRecipe(id: string) {
  const recipes = getPresetRecipes().filter(r => r.id !== id);
  savePresetRecipes(recipes);
}

export default function MeltingManagement() {
  const [records, setRecords] = useState<MeltRecord[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MeltRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterFurnace, setFilterFurnace] = useState('');
  const [showPresetManager, setShowPresetManager] = useState(false);
  const { toast } = useToast();

  const syncTrigger = useSyncTrigger();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getMeltRecords();
      if (!cancelled) setRecords(data);
    })();
    return () => { cancelled = true; };
  }, [syncTrigger]);

  const refreshRecords = async () => setRecords(await getMeltRecords());

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
    const headers = ['熔解編號', '日期', '材質', '爐號', '開始送電', '出湯時間', '熔解時間(分)', '耗電(kWh)', '總投料(kg)', '能耗(kWh/kg)', '出爐溫度(℃)', '建立人', '備註'];
    const rows = filteredRecords.map(r => [
      r.melt_no, r.melt_date, r.material_grade, r.furnace_no,
      r.power_start_time, r.tap_time, r.melt_minutes,
      r.power_kwh, r.total_charge_weight, r.specific_energy,
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
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜尋編號、材質、爐號、建立人..." className="bg-zinc-800 border-zinc-700 text-zinc-100 pl-9 h-9" />
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
        <div className="space-y-3">
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
        />

        {/* Preset Recipe Manager Dialog */}
        <PresetRecipeManager
          open={showPresetManager}
          onOpenChange={setShowPresetManager}
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
function MeltRecordCard({ record, expanded, onToggle, onEdit, onDelete }: {
  record: MeltRecord; expanded: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void;
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
  }, [record.id]);

  useEffect(() => {
    if (!expanded) { setTargetRangeData(null); return; }
    let cancelled = false;
    (async () => {
      const [tr, batches] = await Promise.all([getMeltTargetRange(record.id), getMoldingBatches()]);
      if (!cancelled) { setTargetRangeData(tr); setCardBatches(batches); }
    })();
    return () => { cancelled = true; };
  }, [expanded, record.id]);

  return (
    <Card className="bg-zinc-800 border-zinc-700">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="font-mono text-sm font-semibold text-amber-400">{record.melt_no}</span>
              <span className="text-xs text-zinc-500">{record.melt_date}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-zinc-400">
              <span>材質: <span className="text-zinc-200">{record.material_grade}</span></span>
              <span>爐號: <span className="text-zinc-200">{record.furnace_no}</span></span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3" />耗電: <span className="text-zinc-200">{record.power_kwh} kWh</span></span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />時間: <span className="text-zinc-200">{(() => {
                if (record.power_start_time && record.tap_time) {
                  const [sh, sm] = record.power_start_time.split(':').map(Number);
                  const [eh, em] = record.tap_time.split(':').map(Number);
                  let diff = (eh * 60 + em) - (sh * 60 + sm);
                  if (diff < 0) diff += 24 * 60;
                  return formatMeltMinutes(diff);
                }
                return formatMeltMinutes(record.melt_minutes);
              })()}</span></span>
              <span>總投料: <span className="text-zinc-200">{record.total_charge_weight} kg</span></span>
              <span>能耗: <span className={`font-bold ${record.specific_energy > 1 ? 'text-red-400' : 'text-green-400'}`}>{record.specific_energy} kWh/kg</span></span>
              <span className="flex items-center gap-1"><Thermometer className="w-3 h-3" />出爐溫度: <span className="text-zinc-200">{record.tap_temp}℃</span></span>
              <span>建立人: <span className="text-zinc-200">{record.created_by || '-'}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-1 print:hidden">
            <Button variant="ghost" size="icon" onClick={onToggle} className="text-zinc-400 hover:text-zinc-100 h-7 w-7">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onEdit} className="text-zinc-400 hover:text-amber-400 h-7 w-7">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete} className="text-zinc-400 hover:text-red-400 h-7 w-7">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-zinc-700 space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-zinc-300">投料明細 ({materials.length} 筆)</span>
              </div>
              {materials.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
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
                <span className="text-xs font-medium text-zinc-300">成份紀錄 ({chemistry.length} 筆)</span>
              </div>
              {chemistry.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
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
function PresetRecipeManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [recipes, setRecipes] = useState<PresetRecipe[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMaterials, setNewMaterials] = useState<Array<{ raw_material: string; charge_weight: number; secondary_weight: number }>>([]);
  const [addRow, setAddRow] = useState({ raw_material: '', charge_weight: 0, secondary_weight: 0, custom: '' });
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editingMaterials, setEditingMaterials] = useState<Array<{ raw_material: string; charge_weight: number; secondary_weight: number }>>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setRecipes(getPresetRecipes());
  }, [open]);

  const handleAddMaterialRow = () => {
    const name = addRow.raw_material === '__custom__' ? addRow.custom : addRow.raw_material;
    if (!name) { toast({ title: '請選擇或輸入原料', variant: 'destructive' }); return; }
    setNewMaterials([...newMaterials, { raw_material: name, charge_weight: addRow.charge_weight, secondary_weight: addRow.secondary_weight }]);
    setAddRow({ raw_material: '', charge_weight: 0, secondary_weight: 0, custom: '' });
  };

  const handleSaveRecipe = () => {
    if (!newName.trim()) { toast({ title: '請輸入配比名稱', variant: 'destructive' }); return; }
    if (newMaterials.length === 0) { toast({ title: '請至少新增一項原料', variant: 'destructive' }); return; }
    createPresetRecipe(newName.trim(), newMaterials);
    setRecipes(getPresetRecipes());
    setNewName('');
    setNewMaterials([]);
    setIsAdding(false);
    toast({ title: '預設配比已建立' });
  };

  const handleDeleteRecipe = (id: string) => {
    if (!window.confirm('確定要刪除此預設配比？')) return;
    deletePresetRecipe(id);
    setRecipes(getPresetRecipes());
    toast({ title: '預設配比已刪除' });
  };

  const handleStartEdit = (recipe: PresetRecipe) => {
    setEditingRecipeId(recipe.id);
    setEditingMaterials(recipe.materials.map(m => ({ ...m })));
  };

  const handleCancelEdit = () => {
    setEditingRecipeId(null);
    setEditingMaterials([]);
  };

  const handleSaveEdit = () => {
    if (!editingRecipeId) return;
    const allRecipes = getPresetRecipes();
    const idx = allRecipes.findIndex(r => r.id === editingRecipeId);
    if (idx >= 0) {
      allRecipes[idx].materials = editingMaterials;
      savePresetRecipes(allRecipes);
      setRecipes(allRecipes);
      toast({ title: '配比已更新' });
    }
    setEditingRecipeId(null);
    setEditingMaterials([]);
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

          {recipes.map(recipe => (
            <Card key={recipe.id} className="bg-zinc-700/30 border-zinc-700">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-amber-400">{recipe.name}</span>
                  <div className="flex items-center gap-1">
                    {editingRecipeId === recipe.id ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="text-zinc-400 hover:text-zinc-200 h-6 px-2 text-xs">取消</Button>
                        <Button size="sm" onClick={handleSaveEdit} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 h-6 px-2 text-xs">儲存</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleStartEdit(recipe)} className="text-zinc-400 hover:text-blue-400 h-6 w-6 p-0">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteRecipe(recipe.id)} className="text-zinc-400 hover:text-red-400 h-6 w-6 p-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-zinc-500 border-b border-zinc-700"><th className="text-left py-1">原料</th><th className="text-right py-1">首次(kg)</th><th className="text-right py-1">二次(kg)</th><th className="text-right py-1">小計</th></tr></thead>
                    <tbody>
                      {editingRecipeId === recipe.id ? (
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
                          </tr>
                        ))
                      ) : (
                        recipe.materials.map((m, i) => (
                          <tr key={i} className="text-zinc-300 border-b border-zinc-700/50"><td className="py-1">{m.raw_material}</td><td className="text-right py-1">{m.charge_weight}</td><td className="text-right py-1">{m.secondary_weight}</td><td className="text-right py-1 font-medium">{m.charge_weight + m.secondary_weight}</td></tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-zinc-500 mt-1">總重: {editingRecipeId === recipe.id ? editingMaterials.reduce((s, m) => s + m.charge_weight + m.secondary_weight, 0) : recipe.materials.reduce((s, m) => s + m.charge_weight + m.secondary_weight, 0)} kg</p>
              </CardContent>
            </Card>
          ))}

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
                <div className="flex flex-col sm:flex-row gap-2 items-end">
                  <div className="flex-1">
                    <Select value={addRow.raw_material} onValueChange={v => setAddRow({ ...addRow, raw_material: v })}>
                      <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs"><SelectValue placeholder="選擇原料" /></SelectTrigger>
                      <SelectContent className="bg-zinc-700 border-zinc-600">
                        {MATERIAL_OPTIONS.map(m => (<SelectItem key={m} value={m} className="text-zinc-100">{m}</SelectItem>))}
                        <SelectItem value="__custom__" className="text-zinc-100">自行輸入</SelectItem>
                      </SelectContent>
                    </Select>
                    {addRow.raw_material === '__custom__' && (
                      <Input value={addRow.custom} onChange={e => setAddRow({ ...addRow, custom: e.target.value })} placeholder="原料名稱" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs mt-1" />
                    )}
                  </div>
                  <Input type="number" min="0" value={addRow.charge_weight || ''} onChange={e => setAddRow({ ...addRow, charge_weight: Math.max(0, Number(e.target.value)) })} placeholder="首次(kg)" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs w-24" />
                  <Input type="number" min="0" value={addRow.secondary_weight || ''} onChange={e => setAddRow({ ...addRow, secondary_weight: Math.max(0, Number(e.target.value)) })} placeholder="二次(kg)" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs w-24" />
                  <Button size="sm" onClick={handleAddMaterialRow} className="bg-blue-500 hover:bg-blue-600 text-white h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" />加入
                  </Button>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => { setIsAdding(false); setNewName(''); setNewMaterials([]); }} className="text-zinc-400 h-7 text-xs">取消</Button>
                  <Button size="sm" onClick={handleSaveRecipe} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 h-7 text-xs">儲存配比</Button>
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

// === Single Page Form Dialog (No Tabs) ===
function MeltFormDialog({ open, onOpenChange, editRecord, onSaved, onSavedAndNew, existingMaterials }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRecord: MeltRecord | null;
  onSaved: () => void;
  onSavedAndNew: () => void;
  existingMaterials: string[];
}) {
  const isEdit = !!editRecord;
  const { toast } = useToast();

  // Basic info form
  const [form, setForm] = useState({
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

  // Materials state
  const [materials, setMaterials] = useState<Array<{ id?: string; raw_material: string; charge_weight: number; secondary_weight: number }>>([]);
  const [newMaterialRow, setNewMaterialRow] = useState({ raw_material: '', charge_weight: 0, secondary_weight: 0, custom: '' });

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

  // Collapsible states
  const [materialsOpen, setMaterialsOpen] = useState(true);
  const [chemistryOpen, setChemistryOpen] = useState(true);
  const [pouringOpen, setPouringOpen] = useState(true);

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
    if (open) {
      (async () => {
      setPresetRecipes(getPresetRecipes());
      const [batches, orders] = await Promise.all([getMoldingBatches(), getWorkOrders()]);
      setAllBatches(batches);
      setAllWorkOrders(orders);
      if (editRecord) {
        // Load pouring data
        const pouringKey = `melt_pouring_${editRecord.id}`;
        const savedPouring = localStorage.getItem(pouringKey);
        if (savedPouring) {
          try { setSelectedPouringBatches(JSON.parse(savedPouring)); } catch { setSelectedPouringBatches([]); }
        } else {
          setSelectedPouringBatches([]);
        }
        setForm({
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
        const mats = await getMeltMaterials(editRecord.id);
        setMaterials(mats.map(m => ({ id: m.id, raw_material: m.raw_material, charge_weight: m.charge_weight, secondary_weight: m.secondary_weight })));
        const chem = await getMeltChemistry(editRecord.id);
        const loadedChemRows: Record<'IN_FURNACE' | 'AFTER_FURNACE', Record<string, number>> = {
          IN_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
          AFTER_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
        };
        // Try loading target range from dedicated storage first
        const savedRange = await getMeltTargetRange(editRecord.id);
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
      } else {
        resetFormState();
      }
      setTimeError('');
      })();
    }
  }, [open, editRecord]);

  const resetFormState = () => {
    setForm({
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
    setTimeError('');
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

  const calcFe = (row: Record<string, number>): number => {
    const sum = (row.C || 0) + (row.Si || 0) + (row.Mn || 0) + (row.P || 0) + (row.S || 0) + (row.Ni || 0) + (row.Cr || 0) + (row.Mo || 0) + (row.Cu || 0);
    return Math.round((100 - sum) * 1000) / 1000;
  };

  // Add material row
  const addMaterialRow = () => {
    const name = newMaterialRow.raw_material === '__custom__' ? newMaterialRow.custom : newMaterialRow.raw_material;
    if (!name) { toast({ title: '請選擇或輸入原料名稱', variant: 'destructive' }); return; }
    setMaterials([...materials, { raw_material: name, charge_weight: newMaterialRow.charge_weight, secondary_weight: newMaterialRow.secondary_weight }]);
    setNewMaterialRow({ raw_material: '', charge_weight: 0, secondary_weight: 0, custom: '' });
  };

  const loadPresetRecipe = (recipeId: string) => {
    const recipe = presetRecipes.find(r => r.id === recipeId);
    if (!recipe) return;
    setMaterials([...materials, ...recipe.materials.map(m => ({ raw_material: m.raw_material, charge_weight: m.charge_weight, secondary_weight: m.secondary_weight }))]);
    toast({ title: `已載入配比「${recipe.name}」` });
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
    if (!form.material_grade || !form.furnace_no) {
      toast({ title: '請填寫材質與爐號', variant: 'destructive' });
      return;
    }
    if (form.power_start_time && form.tap_time && !validateTime(form.power_start_time, form.tap_time)) {
      toast({ title: '出湯時間不可早於開始送電時間', variant: 'destructive' });
      return;
    }

    try {
      let recordId: string;

      if (isEdit && editRecord) {
        await updateMeltRecord(editRecord.id, {
          melt_date: form.melt_date,
          material_grade: form.material_grade,
          furnace_no: form.furnace_no,
          power_kwh: form.power_kwh,
          power_start_time: form.power_start_time,
          tap_time: form.tap_time,
          tap_temp: form.tap_temp,
          created_by: form.created_by,
          remark: form.remark,
        });
        recordId = editRecord.id;
        const oldMats = await getMeltMaterials(recordId);
        for (const m of oldMats) { await deleteMeltMaterial(m.id); }
        const oldChem = await getMeltChemistry(recordId);
        for (const c of oldChem) { await deleteMeltChemistry(c.id); }
      } else {
        const newRec = await createMeltRecord({
          melt_date: form.melt_date,
          material_grade: form.material_grade,
          furnace_no: form.furnace_no,
          power_kwh: form.power_kwh,
          power_start_time: form.power_start_time,
          tap_time: form.tap_time,
          tap_temp: form.tap_temp,
          created_by: form.created_by,
          remark: form.remark,
        });
        recordId = newRec.id;
      }

      for (const m of materials) {
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
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，儲存失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else {
        toast({ title: '儲存失敗，請稍後再試', variant: 'destructive' });
      }
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
                <div>
                  <Label className="text-zinc-400 text-xs">日期 *</Label>
                  <Input type="date" value={form.melt_date} onChange={e => setForm({ ...form, melt_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">材質 *</Label>
                  <Input value={form.material_grade} onChange={e => setForm({ ...form, material_grade: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" placeholder="例: SCM440, 316L" list="mat-hist-list" />
                  <datalist id="mat-hist-list">{existingMaterials.map(m => <option key={m} value={m} />)}</datalist>
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
                      <table className="w-full text-xs">
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
                            <tr key={idx} className="text-zinc-300 border-b border-zinc-700/50">
                              <td className="py-1 pr-2">{m.raw_material}</td>
                              <td className="text-right py-1 pr-2">
                                <Input type="number" min="0" value={m.charge_weight || ''} onChange={e => updateMaterialRow(idx, 'charge_weight', Math.max(0, Number(e.target.value)))} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-xs w-20 ml-auto" />
                              </td>
                              <td className="text-right py-1 pr-2">
                                <Input type="number" min="0" value={m.secondary_weight || ''} onChange={e => updateMaterialRow(idx, 'secondary_weight', Math.max(0, Number(e.target.value)))} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-xs w-20 ml-auto" />
                              </td>
                              <td className="text-right py-1 pr-2 font-medium text-zinc-200">{m.charge_weight + m.secondary_weight}</td>
                              <td className="py-1">
                                <Button size="sm" variant="ghost" onClick={() => removeMaterialRow(idx)} className="text-zinc-400 hover:text-red-400 h-5 w-5 p-0"><Trash2 className="w-3 h-3" /></Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Total */}
                  <div className="flex justify-end text-xs font-medium text-amber-400 pr-10">
                    總投料重量：{totalChargeWeight} kg
                  </div>

                  {/* Add row */}
                  <div className="flex flex-col sm:flex-row gap-2 items-end">
                    <div className="flex-1">
                      <Select value={newMaterialRow.raw_material} onValueChange={v => setNewMaterialRow({ ...newMaterialRow, raw_material: v })}>
                        <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs"><SelectValue placeholder="選擇原料" /></SelectTrigger>
                        <SelectContent className="bg-zinc-700 border-zinc-600">
                          {MATERIAL_OPTIONS.map(m => (<SelectItem key={m} value={m} className="text-zinc-100">{m}</SelectItem>))}
                          <SelectItem value="__custom__" className="text-zinc-100">自行輸入</SelectItem>
                        </SelectContent>
                      </Select>
                      {newMaterialRow.raw_material === '__custom__' && (
                        <Input value={newMaterialRow.custom} onChange={e => setNewMaterialRow({ ...newMaterialRow, custom: e.target.value })} placeholder="輸入原料名稱" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs mt-1" />
                      )}
                    </div>
                    <Input type="number" min="0" value={newMaterialRow.charge_weight || ''} onChange={e => setNewMaterialRow({ ...newMaterialRow, charge_weight: Math.max(0, Number(e.target.value)) })} placeholder="首次(kg)" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs w-24" />
                    <Input type="number" min="0" value={newMaterialRow.secondary_weight || ''} onChange={e => setNewMaterialRow({ ...newMaterialRow, secondary_weight: Math.max(0, Number(e.target.value)) })} placeholder="二次(kg)" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs w-24" />
                    <Button size="sm" onClick={addMaterialRow} className="bg-blue-500 hover:bg-blue-600 text-white h-7 text-xs whitespace-nowrap">
                      <Plus className="w-3 h-3 mr-1" />新增
                    </Button>
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
                    <table className="w-full text-xs">
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
                                    value={targetRange[`${el}_min`] || ''}
                                    onChange={e => setTargetRange({ ...targetRange, [`${el}_min`]: Number(e.target.value) })}
                                    placeholder="min"
                                    className="bg-zinc-700 border-zinc-600 text-zinc-100 h-5 text-[10px] text-center w-full px-0.5"
                                  />
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
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
                          <tr key={stage} className="border-b border-zinc-700/50">
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
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-zinc-400 hover:text-zinc-200">
            取消
          </Button>
          <Button onClick={() => handleSave(false)} disabled={!!timeError} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 disabled:opacity-50">
            儲存
          </Button>
          {!isEdit && (
            <Button onClick={() => handleSave(true)} disabled={!!timeError} className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
              儲存並新增下一爐
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}