import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { dsCreateCustomer } from '@/lib/dataService';
import { CustomerType, CustomerStatus } from '@/lib/types';
import { Upload, FileSpreadsheet, Check, AlertCircle, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

const CUSTOMER_TYPES: CustomerType[] = ['產業機械', '砂石產業', '營造工程', '汽車模具', '鑄造廠', '加工廠', '貿易商', '其他'];
const CUSTOMER_STATUSES: CustomerStatus[] = ['啟用', '停用'];

const FIELD_MAP: Record<string, string> = {
  '客戶名稱': 'name', '名稱': 'name', 'name': 'name',
  '客戶簡稱': 'short_name', '簡稱': 'short_name', 'short_name': 'short_name',
  '客戶類型': 'type', '類型': 'type', 'type': 'type',
  '公司地址': 'address', '地址': 'address', 'address': 'address',
  '送貨地址': 'delivery_address', 'delivery_address': 'delivery_address',
  '公司電話': 'phone', '電話': 'phone', 'phone': 'phone',
  'email': 'email', 'Email': 'email', 'EMAIL': 'email', '信箱': 'email',
  '聯絡人1姓名': 'contact1_name', '聯絡人1': 'contact1_name', 'contact1_name': 'contact1_name',
  '聯絡人1手機': 'contact1_phone', 'contact1_phone': 'contact1_phone',
  '聯絡人2姓名': 'contact2_name', '聯絡人2': 'contact2_name', 'contact2_name': 'contact2_name',
  '聯絡人2手機': 'contact2_phone', 'contact2_phone': 'contact2_phone',
  '狀態': 'status', 'status': 'status',
  '備註': 'remarks', 'remarks': 'remarks',
};

interface ImportRow {
  name: string;
  short_name: string;
  type: string;
  address: string;
  delivery_address: string;
  phone: string;
  email: string;
  contact1_name: string;
  contact1_phone: string;
  contact2_name: string;
  contact2_phone: string;
  status: string;
  remarks: string;
  selected: boolean;
}

interface BatchImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

export default function BatchImportDialog({ open, onOpenChange, onImportComplete }: BatchImportDialogProps) {
  const { toast } = useToast();
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetImport = () => {
    setImportStep('upload');
    setImportData([]);
    setImportFileName('');
    setImportErrors([]);
    setIsImporting(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetImport();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { defval: '' });
        if (jsonData.length === 0) {
          toast({ title: 'Excel 檔案無資料', variant: 'destructive' });
          return;
        }
        const headers = Object.keys(jsonData[0]);
        const rows: ImportRow[] = jsonData.map(row => {
          const mapped: Record<string, string> = {};
          headers.forEach(h => {
            const fieldKey = FIELD_MAP[h] || FIELD_MAP[h.trim()] || h;
            mapped[fieldKey] = String(row[h] ?? '').trim();
          });
          return {
            name: mapped.name || '',
            short_name: mapped.short_name || '',
            type: mapped.type || '',
            address: mapped.address || '',
            delivery_address: mapped.delivery_address || '',
            phone: mapped.phone || '',
            email: mapped.email || '',
            contact1_name: mapped.contact1_name || '',
            contact1_phone: mapped.contact1_phone || '',
            contact2_name: mapped.contact2_name || '',
            contact2_phone: mapped.contact2_phone || '',
            status: mapped.status || '啟用',
            remarks: mapped.remarks || '',
            selected: true,
          };
        });
        setImportData(rows);
        setImportErrors([]);
        setImportStep('preview');
      } catch {
        toast({ title: '無法解析 Excel 檔案', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateRow = (idx: number, field: keyof ImportRow, value: string | boolean) => {
    setImportData(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const deleteRow = (idx: number) => {
    setImportData(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleAll = () => {
    const allSelected = importData.every(r => r.selected);
    setImportData(prev => prev.map(row => ({ ...row, selected: !allSelected })));
  };

  const handleBatchCreate = async () => {
    setIsImporting(true);
    const errors: string[] = [];
    let created = 0;

    for (let idx = 0; idx < importData.length; idx++) {
      const row = importData[idx];
      if (!row.selected) continue;
      if (!row.name.trim()) {
        errors.push(`第 ${idx + 1} 行：缺少客戶名稱`);
        continue;
      }
      if (!row.contact1_name.trim()) {
        errors.push(`第 ${idx + 1} 行：缺少聯絡人1姓名`);
        continue;
      }
      if (!row.contact1_phone.trim()) {
        errors.push(`第 ${idx + 1} 行：缺少聯絡人1手機`);
        continue;
      }
      const type = CUSTOMER_TYPES.includes(row.type as CustomerType) ? (row.type as CustomerType) : '其他';
      const status = CUSTOMER_STATUSES.includes(row.status as CustomerStatus) ? (row.status as CustomerStatus) : '啟用';
      try {
        await dsCreateCustomer({
          name: row.name,
          short_name: row.short_name,
          type,
          address: row.address,
          delivery_addresses: row.delivery_address ? [row.delivery_address] : [],
          phone: row.phone,
          email: row.email,
          contact1_name: row.contact1_name,
          contact1_phone: row.contact1_phone,
          contact2_name: row.contact2_name,
          contact2_phone: row.contact2_phone,
          status,
          remarks: row.remarks,
        });
        created++;
      } catch (err) {
        errors.push(`第 ${idx + 1} 行：建立失敗 - ${err}`);
      }
    }

    setImportErrors(errors);
    setIsImporting(false);
    if (created > 0) {
      onImportComplete();
      toast({ title: `成功匯入 ${created} 筆客戶資料` });
    }
    if (errors.length === 0) {
      setImportStep('done');
    }
  };

  const selectedCount = importData.filter(r => r.selected).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-700 w-[95vw] max-w-[1400px] max-h-[90vh] overflow-hidden flex flex-col" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-500" />
            批次匯入客戶資料
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm mb-2">
          <span className={`px-2 py-0.5 rounded ${importStep === 'upload' ? 'bg-amber-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>1. 上傳檔案</span>
          <span className="text-zinc-600">{'\u2192'}</span>
          <span className={`px-2 py-0.5 rounded ${importStep === 'preview' ? 'bg-amber-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>2. 核對編輯</span>
          <span className="text-zinc-600">{'\u2192'}</span>
          <span className={`px-2 py-0.5 rounded ${importStep === 'done' ? 'bg-green-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>3. 完成</span>
        </div>

        {/* Step 1: Upload */}
        {importStep === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <div
              className="border-2 border-dashed border-zinc-600 rounded-lg p-8 text-center hover:border-amber-500 transition-colors cursor-pointer w-full max-w-md"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-12 h-12 text-zinc-500 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">點擊選擇 Excel 檔案</p>
              <p className="text-zinc-500 text-sm mt-1">支援 .xlsx, .xls 格式</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="bg-zinc-800 rounded-lg p-4 w-full max-w-md text-sm">
              <p className="text-amber-400 font-medium mb-2">Excel 欄位對應說明：</p>
              <div className="grid grid-cols-2 gap-1 text-zinc-400">
                <span>客戶名稱 *</span><span className="text-zinc-500">（必填）</span>
                <span>客戶簡稱</span><span className="text-zinc-500">（選填）</span>
                <span>客戶類型</span><span className="text-zinc-500">（產業機械/砂石產業/...）</span>
                <span>公司地址</span><span className="text-zinc-500">（選填）</span>
                <span>送貨地址</span><span className="text-zinc-500">（選填）</span>
                <span>公司電話</span><span className="text-zinc-500">（選填）</span>
                <span>Email</span><span className="text-zinc-500">（選填）</span>
                <span>聯絡人1姓名 *</span><span className="text-zinc-500">（必填）</span>
                <span>聯絡人1手機 *</span><span className="text-zinc-500">（必填）</span>
                <span>聯絡人2姓名</span><span className="text-zinc-500">（選填）</span>
                <span>聯絡人2手機</span><span className="text-zinc-500">（選填）</span>
                <span>狀態</span><span className="text-zinc-500">（啟用/停用，預設啟用）</span>
                <span>備註</span><span className="text-zinc-500">（選填）</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Preview with inline editing */}
        {importStep === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <p className="text-sm text-zinc-400">
                檔案：<span className="text-zinc-200">{importFileName}</span>，共 <span className="text-amber-400 font-medium">{importData.length}</span> 筆資料，已選取 <span className="text-green-400 font-medium">{selectedCount}</span> 筆
              </p>
              <Button size="sm" variant="ghost" onClick={toggleAll} className="text-xs text-amber-400 hover:text-amber-300">
                {importData.every(r => r.selected) ? '取消全選' : '全選'}
              </Button>
            </div>

            {importErrors.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-2 max-h-24 overflow-y-auto flex-shrink-0">
                {importErrors.map((err, i) => (
                  <p key={i} className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" /> {err}
                  </p>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-auto rounded-lg border border-zinc-700 min-h-0">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-zinc-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-1 py-2 text-center text-zinc-400 w-8 border-b border-zinc-700">選</th>
                    <th className="px-1 py-2 text-center text-zinc-400 w-6 border-b border-zinc-700">#</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[120px] border-b border-zinc-700">客戶名稱 *</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[80px] border-b border-zinc-700">簡稱</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[100px] border-b border-zinc-700">類型</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[120px] border-b border-zinc-700">公司地址</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[100px] border-b border-zinc-700">電話</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[100px] border-b border-zinc-700">Email</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[80px] border-b border-zinc-700">聯絡人1 *</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[100px] border-b border-zinc-700">手機1 *</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[80px] border-b border-zinc-700">聯絡人2</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[100px] border-b border-zinc-700">手機2</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[70px] border-b border-zinc-700">狀態</th>
                    <th className="px-1 py-2 text-left text-zinc-300 min-w-[80px] border-b border-zinc-700">備註</th>
                    <th className="px-1 py-2 text-center text-zinc-400 w-8 border-b border-zinc-700">刪</th>
                  </tr>
                </thead>
                <tbody>
                  {importData.map((row, idx) => {
                    const hasError = !row.name.trim() || !row.contact1_name.trim() || !row.contact1_phone.trim();
                    return (
                      <tr key={idx} className={`${hasError && row.selected ? 'bg-red-500/5' : 'hover:bg-zinc-800/50'} ${!row.selected ? 'opacity-40' : ''}`}>
                        <td className="px-1 py-1 text-center border-b border-zinc-800">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => updateRow(idx, 'selected', !row.selected)}
                            className="rounded border-zinc-600"
                          />
                        </td>
                        <td className="px-1 py-1 text-center text-zinc-500 border-b border-zinc-800">{idx + 1}</td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Input
                            value={row.name}
                            onChange={e => updateRow(idx, 'name', e.target.value)}
                            className={`h-7 text-xs bg-zinc-800 border-zinc-700 ${!row.name.trim() && row.selected ? 'border-red-500' : ''}`}
                            placeholder="必填"
                          />
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Input
                            value={row.short_name}
                            onChange={e => updateRow(idx, 'short_name', e.target.value)}
                            className="h-7 text-xs bg-zinc-800 border-zinc-700"
                          />
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Select value={CUSTOMER_TYPES.includes(row.type as CustomerType) ? row.type : '其他'} onValueChange={v => updateRow(idx, 'type', v)}>
                            <SelectTrigger className="h-7 text-xs bg-zinc-800 border-zinc-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CUSTOMER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Input
                            value={row.address}
                            onChange={e => updateRow(idx, 'address', e.target.value)}
                            className="h-7 text-xs bg-zinc-800 border-zinc-700"
                          />
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Input
                            value={row.phone}
                            onChange={e => updateRow(idx, 'phone', e.target.value)}
                            className="h-7 text-xs bg-zinc-800 border-zinc-700"
                          />
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Input
                            value={row.email}
                            onChange={e => updateRow(idx, 'email', e.target.value)}
                            className="h-7 text-xs bg-zinc-800 border-zinc-700"
                          />
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Input
                            value={row.contact1_name}
                            onChange={e => updateRow(idx, 'contact1_name', e.target.value)}
                            className={`h-7 text-xs bg-zinc-800 border-zinc-700 ${!row.contact1_name.trim() && row.selected ? 'border-red-500' : ''}`}
                            placeholder="必填"
                          />
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Input
                            value={row.contact1_phone}
                            onChange={e => updateRow(idx, 'contact1_phone', e.target.value)}
                            className={`h-7 text-xs bg-zinc-800 border-zinc-700 ${!row.contact1_phone.trim() && row.selected ? 'border-red-500' : ''}`}
                            placeholder="必填"
                          />
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Input
                            value={row.contact2_name}
                            onChange={e => updateRow(idx, 'contact2_name', e.target.value)}
                            className="h-7 text-xs bg-zinc-800 border-zinc-700"
                          />
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Input
                            value={row.contact2_phone}
                            onChange={e => updateRow(idx, 'contact2_phone', e.target.value)}
                            className="h-7 text-xs bg-zinc-800 border-zinc-700"
                          />
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Select value={row.status === '停用' ? '停用' : '啟用'} onValueChange={v => updateRow(idx, 'status', v)}>
                            <SelectTrigger className="h-7 text-xs bg-zinc-800 border-zinc-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CUSTOMER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1 border-b border-zinc-800">
                          <Input
                            value={row.remarks}
                            onChange={e => updateRow(idx, 'remarks', e.target.value)}
                            className="h-7 text-xs bg-zinc-800 border-zinc-700"
                          />
                        </td>
                        <td className="px-1 py-1 text-center border-b border-zinc-800">
                          <Button size="sm" variant="ghost" onClick={() => deleteRow(idx)} className="h-6 w-6 p-0 text-red-400 hover:text-red-300">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-700 flex-shrink-0">
              <Button variant="outline" onClick={resetImport} className="text-zinc-400">
                重新上傳
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>取消</Button>
                <Button
                  onClick={handleBatchCreate}
                  disabled={selectedCount === 0 || isImporting}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {isImporting ? (
                    <>匯入中...</>
                  ) : (
                    <><Check className="w-4 h-4 mr-1" /> 確認建立 ({selectedCount} 筆)</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {importStep === 'done' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-lg text-zinc-200 font-medium">匯入完成！</p>
            <p className="text-zinc-400 text-sm">客戶資料已成功建立</p>
            <Button onClick={handleClose} className="bg-amber-600 hover:bg-amber-700 mt-2">
              關閉
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}