import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, Loader2, ScanLine, X } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { recognizeCloudCard } from '@/lib/businessCardCloud';

import { cardFields, parseBusinessCard, type OCRResult } from '@/lib/businessCard';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface BusinessCardOCRProps { onResult: (data: OCRResult) => void; }

export default function BusinessCardOCR({ onResult }: BusinessCardOCRProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [draft, setDraft] = useState<OCRResult | null>(null);
  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');
  const [rotation, setRotation] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: '錯誤', description: '請選擇圖片檔案', variant: 'destructive' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: '錯誤', description: '圖片大小不能超過 10MB', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPreview(dataUrl);
      setDraft(null);
      setRawText('');
      setRotation(0);
    };
    reader.readAsDataURL(file);
  };

  const processImage = useCallback(async () => {
    if (!preview) return;

    setIsProcessing(true);
    setProgress(0);

    let worker: Awaited<ReturnType<typeof Tesseract.createWorker>> | undefined;
    try {
      const image = new Image();
      image.src = preview;
      await image.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(2, 2400 / Math.max(image.width, image.height));
      const width = Math.round(image.width * scale), height = Math.round(image.height * scale);
      canvas.width = rotation % 180 ? height : width;
      canvas.height = rotation % 180 ? width : height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('無法處理圖片，請重新選擇');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
      if (mode === 'cloud') {
        setProgress(30);
        const parsed = await recognizeCloudCard(canvas.toDataURL('image/jpeg', 0.92));
        setDraft(parsed);
        setRawText('');
        toast({ title: 'AI 辨識完成', description: '請對照原圖核對所有欄位，尤其是姓名與號碼' });
        return;
      }
      worker = await Tesseract.createWorker('chi_tra+eng', Tesseract.OEM.LSTM_ONLY, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });

      await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
      const result = await worker.recognize(canvas, { rotateAuto: true });
      const text = result.data.text;

      if (!text || text.trim().length < 5) {
        toast({ title: '辨識失敗', description: '無法從圖片中辨識出文字，請確認圖片清晰度', variant: 'destructive' });
        return;
      }

      const parsed = parseBusinessCard(text);
      setRawText(text);
      setDraft(parsed);
      toast({ title: '辨識完成', description: '請對照名片核對下方欄位，再確認填入' });
    } catch (err) {
      const message = err instanceof Error ? err.message : '辨識過程發生錯誤';
      toast({ title: '辨識失敗', description: message, variant: 'destructive' });
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
      setIsProcessing(false);
      setProgress(0);
    }
  }, [preview, rotation, mode, toast]);

  const resetState = () => {
    setPreview(null);
    setDraft(null);
    setRawText('');
    setRotation(0);
    setIsProcessing(false);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => { resetState(); setIsOpen(true); }}
        className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
      >
        <ScanLine className="w-4 h-4 mr-1" />
        名片辨識
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!isProcessing) { setIsOpen(open); if (!open) resetState(); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <ScanLine className="w-5 h-5" />
              名片辨識
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <label className="block text-sm text-zinc-300">辨識方式
              <select aria-label="辨識方式" value={mode} disabled={isProcessing} onChange={e => { setMode(e.target.value as 'cloud' | 'local'); setDraft(null); setRawText(''); }} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 p-2">
                <option value="cloud">雲端 AI 辨識</option><option value="local">本機文字辨識</option>
              </select>
            </label>
            <p className="text-xs text-zinc-400">{mode === 'cloud' ? '開始辨識後，名片照片會經 Supabase 傳送至 Google AI，可能產生用量費用；核對後才填入表單。' : '照片在此瀏覽器內辨識，不傳送至 AI 服務。'}</p>
            {!preview ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">
                  拍攝或上傳名片照片，系統會辨識文字，核對後再填入客戶資料
                </p>
                <p className="text-xs text-zinc-500">
                  💡 提示：照片越清晰、文字越正面，辨識效果越好
                </p>

                {/* Camera capture (mobile friendly) */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-20 border-dashed border-zinc-600 hover:border-amber-500/50 hover:bg-zinc-800"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-1">
                    <Camera className="w-6 h-6 text-amber-400" />
                    <span className="text-sm text-zinc-300">拍攝名片</span>
                  </div>
                </Button>

                {/* File upload */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-20 border-dashed border-zinc-600 hover:border-amber-500/50 hover:bg-zinc-800"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="w-6 h-6 text-amber-400" />
                    <span className="text-sm text-zinc-300">上傳名片圖片</span>
                  </div>
                </Button>

                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Preview */}
                <div className="relative rounded-lg overflow-hidden border border-zinc-700">
                  <img
                    src={preview}
                    alt="名片預覽"
                    className="w-full h-64 object-contain bg-zinc-800"
                    style={{ transform: `rotate(${rotation}deg)`, padding: rotation % 180 ? '48px' : undefined }}
                  />
                  {!isProcessing && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-7 w-7 p-0 bg-zinc-900/80 hover:bg-zinc-900 text-zinc-300"
                      onClick={resetState}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <Button type="button" variant="outline" disabled={isProcessing} onClick={() => { setRotation(value => (value + 90) % 360); setDraft(null); }}>向右旋轉 90°</Button>
                {draft && <div className="space-y-3">
                  <p className="text-sm text-amber-300">請核對姓名、電話及公司名稱；未辨識到的欄位會留白。</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.keys(cardFields) as (keyof OCRResult)[]).map(key => <label key={key} className="text-sm text-zinc-300">{cardFields[key]}
                      <Input value={draft[key]} disabled={isProcessing} onChange={e => setDraft({ ...draft, [key]: e.target.value })} className="mt-1 bg-zinc-800 border-zinc-600" />
                    </label>)}
                  </div>
                  {rawText && <details><summary className="text-sm text-zinc-400 cursor-pointer">查看／修正辨識原文</summary>
                    <Textarea aria-label="辨識原文" value={rawText} disabled={isProcessing} onChange={e => setRawText(e.target.value)} className="mt-2 min-h-32" />
                    <Button type="button" variant="outline" disabled={isProcessing} onClick={() => setDraft(parseBusinessCard(rawText))}>依原文重新解析欄位</Button>
                  </details>}
                  <Button type="button" disabled={isProcessing || !Object.values(draft).some(value => value.trim())} onClick={() => { onResult(draft); setIsOpen(false); resetState(); }} className="w-full bg-amber-600 hover:bg-amber-500">確認並填入客戶表單</Button>
                </div>}
                {/* Progress bar */}
                {isProcessing && (
                  <div className="space-y-1">
                    <div className="w-full bg-zinc-700 rounded-full h-2">
                      <div
                        className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-center text-zinc-400">
                      {mode === 'cloud' ? 'AI 正在讀取名片，請稍候…' : `辨識進度：${progress}%`}
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-zinc-600"
                    onClick={resetState}
                    disabled={isProcessing}
                  >
                    重新選擇
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
                    onClick={processImage}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        辨識中...
                      </>
                    ) : (
                      <>
                        <ScanLine className="w-4 h-4 mr-1" />
                        開始辨識
                      </>
                    )}
                  </Button>
                </div>

                {isProcessing && mode === 'local' && (
                  <p className="text-xs text-center text-zinc-500">
                    首次使用需下載語言包（約 10MB），之後會快很多...
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}