import type { Customer } from './types';

export function normalizeCustomerName(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('en-US');
}

export function findDuplicateCustomers(customers: Customer[], candidate: Pick<Customer, 'name' | 'short_name'>): Customer[] {
  const names = new Set([candidate.name, candidate.short_name].map(normalizeCustomerName).filter(Boolean));
  return customers.filter(customer => [customer.name, customer.short_name].some(name => {
    const normalized = normalizeCustomerName(name || '');
    return normalized !== '' && names.has(normalized);
  }));
}

export class DuplicateCustomerError extends Error {
  constructor(public readonly customers: Customer[]) {
    super(`客戶名稱或簡稱重複，未新增：${customers.map(customer => `${customer.customer_no} ${customer.name}`).join('、')}。請使用既有客戶或修正名稱。`);
    this.name = 'DuplicateCustomerError';
  }
}

/** Advisory matches only: shared offices and switchboards can be legitimate. */
export function findPossibleDuplicateCustomers(customers: Customer[], candidate: Partial<Customer>, excludeId?: string) {
  const clean = (value?: string) => normalizeCustomerName(value || '').replace(/[()（）,，.。·-]/g, '');
  const core = (value?: string) => clean(value).replace(/(?:股份有限公司|有限公司|企業社|公司)$/u, '');
  const phone = (value?: string) => {
    const digits = (value || '').split(/分機|ext\.?|#/i)[0].replace(/\D/g, '');
    return digits.startsWith('886') ? '0' + digits.slice(3).replace(/^0/, '') : digits;
  };
  const names = [candidate.name, candidate.short_name].map(core).filter(value => value.length >= 2);
  const numbers = [candidate.phone, candidate.contact1_phone, candidate.contact2_phone].map(phone).filter(value => value.length >= 8);
  return customers.filter(customer => customer.id !== excludeId).map(customer => {
    const reasons: string[] = [];
    if (findDuplicateCustomers([customer], {name: candidate.name || '', short_name: candidate.short_name || ''}).length) reasons.push('全名或簡稱相同');
    else if ([customer.name, customer.short_name].map(core).some(value => value.length >= 2 && names.some(name => name === value || (Math.min(name.length, value.length) >= 3 && (name.includes(value) || value.includes(name)))))) reasons.push('名稱相近');
    if ([customer.phone, customer.contact1_phone, customer.contact2_phone].map(phone).some(value => numbers.includes(value))) reasons.push('電話或手機相同');
    if (candidate.email?.trim() && candidate.email.trim().toLowerCase() === customer.email?.trim().toLowerCase()) reasons.push('電子郵件相同');
    if (clean(candidate.address).length >= 6 && clean(candidate.address) === clean(customer.address)) reasons.push('地址相同');
    return { customer, reasons };
  }).filter(match => match.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length);
}
