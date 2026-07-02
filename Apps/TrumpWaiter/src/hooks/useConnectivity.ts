// Live online/offline + socket-connected state for the UI (banners, disabled
// actions). Combines NetInfo connectivity with the realtime socket status.
import { useEffect, useState } from 'react';
import { subscribeConnectivity } from '../services/connectivity';
import { onSocketStatus } from '../services/socket';

export function useConnectivity(): { online: boolean; socketConnected: boolean } {
  const [online, setOnline] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => subscribeConnectivity(setOnline), []);
  useEffect(() => onSocketStatus(setSocketConnected), []);

  return { online, socketConnected };
}
