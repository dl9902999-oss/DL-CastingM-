/** Do not treat a short page as EOF: server row caps may be below our page size. */
export async function readAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await fetchPage(rows.length, rows.length + 499);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('雲端清單回應不完整，未採用部分資料。');
    if (!data.length) return rows;
    rows.push(...data);
  }
}
