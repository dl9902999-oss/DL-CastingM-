import { getDocument, PDFWorker } from 'pdfjs-dist';
import InlinePdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';
import { parseOrderPage, type PdfWord, type PdfOrderDraft } from './workOrderPdf';
export async function readWorkOrderPdf(file: File): Promise<PdfOrderDraft[]> {
  if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 10 * 1024 * 1024 || file.size === 0) throw new Error('請選擇非空白且小於10 MB的PDF。');
  const data = new Uint8Array(await file.arrayBuffer());
  const port = new InlinePdfWorker();
  // PDF.js 4.10 的宣告將 port 推導為 null，但執行期支援原生 Worker。
  // @ts-expect-error PDF.js 的 port 宣告與執行期介面不一致。
  const worker = new PDFWorker({ port });
  let task: ReturnType<typeof getDocument> | undefined;
  try {
    task = getDocument({ data, worker });
    const document = await task.promise;
    if (document.numPages > 30) throw new Error('每份PDF最多30頁，請拆分後匯入。');
    const drafts: PdfOrderDraft[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      try { drafts.push(parseOrderPage(content.items.filter((item): item is PdfWord & typeof item => 'str' in item), file.name)); }
      catch (error) { throw new Error(`第${pageNumber}頁：${error instanceof Error ? error.message : '解析失敗'}`); }
    }
    return drafts;
  } finally {
    try {
      await task?.destroy();
    } finally {
      worker.destroy();
      port.terminate();
    }
  }
}
