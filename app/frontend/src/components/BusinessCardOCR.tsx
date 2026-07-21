import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, Loader2, ScanLine, X } from 'lucide-react';

interface OCRResult {
  company_name: string;
  short_name: string;
  contact_name: string;
  contact_title: string;
  phone: string;
  mobile: string;
  fax: string;
  email: string;
  address: string;
  website: string;
}

interface BusinessCardOCRProps {
  onResult: (data: OCRResult) => void;
}

export default function BusinessCardOCR({ onResult }: BusinessCardOCRProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: '錯誤', description: '請選擇圖片檔案', variant: 'destructive' });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: '錯誤', description: '圖片大小不能超過 10MB', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const processImage = async () => {
    if (!preview) return;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      toast({ title: '錯誤', description: '尚未設定 Supabase 連線，無法使用 AI 辨識', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);

    try {
      // Extract base64 from data URL
      const base64 = preview.split(',')[1];

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ocr-business-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ image_base64: base64 }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'AI 辨識失敗');
      }

      onResult(result.data);
      toast({ title: '辨識成功', description: '名片資訊已自動填入表單' });
      setIsOpen(false);
      setPreview(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '辨識過程發生錯誤';
      toast({ title: '辨識失敗', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setPreview(null);
    setIsProcessing(false);
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
        AI 名片辨識
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!isProcessing) { setIsOpen(open); if (!open) resetState(); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <ScanLine className="w-5 h-5" />
              AI 名片辨識
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!preview ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">
                  拍攝或上傳名片照片，AI 將自動辨識並填入客戶資料
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
                    className="w-full h-auto max-h-64 object-contain bg-zinc-800"
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

                {isProcessing && (
                  <p className="text-xs text-center text-zinc-500">
                    AI 正在分析名片內容，請稍候約 5-10 秒...
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