import { io, Socket } from 'socket.io-client';
import { SOCKET_PATH } from '../constants/api';

let instance: Socket | null = null;

export function getSocket(): Socket {
  if (!instance) {
    instance = io({ path: SOCKET_PATH, transports: ['websocket', 'polling'] });
  }
  return instance;
}

export function disconnectSocket(): void {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}
