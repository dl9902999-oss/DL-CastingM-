import { supabase } from './supabase';
import type { MeltPouring } from './supabaseStore';
import { preparePourings, type PouringDraft } from './pouringData';
export async function readCloudPourings(meltId?: string): Promise<MeltPouring[]> {
  let query = supabase.from('melt_pourings').select('*').order('id');
  if (meltId) query = query.eq('melt_id', meltId);
  // Paginate to avoid silently omitting records beyond the REST row limit.
  const rows: MeltPouring[] = [];
  for(let from=0;;from+=500) {
    const {data,error} = await query.range(from,from+499);
    if(error) throw new Error('澆注雲端資料讀取失敗，請恢復連線後重試。');
    rows.push(...(data || []));
    if(!data || data.length<500) return rows;
  }
}
export async function checkPouringSaveReady(): Promise<void> {
  const {error} = await supabase.rpc('save_melt_pourings_checked', {p_melt_id:null,p_expected:[],p_rows:[],p_check_only:true});
  if(error) throw new Error('澆注雲端保存尚未就緒或無存取權限；本次尚未開始儲存，請聯絡管理員。');
}
export async function saveCloudPourings(meltId: string, expected: MeltPouring[], drafts: PouringDraft[]): Promise<MeltPouring[]> {
  const rows=preparePourings(meltId,drafts);
  // Keep a separate recovery draft; never merge it into confirmed statistics.
  localStorage.setItem(`foundry_pouring_draft_${meltId}`, JSON.stringify({savedAt:new Date().toISOString(),expected,rows}));
  const {data,error}=await supabase.rpc('save_melt_pourings_checked',{p_melt_id:meltId,p_expected:expected,p_rows:rows,p_check_only:false});
  if(error) throw new Error(error.message.includes('POURING_CONFLICT') ? '澆注已被其他人修改，未覆蓋雲端；本機草稿已保留。請重新開啟並核對。' : '澆注尚未確認保存成功，本機草稿已保留；請重新讀取雲端核對後再試。');
  if (!Array.isArray(data) || data.length !== rows.length) throw new Error('澆注保存回應不完整，草稿已保留，請重新讀取核對。');
  // A cleanup failure must not turn a confirmed cloud save into a retry.
  try { localStorage.removeItem(`foundry_pouring_draft_${meltId}`); } catch { /* keep backup */ }
  return data as MeltPouring[];
}
