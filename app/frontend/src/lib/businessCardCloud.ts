import { supabase, hasSupabaseConfig } from './supabase';
import { cardFields, type OCRResult } from './businessCard';

export function validateCloudCard(data: unknown): OCRResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('AI 回傳格式不正確，請重試');
  const record = data as Record<string, unknown>;
  const fields = Object.keys(cardFields) as (keyof OCRResult)[];
  if (fields.some(key => record[key] != null && typeof record[key] !== 'string')) throw new Error('AI 回傳欄位格式不正確，請重試');
  const result = Object.fromEntries(fields.map(key => [key, typeof record[key] === 'string' ? record[key].trim().slice(0, 1000) : ''])) as OCRResult;
  if (!Object.values(result).some(Boolean)) throw new Error('AI 未辨識到名片資料，請換一張清晰照片');
  return result;
}

export async function recognizeCloudCard(image: string): Promise<OCRResult> {
  if (!hasSupabaseConfig()) throw new Error('尚未設定雲端連線');
  const { data, error } = await supabase.functions.invoke('ocr-business-card', {
    body: { image_base64: image.split(',')[1], mime_type: 'image/jpeg' },
    signal: AbortSignal.timeout(65000),
  });
  if (error || !data?.success) {
    let detail = data?.error || '';
    if (error && 'context' in error && error.context instanceof Response) {
      try { detail = (await error.context.json()).error || detail; } catch { /* Non-JSON gateway error. */ }
    }
    if (/not configured|未設定/.test(detail)) throw new Error('雲端 AI 尚未設定金鑰，請由管理者完成設定；也可切換本機文字辨識');
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(detail)) throw new Error('AI 服務額度不足或請求過多，請稍後重試或檢查用量');
    throw new Error('雲端 AI 暫時無法辨識，請檢查服務設定或切換本機文字辨識');
  }
  return validateCloudCard(data.data);
}
