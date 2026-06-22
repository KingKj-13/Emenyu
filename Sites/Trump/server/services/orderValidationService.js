// Server-authoritative order validation.
//
// The server must never trust client-supplied prices, totals, or item identity.
// This service rebuilds an order from the live menu (Postgres-backed, JSON
// fallback): it verifies every line item exists and is available, clamps
// quantities, recomputes line prices + subtotal + VAT + service from authoritative
// data, accepts only a bounded customer tip, and recomputes the grand total.
//
// Structural tampering (unknown / unavailable items, bad quantities, invalid
// table) is REJECTED with HTTP 400. Price/total tampering is NEUTRALIZED by
// overriding with server values and logged as `order_pricing_corrected`; set
// TRUMP_ORDER_REJECT_ON_PRICE_MISMATCH=true to reject those outright instead.

const { normalizeName, getCanonicalTableId } = require('../utils/helpers');
const { flattenMenu } = require('./prismaMenuService');

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function itemQuantity(item) {
  const raw = Number(item && (item.qty !== undefined ? item.qty : item.quantity));
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return Math.floor(raw);
}

function validationError(message, details, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = Array.isArray(details) ? details : [details].filter(Boolean);
  return error;
}

// Build a normalized-name → authoritative menu item lookup.
function buildMenuIndex(menu) {
  const index = new Map();
  for (const { item } of flattenMenu(menu || {})) {
    const key = normalizeName(item.name);
    if (!key || index.has(key)) {
      continue;
    }

    index.set(key, {
      name: item.name,
      price: Number(item.price) || 0,
      available: item.available !== false,
      visible: item.visible !== false
    });
  }
  return index;
}

function createOrderValidationService({ config, fileService, logger = null }) {
  const orderConfig = config.order;

  // Resolve a submitted table identifier to a canonical, in-range table id, or
  // null when it does not name a real table (1..tableCount).
  function resolveTableId(rawTableId) {
    const canonical = getCanonicalTableId(rawTableId);
    const match = /^table(\d+)$/.exec(canonical);
    if (!match) {
      return null;
    }

    const number = Number(match[1]);
    if (!Number.isInteger(number) || number < 1 || number > config.tableCount) {
      return null;
    }

    return canonical;
  }

  // Validate + normalize an order. Returns { order, tableId, meta }.
  // Throws a validation Error (with .statusCode + .details) on rejection.
  async function validateOrder(rawOrder = {}, options = {}) {
    const { requireTotals = true } = options;
    const source = rawOrder && typeof rawOrder === 'object' ? rawOrder : {};
    const rawTableId = options.tableId !== undefined && options.tableId !== null
      ? options.tableId
      : source.table_number;

    const tableId = resolveTableId(rawTableId);
    if (!tableId) {
      throw validationError('Invalid or unknown table.', [
        `table "${rawTableId}" is not a valid table (expected 1-${config.tableCount})`
      ]);
    }

    const rawItems = Array.isArray(source.items) ? source.items : [];
    if (rawItems.length === 0) {
      throw validationError('Empty order.', ['order contains no items']);
    }
    if (rawItems.length > orderConfig.maxLines) {
      throw validationError('Too many distinct items in one order.', [
        `order has ${rawItems.length} lines (max ${orderConfig.maxLines})`
      ]);
    }

    const menu = await fileService.loadMenu();
    const index = buildMenuIndex(menu);
    if (index.size === 0) {
      throw validationError('Menu is unavailable; cannot validate order.', ['menu index is empty'], 503);
    }

    const errors = [];
    const items = [];
    let subtotal = 0;
    let totalQty = 0;
    let priceTampered = false;

    rawItems.forEach((raw, position) => {
      const name = String(raw && raw.name ? raw.name : '').trim();
      const menuItem = index.get(normalizeName(name));

      if (!name || !menuItem) {
        errors.push(`item ${position + 1} (${name || 'unnamed'}) is not on the menu`);
        return;
      }

      if (!menuItem.available || !menuItem.visible) {
        errors.push(`item "${menuItem.name}" is unavailable`);
        return;
      }

      const qty = itemQuantity(raw);
      if (qty < 1 || qty > orderConfig.maxItemQty) {
        errors.push(`item "${menuItem.name}" has invalid quantity (allowed 1-${orderConfig.maxItemQty})`);
        return;
      }

      const clientPrice = Number(raw && raw.price);
      if (Number.isFinite(clientPrice) && round2(clientPrice) !== round2(menuItem.price)) {
        priceTampered = true;
      }

      totalQty += qty;
      const lineTotal = round2(menuItem.price * qty);
      subtotal += lineTotal;

      // Preserve non-pricing fields (notes, modifiers, etc.) but force the
      // authoritative name + price from the menu.
      const rest = raw && typeof raw === 'object' ? { ...raw } : {};
      delete rest.price;
      delete rest.lineTotal;
      items.push({
        ...rest,
        name: menuItem.name,
        price: menuItem.price,
        qty,
        lineTotal
      });
    });

    if (totalQty > orderConfig.maxTotalQty) {
      errors.push(`total quantity ${totalQty} exceeds maximum ${orderConfig.maxTotalQty}`);
    }

    if (errors.length > 0) {
      throw validationError('Order failed validation.', errors);
    }

    subtotal = round2(subtotal);
    const vat = round2(subtotal * orderConfig.vatRate);
    const service = round2(subtotal * orderConfig.serviceRate);

    // Tip is customer-chosen: accept it, but clamp to [0, subtotal * multiple].
    let tip = requireTotals ? Number(source.totals && source.totals.tip) : 0;
    if (!Number.isFinite(tip) || tip < 0) {
      tip = 0;
    }
    const maxTip = round2(subtotal * orderConfig.maxTipMultiple);
    if (tip > maxTip) {
      tip = maxTip;
    }
    tip = round2(tip);

    const total = round2(subtotal + vat + service + tip);

    const claimedTotal = Number(source.totals && source.totals.total);
    const totalMismatch = requireTotals && Number.isFinite(claimedTotal) && round2(claimedTotal) !== total;

    if (priceTampered || totalMismatch) {
      logger?.warn?.('order_pricing_corrected', {
        tableId,
        priceTampered,
        totalMismatch,
        claimedTotal: Number.isFinite(claimedTotal) ? round2(claimedTotal) : null,
        serverTotal: total
      });

      if (orderConfig.rejectOnPriceMismatch) {
        throw validationError('Order pricing does not match the menu.', [
          'submitted prices/totals do not match server-side menu pricing'
        ]);
      }
    }

    const order = {
      ...source,
      table_number: tableId,
      restaurantId: config.restaurantId,
      items
    };

    if (requireTotals) {
      order.totals = { subtotal, vat, service, tip, total };
    }

    return {
      order,
      tableId,
      meta: { subtotal, vat, service, tip, total, totalQty, priceTampered, totalMismatch }
    };
  }

  return { validateOrder, buildMenuIndex, resolveTableId };
}

module.exports = { createOrderValidationService };
