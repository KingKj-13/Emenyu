const { PrismaClient } = require('@prisma/client');

let prisma;
function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

let webpush;
function getWebPush() {
  if (!webpush) {
    try {
      webpush = require('web-push');
    } catch {
      return null;
    }
  }
  return webpush;
}

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'admin@emenyu.com';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, email };
}

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  const wp = getWebPush();
  if (!wp) return false;
  const vapid = getVapidConfig();
  if (!vapid) return false;
  wp.setVapidDetails(`mailto:${vapid.email}`, vapid.publicKey, vapid.privateKey);
  vapidConfigured = true;
  return true;
}

async function sendToRole(restaurantId, roles, payload) {
  if (!ensureVapid()) return;
  const wp = getWebPush();
  const db = getPrisma();
  const subs = await db.pushSubscription.findMany({
    where: { restaurantId, userRole: { in: roles } }
  });
  const message = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(sub =>
      wp.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message
      ).catch(async err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      })
    )
  );
}

module.exports = {
  getVapidPublicKey() {
    return getVapidConfig()?.publicKey || null;
  },

  async saveSubscription(restaurantId, endpoint, p256dh, auth, userRole, username) {
    const db = getPrisma();
    await db.pushSubscription.upsert({
      where: { endpoint },
      create: { restaurantId, endpoint, p256dh, auth, userRole, username },
      update: { restaurantId, userRole, username }
    });
  },

  async deleteSubscription(endpoint) {
    const db = getPrisma();
    await db.pushSubscription.deleteMany({ where: { endpoint } }).catch(() => {});
  },

  async notifyNewOrder(restaurantId, tableId) {
    await sendToRole(restaurantId, ['owner', 'manager', 'waiter'], {
      title: 'New Order',
      body: `New order from ${tableId.replace(/^table/, 'Table ')}`,
      tag: `order-${tableId}`,
      url: '/Trump/Waiter'
    });
  },

  async notifyOrderReady(restaurantId, tableId) {
    await sendToRole(restaurantId, ['owner', 'manager', 'waiter'], {
      title: 'Order Ready',
      body: `Order for ${tableId.replace(/^table/, 'Table ')} is ready to serve`,
      tag: `ready-${tableId}`,
      url: '/Trump/Waiter'
    });
  },

  async notifyCallWaiter(restaurantId, tableId) {
    await sendToRole(restaurantId, ['owner', 'manager', 'waiter'], {
      title: 'Waiter Requested',
      body: `${tableId.replace(/^table/, 'Table ')} is calling for service`,
      tag: `call-${tableId}`,
      url: '/Trump/Waiter'
    });
  }
};
