'use strict';
// AI Shared Event System — the single place that turns something the
// deterministic AI/chat layer notices (birthday mention, a VIP guest seated,
// a big party ordering) into one structured, persisted event that admin,
// waiter, and analytics all read from. Before this service existed, chat-text
// detection (see EVENT_PATTERNS below) created an isolated WaiterTask and
// nothing else ever knew about it — this keeps that WaiterTask (the existing
// waiter inbox UI still needs it) but makes the AiEvent row the canonical
// record, with a confidence, a recommended action, and suggested wording for
// both the waiter and the manager, all defined ONCE per event type in
// EVENT_TAXONOMY below rather than re-derived per surface.
//
// This is a deterministic, rule-based system (regex + guest/order data), not
// an LLM — "confidence" reflects how certain a fixed rule is, not a model
// score. See CLAUDE.md: Trump's aiService makes no external LLM calls.

const { getPrisma } = require('./prismaClient');
const { getCanonicalTableId } = require('../utils/helpers');

// One row per supported event type: display label/icon (for admin+waiter UIs
// to share), default priority, and template strings. `%s` in message
// templates is replaced with a context value (guest name, item name, etc.)
// where noted per-call — kept simple since this isn't NLG-generated text.
const EVENT_TAXONOMY = {
  birthday: { label: 'Birthday', icon: '🎂', priority: 1,
    suggestedWaiterMessage: 'Wish the table a happy birthday and mention a complimentary dessert is on its way.',
    suggestedManagerAction: 'Approve a complimentary dessert with a candle.' },
  anniversary: { label: 'Anniversary', icon: '💐', priority: 2,
    suggestedWaiterMessage: 'Congratulate the table on their anniversary.',
    suggestedManagerAction: 'Consider a complimentary glass of bubbly.' },
  vip: { label: 'VIP Guest', icon: '⭐', priority: 2,
    suggestedWaiterMessage: 'Greet by name and offer their usual table/order if known.',
    suggestedManagerAction: 'Check in personally during the visit.' },
  returning_guest: { label: 'Returning Guest', icon: '🔁', priority: 3,
    suggestedWaiterMessage: 'Welcome them back — mention you remember their last visit.',
    suggestedManagerAction: '' },
  high_value: { label: 'High-Value Customer', icon: '💎', priority: 2,
    suggestedWaiterMessage: 'This guest has a high lifetime spend — prioritize attentive service.',
    suggestedManagerAction: 'Consider a personal visit to the table.' },
  wine_recommendation: { label: 'Wine Recommendation', icon: '🍷', priority: 3,
    suggestedWaiterMessage: 'Offer the suggested wine pairing.',
    suggestedManagerAction: '' },
  upsell_opportunity: { label: 'Upsell Opportunity', icon: '📈', priority: 3,
    suggestedWaiterMessage: 'A relevant add-on/upgrade suits this order — offer it naturally.',
    suggestedManagerAction: '' },
  dietary_restriction: { label: 'Dietary Restriction', icon: '🥗', priority: 2,
    suggestedWaiterMessage: 'Confirm the dietary requirement with the kitchen before the order goes in.',
    suggestedManagerAction: '' },
  allergy: { label: 'Allergy Alert', icon: '⚠️', priority: 1,
    suggestedWaiterMessage: 'Flag the allergy to the kitchen explicitly before the order is prepared.',
    suggestedManagerAction: 'Confirm the kitchen has acknowledged the allergy.' },
  business_meeting: { label: 'Business Meeting', icon: '💼', priority: 3,
    suggestedWaiterMessage: 'Keep service efficient and unobtrusive; avoid interrupting conversation.',
    suggestedManagerAction: '' },
  date_night: { label: 'Date Night', icon: '🌹', priority: 3,
    suggestedWaiterMessage: 'Give the table a bit more privacy and a relaxed pace.',
    suggestedManagerAction: '' },
  proposal: { label: 'Proposal', icon: '💍', priority: 1,
    suggestedWaiterMessage: 'Discreetly check if any special arrangement is needed and alert the manager.',
    suggestedManagerAction: 'Offer a complimentary celebratory drink or dessert.' },
  promotion_celebration: { label: 'Promotion Celebration', icon: '🎉', priority: 2,
    suggestedWaiterMessage: 'Congratulate the table on the celebration.',
    suggestedManagerAction: 'Consider a small complimentary gesture.' },
  family_dinner: { label: 'Family Dinner', icon: '👨‍👩‍👧', priority: 3,
    suggestedWaiterMessage: 'Check if the kids need anything adjusted (spice, portion, cutlery).',
    suggestedManagerAction: '' },
  large_group: { label: 'Large Group', icon: '👥', priority: 2,
    suggestedWaiterMessage: 'Confirm timing expectations with the table early and coordinate courses with the kitchen.',
    suggestedManagerAction: 'Consider assigning a second waiter to support the table.' },
  milestone: { label: 'Customer Milestone', icon: '🏆', priority: 2,
    suggestedWaiterMessage: 'Mention you noticed this is a milestone visit — thank them for their loyalty.',
    suggestedManagerAction: 'Consider a small loyalty gesture.' }
};

// Chat-text detection — deterministic regex over guest/waiter messages.
// `type` must be a key in EVENT_TAXONOMY above.
const EVENT_PATTERNS = [
  { type: 'birthday', test: /\b(birthday|bday|born day)\b/i, confidence: 0.9 },
  { type: 'anniversary', test: /\b(anniversary|years together|wedding anniversary)\b/i, confidence: 0.9 },
  { type: 'allergy', test: /\b(allergy|allergic|nuts|shellfish|gluten|dairy)\b/i, confidence: 0.85 },
  { type: 'dietary_restriction', test: /\b(vegetarian|vegan|no meat|plant.?based|halal|kosher)\b/i, confidence: 0.85 },
  { type: 'vip', test: /\b(vip|regular|owner knows|celebrity|important guest)\b/i, confidence: 0.7 },
  { type: 'business_meeting', test: /\b(business meeting|client dinner|work dinner|meeting with)\b/i, confidence: 0.75 },
  { type: 'date_night', test: /\b(date night|just the two of us|romantic dinner)\b/i, confidence: 0.7 },
  { type: 'proposal', test: /\b(propos(e|al|ing)|popping the question|getting engaged)\b/i, confidence: 0.75 },
  { type: 'promotion_celebration', test: /\b(promotion|new job|got promoted|celebrating my)\b/i, confidence: 0.7 },
  { type: 'family_dinner', test: /\b(family dinner|whole family|kids are (here|with us))\b/i, confidence: 0.7 }
];

// Complaint/refund stay in waiterWorkflowService's own operational-task
// vocabulary (not part of the AI event taxonomy above — they're service
// recovery issues, not guest-context signals) and are left untouched there.

function createAiEventService({ config, socketService = null, notificationService = null, waiterWorkflowService = null, logger = null }) {
  const restaurantId = config?.restaurantId || 'trump';

  function taxonomyFor(eventType) {
    return EVENT_TAXONOMY[eventType] || { label: eventType, icon: '🔔', priority: 3, suggestedWaiterMessage: '', suggestedManagerAction: '' };
  }

  function publicEvent(row) {
    return {
      id: row.id,
      eventType: row.eventType,
      label: taxonomyFor(row.eventType).label,
      icon: taxonomyFor(row.eventType).icon,
      guestId: row.guestId,
      tableId: row.tableId,
      waiterName: row.waiterName,
      priority: row.priority,
      confidence: row.confidence,
      recommendedAction: row.recommendedAction,
      suggestedWaiterMessage: row.suggestedWaiterMessage,
      suggestedManagerAction: row.suggestedManagerAction,
      status: row.status,
      source: row.source,
      payload: row.payload || {},
      waiterTaskId: row.waiterTaskId,
      createdAt: row.createdAt,
      acknowledgedAt: row.acknowledgedAt,
      resolvedAt: row.resolvedAt
    };
  }

  // The one place an AiEvent gets created. Everything else in this file
  // (chat detection, guest-seated evaluation, order-placed evaluation) is a
  // caller of this function, never a second writer.
  async function createEvent({
    eventType, guestId = null, tableId = '', waiterName = '', priority, confidence,
    recommendedAction = '', suggestedWaiterMessage, suggestedManagerAction,
    status = 'open', source = 'system', payload = null, linkWaiterTask = true
  } = {}) {
    const db = getPrisma();
    const tax = taxonomyFor(eventType);
    const cleanTableId = tableId ? getCanonicalTableId(tableId) : '';

    const row = await db.aiEvent.create({
      data: {
        restaurantId,
        eventType: String(eventType),
        guestId: guestId ? Number(guestId) : null,
        tableId: cleanTableId,
        waiterName: String(waiterName || ''),
        priority: Number.isFinite(priority) ? priority : tax.priority,
        confidence: Number.isFinite(confidence) ? confidence : 1,
        recommendedAction: recommendedAction || tax.suggestedManagerAction || '',
        suggestedWaiterMessage: suggestedWaiterMessage || tax.suggestedWaiterMessage || '',
        suggestedManagerAction: suggestedManagerAction || tax.suggestedManagerAction || '',
        status,
        source,
        payload: payload || undefined
      }
    });

    let waiterTaskId = null;
    if (linkWaiterTask && waiterWorkflowService && cleanTableId) {
      try {
        const task = await waiterWorkflowService.createTask({
          tableId: cleanTableId,
          waiterName,
          type: eventType,
          title: `${tax.icon} ${tax.label}`,
          message: row.suggestedWaiterMessage,
          priority: row.priority,
          requestedBy: source,
          payload: { aiEventId: row.id, ...(payload || {}) }
        });
        waiterTaskId = task.id;
        await db.aiEvent.update({ where: { id: row.id }, data: { waiterTaskId } });
      } catch (err) {
        logger?.warn('ai_event_task_link_failed', { error: err?.message, eventId: row.id });
      }
    }

    const published = publicEvent({ ...row, waiterTaskId });

    socketService?.emitAiEvent(published);
    notificationService?.notify({
      source: 'ai_event',
      title: `${tax.icon} ${tax.label}${cleanTableId ? ` — ${cleanTableId.replace(/^table/i, 'Table ')}` : ''}`,
      body: published.suggestedWaiterMessage || tax.label,
      priority: published.priority,
      recipientRole: 'waiter',
      tableId: cleanTableId
    });

    return published;
  }

  async function listEvents({ status = 'open', tableId = '', eventType = '', limit = 100 } = {}) {
    const db = getPrisma();
    const where = { restaurantId };
    if (status !== 'all') where.status = status;
    if (tableId) where.tableId = getCanonicalTableId(tableId);
    if (eventType) where.eventType = eventType;
    try {
      const rows = await db.aiEvent.findMany({
        where, orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: Math.min(Number(limit) || 100, 300)
      });
      return rows.map(publicEvent);
    } catch {
      return [];
    }
  }

  async function resolveEvent(id, { status = 'resolved', actor = 'system' } = {}) {
    const db = getPrisma();
    const row = await db.aiEvent.update({
      where: { id: Number(id) },
      data: {
        status,
        acknowledgedAt: status === 'acknowledged' ? new Date() : undefined,
        resolvedAt: ['resolved', 'dismissed'].includes(status) ? new Date() : undefined
      }
    });
    const published = publicEvent(row);
    socketService?.emitAiEventUpdated(published);
    return published;
  }

  // Chat-text detection — replaces waiterWorkflowService's old EVENT_PATTERNS/
  // analyzeMessage (moved here: this IS the AI event detector; waiterWorkflowService
  // stays a generic task inbox). One AiEvent (+ linked WaiterTask) per matched pattern.
  async function analyzeMessage({ tableId, message, waiterName = '' } = {}) {
    const text = String(message || '');
    const matches = EVENT_PATTERNS.filter(p => p.test.test(text));
    const events = [];
    for (const m of matches) {
      events.push(await createEvent({
        eventType: m.type, tableId, waiterName, confidence: m.confidence,
        source: 'chat', payload: { detectedFrom: text.slice(0, 240) }
      }));
    }
    return { events };
  }

  // Guest-seated detection — fired when a waiter links a real Guest record to
  // a table (guestService.seatGuest). This is the trigger that was previously
  // missing entirely: without it, VIP/returning/high-value/dietary/allergy
  // signals that already exist as structured Guest data never became events.
  const HIGH_VALUE_LIFETIME_SPEND = 10000;
  const MILESTONE_VISITS = [5, 10, 20, 50, 100];

  async function evaluateGuestSeated(guest, tableId) {
    if (!guest) return [];
    const events = [];
    const push = async opts => events.push(await createEvent({ ...opts, tableId, guestId: guest.id, source: 'guest_seated', linkWaiterTask: true }));

    if (guest.vip) await push({ eventType: 'vip', confidence: 1 });
    if ((guest.visitCount || 0) > 1) await push({ eventType: 'returning_guest', confidence: 1 });
    if ((guest.lifetimeSpend || 0) >= HIGH_VALUE_LIFETIME_SPEND) await push({ eventType: 'high_value', confidence: 1 });
    if (guest.dietary) await push({ eventType: 'dietary_restriction', confidence: 1, payload: { dietary: guest.dietary } });
    if (guest.allergies) await push({ eventType: 'allergy', confidence: 1, payload: { allergies: guest.allergies } });
    if (MILESTONE_VISITS.includes(guest.visitCount)) {
      await push({ eventType: 'milestone', confidence: 1, payload: { visitCount: guest.visitCount } });
    }
    return events;
  }

  // Order-placed detection — signal derived from the order itself (party
  // size, and any AI-suggestion-accepted wine/upsell items — see the
  // '[AI suggestion accepted]' note convention already used by the demo
  // seed scripts / opportunity engine).
  const LARGE_GROUP_COVERS = 6;

  async function evaluateOrderPlaced(order, tableId) {
    const events = [];
    const covers = Number(order?.covers) || 0;
    if (covers >= LARGE_GROUP_COVERS) {
      events.push(await createEvent({
        eventType: 'large_group', tableId, waiterName: order?.waiterName, confidence: 1,
        source: 'order_placed', payload: { covers }, linkWaiterTask: true
      }));
    }
    const items = Array.isArray(order?.items) ? order.items : [];
    for (const item of items) {
      if (!String(item.note || '').includes('[AI suggestion accepted]')) continue;
      const isWine = /wine|sauvignon|cabernet|merlot|shiraz|pinotage|ros[eé]|brut|chardonnay/i.test(item.name || '');
      events.push(await createEvent({
        eventType: isWine ? 'wine_recommendation' : 'upsell_opportunity', tableId, waiterName: order?.waiterName,
        confidence: 1, source: 'order_placed', payload: { itemName: item.name }, linkWaiterTask: false
      }));
    }
    return events;
  }

  return {
    EVENT_TAXONOMY,
    createEvent,
    listEvents,
    resolveEvent,
    analyzeMessage,
    evaluateGuestSeated,
    evaluateOrderPlaced
  };
}

module.exports = { createAiEventService, EVENT_TAXONOMY };
