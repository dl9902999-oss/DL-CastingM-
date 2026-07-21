import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, Loader2, ScanLine, X } from 'lucide-react';
import Tesseract from 'tesseract.js';

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

// 智能解析名片文字
function parseBusinessCard(text: string): OCRResult {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const result: OCRResult = {
    company_name: '',
    short_name: '',
    contact_name: '',
    contact_title: '',
    phone: '',
    mobile: '',
    fax: '',
    email: '',
    address: '',
    website: '',
  };

  // Email pattern
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  // Phone patterns (Taiwan style)
  const phoneRegex = /(?:TEL|Tel|tel|電話|Phone|phone|T)[：:\s]*([(\d)\s\-+]+[\d\-]+)/;
  const faxRegex = /(?:FAX|Fax|fax|傳真|F)[：:\s]*([(\d)\s\-+]+[\d\-]+)/;
  const mobileRegex = /(?:手機|行動|Mobile|mobile|M|Cell|cell)[：:\s]*(09[\d\-\s]+)/;
  // Generic phone number (Taiwan landline or mobile)
  const genericPhoneRegex = /(\+?886[\s\-]?\d[\s\-]?[\d\s\-]{7,}|0[2-9][\s\-]?[\d\s\-]{7,}|09\d{2}[\s\-]?\d{3}[\s\-]?\d{3})/;
  // Website
  const websiteRegex = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/\S*)?/;
  // Address patterns (Taiwan)
  const addressRegex = /(?:地址|Address|ADD|add)[：:\s]*(.*)/;
  const addressPatternTW = /.{2,3}[市縣].{1,3}[區鄉鎮市].{2,}[路街道巷弄號樓]/;
  // Title patterns
  const titleKeywords = ['總經理', '副總', '經理', '協理', '主任', '課長', '組長', '專員', '業務', '工程師', 'Manager', 'Director', 'CEO', 'CTO', 'VP', 'President', 'Engineer', 'Supervisor', 'Sales', 'General Manager', '董事長', '總監', '處長', '廠長', '副廠長'];

  const usedLines = new Set<number>();

  // 1. Extract email
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(emailRegex);
    if (match) {
      result.email = match[0];
      usedLines.add(i);
      break;
    }
  }

  // 2. Extract phone
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(phoneRegex);
    if (match) {
      result.phone = match[1].replace(/\s+/g, '').trim();
      usedLines.add(i);
      break;
    }
  }

  // 3. Extract fax
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(faxRegex);
    if (match) {
      result.fax = match[1].replace(/\s+/g, '').trim();
      usedLines.add(i);
      break;
    }
  }

  // 4. Extract mobile
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    const match = lines[i].match(mobileRegex);
    if (match) {
      result.mobile = match[1].replace(/[\s\-]/g, '').trim();
      usedLines.add(i);
      break;
    }
  }

  // If no labeled mobile found, look for 09xx pattern
  if (!result.mobile) {
    for (let i = 0; i < lines.length; i++) {
      if (usedLines.has(i)) continue;
      const match = lines[i].match(/09\d{2}[\s\-]?\d{3}[\s\-]?\d{3}/);
      if (match) {
        result.mobile = match[0].replace(/[\s\-]/g, '');
        usedLines.add(i);
        break;
      }
    }
  }

  // If no labeled phone found, look for generic landline
  if (!result.phone) {
    for (let i = 0; i < lines.length; i++) {
      if (usedLines.has(i)) continue;
      const match = lines[i].match(/0[2-9][\s\-]?[\d\s\-]{7,}/);
      if (match && !match[0].startsWith('09')) {
        result.phone = match[0].replace(/\s+/g, '').trim();
        usedLines.add(i);
        break;
      }
    }
  }

  // 5. Extract website
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    const line = lines[i];
    // Skip email lines
    if (emailRegex.test(line) && !line.includes('www') && !line.includes('http')) continue;
    const match = line.match(websiteRegex);
    if (match && !match[0].includes('@')) {
      result.website = match[0];
      usedLines.add(i);
      break;
    }
  }

  // 6. Extract address
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    const addrMatch = lines[i].match(addressRegex);
    if (addrMatch) {
      result.address = addrMatch[1].trim();
      usedLines.add(i);
      break;
    }
  }
  if (!result.address) {
    for (let i = 0; i < lines.length; i++) {
      if (usedLines.has(i)) continue;
      if (addressPatternTW.test(lines[i])) {
        result.address = lines[i].replace(/^(?:地址|Address|ADD|add)[：:\s]*/, '').trim();
        usedLines.add(i);
        break;
      }
    }
  }

  // 7. Extract title
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    for (const title of titleKeywords) {
      if (lines[i].includes(title)) {
        result.contact_title = lines[i].trim();
        usedLines.add(i);
        break;
      }
    }
    if (result.contact_title) break;
  }

  // 8. Extract company name (usually the first or second line, longest CJK text)
  const cjkLines: { idx: number; text: string; len: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    const cjkCount = (lines[i].match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjkCount >= 3) {
      cjkLines.push({ idx: i, text: lines[i], len: cjkCount });
    }
  }

  // Company name heuristic: contains 公司/企業/有限/股份/工業/科技/集團 etc.
  const companyKeywords = ['公司', '企業', '有限', '股份', '工業', '科技', '集團', '工廠', '實業', 'Corp', 'Inc', 'Ltd', 'Co.', 'Company'];
  for (const cl of cjkLines) {
    for (const kw of companyKeywords) {
      if (cl.text.includes(kw)) {
        result.company_name = cl.text.trim();
        usedLines.add(cl.idx);
        break;
      }
    }
    if (result.company_name) break;
  }

  // If no company keyword found, use the longest CJK line from top 3 lines
  if (!result.company_name && cjkLines.length > 0) {
    const topLines = cjkLines.filter(l => l.idx < 3).sort((a, b) => b.len - a.len);
    if (topLines.length > 0) {
      result.company_name = topLines[0].text.trim();
      usedLines.add(topLines[0].idx);
    }
  }

  // 9. Extract contact name (CJK name, typically 2-4 characters, not company/title)
  const nameRegex = /^[\u4e00-\u9fff]{2,4}$/;
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    const cleaned = lines[i].replace(/\s/g, '');
    if (nameRegex.test(cleaned)) {
      result.contact_name = cleaned;
      usedLines.add(i);
      break;
    }
  }

  // If no pure CJK name found, look for name patterns
  if (!result.contact_name) {
    for (let i = 0; i < lines.length; i++) {
      if (usedLines.has(i)) continue;
      const nameMatch = lines[i].match(/^([\u4e00-\u9fff]{2,4})\s/);
      if (nameMatch) {
        result.contact_name = nameMatch[1];
        usedLines.add(i);
        break;
      }
    }
  }

  return result;
}

export default function BusinessCardOCR({ onResult }: BusinessCardOCRProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
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
    };
    reader.readAsDataURL(file);
  };

  const processImage = useCallback(async () => {
    if (!preview) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const result = await Tesseract.recognize(preview, 'chi_tra+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });

      const text = result.data.text;

      if (!text || text.trim().length < 5) {
        toast({ title: '辨識失敗', description: '無法從圖片中辨識出文字，請確認圖片清晰度', variant: 'destructive' });
        return;
      }

      const parsed = parseBusinessCard(text);
      onResult(parsed);
      toast({ title: '辨識完成', description: '名片資訊已自動填入表單，請確認並修正' });
      setIsOpen(false);
      setPreview(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '辨識過程發生錯誤';
      toast({ title: '辨識失敗', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  }, [preview, onResult, toast]);

  const resetState = () => {
    setPreview(null);
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
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <ScanLine className="w-5 h-5" />
              名片辨識（免費 · 無需 API Key）
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!preview ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">
                  拍攝或上傳名片照片，系統將在瀏覽器端辨識文字並自動填入客戶資料
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
                      辨識進度：{progress}%
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

                {isProcessing && (
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