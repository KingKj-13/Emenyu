# Auth SQL Migration

Date: 2026-05-21

## Summary

PostgreSQL auth now uses the existing Prisma `User` model with additive metadata required by the current production auth behavior. The existing `password` column stores the current PBKDF2 password hash, preserving the existing hashing format.

## Applied Migration

Migration file:

- `prisma/migrations/20260521094500_auth_user_metadata/migration.sql`

Added columns:

- `label`
- `suspendedAt`
- `sessionInvalidBefore`
- `createdBy`
- `updatedAt`

Added indexes:

- `User_role_idx`
- `User_suspended_idx`

## Verification

Commands completed successfully:

- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate deploy`
- `npx prisma migrate status`
- `npm run db:check`

Migration status: database schema is up to date.

