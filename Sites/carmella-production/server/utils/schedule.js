// Shared "is this promotion/happy-hour/special active right now" logic used
// by Promotions (Deal of the Day), Happy Hour, and Specials. A row with no
// date/time/day bounds at all is always active while its `active` flag is on.
function isWithinSchedule({ startDate, endDate, startTime, endTime, activeDays } = {}, now = new Date()) {
  if (Array.isArray(activeDays) && activeDays.length > 0 && !activeDays.includes(now.getDay())) {
    return false;
  }

  if (startDate && now < new Date(startDate)) {
    return false;
  }
  if (endDate) {
    const end = new Date(endDate);
    // An end DATE (no time-of-day component) should cover the whole day.
    end.setHours(23, 59, 59, 999);
    if (now > end) {
      return false;
    }
  }

  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const startMins = sh * 60 + (sm || 0);
    const endMins = eh * 60 + (em || 0);
    const inWindow = startMins <= endMins
      ? nowMins >= startMins && nowMins <= endMins
      : nowMins >= startMins || nowMins <= endMins; // overnight window (e.g. 22:00-02:00)
    if (!inWindow) {
      return false;
    }
  }

  return true;
}

module.exports = { isWithinSchedule };
