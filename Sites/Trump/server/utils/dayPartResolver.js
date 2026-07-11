// Resolves which configured day-part (morning/midday/golden-hour, or any
// tenant-defined equivalent) is "now", in the restaurant's local time.
// process.env.TZ is pinned to Africa/Johannesburg at server startup
// (server.js), so Date's local getters already reflect SAST — no timezone
// math needed here. Pure function: no I/O, no clock reads of its own, so it's
// trivially reusable from any caller (GET /api/config, the Gaspard NLG voice)
// without duplicating the "what time-window are we in" logic in each place.
function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function resolveDayPart(dayParts, now = new Date()) {
  if (!Array.isArray(dayParts) || dayParts.length === 0) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const dp of dayParts) {
    const from = timeToMinutes(dp.from);
    const to = timeToMinutes(dp.to);
    // Same-day window (the only case Carmella's data uses — no window
    // crosses midnight) — a wrapping window would need `from > to` handling,
    // deliberately unsupported until a tenant actually needs it.
    if (from <= to ? (nowMinutes >= from && nowMinutes < to) : (nowMinutes >= from || nowMinutes < to)) {
      return dp;
    }
  }

  // Nothing matched (e.g. after the last window closes for the night) —
  // fall back to the day-part with the latest start time, mirroring how a
  // restaurant stays in its final mode until it closes.
  return [...dayParts].sort((a, b) => timeToMinutes(b.from) - timeToMinutes(a.from))[0];
}

module.exports = { resolveDayPart };
