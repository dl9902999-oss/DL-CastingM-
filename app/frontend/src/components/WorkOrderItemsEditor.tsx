import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { WorkOrderItem } from '@/lib/types';
import { emptyOrderItem } from '@/lib/workOrderItems';

export default function WorkOrderItemsEditor({ items, onChange, lockedIds = [], disabled = false }: {
  items: WorkOrderItem[]; onChange: (items: WorkOrderItem[]) => void; lockedIds?: string[]; disabled?: boolean;
}) {
  const patch = (id: string, key: keyof WorkOrderItem, value: string | number) => onChange(items.map(item => item.id === id ? { ...item, [key]: value } : item));
  const fields: { key: keyof WorkOrderItem; label: string; numeric?: boolean; options?: string[] }[] = [
    { key: 'line_no', label: '項次' }, { key: 'product_name', label: '品名 *' }, { key: 'material', label: '材質 *' },
    { key: 'quantity', label: '數量（件）*', numeric: true }, { key: 'estimated_weight', label: '預估單重（kg）', numeric: true },
    { key: 'mold_supply', label: '模具供給', options: ['客戶提供', '公司自有', '代客製作'] },
    { key: 'mold_type', label: '模具種類', options: ['上下模', '單面模', '現板模', '保模', '中板模', '砂心模', '其他'] },
    { key: 'heat_treatment', label: '熱處理', options: ['退火', '淬火', '回火', '正常化', '調質', '其他'] },
    { key: 'group', label: '組別' }, { key: 'remarks', label: '鑄件備註' },
  ];
  return <div className="space-y-3">
    {items.map((item, index) => <fieldset disabled={disabled} key={item.id} className="border border-zinc-600 rounded-lg p-3 space-y-3">
      <legend className="px-2 text-amber-300">品項 {index + 1}</legend>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{fields.map(field => <label key={field.key} className="text-xs text-zinc-300 space-y-1 block"><span>{field.label}</span>{field.options ? <select aria-label={`${field.label} ${index + 1}`} value={String(item[field.key])} onChange={event => patch(item.id, field.key, event.target.value)} className="w-full h-10 bg-zinc-700 border border-zinc-600 rounded-md px-2"><option value="">未填寫</option>{field.options.map(option => <option key={option}>{option}</option>)}</select> : <Input aria-label={`${field.label} ${index + 1}`} type={field.numeric ? 'number' : 'text'} value={item[field.key]} onChange={event => patch(item.id, field.key, field.numeric ? Number(event.target.value) : event.target.value)} className="bg-zinc-700 border-zinc-600 text-zinc-100" />}</label>)}</div>
      <div className="flex items-center justify-between gap-2 text-xs text-zinc-400"><span>預估總重 {(item.quantity * item.estimated_weight).toLocaleString('zh-TW')} kg{lockedIds.includes(item.id) && ' · 已有生產／出貨關聯，不可刪除'}</span><Button size="sm" variant="ghost" disabled={lockedIds.includes(item.id) || items.length <= 1} className="text-red-300" onClick={() => onChange(items.filter(row => row.id !== item.id))}>移除此品項</Button></div>
    </fieldset>)}
    <Button type="button" disabled={disabled} className="bg-zinc-700 text-zinc-100 hover:bg-zinc-600" onClick={() => onChange([...items, { ...emptyOrderItem(), line_no: String(items.length + 1) }])}>新增品項</Button>
  </div>;
}
