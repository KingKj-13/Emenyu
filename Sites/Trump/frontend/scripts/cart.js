function normalizeCartItem(item = {}) {
  return {
    name: item.name || '',
    price: Number(item.price) || 0,
    qty: Number(item.qty || item.quantity || 1),
    note: item.note || '',
    img: item.img || '',
    description: item.description || ''
  };
}

export class CartStore {
  constructor() {
    this.items = [];
    this.history = [];
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(listener => listener(snapshot));
  }

  getSnapshot() {
    return {
      items: [...this.items],
      history: [...this.history],
      count: this.getCount(),
      subtotal: this.getSubtotal()
    };
  }

  replaceCart(items) {
    this.items = Array.isArray(items) ? items.map(normalizeCartItem) : [];
    this.notify();
  }

  setHistory(items) {
    this.history = Array.isArray(items) ? items.map(normalizeCartItem) : [];
    this.notify();
  }

  addItem(item) {
    const nextItem = normalizeCartItem(item);
    const existing = this.items.find(entry => entry.name === nextItem.name && entry.price === nextItem.price);

    if (existing) {
      existing.qty += nextItem.qty;
    } else {
      this.items.push(nextItem);
    }

    this.notify();
  }

  updateQty(index, delta) {
    if (!this.items[index]) {
      return;
    }

    this.items[index].qty += delta;
    if (this.items[index].qty < 1) {
      this.items.splice(index, 1);
    }

    this.notify();
  }

  removeAt(index) {
    if (!this.items[index]) {
      return;
    }

    this.items.splice(index, 1);
    this.notify();
  }

  setNote(index, note) {
    if (!this.items[index]) {
      return;
    }

    this.items[index].note = String(note || '').trim();
    this.notify();
  }

  clear() {
    this.items = [];
    this.notify();
  }

  getCount() {
    return this.items.reduce((sum, item) => sum + item.qty, 0);
  }

  getSubtotal() {
    return this.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  getTotals(tipMode, customTipValue) {
    const subtotal = this.getSubtotal();
    const vat = subtotal * 0.15;
    const service = subtotal * 0.05;
    let tipRate = Number(tipMode || 0);

    if (tipMode === 'custom') {
      tipRate = (Number(customTipValue) || 0) / 100;
    }

    const tip = subtotal * tipRate;
    return {
      subtotal,
      vat,
      service,
      tip,
      total: subtotal + vat + service + tip
    };
  }
}
