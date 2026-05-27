const path = require('path');

const dotenv = require('dotenv');
const { getCategoryType } = require('../utils/helpers');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PRISMA_RETRY_MS = 30000;
const DEFAULT_RESTAURANT_ID = 'trump';

const ITEM_BASE_KEYS = new Set([
  'name',
  'description',
  'price',
  'calories',
  'allergens',
  'spice',
  'img',
  'video',
  'youtubeId',
  'imageVisible',
  'videoVisible',
  'visible',
  'available',
  'chefPick',
  'popular',
  'source_title'
]);

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
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error)
  };
}

function categoryMetadata(value, storage) {
  const metadata = {};
  Object.entries(value || {}).forEach(([key, entry]) => {
    if (key !== 'items' && key !== 'visible' && !(entry && typeof entry === 'object' && !Array.isArray(entry) && Array.isArray(entry.items))) {
      metadata[key] = entry;
    }
  });

  return {
    storage,
    extra: Object.keys(metadata).length > 0 ? metadata : undefined
  };
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
    price: Number(item.price) || 0,
    calories: String(item.calories || ''),
    allergens: String(item.allergens || ''),
    spice: String(item.spice || ''),
    imagePath: String(item.img || ''),
    videoPath: String(item.video || ''),
    youtubeId: String(item.youtubeId || ''),
    imageVisible: item.imageVisible !== false,
    videoVisible: item.videoVisible !== false,
    visible: item.visible !== false,
    available: item.available !== false,
    chefPick: Boolean(item.chefPick),
    popular: Boolean(item.popular),
    sourceTitle: String(item.source_title || item.sourceTitle || ''),
    sortOrder,
    metadata: itemMetadata(item)
  };
}

function dbItemToJson(item, { includeId = false, categoryTitle = '', subcategoryTitle = '' } = {}) {
  return {
    ...(includeId ? { dbId: item.id } : {}),
    ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
    ...(categoryTitle ? { category: categoryTitle } : {}),
    ...(subcategoryTitle ? { subcategory: subcategoryTitle } : {}),
    name: item.name,
    description: item.description || '',
    price: Number(item.price) || 0,
    calories: item.calories || '',
    allergens: item.allergens || '',
    spice: item.spice || '',
    img: item.imagePath || '',
    video: item.videoPath || '',
    youtubeId: item.youtubeId || '',
    imageVisible: item.imageVisible,
    videoVisible: item.videoVisible,
    visible: item.visible,
    available: item.available !== false,
    chefPick: item.chefPick,
    popular: item.popular,
    ...(item.sourceTitle ? { source_title: item.sourceTitle } : {})
  };
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
            create: {
              restaurantId: this.restaurantId,
              source: 'json-hybrid',
              settings: { migratedAt: new Date().toISOString() }
            },
            update: {
              source: 'json-hybrid',
              settings: { migratedAt: new Date().toISOString() }
            }
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
          {
            ...item,
            category: item.category || categoryTitle,
            subcategory: item.subcategory || subTitle
          },
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
          include: { items: { orderBy: { sortOrder: 'asc' } } },
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
          const directItems = root.items.map(item => dbItemToJson(item, { categoryTitle: root.title }));
          if (metadata.storage === 'array') {
            menu[root.title] = directItems;
            return;
          }

          const categoryValue = {
            ...(metadata.extra && typeof metadata.extra === 'object' ? metadata.extra : {}),
            visible: root.visible,
            ...(directItems.length > 0 ? { items: directItems } : {})
          };

          (byParent.get(root.id) || []).sort((left, right) => left.sortOrder - right.sortOrder).forEach(sub => {
            const subMetadata = sub.metadata && typeof sub.metadata === 'object' ? sub.metadata : {};
            categoryValue[sub.title] = {
              ...(subMetadata.extra && typeof subMetadata.extra === 'object' ? subMetadata.extra : {}),
              visible: sub.visible,
              items: sub.items.map(item => dbItemToJson(item, { categoryTitle: root.title, subcategoryTitle: sub.title }))
            };
          });

          menu[root.title] = categoryValue;
        });

        return menu;
      },
      null
    );
  }

  async saveRecommendations(recommendations = []) {
    const list = Array.isArray(recommendations) ? recommendations : [];
    return this.withPrisma(
      'menu_postgres_recommendation_save_failed',
      async prisma => {
        await prisma.$transaction(async tx => {
          await tx.recommendation.deleteMany({ where: { restaurantId: this.restaurantId } });
          let index = 0;
          for (const recommendation of list) {
            await tx.recommendation.create({
              data: {
                restaurantId: this.restaurantId,
                description: String(recommendation.description || ''),
                items: Array.isArray(recommendation.items) ? recommendation.items : [],
                active: recommendation.visible !== false && recommendation.hidden !== true,
                sortOrder: index,
                metadata: Object.fromEntries(
                  Object.entries(recommendation).filter(([key]) => !['description', 'items', 'visible', 'hidden'].includes(key))
                )
              }
            });
            index += 1;
          }
        });
        return true;
      },
      false
    );
  }

  async loadRecommendations() {
    return this.withPrisma(
      'menu_postgres_recommendation_load_failed',
      async prisma => {
        const rows = await prisma.recommendation.findMany({
          where: { restaurantId: this.restaurantId, active: true },
          orderBy: { sortOrder: 'asc' }
        });

        if (rows.length === 0) {
          return null;
        }

        return rows.map(row => ({
          ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
          description: row.description,
          items: Array.isArray(row.items) ? row.items : []
        }));
      },
      null
    );
  }

  async savePopular(popular = []) {
    const list = Array.isArray(popular) ? popular : [];
    const flat = await this.loadFlatItems();
    const byName = new Map(flat.map(item => [normalizeName(item.name), item]));

    return this.withPrisma(
      'menu_postgres_popular_save_failed',
      async prisma => {
        await prisma.featuredItem.deleteMany({ where: { restaurantId: this.restaurantId, group: 'popular' } });
        let index = 0;
        for (const entry of list) {
          const match = byName.get(normalizeName(entry.name));
          await prisma.featuredItem.create({
            data: {
              restaurantId: this.restaurantId,
              group: 'popular',
              itemId: match?.id || null,
              itemName: String(entry.name || ''),
              reason: String(entry.reason || ''),
              active: entry.visible !== false && entry.hidden !== true,
              sortOrder: index,
              metadata: Object.fromEntries(Object.entries(entry).filter(([key]) => !['name', 'reason', 'visible', 'hidden'].includes(key)))
            }
          });
          index += 1;
        }
        return true;
      },
      false
    );
  }

  async loadPopular() {
    return this.withPrisma(
      'menu_postgres_popular_load_failed',
      async prisma => {
        const rows = await prisma.featuredItem.findMany({
          where: { restaurantId: this.restaurantId, group: 'popular', active: true },
          orderBy: { sortOrder: 'asc' }
        });

        if (rows.length === 0) {
          return null;
        }

        return rows.map(row => ({
          ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
          name: row.itemName,
          reason: row.reason
        }));
      },
      null
    );
  }

  async loadFlatItems() {
    return this.withPrisma(
      'menu_postgres_flat_items_failed',
      async prisma => prisma.menuItem.findMany({
        where: { restaurantId: this.restaurantId },
        orderBy: { sortOrder: 'asc' }
      }),
      []
    );
  }

  async loadAdminItems() {
    return this.withPrisma(
      'menu_postgres_admin_items_failed',
      async prisma => {
        const items = await prisma.menuItem.findMany({
          where: { restaurantId: this.restaurantId },
          include: { category: { select: { title: true, parentId: true } } },
          orderBy: { sortOrder: 'asc' }
        });
        return items.map(item => ({
          ...dbItemToJson(item, { includeId: true, categoryTitle: item.category?.title || '' })
        }));
      },
      null
    );
  }

  async toggleItemAvailability(id, available) {
    return this.withPrisma(
      'menu_postgres_toggle_availability_failed',
      async prisma => {
        await prisma.menuItem.update({
          where: { id: Number(id) },
          data: { available: Boolean(available) }
        });
        return true;
      },
      false
    );
  }

  async updateItemMedia(id, patch = {}) {
    const data = {};

    if (Object.prototype.hasOwnProperty.call(patch, 'img')) {
      data.imagePath = String(patch.img || '');
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'video')) {
      data.videoPath = String(patch.video || '');
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'youtubeId')) {
      data.youtubeId = String(patch.youtubeId || '');
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'imageVisible')) {
      data.imageVisible = patch.imageVisible !== false;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'videoVisible')) {
      data.videoVisible = patch.videoVisible !== false;
    }

    if (Object.keys(data).length === 0) {
      return null;
    }

    return this.withPrisma(
      'menu_postgres_update_media_failed',
      async prisma => {
        const item = await prisma.menuItem.update({
          where: { id: Number(id) },
          data
        });
        return dbItemToJson(item, { includeId: true });
      },
      null
    );
  }

  async migrateFromJson({ menuData = {}, recommendations = [], popular = [] } = {}) {
    const summary = {
      categories: 0,
      items: 0,
      recommendations: Array.isArray(recommendations) ? recommendations.length : 0,
      popular: Array.isArray(popular) ? popular.length : 0,
      unavailable: false
    };

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

    await this.saveRecommendations(recommendations);
    await this.savePopular(popular);

    const categoryCount = await this.withPrisma(
      'menu_postgres_migration_count_failed',
      prisma => prisma.menuCategory.count({ where: { restaurantId: this.restaurantId } }),
      0
    );
    const itemCount = await this.withPrisma(
      'menu_postgres_migration_item_count_failed',
      prisma => prisma.menuItem.count({ where: { restaurantId: this.restaurantId } }),
      0
    );

    summary.categories = categoryCount;
    summary.items = itemCount || flattenMenu(menuData).length;
    this.lastMigration = summary;
    return summary;
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
  PrismaMenuService,
  flattenMenu
};
