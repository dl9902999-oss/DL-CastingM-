import { supabase } from './supabase';
import { readAllPages } from './readAllPages';
export interface InventoryAdjustment {
  id: string; adjustment_date: string; raw_material: string; quantity_delta: number;
  reason: string; created_by: string; created_at: string;
}
export async function getInventoryAdjustments() {
  return readAllPages<InventoryAdjustment>((from,to) => supabase.from('inventory_adjustments').select('*').order('adjustment_date').order('id').range(from,to));
}
export async function addInventoryAdjustment(row: Omit<InventoryAdjustment, 'created_at'>) {
  if (!row.raw_material.trim() || !row.reason.trim() || !row.created_by.trim() || !Number.isFinite(row.quantity_delta) || row.quantity_delta === 0) throw new Error('請填寫原料、非零調整重量、原因及登錄人。');
  const { data, error } = await supabase.rpc('append_inventory_adjustment', { p_row: row });
  if (error) throw new Error('盤點調整未確認成功，請重新讀取後重試：' + error.message);
  if (!data?.id) throw new Error('資料庫回應不完整，請重新讀取確認。');
  return data as InventoryAdjustment;
}
export function inventoryBalances(receipts: {raw_material: string; weight: number; receipt_date: string}[], materials: {raw_material: string; charge_weight: number; secondary_weight: number; melt_id: string}[], records: {id: string; melt_date: string}[], adjustments: InventoryAdjustment[], end: string) {
  const totals = new Map<string, {name: string; received: number; used: number; adjustment: number; balance: number}>();
  const entry = (name: string) => { const key = name.trim(); if (!totals.has(key)) totals.set(key,{name:key,received:0,used:0,adjustment:0,balance:0}); return totals.get(key)!; };
  const within = (date: string) => !!date && (!end || date <= end);
  receipts.filter(r => within(r.receipt_date)).forEach(r => entry(r.raw_material).received += Number(r.weight));
  const dates = new Map(records.map(r => [r.id,r.melt_date]));
  materials.filter(m => within(dates.get(m.melt_id) || '')).forEach(m => entry(m.raw_material).used += Number(m.charge_weight)+Number(m.secondary_weight));
  adjustments.filter(a => within(a.adjustment_date)).forEach(a => entry(a.raw_material).adjustment += Number(a.quantity_delta));
  return [...totals.values()].map(r => ({...r,balance: Math.round((r.received-r.used+r.adjustment)*100)/100})).sort((a,b)=>a.name.localeCompare(b.name,'zh-TW'));
}
