import { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MeltRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterFurnace, setFilterFurnace] = useState('');
  const { toast } = useToast();

  // Create form state
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

  useEffect(() => {
    setRecords(getMeltRecords());
  }, []);

  const refreshRecords = () => setRecords(getMeltRecords());

  // Validate time
  const validateTime = (startTime: string, tapTime: string): boolean => {
    if (!startTime || !tapTime) { setTimeError(''); return true; }
    const start = new Date(startTime).getTime();
    const end = new Date(tapTime).getTime();
    if (end <= start) {
      setTimeError('出湯時間不可早於或等於開始送電時間');
      return false;
    }
    setTimeError('');
    return true;
  };

  const handleCreate = () => {
    if (!form.material_grade || !form.furnace_no) {
      toast({ title: '請填寫材質與爐號', variant: 'destructive' });
      return;
    }
    if (form.power_start_time && form.tap_time) {
      if (!validateTime(form.power_start_time, form.tap_time)) {
        toast({ title: '出湯時間不可早於開始送電時間', variant: 'destructive' });
        return;
      }
    }
    createMeltRecord({
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
    refreshRecords();
    setIsCreateOpen(false);
    resetForm();
    toast({ title: '熔解紀錄已建立' });
  };

  const resetForm = () => {
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
    setTimeError('');
  };

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
    // Create new record with same data
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
    // Copy materials
    const lastMaterials = getMeltMaterials(last.id);
    lastMaterials.forEach(m => {
      createMeltMaterial({
        melt_id: newRecord.id,
        raw_material: m.raw_material,
        charge_weight: m.charge_weight,
        secondary_weight: m.secondary_weight,
      });
    });
    // Copy chemistry
    const lastChemistry = getMeltChemistry(last.id);
    lastChemistry.forEach(c => {
      createMeltChemistry({
        melt_id: newRecord.id,
        sample_stage: c.sample_stage,
        C: c.C, Si: c.Si, Mn: c.Mn, P: c.P, S: c.S,
        Ni: c.Ni, Cr: c.Cr, Mo: c.Mo, Cu: c.Cu, Fe: c.Fe,
      });
    });
    refreshRecords();
    toast({ title: `已複製上一爐 ${last.melt_no} 的資料` });
  };

  const openDetail = (record: MeltRecord) => {
    setSelectedRecord(record);
    setIsDetailOpen(true);
  };

  // Export to CSV (Excel compatible)
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

  // Print
  const handlePrint = () => {
    window.print();
  };

  // Filter records
  const filteredRecords = records.filter(r => {
    const matchSearch = !searchQuery || r.melt_no.includes(searchQuery) || r.material_grade.includes(searchQuery) || r.furnace_no.includes(searchQuery) || r.created_by.includes(searchQuery);
    const matchMaterial = !filterMaterial || r.material_grade === filterMaterial;
    const matchFurnace = !filterFurnace || r.furnace_no === filterFurnace;
    return matchSearch && matchMaterial && matchFurnace;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Get unique material grades for filter
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
            <Button onClick={() => setIsCreateOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 text-xs h-8">
              <Plus className="w-3.5 h-3.5 mr-1" />新增熔解
            </Button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-2 print:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 w-4 h-4 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋編號、材質、爐號、建立人..."
              className="bg-zinc-800 border-zinc-700 text-zinc-100 pl-9 h-9"
            />
          </div>
          <Select value={filterMaterial} onValueChange={v => setFilterMaterial(v === 'all' ? '' : v)}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 w-full sm:w-36 h-9">
              <SelectValue placeholder="材質篩選" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="all" className="text-zinc-100">全部材質</SelectItem>
              {uniqueMaterials.map(m => (
                <SelectItem key={m} value={m} className="text-zinc-100">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterFurnace} onValueChange={v => setFilterFurnace(v === 'all' ? '' : v)}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 w-full sm:w-32 h-9">
              <SelectValue placeholder="爐號篩選" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="all" className="text-zinc-100">全部爐號</SelectItem>
              {uniqueFurnaces.map(f => (
                <SelectItem key={f} value={f} className="text-zinc-100">{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Records count */}
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
                onEdit={() => openDetail(record)}
                onDelete={() => handleDelete(record)}
              />
            ))
          )}
        </div>

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="bg-zinc-800 border-zinc-700 max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">新增熔解紀錄</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* 區塊一：基本資料 */}
              <div className="p-3 bg-zinc-700/20 rounded-md border border-zinc-700">
                <p className="text-xs font-medium text-zinc-400 mb-2">基本資料</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300 text-xs">日期 *</Label>
                    <Input type="date" value={form.melt_date} onChange={e => setForm({ ...form, melt_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-xs">材質 *</Label>
                    <Input value={form.material_grade} onChange={e => setForm({ ...form, material_grade: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" placeholder="例: SCM440, 316L" list="material-list" />
                    <datalist id="material-list">
                      {uniqueMaterials.map(m => <option key={m} value={m} />)}
                    </datalist>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <Label className="text-zinc-300 text-xs">爐號 *</Label>
                    <Select value={form.furnace_no} onValueChange={v => setForm({ ...form, furnace_no: v })}>
                      <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8">
                        <SelectValue placeholder="選擇爐號" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-700 border-zinc-600">
                        {FURNACE_OPTIONS.map(f => (
                          <SelectItem key={f} value={f} className="text-zinc-100">{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-xs">建立人</Label>
                    <Input value={form.created_by} onChange={e => setForm({ ...form, created_by: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" placeholder="操作員姓名" />
                  </div>
                </div>
              </div>

              {/* 區塊二：熔解資訊 */}
              <div className="p-3 bg-zinc-700/20 rounded-md border border-zinc-700">
                <p className="text-xs font-medium text-zinc-400 mb-2">熔解資訊</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300 text-xs">開始送電時間 *</Label>
                    <Input type="datetime-local" value={form.power_start_time} onChange={e => { setForm({ ...form, power_start_time: e.target.value }); validateTime(e.target.value, form.tap_time); }} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-xs">出湯時間 *</Label>
                    <Input type="datetime-local" value={form.tap_time} onChange={e => { setForm({ ...form, tap_time: e.target.value }); validateTime(form.power_start_time, e.target.value); }} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
                  </div>
                </div>
                {timeError && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">⚠️ {timeError}</p>
                )}
                {!timeError && form.power_start_time && form.tap_time && (
                  <div className="mt-2 p-2 bg-zinc-700/40 rounded text-xs text-zinc-300">
                    熔解時間(自動)：<span className="text-amber-400 font-bold">
                      {formatMeltMinutes(Math.round((new Date(form.tap_time).getTime() - new Date(form.power_start_time).getTime()) / 60000))}
                    </span>
                  </div>
                )}
              </div>

              {/* 區塊三：能源 */}
              <div className="p-3 bg-zinc-700/20 rounded-md border border-zinc-700">
                <p className="text-xs font-medium text-zinc-400 mb-2">能源</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300 text-xs">耗電 (kWh)</Label>
                    <Input type="number" value={form.power_kwh || ''} onChange={e => setForm({ ...form, power_kwh: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" placeholder="1850" />
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-xs">出爐溫度 (℃)</Label>
                    <Input type="number" value={form.tap_temp || ''} onChange={e => setForm({ ...form, tap_temp: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" placeholder="1600" />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-zinc-300 text-xs">備註</Label>
                <Input value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
              </div>

              <Button onClick={handleCreate} disabled={!!timeError} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900 disabled:opacity-50">
                建立熔解紀錄
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Detail/Edit Dialog */}
        {selectedRecord && (
          <MeltDetailDialog
            record={selectedRecord}
            open={isDetailOpen}
            onOpenChange={(open) => { setIsDetailOpen(open); if (!open) setSelectedRecord(null); }}
            onUpdate={() => { refreshRecords(); setSelectedRecord(getMeltRecords().find(r => r.id === selectedRecord.id) || null); }}
          />
        )}
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

// === Sub-components ===

function MeltRecordCard({ record, expanded, onToggle, onEdit, onDelete }: {
  record: MeltRecord;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const materials = getMeltMaterials(record.id);
  const chemistry = getMeltChemistry(record.id);

  return (
    <Card className="bg-zinc-800 border-zinc-700 print:border print:border-gray-300 print:bg-white">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-orange-400 print:text-orange-600" />
              <span className="font-mono text-sm font-semibold text-amber-400 print:text-amber-700">{record.melt_no}</span>
              <span className="text-xs text-zinc-500 print:text-gray-500">{record.melt_date}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-zinc-400 print:text-gray-600">
              <span>材質: <span className="text-zinc-200 print:text-gray-900">{record.material_grade}</span></span>
              <span>爐號: <span className="text-zinc-200 print:text-gray-900">{record.furnace_no}</span></span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3" />耗電: <span className="text-zinc-200 print:text-gray-900">{record.power_kwh} kWh</span></span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />時間: <span className="text-zinc-200 print:text-gray-900">{formatMeltMinutes(record.melt_minutes)}</span></span>
              <span>總投料: <span className="text-zinc-200 print:text-gray-900">{record.total_charge_weight} kg</span></span>
              <span>能耗: <span className={`font-bold ${record.specific_energy > 1 ? 'text-red-400' : 'text-green-400'} print:text-gray-900`}>{record.specific_energy} kWh/kg</span></span>
              <span className="flex items-center gap-1"><Thermometer className="w-3 h-3" />出爐溫度: <span className="text-zinc-200 print:text-gray-900">{record.tap_temp}℃</span></span>
              <span>建立人: <span className="text-zinc-200 print:text-gray-900">{record.created_by || '-'}</span></span>
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
            {/* Materials */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-zinc-300">投料明細 ({materials.length} 筆)</span>
              </div>
              {materials.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-700">
                        <th className="text-left py-1 pr-3">原料</th>
                        <th className="text-right py-1 pr-3">首次投料(kg)</th>
                        <th className="text-right py-1 pr-3">二次添加(kg)</th>
                        <th className="text-right py-1">小計(kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map(m => (
                        <tr key={m.id} className="text-zinc-300 border-b border-zinc-700/50">
                          <td className="py-1 pr-3">{m.raw_material}</td>
                          <td className="text-right py-1 pr-3">{m.charge_weight}</td>
                          <td className="text-right py-1 pr-3">{m.secondary_weight}</td>
                          <td className="text-right py-1 font-medium">{m.subtotal}</td>
                        </tr>
                      ))}
                      <tr className="text-zinc-200 font-medium border-t border-zinc-600">
                        <td className="py-1 pr-3">合計</td>
                        <td className="text-right py-1 pr-3">{materials.reduce((s, m) => s + m.charge_weight, 0)}</td>
                        <td className="text-right py-1 pr-3">{materials.reduce((s, m) => s + m.secondary_weight, 0)}</td>
                        <td className="text-right py-1 text-amber-400">{materials.reduce((s, m) => s + m.subtotal, 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">尚無投料明細</p>
              )}
            </div>

            {/* Chemistry */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-medium text-zinc-300">成份紀錄 ({chemistry.length} 筆)</span>
              </div>
              {chemistry.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-700">
                        <th className="text-left py-1 pr-2">階段</th>
                        {CHEMISTRY_ELEMENTS.map(el => (
                          <th key={el} className="text-right py-1 px-1">{el}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...chemistry].sort((a, b) => {
                        const order: Record<SampleStage, number> = { TARGET: 0, IN_FURNACE: 1, AFTER_FURNACE: 2 };
                        return order[a.sample_stage] - order[b.sample_stage];
                      }).map(c => (
                        <tr key={c.id} className="text-zinc-300 border-b border-zinc-700/50">
                          <td className="py-1 pr-2 font-medium">{SAMPLE_STAGE_LABELS[c.sample_stage]}</td>
                          {CHEMISTRY_ELEMENTS.map(el => (
                            <td key={el} className="text-right py-1 px-1">
                              {el === 'Fe' ? <span className="text-zinc-500">Bal</span> : (c[el as keyof MeltChemistry] as number)?.toFixed(3)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">尚無成份紀錄</p>
              )}
            </div>
            {record.remark && (
              <p className="text-xs text-zinc-400">備註: {record.remark}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Detail Dialog for editing record, materials, and chemistry
function MeltDetailDialog({ record, open, onOpenChange, onUpdate }: {
  record: MeltRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}) {
  const [tab, setTab] = useState<'info' | 'materials' | 'chemistry'>('info');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-800 border-zinc-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" />
            熔解紀錄 - {record.melt_no}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-700 pb-1">
          <Button variant={tab === 'info' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('info')} className={tab === 'info' ? 'bg-amber-500 text-zinc-900' : 'text-zinc-400'}>
            基本資料
          </Button>
          <Button variant={tab === 'materials' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('materials')} className={tab === 'materials' ? 'bg-amber-500 text-zinc-900' : 'text-zinc-400'}>
            投料明細
          </Button>
          <Button variant={tab === 'chemistry' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('chemistry')} className={tab === 'chemistry' ? 'bg-amber-500 text-zinc-900' : 'text-zinc-400'}>
            成份紀錄
          </Button>
        </div>

        {tab === 'info' && <InfoTab record={record} onUpdate={onUpdate} />}
        {tab === 'materials' && <MaterialsTab meltId={record.id} onUpdate={onUpdate} />}
        {tab === 'chemistry' && <ChemistryTab meltId={record.id} onUpdate={onUpdate} />}
      </DialogContent>
    </Dialog>
  );
}

function InfoTab({ record, onUpdate }: { record: MeltRecord; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    melt_date: record.melt_date,
    material_grade: record.material_grade,
    furnace_no: record.furnace_no,
    power_kwh: record.power_kwh,
    power_start_time: record.power_start_time,
    tap_time: record.tap_time,
    tap_temp: record.tap_temp,
    created_by: record.created_by,
    remark: record.remark,
  });
  const [timeError, setTimeError] = useState('');
  const { toast } = useToast();

  const validateTime = (startTime: string, tapTime: string): boolean => {
    if (!startTime || !tapTime) { setTimeError(''); return true; }
    const start = new Date(startTime).getTime();
    const end = new Date(tapTime).getTime();
    if (end <= start) { setTimeError('出湯時間不可早於或等於開始送電時間'); return false; }
    setTimeError('');
    return true;
  };

  const handleSave = () => {
    if (form.power_start_time && form.tap_time && !validateTime(form.power_start_time, form.tap_time)) {
      toast({ title: '出湯時間不可早於開始送電時間', variant: 'destructive' });
      return;
    }
    updateMeltRecord(record.id, form);
    onUpdate();
    setEditing(false);
    toast({ title: '熔解紀錄已更新' });
  };

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoField label="日期" value={record.melt_date} />
          <InfoField label="材質" value={record.material_grade} />
          <InfoField label="爐號" value={record.furnace_no} />
          <InfoField label="出爐溫度" value={`${record.tap_temp}℃`} />
          <InfoField label="開始送電" value={record.power_start_time ? new Date(record.power_start_time).toLocaleString('zh-TW') : '-'} />
          <InfoField label="出湯時間" value={record.tap_time ? new Date(record.tap_time).toLocaleString('zh-TW') : '-'} />
          <InfoField label="熔解時間" value={formatMeltMinutes(record.melt_minutes)} highlight />
          <InfoField label="耗電度數" value={`${record.power_kwh} kWh`} />
          <InfoField label="總投料重量" value={`${record.total_charge_weight} kg`} highlight />
          <InfoField label="能耗" value={`${record.specific_energy} kWh/kg`} highlight />
          <InfoField label="建立人" value={record.created_by || '-'} />
          <InfoField label="備註" value={record.remark || '-'} />
        </div>
        <Button onClick={() => setEditing(true)} className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
          <Pencil className="w-4 h-4 mr-2" />編輯
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-zinc-300 text-xs">日期</Label>
          <Input type="date" value={form.melt_date} onChange={e => setForm({ ...form, melt_date: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
        </div>
        <div>
          <Label className="text-zinc-300 text-xs">材質</Label>
          <Input value={form.material_grade} onChange={e => setForm({ ...form, material_grade: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
        </div>
        <div>
          <Label className="text-zinc-300 text-xs">爐號</Label>
          <Select value={form.furnace_no} onValueChange={v => setForm({ ...form, furnace_no: v })}>
            <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-700 border-zinc-600">
              {FURNACE_OPTIONS.map(f => (
                <SelectItem key={f} value={f} className="text-zinc-100">{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-zinc-300 text-xs">出爐溫度 (℃)</Label>
          <Input type="number" value={form.tap_temp || ''} onChange={e => setForm({ ...form, tap_temp: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
        </div>
        <div>
          <Label className="text-zinc-300 text-xs">開始送電時間</Label>
          <Input type="datetime-local" value={form.power_start_time} onChange={e => { setForm({ ...form, power_start_time: e.target.value }); validateTime(e.target.value, form.tap_time); }} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
        </div>
        <div>
          <Label className="text-zinc-300 text-xs">出湯時間</Label>
          <Input type="datetime-local" value={form.tap_time} onChange={e => { setForm({ ...form, tap_time: e.target.value }); validateTime(form.power_start_time, e.target.value); }} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
        </div>
        <div>
          <Label className="text-zinc-300 text-xs">耗電度數 (kWh)</Label>
          <Input type="number" value={form.power_kwh || ''} onChange={e => setForm({ ...form, power_kwh: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
        </div>
        <div>
          <Label className="text-zinc-300 text-xs">建立人</Label>
          <Input value={form.created_by} onChange={e => setForm({ ...form, created_by: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
        </div>
      </div>
      {timeError && <p className="text-xs text-red-400">⚠️ {timeError}</p>}
      <div>
        <Label className="text-zinc-300 text-xs">備註</Label>
        <Input value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8" />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={!!timeError} className="bg-amber-500 hover:bg-amber-600 text-zinc-900 disabled:opacity-50">儲存</Button>
        <Button variant="ghost" onClick={() => setEditing(false)} className="text-zinc-400">取消</Button>
      </div>
    </div>
  );
}

function InfoField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="p-2 bg-zinc-700/30 rounded">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-sm font-medium ${highlight ? 'text-amber-400' : 'text-zinc-200'}`}>{value}</p>
    </div>
  );
}

function MaterialsTab({ meltId, onUpdate }: { meltId: string; onUpdate: () => void }) {
  const [materials, setMaterials] = useState<MeltMaterial[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
  const [customMaterial, setCustomMaterial] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    setMaterials(getMeltMaterials(meltId));
  }, [meltId]);

  const refresh = () => {
    setMaterials(getMeltMaterials(meltId));
    onUpdate();
  };

  const handleAdd = () => {
    const materialName = form.raw_material === '__custom__' ? customMaterial : form.raw_material;
    if (!materialName) {
      toast({ title: '請填寫原料名稱', variant: 'destructive' });
      return;
    }
    if (form.charge_weight < 0 || form.secondary_weight < 0) {
      toast({ title: '數值不可為負數', variant: 'destructive' });
      return;
    }
    createMeltMaterial({ melt_id: meltId, raw_material: materialName, charge_weight: form.charge_weight, secondary_weight: form.secondary_weight });
    refresh();
    setIsAdding(false);
    setForm({ raw_material: '', charge_weight: 0, secondary_weight: 0 });
    setCustomMaterial('');
    toast({ title: '投料已新增' });
  };

  const handleLoadDefaults = () => {
    DEFAULT_MATERIALS.forEach(m => {
      if (m.charge_weight > 0 || m.secondary_weight > 0) {
        createMeltMaterial({ melt_id: meltId, raw_material: m.raw_material, charge_weight: m.charge_weight, secondary_weight: m.secondary_weight });
      }
    });
    refresh();
    toast({ title: '已載入預設投料' });
  };

  const handleUpdate = (id: string) => {
    const materialName = form.raw_material === '__custom__' ? customMaterial : form.raw_material;
    if (form.charge_weight < 0 || form.secondary_weight < 0) {
      toast({ title: '數值不可為負數', variant: 'destructive' });
      return;
    }
    updateMeltMaterial(id, { raw_material: materialName, charge_weight: form.charge_weight, secondary_weight: form.secondary_weight });
    refresh();
    setEditingId(null);
    toast({ title: '投料已更新' });
  };

  const handleDeleteMaterial = (id: string) => {
    deleteMeltMaterial(id);
    refresh();
    toast({ title: '投料已刪除' });
  };

  const startEdit = (m: MeltMaterial) => {
    setEditingId(m.id);
    const isCustom = !MATERIAL_OPTIONS.includes(m.raw_material);
    setForm({ raw_material: isCustom ? '__custom__' : m.raw_material, charge_weight: m.charge_weight, secondary_weight: m.secondary_weight });
    if (isCustom) setCustomMaterial(m.raw_material);
  };

  const totalCharge = materials.reduce((s, m) => s + m.charge_weight, 0);
  const totalSecondary = materials.reduce((s, m) => s + m.secondary_weight, 0);
  const totalAll = materials.reduce((s, m) => s + m.subtotal, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-zinc-300 font-medium">投料明細</span>
        <div className="flex gap-2">
          {materials.length === 0 && (
            <Button size="sm" onClick={handleLoadDefaults} variant="outline" className="border-zinc-600 text-zinc-300 h-7 text-xs">
              載入預設投料
            </Button>
          )}
          <Button size="sm" onClick={() => { setIsAdding(true); setForm({ raw_material: '', charge_weight: 0, secondary_weight: 0 }); setCustomMaterial(''); }} className="bg-blue-500 hover:bg-blue-600 text-white h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" />新增原料
          </Button>
        </div>
      </div>

      {/* Add form */}
      {isAdding && (
        <div className="p-3 bg-zinc-700/50 rounded-md border border-zinc-600 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-zinc-400 text-xs">原料名稱</Label>
              <Select value={form.raw_material} onValueChange={v => setForm({ ...form, raw_material: v })}>
                <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8 text-xs">
                  <SelectValue placeholder="選擇原料" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-700 border-zinc-600">
                  {MATERIAL_OPTIONS.map(m => (
                    <SelectItem key={m} value={m} className="text-zinc-100">{m}</SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-zinc-100">自行輸入</SelectItem>
                </SelectContent>
              </Select>
              {form.raw_material === '__custom__' && (
                <Input value={customMaterial} onChange={e => setCustomMaterial(e.target.value)} placeholder="輸入原料名稱" className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs mt-1" />
              )}
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">首次投料(kg)</Label>
              <Input type="number" min="0" value={form.charge_weight || ''} onChange={e => setForm({ ...form, charge_weight: Math.max(0, Number(e.target.value)) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">二次添加(kg)</Label>
              <Input type="number" min="0" value={form.secondary_weight || ''} onChange={e => setForm({ ...form, secondary_weight: Math.max(0, Number(e.target.value)) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs">確認</Button>
            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)} className="text-zinc-400 h-7 text-xs">取消</Button>
          </div>
        </div>
      )}

      {/* Materials table */}
      {materials.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-700">
                <th className="text-left py-1.5 pr-3">原料</th>
                <th className="text-right py-1.5 pr-3">首次投料(kg)</th>
                <th className="text-right py-1.5 pr-3">二次添加(kg)</th>
                <th className="text-right py-1.5 pr-3">小計(kg)</th>
                <th className="text-right py-1.5">操作</th>
              </tr>
            </thead>
            <tbody>
              {materials.map(m => (
                <tr key={m.id} className="text-zinc-300 border-b border-zinc-700/50">
                  {editingId === m.id ? (
                    <>
                      <td className="py-1.5 pr-3">
                        <Input value={form.raw_material === '__custom__' ? customMaterial : form.raw_material} onChange={e => { setForm({ ...form, raw_material: '__custom__' }); setCustomMaterial(e.target.value); }} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-xs w-24" />
                      </td>
                      <td className="text-right py-1.5 pr-3">
                        <Input type="number" min="0" value={form.charge_weight || ''} onChange={e => setForm({ ...form, charge_weight: Math.max(0, Number(e.target.value)) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-xs w-20 ml-auto" />
                      </td>
                      <td className="text-right py-1.5 pr-3">
                        <Input type="number" min="0" value={form.secondary_weight || ''} onChange={e => setForm({ ...form, secondary_weight: Math.max(0, Number(e.target.value)) })} className="bg-zinc-700 border-zinc-600 text-zinc-100 h-6 text-xs w-20 ml-auto" />
                      </td>
                      <td className="text-right py-1.5 pr-3 font-medium">{form.charge_weight + form.secondary_weight}</td>
                      <td className="text-right py-1.5">
                        <Button size="sm" variant="ghost" onClick={() => handleUpdate(m.id)} className="text-green-400 h-5 w-5 p-0"><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-zinc-400 h-5 w-5 p-0 ml-1">✕</Button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-3">{m.raw_material}</td>
                      <td className="text-right py-1.5 pr-3">{m.charge_weight}</td>
                      <td className="text-right py-1.5 pr-3">{m.secondary_weight}</td>
                      <td className="text-right py-1.5 pr-3 font-medium">{m.subtotal}</td>
                      <td className="text-right py-1.5">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(m)} className="text-zinc-400 hover:text-amber-400 h-5 w-5 p-0"><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteMaterial(m.id)} className="text-zinc-400 hover:text-red-400 h-5 w-5 p-0 ml-1"><Trash2 className="w-3 h-3" /></Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              <tr className="text-zinc-200 font-medium border-t border-zinc-600">
                <td className="py-1.5 pr-3">合計</td>
                <td className="text-right py-1.5 pr-3">{totalCharge}</td>
                <td className="text-right py-1.5 pr-3">{totalSecondary}</td>
                <td className="text-right py-1.5 pr-3 text-amber-400">{totalAll}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 text-center py-4">尚無投料明細，點擊「新增原料」或「載入預設投料」開始記錄</p>
      )}
    </div>
  );
}

function ChemistryTab({ meltId, onUpdate }: { meltId: string; onUpdate: () => void }) {
  const [chemistry, setChemistry] = useState<MeltChemistry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addStage, setAddStage] = useState<SampleStage>('TARGET');
  const [form, setForm] = useState<Record<string, number>>({ C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 });
  const [autoCalcFe, setAutoCalcFe] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    setChemistry(getMeltChemistry(meltId));
  }, [meltId]);

  const refresh = () => {
    setChemistry(getMeltChemistry(meltId));
    onUpdate();
  };

  const existingStages = chemistry.map(c => c.sample_stage);
  const availableStages: SampleStage[] = (['TARGET', 'IN_FURNACE', 'AFTER_FURNACE'] as SampleStage[]).filter(s => !existingStages.includes(s));

  const calcFe = (): number => {
    const sum = (form.C || 0) + (form.Si || 0) + (form.Mn || 0) + (form.P || 0) + (form.S || 0) + (form.Ni || 0) + (form.Cr || 0) + (form.Mo || 0) + (form.Cu || 0);
    return Math.round((100 - sum) * 1000) / 1000;
  };

  const handleAdd = () => {
    const fe = autoCalcFe ? calcFe() : (form.Fe || 0);
    createMeltChemistry({
      melt_id: meltId,
      sample_stage: addStage,
      C: form.C || 0,
      Si: form.Si || 0,
      Mn: form.Mn || 0,
      P: form.P || 0,
      S: form.S || 0,
      Ni: form.Ni || 0,
      Cr: form.Cr || 0,
      Mo: form.Mo || 0,
      Cu: form.Cu || 0,
      Fe: fe,
    });
    refresh();
    setIsAdding(false);
    setForm({ C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 });
    toast({ title: `${SAMPLE_STAGE_LABELS[addStage]}成份已新增` });
  };

  const startEditChem = (c: MeltChemistry) => {
    setEditingId(c.id);
    setForm({ C: c.C, Si: c.Si, Mn: c.Mn, P: c.P, S: c.S, Ni: c.Ni, Cr: c.Cr, Mo: c.Mo, Cu: c.Cu });
  };

  const handleUpdateChem = (id: string) => {
    const fe = autoCalcFe ? calcFe() : (form.Fe || 0);
    updateMeltChemistry(id, {
      C: form.C || 0, Si: form.Si || 0, Mn: form.Mn || 0,
      P: form.P || 0, S: form.S || 0, Ni: form.Ni || 0,
      Cr: form.Cr || 0, Mo: form.Mo || 0, Cu: form.Cu || 0, Fe: fe,
    });
    refresh();
    setEditingId(null);
    toast({ title: '成份已更新' });
  };

  const handleDeleteChem = (id: string) => {
    deleteMeltChemistry(id);
    refresh();
    toast({ title: '成份紀錄已刪除' });
  };

  // Order: TARGET, IN_FURNACE, AFTER_FURNACE
  const orderedChemistry = [...chemistry].sort((a, b) => {
    const order: Record<SampleStage, number> = { TARGET: 0, IN_FURNACE: 1, AFTER_FURNACE: 2 };
    return order[a.sample_stage] - order[b.sample_stage];
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-300 font-medium">成份紀錄</span>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={autoCalcFe} onChange={e => setAutoCalcFe(e.target.checked)} className="rounded border-zinc-600" />
            Fe 自動計算
          </label>
        </div>
        {availableStages.length > 0 && (
          <Button size="sm" onClick={() => { setIsAdding(true); setAddStage(availableStages[0]); setForm({ C: 0, Si: 0, Mn: 0, P: 0, S: 0, Ni: 0, Cr: 0, Mo: 0, Cu: 0 }); }} className="bg-purple-500 hover:bg-purple-600 text-white h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" />新增成份
          </Button>
        )}
      </div>

      {/* Add form */}
      {isAdding && (
        <div className="p-3 bg-zinc-700/50 rounded-md border border-zinc-600 space-y-2">
          <div className="flex items-center gap-3">
            <div>
              <Label className="text-zinc-400 text-xs">階段</Label>
              <Select value={addStage} onValueChange={v => setAddStage(v as SampleStage)}>
                <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100 h-8 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-700 border-zinc-600">
                  {availableStages.map(s => (
                    <SelectItem key={s} value={s} className="text-zinc-100">{SAMPLE_STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {CHEMISTRY_ELEMENTS.filter(el => el !== 'Fe').map(el => (
              <div key={el}>
                <Label className="text-zinc-400 text-xs">{el}</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={form[el] || ''}
                  onChange={e => setForm({ ...form, [el]: Number(e.target.value) })}
                  className="bg-zinc-700 border-zinc-600 text-zinc-100 h-7 text-xs"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            Fe = {autoCalcFe ? <span className="text-amber-400">{calcFe().toFixed(3)} (自動)</span> : 'Bal (手動)'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs">確認</Button>
            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)} className="text-zinc-400 h-7 text-xs">取消</Button>
          </div>
        </div>
      )}

      {/* Chemistry table */}
      {orderedChemistry.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-700">
                <th className="text-left py-1.5 pr-2">階段</th>
                {CHEMISTRY_ELEMENTS.map(el => (
                  <th key={el} className="text-right py-1.5 px-1">{el}</th>
                ))}
                <th className="text-right py-1.5 pl-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {orderedChemistry.map(c => (
                <tr key={c.id} className="text-zinc-300 border-b border-zinc-700/50">
                  {editingId === c.id ? (
                    <>
                      <td className="py-1.5 pr-2 font-medium text-amber-400">{SAMPLE_STAGE_LABELS[c.sample_stage]}</td>
                      {CHEMISTRY_ELEMENTS.filter(el => el !== 'Fe').map(el => (
                        <td key={el} className="py-1.5 px-1">
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={form[el] || ''}
                            onChange={e => setForm({ ...form, [el]: Number(e.target.value) })}
                            className="bg-zinc-700 border-zinc-600 text-zinc-100 h-5 text-xs w-14"
                          />
                        </td>
                      ))}
                      <td className="text-right py-1.5 px-1 text-zinc-500">{autoCalcFe ? calcFe().toFixed(3) : 'Bal'}</td>
                      <td className="text-right py-1.5 pl-2">
                        <Button size="sm" variant="ghost" onClick={() => handleUpdateChem(c.id)} className="text-green-400 h-5 w-5 p-0"><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-zinc-400 h-5 w-5 p-0 ml-1">✕</Button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2 font-medium text-amber-400">{SAMPLE_STAGE_LABELS[c.sample_stage]}</td>
                      {CHEMISTRY_ELEMENTS.map(el => (
                        <td key={el} className="text-right py-1.5 px-1">
                          {el === 'Fe' ? <span className="text-zinc-500">Bal</span> : (c[el as keyof MeltChemistry] as number)?.toFixed(3)}
                        </td>
                      ))}
                      <td className="text-right py-1.5 pl-2">
                        <Button size="sm" variant="ghost" onClick={() => startEditChem(c)} className="text-zinc-400 hover:text-amber-400 h-5 w-5 p-0"><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteChem(c.id)} className="text-zinc-400 hover:text-red-400 h-5 w-5 p-0 ml-1"><Trash2 className="w-3 h-3" /></Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 text-center py-4">尚無成份紀錄，點擊「新增成份」開始記錄</p>
      )}
    </div>
  );
}