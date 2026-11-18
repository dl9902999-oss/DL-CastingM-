import { supabase } from './supabase';
import { hasPendingSyncForTable } from './pendingSyncGuard';
import { markRecentWrite } from './realtimeSync';
import type { RawMaterialReceipt, RawMaterialReceiptInput } from './supabaseStore';
export async function saveReceipt(id:string,input:RawMaterialReceiptInput,expected:RawMaterialReceipt|null):Promise<RawMaterialReceipt> {
 if(!navigator.onLine) throw new Error('目前離線，尚未儲存至雲端。請保留表單，恢復連線後重試。');
 if(hasPendingSyncForTable('raw_material_receipts')) throw new Error('尚有舊入庫資料待同步，請完成同步再儲存。');
 const {data,error}=await supabase.rpc('save_raw_receipt_checked',{p_id:id,p_input:input,p_expected:expected});
 if(error) throw new Error(error.message.includes('RECEIPT_CONFLICT')?'此入庫紀錄已被修改或刪除，本次未覆蓋。請保留輸入內容，重新開啟紀錄核對。':`雲端儲存未確認成功，請保留表單並重試：${error.message}`);
 if(data?.id!==id || !data.receipt_no) throw new Error('雲端回應不完整，請保留表單並重試。');
 markRecentWrite('raw_material_receipts');
 try { const old=JSON.parse(localStorage.getItem('foundry_raw_material_receipts')||'[]'); localStorage.setItem('foundry_raw_material_receipts',JSON.stringify([...old.filter((r:RawMaterialReceipt)=>r.id!==id),data])); } catch {console.warn('入庫已存至雲端，本機快取未更新。');}
 return data as RawMaterialReceipt;
}
