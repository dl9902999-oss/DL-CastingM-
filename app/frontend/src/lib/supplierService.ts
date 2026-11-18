import { supabase } from './supabase';
import type { Supplier } from './types';
import { DuplicateSupplierError, findDuplicateSuppliers } from './supplierDuplicates';

type SupplierInput = Omit<Supplier, 'id' | 'supplier_no' | 'created_at' | 'updated_at'>;

function fail(error: { code?: string; message: string }): never {
  if (error.code === 'PGRST205' || error.code === '42P01') throw new Error('廠商資料表尚未啟用，請完成資料庫設定後重試。');
  if (error.code === '23505' || error.code === 'P0001') throw new Error('廠商名稱、簡稱或編號重複，請確認既有廠商資料。');
  throw new Error(error.message);
}

export async function dsGetSuppliers(): Promise<Supplier[]> {
  // Fetch all pages so filtering and duplicate checks include lists over 1,000 rows.
  const rows: Supplier[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('suppliers').select('*').order('id').range(offset, offset + 999);
    if (error) fail(error);
    rows.push(...(data || []) as Supplier[]);
    if (!data || data.length < 1000) return rows;
  }
}

function payload(input: SupplierInput): SupplierInput {
  return {
    name: input.name.trim(), short_name: input.short_name.trim(), type: input.type,
    address: input.address, delivery_addresses: input.delivery_addresses,
    phone: input.phone, email: input.email, contact1_name: input.contact1_name,
    contact1_phone: input.contact1_phone, contact2_name: input.contact2_name,
    contact2_phone: input.contact2_phone, status: input.status, remarks: input.remarks,
  };
}

async function checkDuplicates(input: SupplierInput, excludeId?: string) {
  const duplicates = findDuplicateSuppliers((await dsGetSuppliers()).filter(row => row.id !== excludeId), input);
  if (duplicates.length) throw new DuplicateSupplierError(duplicates);
}

export async function dsCreateSupplier(input: SupplierInput): Promise<Supplier> {
  await checkDuplicates(input);
  const { data, error } = await supabase.from('suppliers').insert(payload(input)).select().single();
  if (error) fail(error);
  return data as Supplier;
}

export async function dsUpdateSupplier(id: string, input: SupplierInput): Promise<Supplier> {
  await checkDuplicates(input, id);
  const { data, error } = await supabase.from('suppliers').update(payload(input)).eq('id', id).select().single();
  if (error) fail(error);
  return data as Supplier;
}

export async function dsDeleteSupplier(id: string): Promise<void> {
  const { data, error } = await supabase.from('suppliers').delete().eq('id', id).select('id').single();
  if (error) fail(error);
  if (!data) throw new Error('刪除未完成，請刷新廠商清單後重試。');
}
