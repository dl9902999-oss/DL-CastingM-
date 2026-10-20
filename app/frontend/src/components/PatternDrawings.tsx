import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { PatternDrawing } from '@/lib/types';
import { drawingUrl, validateDrawings } from '@/lib/patternDrawings';

export default function PatternDrawings({ drawings, files = [], onFilesChange, onRemove, disabled = false }: {
  drawings: PatternDrawing[];
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  onRemove?: (id: string) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<{ url: string; name: string; type: string } | null>(null);
  const [opening, setOpening] = useState(false);
  useEffect(() => () => { if (preview?.url.startsWith('blob:')) URL.revokeObjectURL(preview.url); }, [preview]);
  const openDrawing = async (item: PatternDrawing | File) => {
    setOpening(true);
    try {
      const url = item instanceof File ? URL.createObjectURL(item) : await drawingUrl(item);
      setPreview({ url, name: item.name, type: item.type });
    } catch {
      toast({ title: '無法開啟圖面', description: '請確認網路連線及檔案存取權限後重試。', variant: 'destructive' });
    } finally { setOpening(false); }
  };
  return <section className="space-y-2" aria-label="模具圖面">
    <p className="text-xs text-zinc-300 flex items-center gap-1"><FileText className="h-4 w-4 text-blue-400" />模具圖面</p>
    {onFilesChange && <>
      <input aria-label="上傳圖面" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" disabled={disabled}
        className="block w-full text-xs text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-2 file:text-zinc-100"
        onChange={event => {
          const selected = Array.from(event.target.files || []);
          try {
            validateDrawings([...files, ...selected], drawings.length);
            onFilesChange([...files, ...selected]);
          } catch (error) { toast({ title: '無法加入圖面', description: error instanceof Error ? error.message : '請重新選取檔案。', variant: 'destructive' }); }
          event.target.value = '';
        }} />
      <p className="text-xs text-zinc-400">JPG、PNG、WebP、PDF；每份最多10 MB，共10份。按建立／更新後保存。</p>
    </>}
    {[...drawings, ...files].map((item, index) => <div key={item instanceof File ? `pending-${index}` : item.id} className="flex items-center gap-2 rounded border border-zinc-600 p-2">
      <Button type="button" variant="ghost" disabled={opening || disabled} onClick={() => void openDrawing(item)} className="min-w-0 flex-1 justify-start text-zinc-200 h-auto text-xs">
        <span className="truncate">{item.name}</span>
      </Button>
      <span className="text-xs text-zinc-400">{(item.size / 1024 / 1024).toFixed(2)} MB{item instanceof File ? '・待保存' : ''}</span>
      {onFilesChange && onRemove && <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`移除圖面 ${item.name}`} className="h-7 w-7 text-red-300" onClick={() => item instanceof File ? onFilesChange(files.filter((_, i) => i !== index - drawings.length)) : onRemove(item.id)}><X className="h-4 w-4" /></Button>}
    </div>)}
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}>
      <DialogContent className="max-w-4xl bg-zinc-800 border-zinc-600 text-zinc-100">
        <DialogHeader><DialogTitle className="break-all">{preview?.name}</DialogTitle></DialogHeader>
        {preview && <>
          {preview.type === 'application/pdf' ? <iframe title={preview.name} src={preview.url} className="w-full h-[65vh] bg-white" /> : <img src={preview.url} alt={preview.name} className="max-h-[65vh] w-full object-contain" />}
          <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-300 underline">另開圖面／下載原檔</a>
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}
