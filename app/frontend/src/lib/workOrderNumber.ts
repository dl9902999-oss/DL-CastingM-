import type { Customer } from './types';

export type NumberingCustomer = Pick<Customer, 'id' | 'name' | 'short_name' | 'customer_no'>;

/** 建立日期以台灣當地日期計算，不使用PDF訂貨日期。 */
export function workOrderCreationDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('');
}

export function matchNumberingCustomer(customers: NumberingCustomer[], name: string, selectedId?: string): NumberingCustomer {
  const normalized = name.trim();
  const matches = selectedId
    ? customers.filter(customer => customer.id === selectedId)
    : customers.filter(customer => customer.name.trim() === normalized || (customer.short_name && customer.short_name.trim() === normalized));
  if (matches.length !== 1 || !matches[0].customer_no.trim()) {
    throw new Error('請選擇具有客戶編號的客戶；無法唯一對應時不會使用預設代碼。');
  }
  return matches[0];
}

export function buildWorkOrderNumber(customerNo: string, internalOrderNo: string, now = new Date()): string {
  const customer = customerNo.trim();
  const internal = internalOrderNo.trim();
  if (!customer || /\s/.test(customer)) throw new Error('請確認客戶編號不可空白或含空格。');
  if (!internal || /\s/.test(internal)) throw new Error('請填寫廠內訂單編號，不可含空格。');
  return `WO-${workOrderCreationDate(now)}-${customer}-${internal}`;
}
