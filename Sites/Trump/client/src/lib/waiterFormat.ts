// Currency formatting for the waiter app — South African Rand. Uses a
// NON-BREAKING space (U+00A0) as the thousands separator so amounts like
// "R1 450" never wrap onto two lines in tight layouts.
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

export function pct(value: number | null | undefined): string {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export function clockTime(d: Date = new Date()): string {
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
}
