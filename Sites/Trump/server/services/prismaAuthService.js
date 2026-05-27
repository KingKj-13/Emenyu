const path = require('path');

const dotenv = require('dotenv');

const VALID_ROLES = new Set(['owner', 'manager', 'waiter', 'kitchen']);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PRISMA_RETRY_MS = 30000;

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRole(value) {
  const role = normalizeUsername(value);
  return VALID_ROLES.has(role) ? role : '';
}

function loadDatabaseEnv() {
  dotenv.config({ path: path.join(PROJECT_ROOT, '.env'), quiet: true });
}

function loadPrismaClient() {
  const candidates = [
    path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'client'),
    '@prisma/client'
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next resolution path.
    }
  }

  return null;
}

function toDate(value) {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toNullableDate(value) {
  return toDate(value) || null;
}

function toBigIntOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return BigInt(Math.trunc(numeric));
}

function dateToIso(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function bigIntToNumber(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compactData(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function accountToUserData(account) {
  const username = normalizeUsername(account?.username);
  const role = normalizeRole(account?.role);
  const password = String(account?.passwordHash || account?.password || '');

  if (!username || !role || !password) {
    return null;
  }

  const suspended = account.status === 'suspended' || account.suspended === true;
  const createdAt = toDate(account.createdAt);
  const updatedAt = toDate(account.updatedAt);

  return {
    username,
    password,
    role,
    label: String(account.label || role).trim() || role,
    suspended,
    suspendedAt: suspended ? toNullableDate(account.suspendedAt) : null,
    sessionInvalidBefore: toBigIntOrNull(account.sessionInvalidBefore),
    createdBy: String(account.createdBy || 'system'),
    createdAt,
    updatedAt
  };
}

function userToAccount(user) {
  if (!user) {
    return null;
  }

  return {
    username: user.username,
    role: user.role,
    label: user.label || user.role,
    status: user.suspended ? 'suspended' : 'active',
    passwordHash: user.password,
    createdBy: user.createdBy || 'system',
    createdAt: dateToIso(user.createdAt),
    updatedAt: dateToIso(user.updatedAt),
    suspendedAt: dateToIso(user.suspendedAt),
    sessionInvalidBefore: bigIntToNumber(user.sessionInvalidBefore),
    source: 'postgres'
  };
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error)
  };
}

function shouldUpdateFromJson(sourceData, targetUser) {
  if (!targetUser) {
    return true;
  }

  const sourceUpdatedAt = sourceData.updatedAt ? sourceData.updatedAt.getTime() : 0;
  const targetUpdatedAt = targetUser.updatedAt ? targetUser.updatedAt.getTime() : 0;
  if (sourceUpdatedAt && sourceUpdatedAt > targetUpdatedAt + 1000) {
    return true;
  }

  if (!targetUser.label && sourceData.label) {
    return true;
  }

  if (!targetUser.createdBy && sourceData.createdBy) {
    return true;
  }

  if (targetUser.sessionInvalidBefore === null && sourceData.sessionInvalidBefore !== null) {
    return true;
  }

  return false;
}

class PrismaAuthService {
  constructor({ logger = null } = {}) {
    loadDatabaseEnv();

    this.logger = logger;
    this.enabled = parseBoolean(process.env.TRUMP_AUTH_POSTGRES_ENABLED, true) && Boolean(process.env.DATABASE_URL);
    this.ready = false;
    this.disabledUntil = 0;
    this.lastError = null;
    this.lastMigration = null;
    this.client = null;

    if (this.enabled) {
      const prismaModule = loadPrismaClient();
      if (prismaModule?.PrismaClient) {
        this.client = new prismaModule.PrismaClient();
      } else {
        this.enabled = false;
        this.lastError = 'Prisma client is not available';
      }
    }
  }

  get isConfigured() {
    return this.enabled && Boolean(this.client);
  }

  async ensureReady() {
    if (!this.isConfigured) {
      return false;
    }

    if (this.ready) {
      return true;
    }

    if (this.disabledUntil && Date.now() < this.disabledUntil) {
      return false;
    }

    try {
      await this.client.$connect();
      await this.client.$queryRaw`SELECT 1`;
      this.ready = true;
      this.lastError = null;
      return true;
    } catch (error) {
      this.markUnavailable('auth_postgres_unavailable', error);
      return false;
    }
  }

  markUnavailable(event, error) {
    this.ready = false;
    this.disabledUntil = Date.now() + PRISMA_RETRY_MS;
    this.lastError = error?.message || String(error);
    this.logger?.warn(event, { error: serializeError(error) });
  }

  async withPrisma(event, operation, fallback = null) {
    if (!(await this.ensureReady())) {
      return fallback;
    }

    try {
      return await operation(this.client);
    } catch (error) {
      this.markUnavailable(event, error);
      return fallback;
    }
  }

  async findUser(username) {
    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername) {
      return null;
    }

    return this.withPrisma(
      'auth_postgres_find_failed',
      async prisma => userToAccount(await prisma.user.findUnique({ where: { username: cleanUsername } })),
      null
    );
  }

  async listUsers() {
    return this.withPrisma(
      'auth_postgres_list_failed',
      async prisma => {
        const users = await prisma.user.findMany({ orderBy: { username: 'asc' } });
        return users.map(userToAccount);
      },
      []
    );
  }

  async createUser(account) {
    const data = accountToUserData(account);
    if (!data) {
      return null;
    }

    return this.withPrisma(
      'auth_postgres_create_failed',
      async prisma => userToAccount(await prisma.user.create({ data: compactData(data) })),
      null
    );
  }

  async upsertUser(account, { overwrite = true } = {}) {
    const data = accountToUserData(account);
    if (!data) {
      return null;
    }

    return this.withPrisma(
      'auth_postgres_upsert_failed',
      async prisma => {
        const existing = await prisma.user.findUnique({ where: { username: data.username } });
        if (existing && !overwrite && !shouldUpdateFromJson(data, existing)) {
          return userToAccount(existing);
        }

        const create = compactData(data);
        const update = compactData({
          password: data.password,
          role: data.role,
          label: data.label,
          suspended: data.suspended,
          suspendedAt: data.suspendedAt,
          sessionInvalidBefore: data.sessionInvalidBefore,
          createdBy: data.createdBy,
          updatedAt: data.updatedAt
        });

        const user = await prisma.user.upsert({
          where: { username: data.username },
          create,
          update
        });
        return userToAccount(user);
      },
      null
    );
  }

  async updateUser(username, patch = {}) {
    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername) {
      return null;
    }

    return this.withPrisma(
      'auth_postgres_update_failed',
      async prisma => {
        const data = {};
        if (typeof patch.label === 'string' && patch.label.trim()) {
          data.label = patch.label.trim();
        }

        if (typeof patch.passwordHash === 'string' && patch.passwordHash) {
          data.password = patch.passwordHash;
        }

        if (patch.status === 'active' || patch.status === 'suspended') {
          data.suspended = patch.status === 'suspended';
          data.suspendedAt = data.suspended ? toNullableDate(patch.suspendedAt) || new Date() : null;
        }

        if (patch.sessionInvalidBefore !== undefined) {
          data.sessionInvalidBefore = toBigIntOrNull(patch.sessionInvalidBefore);
        }

        if (Object.keys(data).length === 0) {
          return this.findUser(cleanUsername);
        }

        const user = await prisma.user.update({
          where: { username: cleanUsername },
          data
        });
        return userToAccount(user);
      },
      null
    );
  }

  async suspendUser(username, suspended = true) {
    return this.updateUser(username, {
      status: suspended ? 'suspended' : 'active',
      suspendedAt: suspended ? new Date().toISOString() : null
    });
  }

  async getRole(username) {
    const user = await this.findUser(username);
    return user?.role || null;
  }

  async validateLogin(username, password, verifyPasswordHash) {
    const user = await this.findUser(username);
    if (!user || user.status === 'suspended') {
      return null;
    }

    const valid = user.passwordHash
      ? verifyPasswordHash(password, user.passwordHash)
      : user.password === password;

    return valid ? user : null;
  }

  async migrateAccounts(accounts = []) {
    const summary = {
      attempted: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      invalid: 0,
      unavailable: false
    };

    if (!(await this.ensureReady())) {
      summary.unavailable = true;
      this.lastMigration = summary;
      return summary;
    }

    const result = await this.withPrisma(
      'auth_postgres_migration_failed',
      async prisma => {
        for (const account of accounts) {
          const data = accountToUserData(account);
          if (!data) {
            summary.invalid += 1;
            continue;
          }

          summary.attempted += 1;
          const existing = await prisma.user.findUnique({ where: { username: data.username } });
          if (!existing) {
            await prisma.user.create({ data: compactData(data) });
            summary.created += 1;
            continue;
          }

          if (shouldUpdateFromJson(data, existing)) {
            await prisma.user.update({
              where: { username: data.username },
              data: compactData({
                password: data.password,
                role: data.role,
                label: data.label,
                suspended: data.suspended,
                suspendedAt: data.suspendedAt,
                sessionInvalidBefore: data.sessionInvalidBefore,
                createdBy: data.createdBy,
                updatedAt: data.updatedAt
              })
            });
            summary.updated += 1;
            continue;
          }

          summary.skipped += 1;
        }

        return summary;
      },
      { ...summary, unavailable: true }
    );

    this.lastMigration = result;
    return result;
  }

  getStatus() {
    return {
      configured: this.isConfigured,
      ready: this.ready,
      fallbackEnabled: true,
      lastError: this.lastError,
      lastMigration: this.lastMigration
    };
  }

  async close() {
    if (this.client) {
      await this.client.$disconnect();
    }
  }
}

module.exports = {
  PrismaAuthService,
  normalizeUsername
};
