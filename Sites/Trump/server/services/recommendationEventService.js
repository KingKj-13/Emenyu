'use strict';
// Recommendation analytics storage (Phase 4, Task 1). Postgres-primary with a
// JSON ring-buffer fallback so the dashboard still works when the DB is down (and
// so the pipeline is demonstrable without a database). Aggregation is delegated to
// the pure recommendationAnalytics module.

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const { sanitizeEvent, aggregate } = require('./recommendationAnalytics');

const JSON_MAX_EVENTS = 5000;   // ring-buffer cap for the degraded-mode JSON store
const QUERY_LIMIT = 20000;      // max rows pulled for in-memory aggregation

function loadPrismaClient() {
  // Resolve the root client first (the Trump dir may carry a stub — see the
  // "prisma local stub" note); fall back to bare resolution.
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', '..', 'node_modules', '@prisma', 'client'),
    '@prisma/client'
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* try next */ }
  }
  return null;
}

class RecommendationEventService {
  constructor({ config, logger = null } = {}) {
    this.config = config;
    this.logger = logger;
    this.restaurantId = config?.restaurantId || 'trump';
    this.jsonPath = path.join(config.directories.data, 'recommendation-events.json');
    this.client = null;
    this.prismaTried = false;
    this.writeChain = Promise.resolve(); // serialize JSON writes to avoid races
  }

  prisma() {
    if (this.prismaTried) return this.client;
    this.prismaTried = true;
    try {
      const mod = loadPrismaClient();
      if (mod?.PrismaClient && process.env.DATABASE_URL) {
        this.client = new mod.PrismaClient();
      }
    } catch (error) {
      this.logger?.warn?.('reco_events_prisma_init_failed', { error: error?.message });
    }
    return this.client;
  }

  // Best-effort: store a batch of events. Never throws (analytics must never break UX).
  async recordBatch(rawEvents = []) {
    const events = (Array.isArray(rawEvents) ? rawEvents : [rawEvents])
      .map(sanitizeEvent)
      .filter(Boolean)
      .slice(0, 100);
    if (events.length === 0) return { stored: 0 };

    const db = this.prisma();
    if (db?.recommendationEvent) {
      try {
        await db.recommendationEvent.createMany({
          data: events.map(ev => ({ ...ev, restaurantId: this.restaurantId }))
        });
        return { stored: events.length, sink: 'postgres' };
      } catch (error) {
        this.logger?.warn?.('reco_events_postgres_write_failed', { error: error?.message });
        // fall through to JSON
      }
    }
    return this.appendJson(events);
  }

  async appendJson(events) {
    this.writeChain = this.writeChain.then(async () => {
      let existing = [];
      try {
        existing = JSON.parse(await fsPromises.readFile(this.jsonPath, 'utf8'));
        if (!Array.isArray(existing)) existing = [];
      } catch { existing = []; }
      const merged = existing.concat(events.map(ev => ({ ...ev, createdAt: ev.createdAt.toISOString() })));
      const trimmed = merged.slice(-JSON_MAX_EVENTS);
      await fsPromises.writeFile(this.jsonPath, JSON.stringify(trimmed), 'utf8');
    }).catch(error => {
      this.logger?.warn?.('reco_events_json_write_failed', { error: error?.message });
    });
    await this.writeChain;
    return { stored: events.length, sink: 'json' };
  }

  // Build a Prisma where-clause from dashboard filters.
  whereFromFilters(filters = {}) {
    const where = { restaurantId: this.restaurantId };
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    if (filters.category) where.recType = String(filters.category).toUpperCase();
    if (filters.source) where.source = String(filters.source);
    if (filters.rotationGroup) where.rotationGroup = String(filters.rotationGroup);
    if (filters.mode) where.mode = String(filters.mode);
    return where;
  }

  async loadEvents(filters = {}) {
    const db = this.prisma();
    if (db?.recommendationEvent) {
      try {
        return await db.recommendationEvent.findMany({
          where: this.whereFromFilters(filters),
          orderBy: { createdAt: 'desc' },
          take: QUERY_LIMIT
        });
      } catch (error) {
        this.logger?.warn?.('reco_events_postgres_read_failed', { error: error?.message });
      }
    }
    try {
      const raw = JSON.parse(await fsPromises.readFile(this.jsonPath, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  // Filters are applied twice (DB where + pure aggregate) which is harmless and
  // keeps the JSON path correct.
  async getAnalytics(filters = {}) {
    const events = await this.loadEvents(filters);
    return aggregate(events, filters);
  }

  async close() {
    if (this.client) {
      try { await this.client.$disconnect(); } catch { /* ignore */ }
    }
  }
}

module.exports = { RecommendationEventService };
