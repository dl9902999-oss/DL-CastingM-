import type { Supplier } from './types';

export function normalizeSupplierName(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('en-US');
}

export function findDuplicateSuppliers(suppliers: Supplier[], candidate: Pick<Supplier, 'name' | 'short_name'>): Supplier[] {
  const names = new Set([candidate.name, candidate.short_name].map(normalizeSupplierName).filter(Boolean));
  return suppliers.filter(supplier => [supplier.name, supplier.short_name].some(name => {
    const normalized = normalizeSupplierName(name || '');
    return normalized !== '' && names.has(normalized);
  }));
}

export class DuplicateSupplierError extends Error {
  constructor(public readonly suppliers: Supplier[]) {
    super(`廠商名稱或簡稱重複，未新增：${suppliers.map(supplier => `${supplier.supplier_no} ${supplier.name}`).join('、')}。請使用既有廠商或修正名稱。`);
    this.name = 'DuplicateSupplierError';
  }
}

/** Advisory matches only: shared offices and switchboards can be legitimate. */
export function findPossibleDuplicateSuppliers(suppliers: Supplier[], candidate: Partial<Supplier>, excludeId?: string) {
  const clean = (value?: string) => normalizeSupplierName(value || '').replace(/[()（）,，.。·-]/g, '');
  const core = (value?: string) => clean(value).replace(/(?:股份有限公司|有限公司|企業社|公司)$/u, '');
  const phone = (value?: string) => {
    const digits = (value || '').split(/分機|ext\.?|#/i)[0].replace(/\D/g, '');
    return digits.startsWith('886') ? '0' + digits.slice(3).replace(/^0/, '') : digits;
  };
  const names = [candidate.name, candidate.short_name].map(core).filter(value => value.length >= 2);
  const numbers = [candidate.phone, candidate.contact1_phone, candidate.contact2_phone].map(phone).filter(value => value.length >= 8);
  return suppliers.filter(supplier => supplier.id !== excludeId).map(supplier => {
    const reasons: string[] = [];
    if (findDuplicateSuppliers([supplier], {name: candidate.name || '', short_name: candidate.short_name || ''}).length) reasons.push('全名或簡稱相同');
    else if ([supplier.name, supplier.short_name].map(core).some(value => value.length >= 2 && names.some(name => name === value || (Math.min(name.length, value.length) >= 3 && (name.includes(value) || value.includes(name)))))) reasons.push('名稱相近');
    if ([supplier.phone, supplier.contact1_phone, supplier.contact2_phone].map(phone).some(value => numbers.includes(value))) reasons.push('電話或手機相同');
    if (candidate.email?.trim() && candidate.email.trim().toLowerCase() === supplier.email?.trim().toLowerCase()) reasons.push('電子郵件相同');
    if (clean(candidate.address).length >= 6 && clean(candidate.address) === clean(supplier.address)) reasons.push('地址相同');
    return { supplier, reasons };
  }).filter(match => match.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length);
}

