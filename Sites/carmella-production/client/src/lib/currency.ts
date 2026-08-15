// Single source of truth for South African Rand formatting across Customer,
// Waiter, Kitchen, and Admin/Owner. Uses a non-breaking space (U+00A0) both
// after "R" and between thousands groups so amounts read as "R 25 254" and
// never wrap mid-figure in tight layouts.
const NBSP = String.fromCharCode(160);

export function formatCurrency(amount: number | null | undefined, opts?: { floor?: boolean }): string {
  const n = Number(amount) || 0;
  const whole = opts?.floor ? Math.floor(n) : Math.round(n);
  return `R${NBSP}${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}`;
}
