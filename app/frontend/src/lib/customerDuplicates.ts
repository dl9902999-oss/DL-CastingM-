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
