import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { QualityInspection, MoldingBatch } from '@/lib/types';
import { getQualityInspections, createQualityInspection, getMoldingBatches, getMeltingRecords } from '@/lib/store';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Quality() {
  const [inspections, setInspections] = useState<QualityInspection[]>([]);
  const [batches, setBatches] = useState<MoldingBatch[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({ batch_id: '', heat_no: '', result: '' as 'PASS' | 'HOLD' | 'REJECT' | '', defect_count: 0, inspected_quantity: 0, remarks: '' });

  useEffect(() => {
    setInspections(getQualityInspections());
    setBatches(getMoldingBatches());
  }, []);

  const handleCreate = () => {
    if (!form.batch_id || !form.result || form.inspected_quantity <= 0) {
      toast({ title: '請填寫所有必要欄位', variant: 'destructive' });
      return;
    }
    const batch = batches.find(b => b.id === form.batch_id);
    if (!batch) return;
    const meltings = getMeltingRecords().filter(m => m.batch_id === form.batch_id);
    const heatNo = form.heat_no || (meltings.length > 0 ? meltings[0].heat_no : 'N/A');

    createQualityInspection({
      batch_id: form.batch_id,
      batch_no: batch.batch_no,
      heat_no: heatNo,
      result: form.result as 'PASS' | 'HOLD' | 'REJECT',
      defect_count: form.defect_count,
      inspected_quantity: form.inspected_quantity,
      remarks: form.remarks,
      inspector: user?.name || 'Unknown',
    });
    setInspections(getQualityInspections());
    setIsCreateOpen(false);
    setForm({ batch_id: '', heat_no: '', result: '', defect_count: 0, inspected_quantity: 0, remarks: '' });
    toast({ title: '檢驗紀錄已建立' });
  };

  const getResultIcon = (result: string) => {
    switch (result) {
      case 'PASS': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'HOLD': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'REJECT': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return null;
    }
  };

  const getResultStyle = (result: string) => {
    switch (result) {
      case 'PASS': return 'bg-green-500/20 text-green-400';
      case 'HOLD': return 'bg-amber-500/20 text-amber-400';
      case 'REJECT': return 'bg-red-500/20 text-red-400';
      default: return '';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">品質檢驗</h1>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
                <Plus className="w-4 h-4 mr-2" />新增檢驗
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-zinc-100">新增品質檢驗</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-300">批次</Label>
                  <Select value={form.batch_id} onValueChange={val => setForm({ ...form, batch_id: val })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇批次" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      {batches.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.batch_no}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">檢驗結果</Label>
                  <Select value={form.result} onValueChange={val => setForm({ ...form, result: val as 'PASS' | 'HOLD' | 'REJECT' })}>
                    <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                      <SelectValue placeholder="選擇結果" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-700 border-zinc-600">
                      <SelectItem value="PASS">PASS</SelectItem>
                      <SelectItem value="HOLD">HOLD</SelectItem>
                      <SelectItem value="REJECT">REJECT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">檢驗數量</Label>
                  <Input type="number" value={form.inspected_quantity} onChange={e => setForm({ ...form, inspected_quantity: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">缺陷數量</Label>
                  <Input type="number" value={form.defect_count} onChange={e => setForm({ ...form, defect_count: Number(e.target.value) })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <div>
                  <Label className="text-zinc-300">備註</Label>
                  <Textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="bg-zinc-700 border-zinc-600 text-zinc-100" />
                </div>
                <Button onClick={handleCreate} className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900">建立</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Inspections List */}
        <div className="space-y-3">
          {inspections.length === 0 ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardContent className="p-8 text-center text-zinc-400">尚無檢驗紀錄</CardContent>
            </Card>
          ) : (
            inspections.map(insp => (
              <Card key={insp.id} className="bg-zinc-800 border-zinc-700">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getResultIcon(insp.result)}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getResultStyle(insp.result)}`}>{insp.result}</span>
                        <span className="font-mono text-xs text-zinc-400">{insp.batch_no}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-400">
                        <span>Heat No: <span className="text-zinc-200">{insp.heat_no}</span></span>
                        <span>檢驗數: <span className="text-zinc-200">{insp.inspected_quantity}</span></span>
                        <span>缺陷數: <span className="text-zinc-200">{insp.defect_count}</span></span>
                        <span>檢驗員: <span className="text-zinc-200">{insp.inspector}</span></span>
                      </div>
                      {insp.remarks && <p className="text-xs text-zinc-500 mt-1">{insp.remarks}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}