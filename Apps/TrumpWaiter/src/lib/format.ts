// Currency + time formatting for the waiter app — South African Rand, matching the
// web waiter (client/src/lib/waiterFormat.ts) so both UIs read identically. Uses a
// non-breaking space as the thousands separator so amounts never wrap.
const SEP = String.fromCharCode(160);

export function money(value: number | null | undefined): string {
  const n = Math.round(Number(value) || 0);
  return 'R' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, SEP);
}

export function moneyExact(value: number | null | undefined): string {
  const n = Number(value) || 0;
  const whole = Math.floor(n);
  return 'R' + String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, SEP);
}

export function seatedLabel(minutes?: number | null): string {
  if (!minutes) return '-';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

// "table7" -> "7"
export function tableNum(tableId?: string | null): string {
  return String(tableId || '').replace(/^table/i, '') || '-';
}
