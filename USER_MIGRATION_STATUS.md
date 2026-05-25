# User Migration Status

Date: 2026-05-21

## Migrated Accounts

Existing JSON accounts were synced into PostgreSQL:

- `admin` - owner
- `owner` - owner
- `manager` - manager
- `waiter` - waiter

Current PostgreSQL user count: 4.

Role counts:

- owner: 2
- manager: 1
- waiter: 1

## Account Safety

No JSON accounts were removed. `Sites/Trump/data/accounts.json` remains present as the temporary fallback and rollback-compatible mirror.

Latest migration run:

- attempted: 4
- created: 0
- updated: 0
- skipped: 4
- unavailable: false

