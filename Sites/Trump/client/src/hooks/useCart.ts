import { useEffect } from 'react';
import { useCart as useCartContext } from '../context/CartContext';
import { useApp } from '../context/AppContext';
import { useSocketEvent, useSocket } from './useSocket';
import type { SyncCartEvent, SyncHistoryEvent } from '../types/socket';

export function useCart() {
  const cart = useCartContext();
  const { tableId, device } = useApp();
  const socket = useSocket();

  useEffect(() => {
    socket.emit('joinTable', { tableId });
    return () => { socket.emit('leaveTable', { tableId }); };
  }, [socket, tableId]);

  useSocketEvent<SyncCartEvent>('syncCart', ({ tableId: tid, cart: items }) => {
    if (tid === tableId) cart.replaceCart(items);
  });

  useSocketEvent<SyncHistoryEvent>('syncHistory', ({ tableId: tid, history }) => {
    if (tid === tableId) cart.setHistory(history);
  });

  function syncCart() {
    socket.emit('updateCart', { tableId, cart: cart.items, deviceId: device.deviceId });
  }

  return { ...cart, syncCart };
}
