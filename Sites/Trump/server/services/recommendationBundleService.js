'use strict';
// Database-backed recommended-order bundles (Phase 5, Task 1). Postgres-primary with a
// JSON fallback (data/recommendation-bundles.json) so the guest "Not sure what to order?"
// strip keeps working when the DB is down. Writes (admin management) require Postgres.
//
// The pure mapping/validation helpers (toPersonaOrder / sanitizeBundleInput) are exported
// for offline unit-testing.

const fsPromises = require('fs').promises;
const path = require('path');

const COURSES = ['Drink', 'Starter', 'Main', 'Dessert', 'Side', 'Extra'];

function loadPrismaClient() {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', '..', 'node_modules', '@prisma', 'client'),
    '@prisma/client'
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* try next */ }
  }
  return null;
}

function slugify(value, fallback) {
  const slug = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return slug || fallback;
}

// Bundle row (DB or JSON) → the PersonaOrder shape the client already renders.
function toPersonaOrder(bundle = {}) {
  const items = [...(bundle.items || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return {
    id: bundle.slug || `bundle-${bundle.id}`,
    persona: bundle.persona || '',
    icon: bundle.icon || '',
    blurb: bundle.description || '',
    accent: bundle.accent || '',
    courses: items.map(it => ({ course: it.course || '', name: it.itemName, price: Number(it.price) || 0 })),
    daypart: bundle.daypart || ''
  };
}

// Validate + coerce an admin payload. `partial` allows PATCH updates.
function sanitizeBundleInput(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.persona !== undefined) {
    const persona = String(body.persona || '').trim();
    if (!persona) return { error: 'persona is required' };
    out.persona = persona.slice(0, 80);
  }
  if (body.slug !== undefined) out.slug = slugify(body.slug, '');
  if (body.description !== undefined) out.description = String(body.description || '').slice(0, 240);
  if (body.icon !== undefined) out.icon = String(body.icon || '').slice(0, 16);
  if (body.accent !== undefined) out.accent = String(body.accent || '').slice(0, 32);
  if (body.active !== undefined) out.active = Boolean(body.active);
  if (body.priority !== undefined) {
    const p = Number(body.priority);
    if (!Number.isFinite(p)) return { error: 'priority must be a number' };
    out.priority = Math.trunc(p);
  }
  if (body.rotationGroup !== undefined) out.rotationGroup = String(body.rotationGroup || '').slice(0, 80);
  if (body.sortOrder !== undefined) out.sortOrder = Math.trunc(Number(body.sortOrder) || 0);
  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) return { error: 'items must be an array' };
    out.items = body.items
      .filter(it => it && String(it.itemName || it.name || '').trim())
      .slice(0, 12)
      .map((it, idx) => ({
        course: String(it.course || '').slice(0, 24),
        itemName: String(it.itemName || it.name || '').slice(0, 160),
        itemId: Number.isInteger(Number(it.itemId)) ? Number(it.itemId) : null,
        price: Math.max(0, Number(it.price) || 0),
        sortOrder: Number.isInteger(Number(it.sortOrder)) ? Number(it.sortOrder) : idx
      }));
  }
  return { value: out };
}

class RecommendationBundleService {
  constructor({ config, logger = null } = {}) {
    this.config = config;
    this.logger = logger;
    this.restaurantId = config?.restaurantId || 'trump';
    this.jsonPath = path.join(config.directories.data, 'recommendation-bundles.json');
    this.client = null;
    this.prismaTried = false;
  }

  prisma() {
    if (this.prismaTried) return this.client;
    this.prismaTried = true;
    try {
      const mod = loadPrismaClient();
      if (mod?.PrismaClient && process.env.DATABASE_URL) this.client = new mod.PrismaClient();
    } catch (error) {
      this.logger?.warn?.('reco_bundles_prisma_init_failed', { error: error?.message });
    }
    return this.client;
  }

  async readJson() {
    try {
      const raw = JSON.parse(await fsPromises.readFile(this.jsonPath, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  async writeJson(bundles) {
    await fsPromises.writeFile(this.jsonPath, JSON.stringify(bundles, null, 2), 'utf8');
  }

  // Active bundles in PersonaOrder shape for the guest menu. Returns [] when there is
  // no data anywhere, so the client falls back to its bundled constant.
  async listActive() {
    const db = this.prisma();
    if (db?.recommendationBundle) {
      try {
        const rows = await db.recommendationBundle.findMany({
          where: { restaurantId: this.restaurantId, active: true },
          orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
          include: { items: { orderBy: { sortOrder: 'asc' } } }
        });
        if (rows.length) return rows.map(toPersonaOrder);
      } catch (error) {
        this.logger?.warn?.('reco_bundles_read_failed', { error: error?.message });
      }
    }
    return (await this.readJson()).filter(b => b.active !== false).map(toPersonaOrder);
  }

  // All bundles (incl. inactive) in admin shape.
  async listAdmin() {
    const db = this.prisma();
    if (db?.recommendationBundle) {
      try {
        return await db.recommendationBundle.findMany({
          where: { restaurantId: this.restaurantId },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: { items: { orderBy: { sortOrder: 'asc' } } }
        });
      } catch (error) {
        this.logger?.warn?.('reco_bundles_admin_read_failed', { error: error?.message });
      }
    }
    return this.readJson();
  }

  async create(data = {}) {
    const db = this.prisma();
    if (!db?.recommendationBundle) return null;
    const { items = [], ...fields } = data;
    try {
      return await db.recommendationBundle.create({
        data: {
          restaurantId: this.restaurantId,
          slug: fields.slug || slugify(fields.persona, `bundle-${Date.now()}`),
          ...fields,
          items: { create: items }
        },
        include: { items: true }
      });
    } catch (error) {
      this.logger?.warn?.('reco_bundle_create_failed', { error: error?.message });
      return null;
    }
  }

  async update(id, patch = {}) {
    const db = this.prisma();
    if (!db?.recommendationBundle) return null;
    const { items, ...fields } = patch;
    try {
      return await db.$transaction(async tx => {
        if (items !== undefined) {
          await tx.recommendationBundleItem.deleteMany({ where: { bundleId: Number(id) } });
          await tx.recommendationBundleItem.createMany({ data: items.map(it => ({ ...it, bundleId: Number(id) })) });
        }
        return tx.recommendationBundle.update({
          where: { id: Number(id) },
          data: fields,
          include: { items: { orderBy: { sortOrder: 'asc' } } }
        });
      });
    } catch (error) {
      this.logger?.warn?.('reco_bundle_update_failed', { error: error?.message });
      return null;
    }
  }

  async remove(id) {
    const db = this.prisma();
    if (!db?.recommendationBundle) return false;
    try {
      await db.recommendationBundle.delete({ where: { id: Number(id) } });
      return true;
    } catch (error) {
      this.logger?.warn?.('reco_bundle_delete_failed', { error: error?.message });
      return false;
    }
  }

  async close() {
    if (this.client) {
      try { await this.client.$disconnect(); } catch { /* ignore */ }
    }
  }
}

module.exports = { RecommendationBundleService, toPersonaOrder, sanitizeBundleInput, COURSES, slugify };
