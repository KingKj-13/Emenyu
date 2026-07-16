// Bare suffixes -- services/storage.ts prepends the tenant's own
// RESTAURANT_ID to every key before it ever touches localStorage, so
// namespacing is enforced in one place structurally (impossible for a new
// key added here to forget the prefix) rather than by each constant
// happening to be typed correctly.
export const LOCAL_TABLE_KEY = 'active_table';
export const LOCAL_SESSION_KEY = 'session_id';
export const DEFAULT_TABLE = 'table1';

// Fallback defaults — GET /api/config (see AppContext) supplies the real
// restaurant-configured values; these only apply before that resolves.
export const VAT_RATE = 0.15;
export const SERVICE_RATE = 0.05;
