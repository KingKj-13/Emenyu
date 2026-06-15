export const SESSION_COOKIE = 'trump_session';
export const LOCAL_TABLE_KEY = 'trump_active_table';
export const LOCAL_DEVICE_KEY = 'trump_device_identity';
export const LOCAL_FAVORITES_KEY = 'trump_favorites';
export const LOCAL_RECENTLY_VIEWED_KEY = 'trump_recently_viewed';
export const DEFAULT_TABLE = 'table1';

// In-app AI waiter name. Drives the recommendation header ("DONALD RECOMMENDS")
// and any other assistant-branded copy. Configurable via VITE_ASSISTANT_NAME.
export const ASSISTANT_NAME = (import.meta.env.VITE_ASSISTANT_NAME || 'Donald').trim();

export const VAT_RATE = 0.15;
export const SERVICE_RATE = 0.05;
export const RECENTLY_VIEWED_LIMIT = 20;
