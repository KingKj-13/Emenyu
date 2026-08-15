import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';
import type { Socket } from 'socket.io-client';

export function useSocket(): Socket {
  return getSocket();
}

export function useSocketEvent<T>(event: string, handler: (data: T) => void): void {
  const socket = getSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const cb = (data: T) => handlerRef.current(data);
    socket.on(event, cb);
    return () => { socket.off(event, cb); };
  }, [socket, event]);
}
