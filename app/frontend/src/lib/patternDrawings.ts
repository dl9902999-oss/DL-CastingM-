import { supabase } from './supabase';
import type { PatternDrawing } from './types';

const BUCKET = 'pattern-drawings';
export const MAX_DRAWINGS = 10;
export const MAX_DRAWING_SIZE = 10 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

export function validateDrawings(files: File[], existingCount: number): void {
  if (files.length + existingCount > MAX_DRAWINGS) throw new Error('每個模具最多可附加10份圖面。');
  for (const file of files) {
    if (!TYPES[file.type]) throw new Error(`${file.name}：僅支援 JPG、PNG、WebP 或 PDF。`);
    if (!file.size || file.size > MAX_DRAWING_SIZE) throw new Error(`${file.name}：檔案不可為空，且每份不得超過10 MB。`);
  }
}

export async function uploadDrawings(files: File[]): Promise<PatternDrawing[]> {
  validateDrawings(files, 0);
  const uploaded: PatternDrawing[] = [];
  try {
    for (const file of files) {
      const id = crypto.randomUUID();
      const path = `${id}.${TYPES[file.type]}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      uploaded.push({ id, path, name: file.name, type: file.type, size: file.size });
    }
    return uploaded;
  } catch (error) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded.map(file => file.path));
    throw error;
  }
}

export async function drawingUrl(drawing: PatternDrawing): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(drawing.path, 300);
  if (error) throw error;
  return data.signedUrl;
}
