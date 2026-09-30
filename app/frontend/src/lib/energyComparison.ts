export function getEnergyBand(energy: number, average: number | null) {
  if (average == null || average <= 0 || !Number.isFinite(energy)) return null;
  const deviation = (energy / average - 1) * 100;
  // 容許浮點運算誤差，恰好 ±10% 仍屬黃色。
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(deviation)) * 8;
  if (deviation > 10 + tolerance) return { key: 'high', label: '高於平均10%', className: 'bg-red-950 text-red-300', deviation };
  if (deviation < -10 - tolerance) return { key: 'low', label: '低於平均10%', className: 'bg-green-950 text-green-300', deviation };
  return { key: 'normal', label: '平均±10%內', className: 'bg-yellow-950 text-yellow-300', deviation };
}
