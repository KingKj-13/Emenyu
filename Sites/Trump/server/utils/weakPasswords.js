// Centralized weak / known-compromised password denylist.
//
// Used by:
//   - production config validation (refuse to *seed* a weak password) — helpers.js
//   - the credential audit script (detect weak passwords on *existing* accounts)
//
// Keep this list focused on the credentials most likely to surface in a
// restaurant deployment: retired demo seeds plus the most common defaults.
// It is deliberately small so hash-scanning existing accounts stays cheap.

const WEAK_PASSWORDS = new Set([
  // Demo / seed values explicitly retired during Phase 0/1 hardening.
  '123456789',
  '12345678',
  '1234567',
  '123456',
  '12345',
  'password',
  'password1',
  'passw0rd',
  'admin',
  'admin123',
  'administrator',
  'changeme',
  'change-me',
  'letmein',
  'qwerty',
  'iloveyou',
  'welcome',
  'secret',
  'trump',
  'restaurant',
  'local-only-change-me'
]);

function toStringValue(value) {
  return String(value === undefined || value === null ? '' : value);
}

// True when the plaintext password is empty or appears in the denylist
// (case-insensitively).
function isWeakPassword(plain) {
  const value = toStringValue(plain).trim();
  if (!value) {
    return true;
  }

  return WEAK_PASSWORDS.has(value) || WEAK_PASSWORDS.has(value.toLowerCase());
}

// Find which denylisted password a stored hash matches, if any.
// `verify` is a function (plain, storedHash) => boolean (e.g. accountService's
// verifyPasswordHash). Returns the matching weak password string, or null.
// Never throws — malformed hashes simply yield null.
function findWeakMatch(storedHash, verify) {
  if (!storedHash || typeof verify !== 'function') {
    return null;
  }

  for (const candidate of WEAK_PASSWORDS) {
    try {
      if (verify(candidate, storedHash)) {
        return candidate;
      }
    } catch {
      // Ignore verify errors (bad hash format) and keep scanning.
    }
  }

  return null;
}

module.exports = {
  WEAK_PASSWORDS,
  isWeakPassword,
  findWeakMatch
};
