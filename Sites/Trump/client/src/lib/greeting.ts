// Shared by the waiter Start-Shift screen and the guest chat concierge greeting
// so both actually reflect the time of day instead of one being hardcoded.
export function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function isEvening(): boolean {
  return new Date().getHours() >= 17;
}
