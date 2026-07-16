const path = require('path');

const dotenv = require('dotenv');
const { getCategoryType } = require('../utils/helpers');
const classifier = require('./categoryClassifier');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PRISMA_RETRY_MS = 30000;
const DEFAULT_RESTAURANT_ID = 'carmella-production';

// category/subcategory are derived from the item's category relation (see
// dbItemToJson), never stored as free-form data -- excluded here so they
// never leak into the metadata JSON blob when a caller passes them through
// (they're informational pass-throughs some call sites include alongside
// the item, not actual columns this function writes anywhere).
const ITEM_BASE_KEYS = new Set([
  'name', 'description', 'story', 'subtitle', 'price', 'calories', 'allergens',
  'spice', 'img', 'imageVisible', 'visible', 'available', 'availability',
  'popular', 'variants', 'daypart', 'category', 'subcategory'
]);

const DAYPARTS = new Set(['day', 'night', 'both']);
function normalizeDaypart(value) {
  const v = String(value || 'both').toLowerCase();
  return DAYPARTS.has(v) ? v : 'both';
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function slugify(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || fallback;
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

function serializeError(error) {
  return { name: error?.name || 'Error', message: error?.message || String(error) };
}

function categoryMetadata(value, storage) {
  const metadata = {};
  Object.entries(value || {}).forEach(([key, entry]) => {
    if (key !== 'items' && key !== 'visible' && !(entry && typeof entry === 'object' && !Array.isArray(entry) && Array.isArray(entry.items))) {
      metadata[key] = entry;
    }
  });
  return { storage, extra: Object.keys(metadata).length > 0 ? metadata : undefined };
}

function itemMetadata(item = {}) {
  const metadata = {};
  Object.entries(item).forEach(([key, value]) => {
    if (!ITEM_BASE_KEYS.has(key)) {
      metadata[key] = value;
    }
  });
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function itemToCreateData(item = {}, categoryId, restaurantId, sortOrder) {
  return {
    restaurantId,
    categoryId,
    name: String(item.name || '').trim(),
    normalizedName: normalizeName(item.name),
    description: String(item.description || ''),
    story: String(item.story || ''),
    subtitle: String(item.subtitle || ''),
    price: Number(item.price) || 0,
    calories: String(item.calories || ''),
    allergens: String(item.allergens || ''),
    spice: String(item.spice || ''),
    imagePath: String(item.img || ''),
    imageVisible: item.imageVisible !== false,
    visible: item.visible !== false,
    available: item.available !== false,
    availability: String(item.availability || 'available'),
    popular: Boolean(item.popular),
    daypart: normalizeDaypart(item.daypart),
    sortOrder,
    metadata: itemMetadata(item)
  };
}

function variantToJson(variant) {
  return {
    dbId: variant.id,
    name: variant.name,
    price: Number(variant.price) || 0,
    img: variant.imagePath || '',
    isAddon: Boolean(variant.isAddon)
  };
}

// Variant-only items (e.g. coffees/wines-by-the-glass: no single price, only
// per-variant prices) have `price: 0` on the base row — fall back to the
// cheapest non-addon variant so cards always show a real "from" price.
function effectivePrice(item) {
  const basePrice = Number(item.price) || 0;
  if (basePrice > 0 || !Array.isArray(item.variants) || item.variants.length === 0) {
    return basePrice;
  }
  const variantPrices = item.variants
    .filter(v => !v.isAddon)
    .map(v => Number(v.price) || 0)
    .filter(p => p > 0);
  return variantPrices.length > 0 ? Math.min(...variantPrices) : 0;
}

function dbItemToJson(item, { includeId = false, categoryTitle = '', subcategoryTitle = '' } = {}) {
  const json = {
    ...(includeId ? { dbId: item.id } : {}),
    ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
    // Always explicit (never conditional on truthiness) so these two, which
    // are derived fresh from the item's actual category relation every call,
    // can never be shadowed by a stale category/subcategory value some
    // historical import left sitting in the metadata JSON blob above.
    category: categoryTitle,
    subcategory: subcategoryTitle,
    name: item.name,
    description: item.description || '',
    story: item.story || '',
    subtitle: item.subtitle || '',
    price: effectivePrice(item),
    calories: item.calories || '',
    allergens: item.allergens || '',
    spice: item.spice || '',
    img: item.imagePath || '',
    imageVisible: item.imageVisible,
    visible: item.visible,
    available: item.available !== false,
    availability: item.availability || 'available',
    popular: item.popular,
    daypart: normalizeDaypart(item.daypart),
    ...(Array.isArray(item.variants) && item.variants.length > 0
      ? { variants: item.variants.map(variantToJson) }
      : {})
  };

  // Stamp the authoritative server-side classification so the client does not
  // re-derive it.
  const ctx = { name: json.name, category: categoryTitle, subcategory: subcategoryTitle, types: json.types };
  json.categoryType = classifier.categoryType(ctx);
  json.beverageKind = json.categoryType === 'WINE'
    ? 'WINE'
    : json.categoryType === 'DRINK' ? classifier.beverageKind(ctx) : 'NONE';

  return json;
}

function flattenMenu(menuData = {}) {
  const items = [];
  Object.entries(menuData || {}).forEach(([categoryTitle, categoryValue]) => {
    if (Array.isArray(categoryValue)) {
      categoryValue.forEach(item => {
        if (item?.name) items.push({ item, categoryTitle });
      });
      return;
    }
    if (!categoryValue || typeof categoryValue !== 'object') {
      return;
    }
    (categoryValue.items || []).forEach(item => {
      if (item?.name) items.push({ item, categoryTitle });
    });
    Object.entries(categoryValue).forEach(([subTitle, subValue]) => {
      if (subTitle === 'items' || subTitle === 'visible' || !subValue || typeof subValue !== 'object') {
        return;
      }
      (subValue.items || []).forEach(item => {
        if (item?.name) items.push({ item, categoryTitle, subTitle });
      });
    });
  });
  return items;
}

class PrismaMenuService {
  constructor({ restaurantId = DEFAULT_RESTAURANT_ID, logger = null } = {}) {
    loadDatabaseEnv();

    this.restaurantId = restaurantId || DEFAULT_RESTAURANT_ID;
    this.logger = logger;
    this.enabled = parseBoolean(process.env.TRUMP_MENU_POSTGRES_ENABLED, true) && Boolean(process.env.DATABASE_URL);
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
      this.markUnavailable('menu_postgres_unavailable', error);
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

  async hasMenuData() {
    return this.withPrisma(
      'menu_postgres_count_failed',
      async prisma => (await prisma.menuCategory.count({ where: { restaurantId: this.restaurantId } })) > 0,
      false
    );
  }

  async saveMenu(menuData = {}) {
    return this.withPrisma(
      'menu_postgres_save_failed',
      async prisma => {
        await prisma.$transaction(async tx => {
          await tx.menuItem.deleteMany({ where: { restaurantId: this.restaurantId } });
          await tx.menuCategory.deleteMany({ where: { restaurantId: this.restaurantId } });
          await tx.restaurantMenuSettings.upsert({
            where: { restaurantId: this.restaurantId },
            create: { restaurantId: this.restaurantId, source: 'json-hybrid', settings: { migratedAt: new Date().toISOString() } },
            update: { source: 'json-hybrid', settings: { migratedAt: new Date().toISOString() } }
          });

          let categoryIndex = 0;
          for (const [categoryTitle, categoryValue] of Object.entries(menuData || {})) {
            const rootPath = `${this.restaurantId}/${String(categoryIndex + 1).padStart(3, '0')}-${slugify(categoryTitle, `category-${categoryIndex + 1}`)}`;
            const storage = Array.isArray(categoryValue) ? 'array' : 'object';
            const rootCourseType = getCategoryType(categoryTitle);
            const root = await tx.menuCategory.create({
              data: {
                restaurantId: this.restaurantId,
                title: categoryTitle,
                slug: slugify(categoryTitle, `category-${categoryIndex + 1}`),
                path: rootPath,
                sortOrder: categoryIndex,
                visible: Array.isArray(categoryValue) ? true : categoryValue?.visible !== false,
                courseType: rootCourseType,
                metadata: categoryMetadata(categoryValue, storage)
              }
            });

            const directItems = Array.isArray(categoryValue) ? categoryValue : categoryValue?.items || [];
            await this.createItems(tx, directItems, root.id, categoryIndex, root.title);

            if (!Array.isArray(categoryValue) && categoryValue && typeof categoryValue === 'object') {
              let subIndex = 0;
              for (const [subTitle, subValue] of Object.entries(categoryValue)) {
                if (subTitle === 'items' || subTitle === 'visible' || !subValue || typeof subValue !== 'object' || !Array.isArray(subValue.items)) {
                  continue;
                }
                const subPath = `${rootPath}/${String(subIndex + 1).padStart(3, '0')}-${slugify(subTitle, `subcategory-${subIndex + 1}`)}`;
                const subCourseType = getCategoryType(subTitle);
                const sub = await tx.menuCategory.create({
                  data: {
                    restaurantId: this.restaurantId,
                    title: subTitle,
                    slug: slugify(subTitle, `subcategory-${subIndex + 1}`),
                    path: subPath,
                    parentId: root.id,
                    sortOrder: subIndex,
                    visible: subValue.visible !== false,
                    courseType: subCourseType !== 'MAIN' ? subCourseType : rootCourseType,
                    metadata: categoryMetadata(subValue, 'object')
                  }
                });
                await this.createItems(tx, subValue.items || [], sub.id, subIndex, root.title, sub.title);
                subIndex += 1;
              }
            }
            categoryIndex += 1;
          }
        });
        return true;
      },
      false
    );
  }

  async createItems(tx, items = [], categoryId, categoryOrder, categoryTitle, subTitle = '') {
    let itemIndex = 0;
    for (const item of items) {
      if (!item?.name) {
        continue;
      }
      await tx.menuItem.create({
        data: itemToCreateData(
          { ...item, category: item.category || categoryTitle, subcategory: item.subcategory || subTitle },
          categoryId,
          this.restaurantId,
          categoryOrder * 10000 + itemIndex
        )
      });
      itemIndex += 1;
    }
  }

  async loadMenu() {
    return this.withPrisma(
      'menu_postgres_load_failed',
      async prisma => {
        const categories = await prisma.menuCategory.findMany({
          where: { restaurantId: this.restaurantId },
          include: { items: { orderBy: { sortOrder: 'asc' }, include: { variants: { orderBy: { sortOrder: 'asc' } } } } },
          orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }]
        });

        if (categories.length === 0) {
          return null;
        }

        const byParent = new Map();
        categories.forEach(category => {
          const key = category.parentId || 0;
          if (!byParent.has(key)) byParent.set(key, []);
          byParent.get(key).push(category);
        });

        const menu = {};
        (byParent.get(0) || []).sort((left, right) => left.sortOrder - right.sortOrder).forEach(root => {
          const metadata = root.metadata && typeof root.metadata === 'object' ? root.metadata : {};
          const directItems = root.items.map(item => dbItemToJson(item, { includeId: true, categoryTitle: root.title }));
          if (metadata.storage === 'array') {
            menu[root.title] = directItems;
            return;
          }

          const categoryValue = {
            ...(metadata.extra && typeof metadata.extra === 'object' ? metadata.extra : {}),
            visible: root.visible,
            slug: root.slug,
            ...(root.intro ? { intro: root.intro } : {}),
            ...(directItems.length > 0 ? { items: directItems } : {})
          };

          (byParent.get(root.id) || []).sort((left, right) => left.sortOrder - right.sortOrder).forEach(sub => {
            const subMetadata = sub.metadata && typeof sub.metadata === 'object' ? sub.metadata : {};
            categoryValue[sub.title] = {
              ...(subMetadata.extra && typeof subMetadata.extra === 'object' ? subMetadata.extra : {}),
              visible: sub.visible,
              items: sub.items.map(item => dbItemToJson(item, { includeId: true, categoryTitle: root.title, subcategoryTitle: sub.title }))
            };
          });

          menu[root.title] = categoryValue;
        });

        return menu;
      },
      null
    );
  }

  async loadFlatItems() {
    return this.withPrisma(
      'menu_postgres_flat_items_failed',
      async prisma => prisma.menuItem.findMany({ where: { restaurantId: this.restaurantId }, orderBy: { sortOrder: 'asc' } }),
      []
    );
  }

  async loadAdminItems() {
    return this.withPrisma(
      'menu_postgres_admin_items_failed',
      async prisma => {
        const items = await prisma.menuItem.findMany({
          where: { restaurantId: this.restaurantId },
          include: { category: { include: { parent: true } }, variants: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' }
        });
        // item.category is the row categoryId actually points at, which in
        // this catalog is always a section (child) -- the chapter (top-level)
        // title is one level up, at item.category.parent. Falls back to
        // item.category itself for the (currently nonexistent, but
        // structurally possible) case of an item attached directly to a
        // childless top-level category.
        return items.map(item => {
          const categoryTitle = item.category?.parent ? item.category.parent.title : (item.category?.title || '');
          const subcategoryTitle = item.category?.parent ? item.category.title : '';
          return { ...dbItemToJson(item, { includeId: true, categoryTitle, subcategoryTitle }) };
        });
      },
      null
    );
  }

  async toggleItemAvailability(id, available) {
    return this.withPrisma(
      'menu_postgres_toggle_availability_failed',
      async prisma => {
        const result = await prisma.menuItem.updateMany({
          where: { id: Number(id), restaurantId: this.restaurantId },
          data: { available: Boolean(available) }
        });
        return result.count > 0;
      },
      false
    );
  }

  async updateItemMedia(id, patch = {}) {
    const data = {};
    if (Object.prototype.hasOwnProperty.call(patch, 'img')) {
      data.imagePath = String(patch.img || '');
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'imageVisible')) {
      data.imageVisible = patch.imageVisible !== false;
    }
    if (Object.keys(data).length === 0) {
      return null;
    }

    return this.withPrisma(
      'menu_postgres_update_media_failed',
      async prisma => {
        const result = await prisma.menuItem.updateMany({ where: { id: Number(id), restaurantId: this.restaurantId }, data });
        if (result.count === 0) {
          return null;
        }
        const item = await prisma.menuItem.findUnique({ where: { id: Number(id) } });
        return dbItemToJson(item, { includeId: true });
      },
      null
    );
  }

  async deleteItem(id) {
    return this.withPrisma(
      'menu_postgres_delete_item_failed',
      async prisma => {
        const result = await prisma.menuItem.deleteMany({ where: { id: Number(id), restaurantId: this.restaurantId } });
        return result.count > 0;
      },
      false
    );
  }

  // STEP 3 — item counts must include items belonging to this category's
  // child sections, not just items attached directly to the top-level
  // category row: this app's chapters (top-level) contain sections
  // (children) which is where imported items actually attach, so counting
  // only `categoryId = chapter.id` undercounts to 0 for every chapter that
  // has sections. This was the root cause of the admin always showing
  // "0 Items".
  async listCategories() {
    return this.withPrisma(
      'menu_postgres_list_categories_failed',
      async prisma => {
        const categories = await prisma.menuCategory.findMany({
          where: { restaurantId: this.restaurantId, parentId: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            title: true,
            sortOrder: true,
            visible: true,
            _count: { select: { items: true } },
            children: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, title: true, sortOrder: true, visible: true, _count: { select: { items: true } } }
            }
          }
        });
        return categories.map(category => ({
          id: category.id,
          title: category.title,
          sortOrder: category.sortOrder,
          visible: category.visible,
          itemCount: category._count.items + category.children.reduce((sum, child) => sum + child._count.items, 0),
          subcategories: category.children.map(child => ({
            id: child.id,
            title: child.title,
            sortOrder: child.sortOrder,
            visible: child.visible,
            itemCount: child._count.items
          }))
        }));
      },
      []
    );
  }

  // STEP 6 — admin can create a category with no items yet.
  async createCategory(title) {
    const trimmed = String(title || '').trim();
    if (!trimmed) {
      return null;
    }
    return this.withPrisma(
      'menu_postgres_create_category_failed',
      async prisma => {
        const count = await prisma.menuCategory.count({ where: { restaurantId: this.restaurantId, parentId: null } });
        const slug = slugify(trimmed, `category-${count + 1}`);
        const category = await prisma.menuCategory.create({
          data: {
            restaurantId: this.restaurantId,
            title: trimmed,
            slug,
            path: `${this.restaurantId}/${slug}-${Date.now()}`,
            sortOrder: count,
            visible: true,
            courseType: getCategoryType(trimmed),
            metadata: { storage: 'object' }
          }
        });
        return { id: category.id, title: category.title, sortOrder: category.sortOrder, visible: category.visible };
      },
      null
    );
  }

  // STEP 6 — admin reorders categories by passing the full ordered id list.
  async reorderCategories(orderedIds = []) {
    const ids = (Array.isArray(orderedIds) ? orderedIds : []).map(Number).filter(Number.isInteger);
    if (ids.length === 0) {
      return false;
    }
    return this.withPrisma(
      'menu_postgres_reorder_categories_failed',
      async prisma => {
        await prisma.$transaction(
          ids.map((id, index) =>
            prisma.menuCategory.updateMany({ where: { id, restaurantId: this.restaurantId }, data: { sortOrder: index } })
          )
        );
        return true;
      },
      false
    );
  }

  async renameCategory(id, title) {
    const categoryId = Number(id);
    const trimmed = String(title || '').trim();
    if (!Number.isInteger(categoryId) || !trimmed) {
      return null;
    }
    return this.withPrisma(
      'menu_postgres_rename_category_failed',
      async prisma => {
        const result = await prisma.menuCategory.updateMany({
          where: { id: categoryId, restaurantId: this.restaurantId },
          data: { title: trimmed }
        });
        if (result.count === 0) {
          return null;
        }
        const updated = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
        return { id: updated.id, title: updated.title, sortOrder: updated.sortOrder, visible: updated.visible };
      },
      null
    );
  }

  // Deletes a category (and, via Prisma's onDelete: Cascade on the
  // self-relation, any child subcategories) only once it holds zero items —
  // across itself AND its children, since items live one level down. Pass
  // moveItemsTo to relocate every item (direct + via children) into another
  // top-level category first, then delete.
  async deleteCategory(id, { moveItemsTo } = {}) {
    const categoryId = Number(id);
    if (!Number.isInteger(categoryId)) {
      return { error: 'invalid category id' };
    }
    return this.withPrisma(
      'menu_postgres_delete_category_failed',
      async prisma => {
        const category = await prisma.menuCategory.findFirst({
          where: { id: categoryId, restaurantId: this.restaurantId },
          include: { children: true }
        });
        if (!category) {
          return { error: 'category not found' };
        }
        const categoryIds = [categoryId, ...category.children.map(c => c.id)];
        const itemCount = await prisma.menuItem.count({ where: { categoryId: { in: categoryIds } } });

        if (itemCount > 0) {
          const targetId = Number(moveItemsTo);
          if (!Number.isInteger(targetId)) {
            return { error: 'category has items', itemCount };
          }
          const target = await prisma.menuCategory.findFirst({ where: { id: targetId, restaurantId: this.restaurantId, parentId: null } });
          if (!target || targetId === categoryId) {
            return { error: 'invalid destination category' };
          }
          await prisma.menuItem.updateMany({ where: { categoryId: { in: categoryIds } }, data: { categoryId: targetId } });
        }

        await prisma.menuCategory.delete({ where: { id: categoryId } });
        return { ok: true, movedItems: itemCount };
      },
      { error: 'database unavailable' }
    );
  }

  // Resolves (creating rows as needed) the top-level category matching
  // categoryTitle and, if subcategoryTitle is non-empty, the child category
  // under it matching subcategoryTitle. Returns the id items should actually
  // attach to (the subcategory's, when one is given -- items in this catalog
  // always live one level down, under a section, never directly on a chapter
  // that has sections) plus the resolved titles for the caller's own JSON
  // response. Shared by createItem/updateItem so both go through the exact
  // same rule.
  async resolveCategoryChain(prisma, categoryTitle, subcategoryTitle) {
    const topTitle = String(categoryTitle || '').trim();
    if (!topTitle) {
      return null;
    }

    let category = await prisma.menuCategory.findFirst({ where: { restaurantId: this.restaurantId, parentId: null, title: topTitle } });
    if (!category) {
      const count = await prisma.menuCategory.count({ where: { restaurantId: this.restaurantId } });
      const slug = slugify(topTitle, `category-${count + 1}`);
      category = await prisma.menuCategory.create({
        data: {
          restaurantId: this.restaurantId,
          title: topTitle,
          slug,
          path: `${this.restaurantId}/${slug}-${Date.now()}`,
          sortOrder: count,
          visible: true,
          courseType: getCategoryType(topTitle),
          metadata: { storage: 'object' }
        }
      });
    }

    const subTitle = String(subcategoryTitle || '').trim();
    if (!subTitle) {
      return { categoryId: category.id, categoryTitle: category.title, subcategoryTitle: '' };
    }

    let sub = await prisma.menuCategory.findFirst({ where: { restaurantId: this.restaurantId, parentId: category.id, title: subTitle } });
    if (!sub) {
      const siblingCount = await prisma.menuCategory.count({ where: { restaurantId: this.restaurantId, parentId: category.id } });
      const slug = slugify(subTitle, `${category.slug}-sub-${siblingCount + 1}`);
      sub = await prisma.menuCategory.create({
        data: {
          restaurantId: this.restaurantId,
          title: subTitle,
          slug,
          path: `${this.restaurantId}/${slug}-${Date.now()}`,
          parentId: category.id,
          sortOrder: siblingCount,
          visible: true,
          courseType: category.courseType,
          metadata: { storage: 'object' }
        }
      });
    }
    return { categoryId: sub.id, categoryTitle: category.title, subcategoryTitle: sub.title };
  }

  async createItem(item = {}) {
    const name = String(item.name || '').trim();
    const categoryTitle = String(item.category || '').trim();
    if (!name || !categoryTitle) {
      return null;
    }

    return this.withPrisma(
      'menu_postgres_create_item_failed',
      async prisma => {
        const resolved = await this.resolveCategoryChain(prisma, categoryTitle, item.subcategory);
        if (!resolved) {
          return null;
        }

        const last = await prisma.menuItem.findFirst({ where: { categoryId: resolved.categoryId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
        const created = await prisma.menuItem.create({
          data: itemToCreateData({ ...item, category: resolved.categoryTitle, subcategory: resolved.subcategoryTitle }, resolved.categoryId, this.restaurantId, (last?.sortOrder ?? 0) + 1)
        });
        return dbItemToJson(created, { includeId: true, categoryTitle: resolved.categoryTitle, subcategoryTitle: resolved.subcategoryTitle });
      },
      null
    );
  }

  // Surgical per-item update of editable scalar fields (+ optional category move).
  // Deliberately NOT routed through saveMenu(): that path deletes & recreates
  // every item, reassigning ids. update() keeps the id stable. Media is owned
  // by updateItemMedia(); availability by toggleItemAvailability().
  async updateItem(id, patch = {}) {
    const itemId = Number(id);
    if (!Number.isInteger(itemId)) {
      return null;
    }

    const data = {};
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      const name = String(patch.name || '').trim();
      if (!name) {
        return null;
      }
      data.name = name;
      data.normalizedName = normalizeName(name);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) data.description = String(patch.description || '');
    if (Object.prototype.hasOwnProperty.call(patch, 'story')) data.story = String(patch.story || '');
    if (Object.prototype.hasOwnProperty.call(patch, 'subtitle')) data.subtitle = String(patch.subtitle || '');
    if (Object.prototype.hasOwnProperty.call(patch, 'availability')) data.availability = String(patch.availability || 'available');
    if (Object.prototype.hasOwnProperty.call(patch, 'price')) data.price = Number(patch.price) || 0;
    if (Object.prototype.hasOwnProperty.call(patch, 'calories')) data.calories = String(patch.calories || '');
    if (Object.prototype.hasOwnProperty.call(patch, 'allergens')) data.allergens = String(patch.allergens || '');
    if (Object.prototype.hasOwnProperty.call(patch, 'spice')) data.spice = String(patch.spice || '');
    if (Object.prototype.hasOwnProperty.call(patch, 'popular')) data.popular = Boolean(patch.popular);
    if (Object.prototype.hasOwnProperty.call(patch, 'available')) data.available = patch.available !== false;
    if (Object.prototype.hasOwnProperty.call(patch, 'visible')) data.visible = patch.visible !== false;
    if (Object.prototype.hasOwnProperty.call(patch, 'daypart')) data.daypart = normalizeDaypart(patch.daypart);

    return this.withPrisma(
      'menu_postgres_update_item_failed',
      async prisma => {
        let categoryTitle = '';
        let subcategoryTitle = '';

        // Only touch categoryId at all if the caller actually sent category
        // and/or subcategory. Whichever of the two wasn't sent is looked up
        // from the item's CURRENT chain and re-applied, not dropped -- this
        // is what makes "editing an item never changes its category or
        // subcategory unless explicitly changed" hold even for callers that
        // only ever intend to touch one of the two fields.
        if (patch.category !== undefined || patch.subcategory !== undefined) {
          const current = await prisma.menuItem.findUnique({
            where: { id: itemId },
            select: { category: { select: { title: true, parent: { select: { title: true } } } } }
          });
          const currentTopTitle = current?.category?.parent ? current.category.parent.title : (current?.category?.title || '');
          const currentSubTitle = current?.category?.parent ? current.category.title : '';

          const effectiveCategoryTitle = patch.category !== undefined ? String(patch.category || '').trim() : currentTopTitle;
          const effectiveSubcategoryTitle = patch.subcategory !== undefined ? String(patch.subcategory || '').trim() : currentSubTitle;

          if (effectiveCategoryTitle) {
            const resolved = await this.resolveCategoryChain(prisma, effectiveCategoryTitle, effectiveSubcategoryTitle);
            if (resolved) {
              data.categoryId = resolved.categoryId;
              categoryTitle = resolved.categoryTitle;
              subcategoryTitle = resolved.subcategoryTitle;
            }
          }
        }

        if (Object.keys(data).length === 0) {
          return null;
        }

        const result = await prisma.menuItem.updateMany({ where: { id: itemId, restaurantId: this.restaurantId }, data });
        if (result.count === 0) {
          return null;
        }

        const updated = await prisma.menuItem.findUnique({ where: { id: itemId }, include: { category: { include: { parent: true } }, variants: { orderBy: { sortOrder: 'asc' } } } });
        const finalCategoryTitle = categoryTitle || (updated?.category?.parent ? updated.category.parent.title : updated?.category?.title || '');
        const finalSubcategoryTitle = subcategoryTitle || (updated?.category?.parent ? updated.category.title : '');
        return dbItemToJson(updated, { includeId: true, categoryTitle: finalCategoryTitle, subcategoryTitle: finalSubcategoryTitle });
      },
      null
    );
  }

  async migrateFromJson({ menuData = {} } = {}) {
    const summary = { categories: 0, items: 0, unavailable: false };

    if (!(await this.ensureReady())) {
      summary.unavailable = true;
      this.lastMigration = summary;
      return summary;
    }

    const savedMenu = await this.saveMenu(menuData);
    if (!savedMenu) {
      summary.unavailable = true;
      this.lastMigration = summary;
      return summary;
    }

    const categoryCount = await this.withPrisma('menu_postgres_migration_count_failed', prisma => prisma.menuCategory.count({ where: { restaurantId: this.restaurantId } }), 0);
    const itemCount = await this.withPrisma('menu_postgres_migration_item_count_failed', prisma => prisma.menuItem.count({ where: { restaurantId: this.restaurantId } }), 0);

    summary.categories = categoryCount;
    summary.items = itemCount || flattenMenu(menuData).length;
    this.lastMigration = summary;
    return summary;
  }

  getStatus() {
    return { configured: this.isConfigured, ready: this.ready, fallbackEnabled: true, lastError: this.lastError, lastMigration: this.lastMigration };
  }

  async close() {
    if (this.client) {
      await this.client.$disconnect();
    }
  }
}

module.exports = {
  PrismaMenuService,
  flattenMenu,
  effectivePrice
};
