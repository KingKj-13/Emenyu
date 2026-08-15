// Currency + time formatting for the waiter app — South African Rand, matching the
// web waiter (client/src/lib/currency.ts + waiterFormat.ts) so both UIs read
// identically. Uses a non-breaking space both after "R" and between thousands
// groups (e.g. "R 25 254") so amounts never wrap.
const NBSP = String.fromCharCode(160);

function formatCurrency(value: number | null | undefined, opts?: { floor?: boolean }): string {
  const n = Number(value) || 0;
  const whole = opts?.floor ? Math.floor(n) : Math.round(n);
  return `R${NBSP}${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}`;
}

export function money(value: number | null | undefined): string {
  return formatCurrency(value);
}

export function moneyExact(value: number | null | undefined): string {
  return formatCurrency(value, { floor: true });
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
