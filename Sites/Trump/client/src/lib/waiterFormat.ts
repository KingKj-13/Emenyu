// Currency formatting for the waiter app — South African Rand, space thousands
// separator (e.g. R48 250, R595), matching the design.
export function money(value: number | null | undefined): string {
  const n = Math.round(Number(value) || 0);
  return 'R' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function moneyExact(value: number | null | undefined): string {
  const n = Number(value) || 0;
  const whole = Math.floor(n);
  const formatted = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return 'R' + formatted;
}

export function pct(value: number | null | undefined): string {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export function clockTime(d: Date = new Date()): string {
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
}
