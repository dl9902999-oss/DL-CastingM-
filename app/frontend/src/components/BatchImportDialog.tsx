import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { createCustomer } from '@/lib/store';
import { CustomerType, CustomerStatus } from '@/lib/types';
import { Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
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

interface BatchImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

export default function BatchImportDialog({ open, onOpenChange, onImportComplete }: BatchImportDialogProps) {
  const { toast } = useToast();
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [importData, setImportData] = useState<Record<string, string>[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSelected, setImportSelected] = useState<boolean[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetImport = () => {
    setImportStep('upload');
    setImportData([]);
    setImportFileName('');
    setImportErrors([]);
    setImportSelected([]);
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
        setImportData(jsonData.map(row => {
          const mapped: Record<string, string> = {};
          headers.forEach(h => {
            const fieldKey = FIELD_MAP[h] || FIELD_MAP[h.trim()] || h;
            mapped[fieldKey] = String(row[h] ?? '').trim();
          });
          return mapped;
        }));
        setImportSelected(new Array(jsonData.length).fill(true));
        setImportErrors([]);
        setImportStep('preview');
      } catch {
        toast({ title: '無法解析 Excel 檔案', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleImportRow = (idx: number) => {
    const updated = [...importSelected];
    updated[idx] = !updated[idx];
    setImportSelected(updated);
  };

  const toggleAllImportRows = () => {
    const allSelected = importSelected.every(Boolean);
    setImportSelected(new Array(importData.length).fill(!allSelected));
  };

  const handleBatchCreate = () => {
    const errors: string[] = [];
    let created = 0;
    importData.forEach((row, idx) => {
      if (!importSelected[idx]) return;
      if (!row.name?.trim()) {
        errors.push(`第 ${idx + 1} 行：缺少客戶名稱`);
        return;
      }
      if (!row.contact1_name?.trim()) {
        errors.push(`第 ${idx + 1} 行：缺少聯絡人1姓名`);
        return;
      }
      if (!row.contact1_phone?.trim()) {
        errors.push(`第 ${idx + 1} 行：缺少聯絡人1手機`);
        return;
      }
      const type = CUSTOMER_TYPES.includes(row.type as CustomerType) ? (row.type as CustomerType) : '其他';
      const status = CUSTOMER_STATUSES.includes(row.status as CustomerStatus) ? (row.status as CustomerStatus) : '啟用';
      createCustomer({
        name: row.name,
        short_name: row.short_name || '',
        type,
        address: row.address || '',
        delivery_addresses: row.delivery_address ? [row.delivery_address] : [],
        phone: row.phone || '',
        email: row.email || '',
        contact1_name: row.contact1_name,
        contact1_phone: row.contact1_phone,
        contact2_name: row.contact2_name || '',
        contact2_phone: row.contact2_phone || '',
        status,
        remarks: row.remarks || '',
      });
      created++;
    });
    setImportErrors(errors);
    if (created > 0) {
      onImportComplete();
      toast({ title: `成功匯入 ${created} 筆客戶資料` });
    }
    if (errors.length === 0) {
      setImportStep('done');
    }
  };

  const selectedCount = importSelected.filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" onPointerDownOutside={e => e.preventDefault()}>
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
          <span className={`px-2 py-0.5 rounded ${importStep === 'preview' ? 'bg-amber-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>2. 核對確認</span>
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

        {/* Step 2: Preview */}
        {importStep === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-zinc-400">
                檔案：<span className="text-zinc-200">{importFileName}</span>，共 <span className="text-amber-400 font-medium">{importData.length}</span> 筆資料，已選取 <span className="text-green-400 font-medium">{selectedCount}</span> 筆
              </p>
              <Button size="sm" variant="ghost" onClick={toggleAllImportRows} className="text-xs text-amber-400 hover:text-amber-300">
                {importSelected.every(Boolean) ? '取消全選' : '全選'}
              </Button>
            </div>

            {importErrors.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-2 max-h-24 overflow-y-auto">
                {importErrors.map((err, i) => (
                  <p key={i} className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" /> {err}
                  </p>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-auto rounded-lg border border-zinc-700">
              <table className="w-full text-xs">
                <thead className="bg-zinc-800 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left text-zinc-400 w-10">選取</th>
                    <th className="px-2 py-2 text-left text-zinc-400 w-8">#</th>
                    <th className="px-2 py-2 text-left text-zinc-300">客戶名稱</th>
                    <th className="px-2 py-2 text-left text-zinc-300">簡稱</th>
                    <th className="px-2 py-2 text-left text-zinc-300">類型</th>
                    <th className="px-2 py-2 text-left text-zinc-300">電話</th>
                    <th className="px-2 py-2 text-left text-zinc-300">聯絡人1</th>
                    <th className="px-2 py-2 text-left text-zinc-300">手機1</th>
                    <th className="px-2 py-2 text-left text-zinc-300">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {importData.map((row, idx) => {
                    const hasError = !row.name?.trim() || !row.contact1_name?.trim() || !row.contact1_phone?.trim();
                    return (
                      <tr key={idx} className={`border-t border-zinc-700 ${hasError ? 'bg-red-500/5' : 'hover:bg-zinc-800/50'}`}>
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={importSelected[idx]}
                            onChange={() => toggleImportRow(idx)}
                            className="rounded border-zinc-600"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-zinc-500">{idx + 1}</td>
                        <td className="px-2 py-1.5 text-zinc-100 font-medium">
                          {row.name || <span className="text-red-400 italic">缺少</span>}
                        </td>
                        <td className="px-2 py-1.5 text-zinc-300">{row.short_name || '-'}</td>
                        <td className="px-2 py-1.5 text-zinc-300">
                          {CUSTOMER_TYPES.includes(row.type as CustomerType) ? row.type : (
                            row.type ? <span className="text-yellow-400" title={`將歸類為「其他」`}>{row.type}{'\u2192'}其他</span> : '其他'
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-zinc-300">{row.phone || '-'}</td>
                        <td className="px-2 py-1.5 text-zinc-300">
                          {row.contact1_name || <span className="text-red-400 italic">缺少</span>}
                        </td>
                        <td className="px-2 py-1.5 text-zinc-300">
                          {row.contact1_phone || <span className="text-red-400 italic">缺少</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${row.status === '停用' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                            {row.status === '停用' ? '停用' : '啟用'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-700">
              <Button variant="outline" onClick={resetImport} className="text-zinc-400">
                重新上傳
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>取消</Button>
                <Button
                  onClick={handleBatchCreate}
                  disabled={selectedCount === 0}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  <Check className="w-4 h-4 mr-1" /> 確認建立 ({selectedCount} 筆)
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