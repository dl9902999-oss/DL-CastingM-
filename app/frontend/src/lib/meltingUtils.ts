export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
