// STEP 2 — Day/Night visual theme. Appearance only: resolveActiveTheme()
// never touches menu data, only decides which of "day"/"night" is active.
function resolveActiveTheme(settings, now = new Date()) {
  if (!settings.autoEnabled) {
    return settings.manualTheme === 'night' ? 'night' : 'day';
  }

  const [dayH, dayM] = settings.dayStartTime.split(':').map(Number);
  const [nightH, nightM] = settings.nightStartTime.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const dayMins = dayH * 60 + (dayM || 0);
  const nightMins = nightH * 60 + (nightM || 0);

  // Day runs from dayStartTime up to (not including) nightStartTime; night
  // covers the rest, correctly handling an overnight wrap (e.g. night at 22:00,
  // day at 06:00 -> "day" window is 06:00-21:59, "night" is 22:00-05:59).
  if (dayMins === nightMins) return 'day';
  const inDayWindow = dayMins < nightMins
    ? nowMins >= dayMins && nowMins < nightMins
    : !(nowMins >= nightMins && nowMins < dayMins);
  return inDayWindow ? 'day' : 'night';
}

function toPublic(settings) {
  return {
    autoEnabled: settings.autoEnabled,
    manualTheme: settings.manualTheme,
    dayStartTime: settings.dayStartTime,
    nightStartTime: settings.nightStartTime,
    activeTheme: resolveActiveTheme(settings),
  };
}

function createThemeController({ getPrisma, socketService }) {
  async function ensureSettings(prisma) {
    return prisma.themeSettings.upsert({
      where: { restaurantId: 'carmella-production' },
      create: { restaurantId: 'carmella-production' },
      update: {},
    });
  }

  return {
    async getTheme(req, res) {
      const prisma = getPrisma();
      const settings = await ensureSettings(prisma);
      res.json(toPublic(settings));
    },

    async updateTheme(req, res) {
      const { autoEnabled, manualTheme, dayStartTime, nightStartTime } = req.body || {};
      const data = {};
      if (autoEnabled !== undefined) data.autoEnabled = Boolean(autoEnabled);
      if (manualTheme !== undefined) {
        if (!['day', 'night'].includes(manualTheme)) return res.status(400).json({ error: 'manualTheme must be "day" or "night"' });
        data.manualTheme = manualTheme;
      }
      if (dayStartTime !== undefined) {
        if (!/^\d{2}:\d{2}$/.test(dayStartTime)) return res.status(400).json({ error: 'dayStartTime must be HH:MM' });
        data.dayStartTime = dayStartTime;
      }
      if (nightStartTime !== undefined) {
        if (!/^\d{2}:\d{2}$/.test(nightStartTime)) return res.status(400).json({ error: 'nightStartTime must be HH:MM' });
        data.nightStartTime = nightStartTime;
      }

      const prisma = getPrisma();
      await ensureSettings(prisma);
      const updated = await prisma.themeSettings.update({ where: { restaurantId: 'carmella-production' }, data });
      socketService?.emitThemeUpdated();
      res.json(toPublic(updated));
    },
  };
}

module.exports = { createThemeController, resolveActiveTheme };
