import { useEffect } from 'react';
import { useCart as useCartContext } from '../context/CartContext';
import { useApp } from '../context/AppContext';
import { useSocketEvent, useSocket } from './useSocket';
import { RESTAURANT_ID } from '../constants/api';
import type { SyncCartEvent, SyncHistoryEvent } from '../types/socket';

function normalizeClientTableId(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

export function useCart() {
  const cart = useCartContext();
  const { tableId, device } = useApp();
  const socket = useSocket();
  const normalizedTableId = normalizeClientTableId(tableId);

  useEffect(() => {
    socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId });
    return () => { socket.emit('leaveTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId }); };
  }, [socket, normalizedTableId]);

  useSocketEvent<SyncCartEvent>('syncCart', ({ tableId: tid, cart: items }) => {
    if (normalizeClientTableId(tid) === normalizedTableId) cart.replaceCart(items);
  });

  useSocketEvent<SyncHistoryEvent>('syncHistory', ({ tableId: tid, history }) => {
    if (normalizeClientTableId(tid) === normalizedTableId) cart.setHistory(history);
  });

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
