import { useEffect, useRef } from 'react';
import { useCart as useCartContext } from '../context/CartContext';
import { useApp } from '../context/AppContext';
import { useSocketEvent, useSocket } from './useSocket';
import { RESTAURANT_ID } from '../constants/api';
import type { SyncCartEvent, SyncHistoryEvent } from '../types/socket';

function normalizeClientTableId(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

// Stable signature of a cart so we only sync real changes (and never echo a
// just-received update straight back to the server, which would loop).
function cartSig(items: Array<{ name?: string; price?: number; qty?: number; quantity?: number }>): string {
  return (items || []).map(i => `${i.name}:${i.price}:${i.qty ?? i.quantity ?? 1}`).join('|');
}

export function useCart() {
  const cart = useCartContext();
  const { tableId, device } = useApp();
  const socket = useSocket();
  const normalizedTableId = normalizeClientTableId(tableId);
  const lastSyncSig = useRef<string>('');

  useEffect(() => {
    socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId });
    // Re-join on (re)connect so cart sync survives server restarts / network blips.
    const onConnect = () => socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId });
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
      socket.emit('leaveTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId });
    };
  }, [socket, normalizedTableId]);

  // Server is the source of truth: apply whatever the table currently holds so
  // every device (phones, waiter) converges. Removals propagate too.
  useSocketEvent<SyncCartEvent>('syncCart', ({ tableId: tid, cart: items }) => {
    if (normalizeClientTableId(tid) !== normalizedTableId) return;
    lastSyncSig.current = cartSig(items || []);
    cart.replaceCart(items || []);
  });

  useSocketEvent<SyncHistoryEvent>('syncHistory', ({ tableId: tid, history }) => {
    if (normalizeClientTableId(tid) === normalizedTableId) cart.setHistory(history);
  });

  // Push local cart changes to the table room so they appear on all devices.
  // The signature guard skips the echo of an update we just received.
  useEffect(() => {
    const sig = cartSig(cart.items);
    if (sig === lastSyncSig.current) return;
    lastSyncSig.current = sig;
    socket.emit('updateCart', {
      restaurantId: RESTAURANT_ID,
      tableId: normalizedTableId,
      cart: cart.items,
      deviceId: device.deviceId,
    });
  }, [cart.items, socket, normalizedTableId, device.deviceId]);

  function syncCart() {
    socket.emit('updateCart', {
      restaurantId: RESTAURANT_ID,
      tableId: normalizedTableId,
      cart: cart.items,
      deviceId: device.deviceId,
    });
  }

  return { ...cart, syncCart };
}
