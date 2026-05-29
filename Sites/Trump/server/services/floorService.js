// Floor dashboard state — deterministic. Builds a snapshot of every table from
// bulk Postgres queries (active orders + carts + waiter assignments + table metadata).
// "calling" (service bell) is transient and overlaid client-side from socket events.
const { getPrisma } = require('./prismaClient');

function quantity(item = {}) {
  return Number(item.qty || item.quantity || 1) || 1;
}
function cartTotal(cart = []) {
  return cart.reduce((sum, item) => sum + (Number(item.price) || 0) * quantity(item), 0);
}

function createFloorService({ config }) {
  const restaurantId = config?.restaurantId || 'trump';
  const tableCount = config?.tableCount || 30;

  async function getFloorState() {
    const db = getPrisma();
    let activeOrders = [];
    let carts = [];
    let assignments = [];
    let tables = [];
    let guests = [];

    try {
      [activeOrders, carts, assignments, tables, guests] = await Promise.all([
        db.order.findMany({
          where: { restaurantId, status: 'active' },
          select: { tableId: true, kitchenStatus: true, total: true }
        }),
        db.activeCartState.findMany({ where: { restaurantId }, select: { tableId: true, cart: true } }),
        db.waiterAssignment.findMany({
          where: { restaurantId, status: 'active' },
          select: { tableId: true, waiterName: true },
          orderBy: { assignedAt: 'desc' }
        }),
        db.table.findMany({ where: { restaurantId }, select: { tableId: true, metadata: true } }),
        db.guest.findMany({ where: { restaurantId }, select: { id: true, vip: true, name: true } })
      ]);
    } catch {
      // DB unavailable — return an all-empty floor so the UI still renders.
    }

    const guestById = new Map(guests.map(g => [g.id, g]));
    const ordersByTable = new Map();
    for (const o of activeOrders) {
      const cur = ordersByTable.get(o.tableId) || { count: 0, total: 0, kitchen: new Set() };
      cur.count += 1;
      cur.total += Number(o.total) || 0;
      cur.kitchen.add(o.kitchenStatus || 'new');
      ordersByTable.set(o.tableId, cur);
    }
    const cartByTable = new Map(carts.map(c => [c.tableId, Array.isArray(c.cart) ? c.cart : []]));
    const waiterByTable = new Map();
    for (const a of assignments) if (!waiterByTable.has(a.tableId)) waiterByTable.set(a.tableId, a.waiterName);
    const metaByTable = new Map(tables.map(t => [t.tableId, t.metadata && typeof t.metadata === 'object' ? t.metadata : {}]));

    const counts = { seated: 0, cooking: 0, ready: 0, empty: 0 };
    const list = [];

    for (let n = 1; n <= tableCount; n++) {
      const tableId = `table${n}`;
      const orders = ordersByTable.get(tableId);
      const cart = cartByTable.get(tableId) || [];
      const meta = metaByTable.get(tableId) || {};
      const spend = Number(((orders?.total || 0) + cartTotal(cart)).toFixed(2));
      const guest = meta.guestId ? guestById.get(Number(meta.guestId)) : null;

      let status = 'empty';
      if (orders && orders.kitchen.has('ready')) status = 'ready';
      else if (orders && orders.count > 0) status = 'cooking';
      else if (cart.length > 0) status = 'seated';

      if (status === 'ready') counts.ready += 1;
      else if (status === 'cooking') counts.cooking += 1;
      else if (status === 'seated') counts.seated += 1;
      else counts.empty += 1;

      list.push({
        number: n,
        tableId,
        displayName: `Table ${n}`,
        status,
        spend,
        orderCount: orders?.count || 0,
        guests: meta.guests || null,
        waiter: waiterByTable.get(tableId) || null,
        vip: Boolean(guest?.vip),
        guestName: guest?.name || null
      });
    }

    return { tableCount, counts, tables: list };
  }

  return { getFloorState };
}

module.exports = { createFloorService };
