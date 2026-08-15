// The "Today" analytics preset used to derive midnight from the browser's own
// clock/timezone (new Date(now.getFullYear(), now.getMonth(), now.getDate())).
// If an owner/manager opens the dashboard from a device set to a different
// timezone, that silently shifts "Today" away from the restaurant's actual
// SAST business day. South Africa is a fixed UTC+2 year-round (no DST), so
// this derives the Y-M-D from that fixed zone instead of the viewer's own.
export function sastTodayStartIso(): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${ymd}T00:00:00+02:00`).toISOString();
}
