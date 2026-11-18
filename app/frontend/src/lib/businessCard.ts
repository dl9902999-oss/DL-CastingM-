export const cardFields = {
  company_name: '公司全名', short_name: '公司簡稱', contact_name: '聯絡人姓名',
  contact_title: '職稱', phone: '公司電話', mobile: '手機', fax: '傳真',
  email: '電子郵件', address: '地址', website: '網站', tax_id: '統一編號',
};
export type OCRResult = Record<keyof typeof cardFields, string>;

/** Parse each field independently: a line can contain several contact details. */
export function parseBusinessCard(text: string): OCRResult {
  const result = Object.fromEntries(Object.keys(cardFields).map(key => [key, ''])) as OCRResult;
  const lines = text.normalize('NFKC').replace(/([\u3400-\u9fff])[^\S\r\n]+(?=[\u3400-\u9fff])/g, '$1')
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const email = /[\w.%+-]+\s*@\s*[\w.-]+\s*\.\s*[a-z]{2,}/i;
  const website = /(?:https?:\/\/|www\.)[a-z0-9.-]+(?:\/[\w./?=&%#-]*)?|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|tw|io)\b(?:\/[\w./?=&%#-]*)?/i;
  const title = /總經理|副總經理|董事長|副廠長|廠長|副總|協理|經理|主任|課長|組長|專員|工程師|總監|處長|業務|General Manager|Sales Manager|Manager|Director|President|Engineer|Supervisor|CEO|CTO|Sales/i;
  const company = /股份有限公司|有限公司|公司|企業社|企業|工業社|工業|工廠|實業|科技|集團|\b(?:Corp\.?|Inc\.?|Ltd\.?|Company)\b/i;
  const contactLine = /電話|傳真|手機|行動|地址|網址|電子郵件|\b(?:tel|fax|mobile|cell|phone|email|address|web)\b/i;
  const used = new Set<number>();
  lines.forEach((line, i) => {
    const tax = line.match(/(?:統一編號|統編|VAT|Tax ID)\s*[:/：]?\s*(\d{8})(?!\d)/i);
    if (tax) { result.tax_id ||= tax[1]; used.add(i); }
    const mail = line.match(email);
    if (mail) { result.email ||= mail[0].replace(/\s/g, ''); used.add(i); }
    const site = line.replace(email, '').match(website);
    if (site) { result.website ||= site[0]; used.add(i); }
    // Labels bound each number, preventing a fax or second number from being swallowed.
    const numbers = /(?:\+886[\s().-]*(?:0[\s().-]*)?|\(?0)[2-9](?:[\s().-]*\d){7,9}(?:\s*(?:#|ext\.?|分機)\s*\d{1,6})?/gi;
    for (const match of line.matchAll(numbers)) {
      const value = match[0].trim().replace(/\s+/g, ' ');
      const base = value.split(/#|ext\.?|分機/i)[0].replace(/\D/g, '');
      const local = base.startsWith('886') ? '0' + base.slice(3).replace(/^0/, '') : base;
      if (local.length < 9 || local.length > 10) continue;
      const prefix = line.slice(0, match.index).match(/(?:傳真|fax|\bF|電話|tel|phone|\bT|手機|行動|mobile|cell|\bM)\s*[:.]?\s*$/i)?.[0] || '';
      if (/傳真|fax|^F[\s:.]*$/i.test(prefix)) result.fax ||= value;
      else if (/^09\d{8}$/.test(local)) result.mobile ||= value;
      else if (!/^09/.test(local)) result.phone ||= value;
      used.add(i);
    }
    const address = line.match(/(?:地址|Address|ADD)\s*[:.]?\s*(.+)/i)
      || line.match(/((?:\d{3,6}\s*)?(?:台灣|臺灣)?[\u3400-\u9fff]{2,3}[市縣].*[路街鄉鎮區].*)/);
    if (address) {
      result.address ||= address[1].split(/\s+(?:TEL|FAX|電話|傳真|E-?mail)\b/i)[0].trim();
      const next = lines[i + 1];
      if (next && /^(?:\d|[\u3400-\u9fff]{1,8}[路街巷弄])/.test(next) && /[段巷弄號樓]/.test(next) && !contactLine.test(next) && !company.test(next) && !/@/.test(next)) {
        result.address += next; used.add(i + 1);
      }
      used.add(i);
    }
  });
  lines.forEach((line, i) => {
    if (used.has(i)) return;
    if (company.test(line)) { result.company_name ||= line; used.add(i); }
  });
  lines.forEach((line, i) => {
    if (used.has(i)) return;
    const job = line.match(title);
    if (!job) return;
    result.contact_title ||= job[0];
    const name = line.replace(job[0], '').replace(/^[\s:|·-]+|[\s:|·-]+$/g, '');
    if (/^[\u3400-\u9fff]{2,4}$/.test(name)) result.contact_name ||= name;
    used.add(i);
  });
  lines.forEach((line, i) => {
    if (used.has(i) || contactLine.test(line)) return;
    const labeled = line.match(/^(?:姓名|聯絡人|Name)\s*:?\s*(.+)$/i);
    if (labeled) result.contact_name ||= labeled[1];
    else if (/^[\u3400-\u9fff]{2,4}$/.test(line)) result.contact_name ||= line;
  });
  return result;
}
