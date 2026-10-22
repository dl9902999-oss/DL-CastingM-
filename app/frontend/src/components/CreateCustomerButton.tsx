import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DuplicateCustomerError } from '@/lib/customerDuplicates';
import { dsCreateCustomer } from '@/lib/dataService';
import type { Customer, CustomerType } from '@/lib/types';

type CustomerDraft = Omit<Customer, 'id' | 'customer_no' | 'created_at' | 'updated_at'>;
const categories: CustomerType[] = ['產業機械', '砂石產業', '營造工程', '汽車模具', '鑄造廠', '加工廠', '貿易商', '其他'];
const emptyDraft = (name: string): CustomerDraft => ({
  name, short_name: '', type: '', address: '', delivery_addresses: [''], phone: '', email: '',
  contact1_name: '', contact1_phone: '', contact2_name: '', contact2_phone: '', status: '啟用', remarks: '',
});
const fields: { key: 'name' | 'short_name' | 'address' | 'phone' | 'email' | 'contact1_name' | 'contact1_phone' | 'contact2_name' | 'contact2_phone'; label: string; required?: boolean }[] = [
  { key: 'name', label: '客戶名稱', required: true }, { key: 'short_name', label: '客戶簡稱' },
  { key: 'contact1_name', label: '聯絡人1姓名', required: true }, { key: 'contact1_phone', label: '聯絡人1手機', required: true },
  { key: 'contact2_name', label: '聯絡人2姓名' }, { key: 'contact2_phone', label: '聯絡人2手機' },
  { key: 'phone', label: '公司電話' }, { key: 'email', label: '電子郵件' }, { key: 'address', label: '公司地址' },
];

export default function CreateCustomerButton({ initialName, onCreated, disabled = false }: {
  initialName: string; onCreated: (customer: Customer) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>(() => emptyDraft(initialName));
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const required = fields.find(field => field.required && !draft[field.key].trim());
    if (required || !draft.type) { setError(required ? `請填寫${required.label}` : '請選擇客戶類別'); return; }
    savingRef.current = true; setSaving(true); setError(''); setDuplicates([]);
    try {
      const cleaned = { ...draft };
      for (const field of fields) cleaned[field.key] = draft[field.key].trim();
      cleaned.delivery_addresses = draft.delivery_addresses.map(address => address.trim()).filter(Boolean);
      cleaned.remarks = draft.remarks.trim();
      const customer = await dsCreateCustomer(cleaned);
      if (!customer?.id || !customer.customer_no) throw new Error('未取得客戶編號，請確認儲存結果後再試。');
      onCreated(customer);
      setOpen(false);
    } catch (failure) {
      if (failure instanceof DuplicateCustomerError) setDuplicates(failure.customers);
      setError(failure instanceof Error ? failure.message : '客戶新增失敗，請重試；已填資料仍保留。');
    } finally { savingRef.current = false; setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!savingRef.current) setOpen(value); }}>
    <Button type="button" disabled={disabled} className="bg-zinc-700 text-amber-300 hover:bg-zinc-600" onClick={() => { setDraft(emptyDraft(initialName)); setError(''); setDuplicates([]); setOpen(true); }}>新增客戶</Button>
    <DialogContent className="bg-zinc-800 border-zinc-600 text-zinc-100 max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>新增客戶並選入工單</DialogTitle><DialogDescription className="text-zinc-400">客戶編號由系統產生；保存後自動選入目前工單，不清除已填寫的工單內容。</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={saving} className="space-y-3">
          <label className="block text-sm">客戶類別 *<select required aria-label="客戶類別" value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as CustomerType })} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-700 p-2"><option value="">請選擇類別</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(field => <label key={field.key} className="block text-sm">{field.label}{field.required ? ' *' : ''}<Input required={field.required} aria-label={field.label} type={field.key === 'email' ? 'email' : 'text'} value={draft[field.key]} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} className="mt-1 bg-zinc-700 border-zinc-600 text-zinc-100" /></label>)}</div>
          {draft.delivery_addresses.map((address, index) => <label key={index} className="block text-sm">送貨地址 {index + 1}<div className="flex gap-2"><Input value={address} onChange={event => setDraft({ ...draft, delivery_addresses: draft.delivery_addresses.map((value, i) => i === index ? event.target.value : value) })} className="bg-zinc-700 border-zinc-600" /><Button type="button" disabled={draft.delivery_addresses.length === 1} className="bg-zinc-700 text-red-300" onClick={() => setDraft({ ...draft, delivery_addresses: draft.delivery_addresses.filter((_, i) => i !== index) })}>移除</Button></div></label>)}
          <Button type="button" className="bg-zinc-700 text-zinc-100" onClick={() => setDraft({ ...draft, delivery_addresses: [...draft.delivery_addresses, ''] })}>新增送貨地址</Button>
          <label className="block text-sm">備註<textarea value={draft.remarks} onChange={event => setDraft({ ...draft, remarks: event.target.value })} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-700 p-2" /></label>
        </fieldset>
        {duplicates.length > 0 && <div className="space-y-2 rounded border border-amber-500/50 p-3"><p className="text-sm text-amber-300">找到既有客戶，可直接選入工單，不另行新增：</p>{duplicates.map(customer => <div key={customer.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{customer.customer_no} · {customer.name} · {customer.status}</span><Button type="button" disabled={saving} className="bg-zinc-700 text-amber-300" onClick={() => { onCreated(customer); setOpen(false); }}>選用此客戶</Button></div>)}</div>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" disabled={saving} className="bg-zinc-700 text-zinc-100" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={saving} className="bg-amber-500 text-zinc-900 hover:bg-amber-600">{saving ? '儲存中…' : '保存並選入工單'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
