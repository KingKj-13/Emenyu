# PASSWORD-ROTATION.md — Credentials & Secrets

**Audience:** owner (for staff logins) + operator (for secrets). Trump stores **PBKDF2 password hashes** in PostgreSQL; sessions are HMAC-signed tokens. No plaintext passwords are stored or logged.

---

## Account model
- Roles: **owner > manager > waiter > kitchen** (+ admin console = owner/manager).
- Accounts seed from `.env` **only when missing**; they are **never reset on startup**. So changing a `TRUMP_*_PASS` in `.env` does **not** silently overwrite an existing account.
- The default `admin/123456789` backdoor is **suspended** (Phase 02B1) and must stay suspended.

## Audit (do this regularly + before go-live)
```bash
cd /var/www/mysite/Emenyu/Trump
npm run auth:audit      # lists accounts; flags any weak/default password. TARGET: 0 weak.
```

## Rotate weak/default passwords
```bash
npm run auth:rotate     # rotates flagged weak/default accounts to strong random passwords
npm run auth:audit      # confirm 0 weak
```
Record the new passwords securely (password manager) and hand them to staff privately. **Never** send passwords in chat/email in the clear.

## Owner-driven staff password changes (no shell needed)
Owner/manager console → **Manage staff** → select user → reset password / suspend / re-activate. (Owner manages all; manager manages waiter/kitchen; nobody manages an owner.) See [OWNER-TRAINING.md](OWNER-TRAINING.md).

## Secrets (operator, on the box)
| Secret | Where | Rotate when | How |
|---|---|---|---|
| `TRUMP_SESSION_SECRET` | `Trump/.env` | suspected leak; periodic | set a new random value → reload → **all sessions invalidated** (everyone re-logs in) |
| `DATABASE_URL` password | `Emenyu/.env` + Postgres | DB pw policy / leak | `ALTER USER postgres PASSWORD …` then update `.env` → reload |
| Role passwords (`TRUMP_*_PASS`) | `Trump/.env` (seed only) | onboarding; leak | use `auth:rotate` (DB is the source of truth, not `.env`) |
| FCM key / `google-services.json` | app build + EAS creds | key compromise | regenerate in Firebase; rebuild APK |
| rclone / Spaces keys | `/etc/trump-backup.env` / rclone conf | leak | regenerate in DigitalOcean; update |

```bash
# rotate the session secret (forces re-login everywhere)
sed -i 's/^TRUMP_SESSION_SECRET=.*/TRUMP_SESSION_SECRET='"$(openssl rand -base64 48 | tr -d '\n')"'/' /var/www/mysite/Emenyu/Trump/.env
npm run env:check && npm run pm2:restart
```

## Lost / compromised device
Revoke its session: owner/manager → Profile → **My devices** → Revoke (kills the refresh token; access token dies in ≤15 min). Rotate the staff member's password if the device could be unlocked. → [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md) DR-4.

## Rotation cadence (recommended)
| Cadence | Action |
|---|---|
| Onboarding | rotate all default/seeded passwords; `auth:audit` = 0 weak |
| Quarterly | `auth:audit`; rotate any staff who left; review device list |
| On staff departure | suspend their account immediately; revoke devices |
| On any suspected leak | rotate `TRUMP_SESSION_SECRET` + affected creds; review `auth_login_*` logs |

## Verify after any rotation
- [ ] `npm run auth:audit` → 0 weak.
- [ ] Affected user can log in with the new password (web + app).
- [ ] If session secret rotated: existing sessions are gone (expected); staff re-login works.
- [ ] Log the change ([INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md) if leak-driven).
