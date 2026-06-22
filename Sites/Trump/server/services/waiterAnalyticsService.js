// Per-waiter analytics — deterministic. Derives all metrics from history orders
// (grouped by waiterName) + UpsellEvent. No AI. Wording (coaching hints) added by nlg layer.
const { getPrisma } = require('./prismaClient');
const { normalizeName } = require('../utils/helpers');

// Display buckets shown in "Sales by course" (matches the screenshot).
const COURSE_BUCKETS = { STARTER: 'Starters', MAIN: 'Mains', WINE: 'Cellar', DRINK: 'Cellar', DESSERT: 'Desserts' };
const BUCKET_ORDER = ['Starters', 'Mains', 'Cellar', 'Desserts'];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeForPeriod(period) {
  const now = new Date();
  if (period === 'week') {
    const from = new Date(now);
    from.setDate(now.getDate() - 7);
    return { from, to: now };
  }
  if (period === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  }
  return { from: startOfToday(), to: now };
}

function quantity(item = {}) {
  return Number(item.quantity || item.qty || 1) || 1;
}

function createWaiterAnalyticsService({ config }) {
  const restaurantId = config?.restaurantId || 'trump';
  let courseMapCache = { at: 0, map: null };

  // name(normalized) -> courseType, built from MenuItem joined to MenuCategory.courseType.
  async function getCourseMap() {
    if (courseMapCache.map && Date.now() - courseMapCache.at < 60000) return courseMapCache.map;
    const db = getPrisma();
    const map = new Map();
    try {
      const items = await db.menuItem.findMany({
        where: { restaurantId },
        select: { name: true, category: { select: { courseType: true } } }
      });
      for (const item of items) {
        map.set(normalizeName(item.name), (item.category?.courseType || 'MAIN').toUpperCase());
      }
    } catch {
      // empty map -> everything falls back to MAIN
    }
    courseMapCache = { at: Date.now(), map };
    return map;
  }

  async function fetchWaiterOrders(waiterName, from, to) {
    const db = getPrisma();
    try {
      return await db.order.findMany({
        where: { restaurantId, status: 'history', waiterName, timestamp: { gte: from, lte: to } },
        select: { total: true, tip: true, tableId: true, timestamp: true, items: { select: { name: true, price: true, quantity: true } } }
      });
    } catch {
      return [];
    }
  }

  async function getUpsellStats(waiterName, from, to) {
    const db = getPrisma();
    try {
      const events = await db.upsellEvent.findMany({
        where: { restaurantId, waiterName, createdAt: { gte: from, lte: to } },
        select: { accepted: true, value: true, suggestedItem: true, source: true }
      });
      const offered = events.length;
      const accepted = events.filter(e => e.accepted).length;
      return { offered, accepted, rate: offered ? accepted / offered : 0, events };
    } catch {
      return { offered: 0, accepted: 0, rate: 0, events: [] };
    }
  }

  async function salesByCourse(orders) {
    const courseMap = await getCourseMap();
    const buckets = { Starters: 0, Mains: 0, Cellar: 0, Desserts: 0 };
    let total = 0;
    for (const order of orders) {
      for (const item of order.items || []) {
        const course = courseMap.get(normalizeName(item.name)) || 'MAIN';
        const bucket = COURSE_BUCKETS[course] || 'Mains';
        const value = (Number(item.price) || 0) * quantity(item);
        buckets[bucket] += value;
        total += value;
      }
    }
    return BUCKET_ORDER.map(label => ({
      label,
      value: Number(buckets[label].toFixed(2)),
      pct: total ? Math.round((buckets[label] / total) * 100) : 0
    }));
  }

  // "+X% vs your average": this period's sales vs the waiter's trailing daily average.
  async function vsOwnAverage(waiterName, currentSales) {
    const db = getPrisma();
    try {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const orders = await db.order.findMany({
        where: { restaurantId, status: 'history', waiterName, timestamp: { gte: from, lt: startOfToday() } },
        select: { total: true, timestamp: true }
      });
      if (!orders.length) return null;
      const byDay = new Map();
      for (const o of orders) {
        const day = o.timestamp.toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) || 0) + (Number(o.total) || 0));
      }
      const days = [...byDay.values()];
      const avg = days.reduce((s, v) => s + v, 0) / days.length;
      if (!avg) return null;
      return Math.round(((currentSales - avg) / avg) * 100);
    } catch {
      return null;
    }
  }

  async function getPerformance({ waiterName, period = 'today' }) {
    const { from, to } = rangeForPeriod(period);
    const [orders, upsell] = await Promise.all([
      fetchWaiterOrders(waiterName, from, to),
      getUpsellStats(waiterName, from, to)
    ]);

    const salesDriven = Number(orders.reduce((s, o) => s + (Number(o.total) || 0), 0).toFixed(2));
    const tips = Number(orders.reduce((s, o) => s + (Number(o.tip) || 0), 0).toFixed(2));
    const tablesServed = new Set(orders.map(o => o.tableId)).size;
    const avgCheck = tablesServed ? Number((salesDriven / tablesServed).toFixed(2)) : 0;
    const [courses, vsAverage] = await Promise.all([
      salesByCourse(orders),
      period === 'today' ? vsOwnAverage(waiterName, salesDriven) : Promise.resolve(null)
    ]);

    return {
      waiterName,
      period,
      salesDriven,
      tips,
      tablesServed,
      orderCount: orders.length,
      avgCheck,
      upsellRate: Number(upsell.rate.toFixed(2)),
      upsellOffered: upsell.offered,
      upsellAccepted: upsell.accepted,
      salesByCourse: courses,
      vsAverage
    };
  }

  async function getLeaderboard({ period = 'today' } = {}) {
    const { from, to } = rangeForPeriod(period);
    const db = getPrisma();
    let orders = [];
    try {
      orders = await db.order.findMany({
        where: { restaurantId, status: 'history', timestamp: { gte: from, lte: to }, NOT: { waiterName: '' } },
        select: { waiterName: true, total: true, tip: true, tableId: true }
      });
    } catch {
      orders = [];
    }
    const byWaiter = new Map();
    for (const o of orders) {
      const w = o.waiterName || 'Unknown';
      const cur = byWaiter.get(w) || { salesDriven: 0, tips: 0, tables: new Set() };
      cur.salesDriven += Number(o.total) || 0;
      cur.tips += Number(o.tip) || 0;
      cur.tables.add(o.tableId);
      byWaiter.set(w, cur);
    }
    return [...byWaiter.entries()]
      .map(([waiterName, v]) => ({
        waiterName,
        salesDriven: Number(v.salesDriven.toFixed(2)),
        tips: Number(v.tips.toFixed(2)),
        tablesServed: v.tables.size
      }))
      .sort((a, b) => b.salesDriven - a.salesDriven)
      .map((row, i) => ({ rank: i + 1, ...row }));
  }

  async function getShiftReport({ waiterName, period = 'today' }) {
    const { from, to } = rangeForPeriod(period);
    const [perf, orders, upsell, board] = await Promise.all([
      getPerformance({ waiterName, period }),
      fetchWaiterOrders(waiterName, from, to),
      getUpsellStats(waiterName, from, to),
      getLeaderboard({ period })
    ]);

    const tableSpend = new Map();
    for (const o of orders) tableSpend.set(o.tableId, (tableSpend.get(o.tableId) || 0) + (Number(o.total) || 0));
    const topTableEntry = [...tableSpend.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    const bestUpsell = upsell.events
      .filter(e => e.accepted)
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))[0] || null;
    const rank = board.find(r => r.waiterName === waiterName)?.rank || null;

    // Deterministic coaching hints (the nlg layer phrases them nicely).
    const improvements = [];
    if (perf.upsellRate < 0.5) improvements.push({ key: 'upsell', metric: perf.upsellRate });
    if (perf.avgCheck && perf.avgCheck < 1000) improvements.push({ key: 'avg_check', metric: perf.avgCheck });
    const cellar = perf.salesByCourse.find(c => c.label === 'Cellar');
    if (cellar && cellar.pct < 20) improvements.push({ key: 'cellar', metric: cellar.pct });

    return {
      ...perf,
      rank,
      topTable: topTableEntry ? { tableId: topTableEntry[0], revenue: Number(topTableEntry[1].toFixed(2)) } : null,
      bestUpsell: bestUpsell ? { item: bestUpsell.suggestedItem, value: Number((bestUpsell.value || 0).toFixed(2)) } : null,
      improvements
    };
  }

  async function getAchievements({ waiterName, period = 'today' }) {
    const [perf, board] = await Promise.all([
      getPerformance({ waiterName, period }),
      getLeaderboard({ period })
    ]);
    const rank = board.find(r => r.waiterName === waiterName)?.rank || null;
    const cellar = perf.salesByCourse.find(c => c.label === 'Cellar');
    const desserts = perf.salesByCourse.find(c => c.label === 'Desserts');
    const achievements = [
      { key: 'top_seller', label: 'Top Seller', earned: rank === 1 },
      { key: 'wine_expert', label: 'Wine Expert', earned: Boolean(cellar && cellar.pct >= 25) },
      { key: 'dessert_champion', label: 'Dessert Champion', earned: Boolean(desserts && desserts.pct >= 12) },
      { key: 'upsell_master', label: 'Upsell Master', earned: perf.upsellRate >= 0.6 },
      { key: 'big_spender_tables', label: 'High Roller', earned: perf.avgCheck >= 2500 },
      { key: 'busy_bee', label: 'Floor Marshal', earned: perf.tablesServed >= 12 }
    ];
    return { rank, achievements };
  }

  return { getPerformance, getLeaderboard, getShiftReport, getAchievements };
}

module.exports = { createWaiterAnalyticsService };
