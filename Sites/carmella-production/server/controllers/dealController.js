function isDealActive(deal) {
  const { startsAt, endsAt, activeDays } = deal;
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday

  if (Array.isArray(activeDays) && activeDays.length > 0) {
    if (!activeDays.includes(dayOfWeek)) return false;
  }

  if (startsAt && endsAt) {
    const [sh, sm] = startsAt.split(':').map(Number);
    const [eh, em] = endsAt.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const startMins = sh * 60 + (sm || 0);
    const endMins = eh * 60 + (em || 0);
    if (nowMins < startMins || nowMins > endMins) return false;
  }

  return true;
}

function createDealController({ fileService, socketService }) {
  return {
    async getDeals(req, res) {
      const deals = await fileService.loadDeals();
      const isStaff = req.user && ['owner', 'manager', 'waiter', 'kitchen'].includes(req.user.role);
      if (isStaff) {
        return res.json(deals);
      }
      const active = (Array.isArray(deals) ? deals : []).filter(isDealActive);
      res.json(active);
    },

    async saveDeals(req, res) {
      try {
        await fileService.saveDeals(req.body);
        socketService.emitDealUpdated();
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Deal save failed' });
      }
    }
  };
}

module.exports = {
  createDealController
};
