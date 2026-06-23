'use strict';

const { getPrisma } = require('./prismaClient');
const { getCanonicalTableId } = require('../utils/helpers');

const EVENT_PATTERNS = [
  { type: 'birthday', label: 'Birthday Detected', priority: 1, test: /\b(birthday|bday|born day)\b/i },
  { type: 'anniversary', label: 'Anniversary Detected', priority: 2, test: /\b(anniversary|years together|wedding anniversary)\b/i },
  { type: 'allergy', label: 'Allergy Alert', priority: 1, test: /\b(allergy|allergic|nuts|shellfish|gluten|dairy)\b/i },
  { type: 'complaint', label: 'Complaint Detected', priority: 1, test: /\b(cold|late|waited|angry|unhappy|complain|refund|wrong order|bad service)\b/i },
  { type: 'refund', label: 'Refund Request', priority: 1, test: /\b(refund|money back|remove this|take it off)\b/i },
  { type: 'vip', label: 'VIP Guest', priority: 2, test: /\b(vip|regular|owner knows|celebrity|important guest)\b/i },
  { type: 'vegetarian', label: 'Vegetarian Guest', priority: 3, test: /\b(vegetarian|no meat)\b/i },
  { type: 'vegan', label: 'Vegan Guest', priority: 3, test: /\b(vegan|plant based|plant-based)\b/i }
];

function createWaiterWorkflowService({ config, socketService = null }) {
  const restaurantId = config?.restaurantId || 'trump';

  function publicTask(task) {
    return {
      id: task.id,
      tableId: task.tableId,
      waiterName: task.waiterName,
      type: task.type,
      title: task.title,
      message: task.message,
      priority: task.priority,
      status: task.status,
      payload: task.payload || {},
      requestedBy: task.requestedBy,
      approvedBy: task.approvedBy,
      dueAt: task.dueAt,
      acknowledgedAt: task.acknowledgedAt,
      resolvedAt: task.resolvedAt,
      createdAt: task.createdAt
    };
  }

  async function createTask(data = {}) {
    const db = getPrisma();
    const tableId = data.tableId ? getCanonicalTableId(data.tableId) : '';
    const task = await db.waiterTask.create({
      data: {
        restaurantId,
        tableId,
        waiterName: String(data.waiterName || ''),
        type: String(data.type || 'manager_request'),
        title: String(data.title || 'Waiter task'),
        message: String(data.message || ''),
        priority: Number(data.priority) || 3,
        status: String(data.status || 'open'),
        payload: data.payload || undefined,
        requestedBy: String(data.requestedBy || 'system'),
        dueAt: data.dueAt || undefined
      }
    });
    socketService?.io?.to(socketService.getWaiterRoom()).emit('waiterTaskCreated', { restaurantId, task: publicTask(task) });
    if (task.type === 'birthday_approval') {
      socketService?.io?.to(socketService.getAdminRoom()).emit('managerApprovalRequested', { restaurantId, task: publicTask(task) });
    }
    return publicTask(task);
  }

  async function listTasks({ status = 'open', tableId = '', waiterName = '', limit = 80 } = {}) {
    const db = getPrisma();
    const where = { restaurantId };
    if (status !== 'all') where.status = status;
    if (tableId) where.tableId = getCanonicalTableId(tableId);
    if (waiterName) where.waiterName = waiterName;
    try {
      const tasks = await db.waiterTask.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: Math.min(Number(limit) || 80, 200)
      });
      return tasks.map(publicTask);
    } catch {
      return [];
    }
  }

  async function updateTask(id, patch = {}) {
    const db = getPrisma();
    const task = await db.waiterTask.update({
      where: { id: Number(id) },
      data: {
        ...patch,
        acknowledgedAt: patch.status === 'acknowledged' ? new Date() : patch.acknowledgedAt,
        resolvedAt: ['resolved', 'approved', 'rejected'].includes(patch.status) ? new Date() : patch.resolvedAt
      }
    });
    const payload = publicTask(task);
    socketService?.io?.to(socketService.getWaiterRoom()).to(socketService.getAdminRoom()).emit('waiterTaskUpdated', { restaurantId, task: payload });
    return payload;
  }

  async function requestBirthdayApproval({ tableId, waiterName, itemName = 'Complimentary dessert', reason = 'Birthday detected' } = {}) {
    return createTask({
      tableId,
      waiterName,
      type: 'birthday_approval',
      title: 'Birthday dessert approval',
      message: `Approve ${itemName} for ${getCanonicalTableId(tableId).replace(/^table/, 'Table ')}.`,
      priority: 1,
      requestedBy: waiterName || 'waiter',
      payload: { itemName, reason }
    });
  }

  async function approveBirthday(id, { approved, managerName = 'manager' } = {}) {
    const status = approved ? 'approved' : 'rejected';
    const task = await updateTask(id, { status, approvedBy: managerName });
    if (approved) {
      await createTask({
        tableId: task.tableId,
        waiterName: task.waiterName,
        type: 'birthday',
        title: 'Birthday dessert approved',
        message: `${task.payload?.itemName || 'Complimentary dessert'} approved. Present it naturally; do not mention the approval process.`,
        priority: 1,
        requestedBy: managerName,
        payload: task.payload
      });
    }
    return task;
  }

  async function analyzeMessage({ tableId, message, waiterName = '' } = {}) {
    const text = String(message || '');
    const events = EVENT_PATTERNS.filter(pattern => pattern.test.test(text));
    const tasks = [];
    for (const event of events) {
      tasks.push(await createTask({
        tableId,
        waiterName,
        type: event.type,
        title: event.label,
        message: text.slice(0, 240),
        priority: event.priority,
        requestedBy: 'chat-analysis',
        payload: { detectedFrom: text }
      }));
    }
    return { events: tasks.map(t => ({ type: t.type, label: t.title, priority: t.priority })), tasks };
  }

  async function chatCenter() {
    const tasks = await listTasks({ status: 'open', limit: 120 });
    const byTable = new Map();
    for (const task of tasks) {
      if (!task.tableId) continue;
      const cur = byTable.get(task.tableId) || {
        tableId: task.tableId,
        lastMessage: task.message || task.title,
        timestamp: task.createdAt,
        events: [],
        priority: task.priority
      };
      cur.priority = Math.min(cur.priority, task.priority);
      cur.events.push({ type: task.type, label: task.title });
      byTable.set(task.tableId, cur);
    }
    return [...byTable.values()].sort((a, b) => a.priority - b.priority || new Date(b.timestamp) - new Date(a.timestamp));
  }

  return {
    createTask,
    listTasks,
    updateTask,
    requestBirthdayApproval,
    approveBirthday,
    analyzeMessage,
    chatCenter
  };
}

module.exports = { createWaiterWorkflowService };
