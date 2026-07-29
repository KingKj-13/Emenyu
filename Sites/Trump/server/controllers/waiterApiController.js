// Waiter-AI API surface. Thin orchestration: deterministic services make every
// decision; nlgService only phrases the result. Never blocks on the LLM.
const { getPrisma } = require('../services/prismaClient');
const { normalizeId, getCanonicalTableId, normalizeName } = require('../utils/helpers');
const { countAccepted } = require('../services/curatedDemoJourney');
const { MESSAGES, ENJOYED_THRESHOLD } = require('../config/trumpDemoJourney');

function quantity(item = {}) {
  return Number(item.qty || item.quantity || 1) || 1;
}

function createWaiterApiController(deps) {
  const {
    config,
    fileService,
    socketService,
    aiService,
    nlgService,
    guestService,
    opportunityService,
    waiterAnalyticsService,
    serviceRecoveryService,
    floorService,
    waiterWorkflowService,
    rewardService
  } = deps;
  const restaurantId = config?.restaurantId || 'trump';
  const KINDS = nlgService.KINDS;

  // Combined "what's on the table right now": live cart + already-fired order items.
  async function buildTableCart(tableId) {
    const cleanId = normalizeId(tableId);
    const state = await socketService.getTableState(cleanId);
    const cart = Array.isArray(state?.cart) ? state.cart : (await fileService.loadTableCart(cleanId)) || [];
    let activeItems = [];
    try {
      activeItems = (await fileService.getTableActiveOrders(cleanId)) || [];
    } catch {
      activeItems = [];
    }
    return [...cart, ...activeItems];
  }

  function resolveWaiter(req) {
    return String(req.query.waiter || req.body?.waiter || req.user?.username || 'waiter');
  }

  // Lightweight per-table snapshot for the order-builder header (guests/status/waiter).
  async function getTableInfo(tableId) {
    const db = getPrisma();
    try {
      const [tableRow, activeCount, assignment] = await Promise.all([
        db.table.findUnique({ where: { restaurantId_tableId: { restaurantId, tableId } }, select: { metadata: true, covers: true } }),
        db.order.count({ where: { restaurantId, tableId, status: 'active' } }),
        db.waiterAssignment.findFirst({ where: { restaurantId, tableId, status: 'active' }, orderBy: { assignedAt: 'desc' }, select: { waiterName: true } })
      ]);
      const meta = tableRow?.metadata && typeof tableRow.metadata === 'object' ? tableRow.metadata : {};
      return { guests: tableRow?.covers || meta.guests || null, status: activeCount > 0 ? 'cooking' : 'seated', waiter: assignment?.waiterName || null };
    } catch {
      return { guests: null, status: 'seated', waiter: null };
    }
  }

  return {
    async getFloor(req, res) {
      try {
        res.json(await floorService.getFloorState());
      } catch {
        res.json({ tableCount: config.tableCount || 30, counts: { seated: 0, cooking: 0, ready: 0, empty: 0 }, tables: [] });
      }
    },

    // Guest intelligence + opportunity + table pitch, in one bundle for the order builder.
    async getTableIntel(req, res) {
      const tableId = getCanonicalTableId(req.params.tableId);
      try {
        const cart = await buildTableCart(tableId);
        // Phase 1 (Recommendation Brain): guestIntel feeds the opportunity's own
        // recommend() call (favourite boost / allergy exclusion), so it must
        // resolve before getOpportunity runs, not alongside it.
        const guestIntel = await guestService.getGuestIntel({ tableId });
        const [opportunity, tableInfo] = await Promise.all([
          opportunityService.getOpportunity({ cart, guestIntel }),
          getTableInfo(tableId)
        ]);
        const pitch = await nlgService.phrase({
          kind: KINDS.TABLE_PITCH,
          tone: req.query.tone,
          data: { cart, opportunity, guestIntel }
        });
        res.json({ tableId, tableInfo, guestIntel, opportunity, pitch });
      } catch (error) {
        res.json({ tableId, tableInfo: { guests: null, status: 'seated', waiter: null }, guestIntel: { present: false }, opportunity: { hasOpportunity: false }, pitch: '' });
      }
    },

    // AI Table Coach: best recommendation + "say to the table" + why it works, by tone.
    async postCoach(req, res) {
      const { tableId, dishName, tone } = req.body || {};
      try {
        const cart = tableId ? await buildTableCart(tableId) : (req.body?.cart || []);
        const guestIntel = tableId ? await guestService.getGuestIntel({ tableId }) : { present: false };
        const opportunity = await opportunityService.getOpportunity({ cart, guestIntel });
        const suggestion = opportunity.suggestedItem;
        const dish = dishName
          ? { name: dishName }
          : (cart.find(c => /steak|tomahawk|fillet|beef|lamb|main/i.test(`${c.name} ${c.category || ''}`)) || cart[0] || { name: 'the table' });

        const sayToTable = await nlgService.phrase({
          kind: KINDS.COACH_SAY_TO_TABLE,
          tone,
          data: { dish, suggestion, guestIntel, bestAction: opportunity.bestAction }
        });

        const whyItWorks = suggestion
          ? `Guests ordering like this take the ${suggestion.name} about ${Math.round((opportunity.probability || 0) * 100)}% of the time.`
          : 'The table looks well-matched — keep the pace easy and offer dessert when they slow down.';

        res.json({
          tableId: tableId ? getCanonicalTableId(tableId) : null,
          suggestion,
          expectedRevenue: opportunity.increase,
          expectedValue: opportunity.expectedValue,
          replacement: opportunity.replacement || null,
          successRate: Math.round((opportunity.probability || 0) * 100),
          sayToTable,
          whyItWorks,
          alternatives: opportunity.alternatives || []
        });
      } catch {
        res.json({ suggestion: null, sayToTable: '', whyItWorks: '', alternatives: [] });
      }
    },

    // AI Sommelier: wine recommendation for a dish/cart, with an expert explanation.
    async postSommelier(req, res) {
      const { dish, cart, tone } = req.body || {};
      try {
        const seedCart = Array.isArray(cart) && cart.length
          ? cart
          : dish ? [{ name: typeof dish === 'string' ? dish : dish.name }] : [];
        const recs = await aiService.recommend({ cart: seedCart, limit: 6, reason: 'wine' });
        const wines = recs.filter(r => (r.categoryType || '').toUpperCase() === 'WINE');
        const wine = wines[0] || recs[0] || null;
        const explanation = await nlgService.phrase({
          kind: KINDS.SOMMELIER,
          tone,
          data: { wine: wine ? { name: wine.name, price: wine.price } : null, dish }
        });
        res.json({
          wine,
          alternatives: wines.slice(1, 4),
          explanation
        });
      } catch {
        res.json({ wine: null, alternatives: [], explanation: '' });
      }
    },

    // Voice / text Q&A. Wraps the deterministic chat engine; reply is already phrased.
    async postAsk(req, res) {
      try {
        const data = await aiService.chat(req.body || {});
        res.json(data);
      } catch {
        res.json({ reply: 'Let me check with the kitchen and come right back to you.', suggestions: [] });
      }
    },

    // Service recovery: deterministic trigger + suggested actions + what to say.
    async postRecovery(req, res) {
      const { tableId, delayMinutes } = req.body || {};
      try {
        const recovery = await serviceRecoveryService.getRecovery({ tableId, delayMinutes });
        const sayToTable = await nlgService.phrase({
          kind: KINDS.SERVICE_RECOVERY,
          tone: req.body?.tone,
          data: recovery
        });
        res.json({ ...recovery, sayToTable });
      } catch {
        res.json({ triggered: false, severity: 'none', suggestedActions: [], sayToTable: '' });
      }
    },

    // Record an upsell offer/accept so upsell-rate is real.
    async postUpsellEvent(req, res) {
      const { waiterName, tableId, orderId, suggestedItem, accepted, source, value } = req.body || {};
      try {
        const db = getPrisma();
        await db.upsellEvent.create({
          data: {
            restaurantId,
            waiterName: String(waiterName || req.user?.username || ''),
            tableId: tableId ? getCanonicalTableId(tableId) : '',
            orderId: orderId ? Number(orderId) : null,
            suggestedItem: String(suggestedItem || ''),
            accepted: Boolean(accepted),
            source: String(source || 'coach'),
            value: Number(value) || 0
          }
        });
        // An explicit waiter decline durably suppresses that item from
        // re-suggesting at this table (recoMemory.recordDecline) — previously
        // this only ever wrote an analytics row; nothing actually remembered
        // the decline, so the same card could resurface on the next refetch.
        if (accepted === false && tableId && suggestedItem) {
          aiService?.recoMemory?.recordDecline(getCanonicalTableId(tableId), suggestedItem);
        }
        res.json({ ok: true });
      } catch {
        res.status(200).json({ ok: false });
      }
    },

    async listTasks(req, res) {
      try {
        res.json(await waiterWorkflowService.listTasks({
          status: req.query.status || 'open',
          tableId: req.query.tableId || '',
          waiterName: req.query.waiterName || '',
          limit: req.query.limit || 80
        }));
      } catch {
        res.json([]);
      }
    },

    async createTask(req, res) {
      try {
        const task = await waiterWorkflowService.createTask({
          ...req.body,
          requestedBy: req.user?.username || req.body?.requestedBy || 'staff'
        });
        res.status(201).json(task);
      } catch {
        res.status(500).json({ error: 'Failed to create waiter task' });
      }
    },

    async ackTask(req, res) {
      try {
        res.json(await waiterWorkflowService.updateTask(req.params.id, { status: 'acknowledged' }));
      } catch {
        res.status(500).json({ error: 'Failed to acknowledge task' });
      }
    },

    async resolveTask(req, res) {
      try {
        res.json(await waiterWorkflowService.updateTask(req.params.id, { status: 'resolved' }));
      } catch {
        res.status(500).json({ error: 'Failed to resolve task' });
      }
    },

    async getChatCenter(req, res) {
      try {
        res.json(await waiterWorkflowService.chatCenter());
      } catch {
        res.json([]);
      }
    },

    async analyzeChat(req, res) {
      try {
        res.json(await waiterWorkflowService.analyzeMessage(req.body || {}));
      } catch {
        res.json({ events: [], tasks: [] });
      }
    },

    async requestBirthdayApproval(req, res) {
      try {
        res.status(201).json(await waiterWorkflowService.requestBirthdayApproval({
          ...req.body,
          waiterName: req.body?.waiterName || req.user?.label || req.user?.username || 'waiter'
        }));
      } catch {
        res.status(500).json({ error: 'Failed to request birthday approval' });
      }
    },

    async approveBirthday(req, res) {
      try {
        res.json(await waiterWorkflowService.approveBirthday(req.params.id, {
          approved: req.body?.approved !== false,
          managerName: req.user?.label || req.user?.username || 'manager'
        }));
      } catch {
        res.status(500).json({ error: 'Failed to update birthday approval' });
      }
    },

    async getMyPerformance(req, res) {
      const waiterName = resolveWaiter(req);
      const period = req.query.period || 'today';
      try {
        res.json(await waiterAnalyticsService.getPerformance({ waiterName, period }));
      } catch {
        res.json({ waiterName, period, salesDriven: 0, tips: 0, tablesServed: 0, avgCheck: 0, upsellRate: 0, salesByCourse: [], vsAverage: null });
      }
    },

    async getMyShiftReport(req, res) {
      const waiterName = resolveWaiter(req);
      const period = req.query.period || 'today';
      try {
        const report = await waiterAnalyticsService.getShiftReport({ waiterName, period });
        // Phrase the deterministic improvement hints into a short coaching summary.
        const hintText = {
          upsell: 'Offer a pairing on every main — even a single glass lifts the check.',
          avg_check: 'Lead with the premium cuts and the cellar to grow the average check.',
          cellar: 'Talk wine earlier — a recommended bottle transforms the table spend.'
        };
        const coaching = (report.improvements || []).map(i => hintText[i.key]).filter(Boolean);
        res.json({ ...report, coaching });
      } catch {
        res.json({ waiterName, period, salesDriven: 0, coaching: [] });
      }
    },

    async getLeaderboard(req, res) {
      const period = req.query.period || 'today';
      const waiterName = resolveWaiter(req);
      try {
        const [leaderboard, achievements] = await Promise.all([
          waiterAnalyticsService.getLeaderboard({ period }),
          waiterAnalyticsService.getAchievements({ waiterName, period })
        ]);
        res.json({ period, leaderboard, ...achievements });
      } catch {
        res.json({ period, leaderboard: [], rank: null, achievements: [] });
      }
    },

    async listGuests(req, res) {
      res.json(await guestService.listGuests());
    },

    async getGuest(req, res) {
      const guest = await guestService.getGuest(req.params.id);
      if (!guest) return res.status(404).json({ error: 'Guest not found' });
      res.json(guest);
    },

    async createGuest(req, res) {
      try {
        res.status(201).json(await guestService.createGuest(req.body || {}));
      } catch {
        res.status(500).json({ error: 'Failed to create guest' });
      }
    },

    async seatGuest(req, res) {
      const { guestId } = req.body || {};
      try {
        const intel = await guestService.seatGuest(req.params.tableId, guestId);
        res.json({ ok: true, guestIntel: intel });
      } catch {
        res.status(500).json({ error: 'Failed to seat guest' });
      }
    },

    // Light party-size capture at seating. Stored on the table; each order placed
    // for the table inherits it (prismaOrderService), powering per-cover spend.
    async setTableCovers(req, res) {
      const tableId = getCanonicalTableId(req.params.tableId);
      const covers = Math.max(0, Math.min(50, parseInt(req.body?.covers, 10) || 0));
      try {
        const db = getPrisma();
        await db.table.upsert({
          where: { restaurantId_tableId: { restaurantId, tableId } },
          create: { restaurantId, tableId, displayName: tableId.replace(/^table/, 'Table '), covers },
          update: { covers }
        });
        socketService.emitOrderUpdated();
        res.json({ ok: true, tableId, covers });
      } catch {
        res.status(500).json({ error: 'Failed to set covers' });
      }
    },

    // Mark a table's whole visit done: every currently-active order for the
    // table moves to history (the exact same status transition kitchenController
    // already performs per-order when food is marked "served" -- this just
    // applies it to the whole table at once, from the waiter side) and the
    // live cart is cleared. floorService then naturally reports the table as
    // "empty" (no active orders, no cart) with no new status value invented.
    async completeTable(req, res) {
      const tableId = getCanonicalTableId(req.params.tableId);
      const actor = resolveWaiter(req);
      try {
        const db = getPrisma();
        const activeOrders = await db.order.findMany({
          where: { restaurantId, tableId, status: 'active' },
          select: { filename: true }
        });

        // Curated Demo Mode: Order Complete follow-up — a guest who accepted
        // most of the curated journey's stage offers gets a thank-you; one
        // who declined most gets "your next drink is on us" plus a one-time
        // reward QR. Computed from the table's FULL visit (live cart + every
        // active order), purely from which items ended up on the table —
        // countAccepted() is stateless, so this needs no per-device lookup.
        // Deliberately read BEFORE resetTableState()/order-history-move below
        // touch anything.
        try {
          const liveSettings = await fileService.loadSettings();
          const cartItems = liveSettings?.curatedDemoMode ? await buildTableCart(tableId) : [];
          const cartNames = cartItems.map(item => normalizeName(item.name));
          const { journey, accepted } = countAccepted(cartNames);
          if (journey && rewardService) {
            if (accepted >= ENJOYED_THRESHOLD) {
              socketService.emitOrderCompleteFollowUp(tableId, { message: MESSAGES.chat.orderCompleteThankYou });
            } else {
              const reward = await rewardService.issue({ tableId, deviceId: '', reason: 'declined-recommendations' });
              socketService.emitOrderCompleteFollowUp(tableId, {
                message: MESSAGES.chat.orderCompleteMakeGood,
                rewardCode: reward.code,
                rewardExpiresAt: reward.expiresAt,
                rewardInstructions: MESSAGES.chat.rewardRedeemInstructions
              });
            }
          }
        } catch {
          // A missed Order Complete follow-up (thank-you/reward) must never
          // block the actual table-completion flow below.
        }

        for (const order of activeOrders) {
          await fileService.moveOrder('orders', 'history', order.filename, actor).catch(() => {});
        }
        // Bug fix (Priority 6 — Complete Order): this used to call
        // fileService.saveTableCart directly, which persists the cleared cart
        // but never tells anyone. The guest's own still-open tab kept showing
        // their old cart until they manually refreshed, and any admin
        // overrides for the table (e.g. a manager discount) survived into the
        // next guest's sitting. resetTableState clears both AND broadcasts
        // 'syncCart'/'adminOverride' to the table's room, so the guest's live
        // session updates itself with no refresh needed.
        await socketService.resetTableState(tableId, { preserveAdminOverrides: false }).catch(() => {});

        socketService.emitOrderUpdated();
        await socketService.emitTableHistory(tableId).catch(() => {});

        res.json({ ok: true, tableId, completedOrders: activeOrders.length });
      } catch {
        res.status(500).json({ error: 'Failed to complete table' });
      }
    },

    nlgStatus(req, res) {
      res.json(nlgService.status());
    }
  };
}

module.exports = { createWaiterApiController };
