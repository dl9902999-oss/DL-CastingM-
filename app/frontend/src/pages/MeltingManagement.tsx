import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MeltRecord, MeltMaterial, MeltChemistry, SampleStage } from '@/lib/types';
import {
  getMeltRecords, createMeltRecord, updateMeltRecord, deleteMeltRecord,
  getMeltMaterials, createMeltMaterial, updateMeltMaterial, deleteMeltMaterial,
  getMeltChemistry, createMeltChemistry, updateMeltChemistry, deleteMeltChemistry,
  recalcMeltRecord,
} from '@/lib/store';
import { Plus, Flame, Pencil, Trash2, FlaskConical, Layers, Zap, Clock, Thermometer, ChevronDown, ChevronUp, Copy, Search, Download, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SAMPLE_STAGE_LABELS: Record<SampleStage, string> = {
  TARGET: '目標',
  IN_FURNACE: '爐中',
  AFTER_FURNACE: '爐後',
};

const CHEMISTRY_ELEMENTS = ['C', 'Si', 'Mn', 'P', 'S', 'Ni', 'Cr', 'Mo', 'Cu', 'Fe'] as const;

const DEFAULT_MATERIALS = [
  { raw_material: '回爐料', charge_weight: 1200, secondary_weight: 0 },
  { raw_material: '廢鐵', charge_weight: 500, secondary_weight: 0 },
  { raw_material: '矽鐵', charge_weight: 30, secondary_weight: 10 },
  { raw_material: '高碳錳鐵', charge_weight: 20, secondary_weight: 5 },
  { raw_material: '增碳劑', charge_weight: 10, secondary_weight: 5 },
  { raw_material: '純鎳', charge_weight: 80, secondary_weight: 10 },
  { raw_material: '430', charge_weight: 0, secondary_weight: 0 },
  { raw_material: '鉬鐵', charge_weight: 0, secondary_weight: 0 },
];

const MATERIAL_OPTIONS = ['回爐料', '廢鐵', '矽鐵', '高碳錳鐵', '增碳劑', '純鎳', '430', '鉬鐵', '廢鋼', 'FeSi', 'FeMn', 'FeCr', 'FeMo', '生鐵', '不鏽鋼廢料'];

const FURNACE_OPTIONS = ['F-01', 'F-02', 'F-03'];

export default function MeltingManagement() {
  const [records, setRecords] = useState<MeltRecord[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MeltRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterFurnace, setFilterFurnace] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    setRecords(getMeltRecords());
  }, []);

  const refreshRecords = () => setRecords(getMeltRecords());

  const handleDelete = (record: MeltRecord) => {
    if (!window.confirm(`確定要刪除熔解紀錄 ${record.melt_no} 嗎？`)) return;
    deleteMeltRecord(record.id);
    refreshRecords();
    toast({ title: '熔解紀錄已刪除' });
  };

  const handleCopyLast = () => {
    const sorted = [...records].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (sorted.length === 0) {
      toast({ title: '無可複製的紀錄', variant: 'destructive' });
      return;
    }
    const last = sorted[0];
    const newRecord = createMeltRecord({
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
    const lastMaterials = getMeltMaterials(last.id);
    lastMaterials.forEach(m => {
      createMeltMaterial({ melt_id: newRecord.id, raw_material: m.raw_material, charge_weight: m.charge_weight, secondary_weight: m.secondary_weight });
    });
    const lastChemistry = getMeltChemistry(last.id);
    lastChemistry.forEach(c => {
      createMeltChemistry({ melt_id: newRecord.id, sample_stage: c.sample_stage, C: c.C, Si: c.Si, Mn: c.Mn, P: c.P, S: c.S, Ni: c.Ni, Cr: c.Cr, Mo: c.Mo, Cu: c.Cu, Fe: c.Fe });
    });
    refreshRecords();
    toast({ title: `已複製上一爐 ${last.melt_no} 的資料` });
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
              <Plus className="w-3.5 h-3.5 mr-1" />新增熔解
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
  const materials = getMeltMaterials(record.id);
  const chemistry = getMeltChemistry(record.id);

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
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />時間: <span className="text-zinc-200">{formatMeltMinutes(record.melt_minutes)}</span></span>
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
                        <tr key={c.id} className="text-zinc-300 border-b border-zinc-700/50"><td className="py-1 pr-2 font-medium">{SAMPLE_STAGE_LABELS[c.sample_stage]}</td>{CHEMISTRY_ELEMENTS.map(el => (<td key={el} className="text-right py-1 px-1">{el === 'Fe' ? <span className="text-zinc-500">Bal</span> : (c[el as keyof MeltChemistry] as number)?.toFixed(3)}</td>))}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {record.remark && <p className="text-xs text-zinc-400">備註: {record.remark}</p>}
          </div>
        )}
      </CardContent>
    </Card>
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

  // Chemistry state - always show 3 rows
  const [chemRows, setChemRows] = useState<Record<SampleStage, Record<string, number>>>({
    TARGET: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
    IN_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
    AFTER_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
  });
  const [autoCalcFe, setAutoCalcFe] = useState(true);

  // Collapsible states
  const [materialsOpen, setMaterialsOpen] = useState(true);
  const [chemistryOpen, setChemistryOpen] = useState(true);

  // Load data when dialog opens
  useEffect(() => {
    if (open) {
      if (editRecord) {
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
        // Load materials
        const mats = getMeltMaterials(editRecord.id);
        setMaterials(mats.map(m => ({ id: m.id, raw_material: m.raw_material, charge_weight: m.charge_weight, secondary_weight: m.secondary_weight })));
        // Load chemistry
        const chem = getMeltChemistry(editRecord.id);
        const newChemRows: Record<SampleStage, Record<string, number>> = {
          TARGET: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
          IN_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
          AFTER_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
        };
        chem.forEach(c => {
          newChemRows[c.sample_stage] = { C: c.C, Si: c.Si, Mn: c.Mn, P: c.P, S: c.S, Ni: c.Ni, Cr: c.Cr, Mo: c.Mo, Cu: c.Cu };
        });
        setChemRows(newChemRows);
      } else {
        resetFormState();
      }
      setTimeError('');
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
    setChemRows({
      TARGET: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
      IN_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
      AFTER_FURNACE: { C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 },
    });
    setTimeError('');
  };

  const validateTime = (startTime: string, tapTime: string): boolean => {
    if (!startTime || !tapTime) { setTimeError(''); return true; }
    const start = new Date(startTime).getTime();
    const end = new Date(tapTime).getTime();
    if (end <= start) { setTimeError('出湯時間不可早於或等於開始送電時間'); return false; }
    setTimeError('');
    return true;
  };

  // Calculated fields
  const meltMinutes = (form.power_start_time && form.tap_time && !timeError)
    ? Math.round((new Date(form.tap_time).getTime() - new Date(form.power_start_time).getTime()) / 60000)
    : 0;
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

  const loadDefaults = () => {
    const defaults = DEFAULT_MATERIALS.filter(d => d.charge_weight > 0 || d.secondary_weight > 0)
      .map(d => ({ raw_material: d.raw_material, charge_weight: d.charge_weight, secondary_weight: d.secondary_weight }));
    setMaterials([...materials, ...defaults]);
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
  const handleSave = (andNew: boolean) => {
    if (!form.material_grade || !form.furnace_no) {
      toast({ title: '請填寫材質與爐號', variant: 'destructive' });
      return;
    }
    if (form.power_start_time && form.tap_time && !validateTime(form.power_start_time, form.tap_time)) {
      toast({ title: '出湯時間不可早於開始送電時間', variant: 'destructive' });
      return;
    }

    let recordId: string;

    if (isEdit && editRecord) {
      // Update existing record
      updateMeltRecord(editRecord.id, {
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

      // Delete old materials and re-create
      const oldMats = getMeltMaterials(recordId);
      oldMats.forEach(m => deleteMeltMaterial(m.id));
      // Delete old chemistry and re-create
      const oldChem = getMeltChemistry(recordId);
      oldChem.forEach(c => deleteMeltChemistry(c.id));
    } else {
      // Create new record
      const newRec = createMeltRecord({
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

    // Save materials
    materials.forEach(m => {
      createMeltMaterial({ melt_id: recordId, raw_material: m.raw_material, charge_weight: m.charge_weight, secondary_weight: m.secondary_weight });
    });

    // Save chemistry (only rows with data)
    const stages: SampleStage[] = ['TARGET', 'IN_FURNACE', 'AFTER_FURNACE'];
    stages.forEach(stage => {
      const row = chemRows[stage];
      const hasData = Object.values(row).some(v => v > 0);
      if (hasData) {
        const fe = autoCalcFe ? calcFe(row) : 0;
        createMeltChemistry({
          melt_id: recordId,
          sample_stage: stage,
          C: row.C || 0, Si: row.Si || 0, Mn: row.Mn || 0,
          P: row.P || 0, S: row.S || 0, Ni: row.Ni || 0,
          Cr: row.Cr || 0, Mo: row.Mo || 0, Cu: row.Cu || 0,
          Fe: fe,
        });
      }
    });

    // Recalculate
    recalcMeltRecord(recordId);

    toast({ title: isEdit ? '熔解紀錄已更新' : '熔解紀錄已建立' });

    if (andNew) {
      resetFormState();
      onSavedAndNew();
    } else {
      onOpenChange(false);
      onSaved();
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
                  <Label className="text-zinc-400 text-xs">開始送電時間 *</Label>
                  <Input type="datetime-local" value={form.power_start_time} onChange={e => { setForm({ ...form, power_start_time: e.target.value }); validateTime(e.target.value, form.tap_time); }} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">出湯時間 *</Label>
                  <Input type="datetime-local" value={form.tap_time} onChange={e => { setForm({ ...form, tap_time: e.target.value }); validateTime(form.power_start_time, e.target.value); }} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
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

                  {materials.length === 0 && (
                    <Button size="sm" onClick={loadDefaults} variant="outline" className="border-zinc-600 text-zinc-300 h-7 text-xs w-full">
                      載入預設投料
                    </Button>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* 區塊三：成份紀錄 (Collapsible) */}
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
                        {(['TARGET', 'IN_FURNACE', 'AFTER_FURNACE'] as SampleStage[]).map(stage => (
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