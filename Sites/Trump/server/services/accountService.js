const crypto = require('crypto');
const fsPromises = require('fs').promises;
const path = require('path');

const { PrismaAuthService } = require('./prismaAuthService');

const HASH_ITERATIONS = 120000;
const HASH_KEY_LENGTH = 32;
const HASH_DIGEST = 'sha256';
const VALID_ROLES = new Set(['owner', 'manager', 'waiter', 'kitchen']);

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function prepareJsonAccount(account) {
  const clean = clone(account);
  delete clean.source;
  return clean;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.pbkdf2Sync(String(password || ''), salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST);
  return `pbkdf2$${HASH_ITERATIONS}$${salt}$${derived.toString('hex')}`;
}

function verifyPasswordHash(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!iterations || !salt || !expected) {
    return false;
  }

  const actual = crypto.pbkdf2Sync(String(password || ''), salt, iterations, HASH_KEY_LENGTH, HASH_DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function sanitizeAccount(account) {
  if (!account) {
    return null;
  }

  return {
    username: account.username,
    role: account.role,
    label: account.label || account.role,
    status: account.status || 'active',
    createdBy: account.createdBy || 'system',
    createdAt: account.createdAt || null,
    updatedAt: account.updatedAt || null,
    suspendedAt: account.suspendedAt || null
  };
}

class AccountService {
  constructor(config, { logger = null } = {}) {
    this.config = config;
    this.logger = logger;
    this.filePath = config.files.accounts;
    this.accounts = null;
    this.prismaAuth = new PrismaAuthService({ logger });
    this.migrationStatus = null;
  }

  async ensureReady() {
    await fsPromises.mkdir(path.dirname(this.filePath), { recursive: true });
    const accounts = await this.readAccounts();
    const merged = this.mergeDefaultAccounts(accounts);
    this.accounts = merged;
    await this.writeAccounts(merged);

    this.migrationStatus = await this.prismaAuth.migrateAccounts(merged);
    if (this.migrationStatus.unavailable) {
      this.logger?.warn('auth_postgres_migration_skipped', this.migrationStatus);
    } else {
      this.logger?.info('auth_postgres_migration_complete', this.migrationStatus);
    }
  }

  async readAccounts() {
    try {
      const raw = await fsPromises.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.accounts) ? parsed.accounts : [];
    } catch {
      return [];
    }
  }

  async writeAccounts(accounts = this.accounts || []) {
    await fsPromises.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fsPromises.writeFile(tempPath, JSON.stringify({ accounts: accounts.map(prepareJsonAccount) }, null, 2));
    await fsPromises.rename(tempPath, this.filePath);
  }

  mergeDefaultAccounts(existingAccounts = []) {
    const now = new Date().toISOString();
    const byUsername = new Map();

    existingAccounts.forEach(account => {
      const username = normalizeUsername(account.username);
      if (!username || !VALID_ROLES.has(account.role)) {
        return;
      }

      byUsername.set(username, {
        ...account,
        username,
        status: account.status === 'suspended' ? 'suspended' : 'active'
      });
    });

    (this.config.auth.users || []).forEach(defaultUser => {
      const username = normalizeUsername(defaultUser.username);
      if (!username) {
        return;
      }

      const existing = byUsername.get(username);
      const shouldRefreshDemo = defaultUser.demo === true && !defaultUser.passwordFromEnv;
      if (existing) {
        if (shouldRefreshDemo || existing.status === 'suspended') {
          byUsername.set(username, {
            ...existing,
            role: defaultUser.role,
            label: defaultUser.label || existing.label || defaultUser.role,
            status: 'active',
            passwordHash: shouldRefreshDemo ? hashPassword(defaultUser.password) : existing.passwordHash,
            updatedAt: now,
            suspendedAt: null,
            sessionInvalidBefore: null
          });
        }
        return;
      }

      byUsername.set(username, {
        username,
        role: defaultUser.role,
        label: defaultUser.label || defaultUser.role,
        status: 'active',
        passwordHash: hashPassword(defaultUser.password),
        createdBy: 'system',
        createdAt: now,
        updatedAt: now
      });
    });

    return [...byUsername.values()].sort((left, right) => left.username.localeCompare(right.username));
  }

  async getAccounts() {
    if (!this.accounts) {
      await this.ensureReady();
    }

    return this.accounts;
  }

  async getHybridAccounts() {
    const jsonAccounts = await this.getAccounts();
    const byUsername = new Map();

    jsonAccounts.forEach(account => {
      byUsername.set(account.username, account);
    });

    const postgresAccounts = await this.prismaAuth.listUsers();
    postgresAccounts.forEach(account => {
      byUsername.set(account.username, account);
    });

    return [...byUsername.values()].sort((left, right) => left.username.localeCompare(right.username));
  }

  async findAccount(username) {
    const cleanUsername = normalizeUsername(username);
    const postgresAccount = await this.prismaAuth.findUser(cleanUsername);
    if (postgresAccount) {
      return postgresAccount;
    }

    const accounts = await this.getAccounts();
    return accounts.find(account => account.username === cleanUsername) || null;
  }

  async findActiveUser(username, issuedAt = Date.now()) {
    const account = await this.findAccount(username);
    if (!account || account.status === 'suspended') {
      return null;
    }

    if (account.sessionInvalidBefore && issuedAt <= account.sessionInvalidBefore) {
      return null;
    }

    return sanitizeAccount(account);
  }

  async verifyCredentials(username, password) {
    const postgresUser = await this.prismaAuth.findUser(username);
    if (postgresUser) {
      if (postgresUser.status === 'suspended') {
        return null;
      }

      const valid = postgresUser.passwordHash
        ? verifyPasswordHash(password, postgresUser.passwordHash)
        : postgresUser.password === password;

      return valid ? sanitizeAccount(postgresUser) : null;
    }

    const cleanUsername = normalizeUsername(username);
    const accounts = await this.getAccounts();
    const account = accounts.find(candidate => candidate.username === cleanUsername) || null;
    if (!account || account.status === 'suspended') {
      return null;
    }

    const valid = account.passwordHash
      ? verifyPasswordHash(password, account.passwordHash)
      : account.password === password;

    if (valid) {
      await this.prismaAuth.upsertUser(account, { overwrite: false });
    }

    return valid ? sanitizeAccount(account) : null;
  }

  canManageRole(actor, targetRole) {
    if (!actor || !VALID_ROLES.has(targetRole)) {
      return false;
    }

    if (actor.role === 'owner') {
      return targetRole === 'manager' || targetRole === 'waiter' || targetRole === 'kitchen';
    }

    if (actor.role === 'manager') {
      return targetRole === 'waiter' || targetRole === 'kitchen';
    }

    return false;
  }

  async listForActor(actor) {
    const accounts = await this.getHybridAccounts();
    return accounts
      .filter(account => account.role !== 'owner' && this.canManageRole(actor, account.role))
      .map(sanitizeAccount);
  }

  async createAccount(actor, payload = {}) {
    const username = normalizeUsername(payload.username);
    const role = normalizeUsername(payload.role);
    const password = String(payload.password || '');
    const label = String(payload.label || '').trim() || role;

    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      const error = new Error('Username must be 3-32 characters using letters, numbers, dot, dash, or underscore.');
      error.statusCode = 400;
      throw error;
    }

    if (!this.canManageRole(actor, role)) {
      const error = new Error('You do not have permission to create that role.');
      error.statusCode = 403;
      throw error;
    }

    if (password.length < 6) {
      const error = new Error('Password must be at least 6 characters.');
      error.statusCode = 400;
      throw error;
    }

    const existing = await this.findAccount(username);
    if (existing) {
      const error = new Error('Username already exists.');
      error.statusCode = 409;
      throw error;
    }

    const now = new Date().toISOString();
    const account = {
      username,
      role,
      label,
      status: 'active',
      passwordHash: hashPassword(password),
      createdBy: actor.username,
      createdAt: now,
      updatedAt: now
    };

    await this.prismaAuth.createUser(account);

    const accounts = await this.getAccounts();
    accounts.push(account);
    accounts.sort((left, right) => left.username.localeCompare(right.username));
    await this.writeAccounts(accounts);
    return sanitizeAccount(account);
  }

  async updateAccount(actor, username, patch = {}) {
    const cleanUsername = normalizeUsername(username);
    const account = await this.findAccount(cleanUsername);
    if (!account) {
      const error = new Error('Account not found.');
      error.statusCode = 404;
      throw error;
    }

    if (!this.canManageRole(actor, account.role)) {
      const error = new Error('You do not have permission to manage this account.');
      error.statusCode = 403;
      throw error;
    }

    const now = new Date().toISOString();
    if (typeof patch.label === 'string' && patch.label.trim()) {
      account.label = patch.label.trim();
    }

    if (typeof patch.password === 'string' && patch.password.length > 0) {
      if (patch.password.length < 6) {
        const error = new Error('Password must be at least 6 characters.');
        error.statusCode = 400;
        throw error;
      }

      account.passwordHash = hashPassword(patch.password);
      delete account.password;
    }

    if (patch.status === 'active' || patch.status === 'suspended') {
      account.status = patch.status;
      account.suspendedAt = patch.status === 'suspended' ? now : null;
    }

    account.updatedAt = now;
    await this.prismaAuth.upsertUser(account, { overwrite: true });

    const accounts = await this.getAccounts();
    const index = accounts.findIndex(candidate => candidate.username === cleanUsername);
    if (index >= 0) {
      accounts[index] = prepareJsonAccount(account);
    } else {
      accounts.push(prepareJsonAccount(account));
      accounts.sort((left, right) => left.username.localeCompare(right.username));
    }

    await this.writeAccounts(accounts);
    return sanitizeAccount(account);
  }

  async invalidateSessions(username) {
    const account = await this.findAccount(username);
    if (!account) {
      return;
    }

    account.sessionInvalidBefore = Date.now();
    account.updatedAt = new Date().toISOString();
    await this.prismaAuth.updateUser(account.username, {
      sessionInvalidBefore: account.sessionInvalidBefore
    });

    const accounts = await this.getAccounts();
    const index = accounts.findIndex(candidate => candidate.username === account.username);
    if (index >= 0) {
      accounts[index] = prepareJsonAccount(account);
    } else {
      accounts.push(prepareJsonAccount(account));
      accounts.sort((left, right) => left.username.localeCompare(right.username));
    }

    await this.writeAccounts(accounts);
  }

  getMigrationStatus() {
    return {
      jsonAccounts: this.accounts ? this.accounts.length : 0,
      postgres: this.prismaAuth.getStatus(),
      migration: this.migrationStatus
    };
  }

  async close() {
    await this.prismaAuth.close();
  }

  sanitizeUser(user) {
    return sanitizeAccount(user);
  }

  sanitizeAccount(account) {
    return sanitizeAccount(account);
  }
}

module.exports = {
  AccountService,
  normalizeUsername
};
