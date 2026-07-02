// Connectivity detection. A thin observable around NetInfo so the API client and
// UI can react to going offline/online (offline → disable server-authoritative
// actions, show banner; online → replay/refresh).
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type Listener = (online: boolean) => void;

let currentOnline = true;
const listeners = new Set<Listener>();

function computeOnline(state: NetInfoState): boolean {
  // isInternetReachable can be null while unknown — treat null as online to avoid
  // false "offline" flicker; only an explicit false is offline.
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

NetInfo.addEventListener((state) => {
  const next = computeOnline(state);
  if (next !== currentOnline) {
    currentOnline = next;
    listeners.forEach((l) => l(currentOnline));
  }
});

export function isOnline(): boolean {
  return currentOnline;
}

export async function refreshOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  currentOnline = computeOnline(state);
  return currentOnline;
}

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentOnline);
  return () => listeners.delete(listener);
}
