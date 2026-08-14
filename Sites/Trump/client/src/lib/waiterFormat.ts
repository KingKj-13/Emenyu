// Currency formatting for the waiter app — South African Rand. Delegates to
// the shared formatter (src/lib/currency.ts) so amounts read identically to
// Customer/Kitchen/Admin.
import { formatCurrency } from './currency';

export function money(value: number | null | undefined): string {
  return formatCurrency(value);
}

export function moneyExact(value: number | null | undefined): string {
  return formatCurrency(value, { floor: true });
}

export function pct(value: number | null | undefined): string {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export function clockTime(d: Date = new Date()): string {
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
}
