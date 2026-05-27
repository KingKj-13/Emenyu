'use strict';
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function loadPrismaClient() {
  const candidates = [
    path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'client'),
    '@prisma/client'
  ];

  for (const candidate of candidates) {
    try {
      const prismaModule = require(candidate);
      if (prismaModule?.PrismaClient) return prismaModule.PrismaClient;
    } catch {
      // Try the next resolution path.
    }
  }

  return null;
}

function loadSharp() {
  try {
    return require('sharp');
  } catch {
    return null;
  }
}

class MediaEnrichmentService {
  constructor(config) {
    this.uploadDir = path.join(config.directories.uploads, 'menu-media');
    this.pexelsKey = process.env.PEXELS_API_KEY || '';
    this.pixabayKey = process.env.PIXABAY_API_KEY || '';
    this.sharp = loadSharp();
    const PrismaClient = loadPrismaClient();
    this.db = PrismaClient ? new PrismaClient() : null;
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  async searchPexels(query) {
    if (!this.pexelsKey) return null;
    try {
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query + ' food dish restaurant')}&per_page=3&orientation=landscape`;
      const res = await fetch(url, {
        headers: { Authorization: this.pexelsKey },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const photo = data.photos?.[0];
      return photo ? { url: photo.src.large, src: 'pexels', score: 85 } : null;
    } catch { return null; }
  }

  async searchPixabay(query) {
    if (!this.pixabayKey) return null;
    try {
      const url = `https://pixabay.com/api/?key=${this.pixabayKey}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&per_page=3&category=food&safesearch=true`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data = await res.json();
      const hit = data.hits?.[0];
      return hit ? { url: hit.webformatURL, src: 'pixabay', score: 70 } : null;
    } catch { return null; }
  }

  async downloadAndConvert(imageUrl, destPath) {
    if (!this.sharp) {
      throw new Error('Image processor unavailable. Install sharp to enable media enrichment.');
    }

    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await this.sharp(buffer)
      .resize(800, 450, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toFile(destPath);
  }

  async enrichItem(item) {
    const filename = `${item.id}.webp`;
    const destPath = path.join(this.uploadDir, filename);
    const publicPath = `/uploads/menu-media/${filename}`;

    const result = await this.searchPexels(item.name) || await this.searchPixabay(item.name);
    if (!result) {
      await this.db.menuItem.update({
        where: { id: item.id },
        data: { metadata: { mediaStatus: 'no_result', mediaUpdatedAt: new Date().toISOString() } },
      });
      return false;
    }

    await this.downloadAndConvert(result.url, destPath);
    await this.db.menuItem.update({
      where: { id: item.id },
      data: {
        imagePath: publicPath,
        metadata: { mediaStatus: 'enriched', mediaSrc: result.src, mediaScore: result.score, mediaUpdatedAt: new Date().toISOString() },
      },
    });
    return true;
  }

  async enrichBatch({ limit = 20, restaurantId = 'trump', retry = false } = {}) {
    if (!this.db) {
      return { processed: 0, enriched: 0, error: 'Prisma client unavailable. Run prisma generate to enable media enrichment.' };
    }

    if (!this.sharp) {
      return { processed: 0, enriched: 0, error: 'Image processor unavailable. Install sharp to enable media enrichment.' };
    }

    if (!this.pexelsKey && !this.pixabayKey) {
      return { processed: 0, enriched: 0, error: 'No API keys configured. Set PEXELS_API_KEY or PIXABAY_API_KEY.' };
    }

    // Fetch all items with no image; filter already-tried in JS to avoid complex JSON Prisma queries
    const candidates = await this.db.menuItem.findMany({
      where: { restaurantId, imagePath: '' },
      select: { id: true, name: true, metadata: true },
      take: limit * 3, // over-fetch so we have enough after filtering
    });

    const items = retry
      ? candidates.slice(0, limit)
      : candidates.filter(it => {
          const m = it.metadata;
          return !m || !m.mediaStatus || m.mediaStatus === 'error';
        }).slice(0, limit);

    let enriched = 0;
    for (const item of items) {
      try {
        const ok = await this.enrichItem(item);
        if (ok) enriched++;
        await new Promise(r => setTimeout(r, 600)); // respect rate limits
      } catch (e) {
        await this.db.menuItem.update({
          where: { id: item.id },
          data: { metadata: { mediaStatus: 'error', mediaError: e.message, mediaUpdatedAt: new Date().toISOString() } },
        }).catch(() => {});
      }
    }
    return { processed: items.length, enriched };
  }

  async getStatus(restaurantId = 'trump') {
    if (!this.db) {
      return {
        total: 0,
        hasImage: 0,
        pending: 0,
        noApiKeys: !this.pexelsKey && !this.pixabayKey,
        imageProcessorAvailable: Boolean(this.sharp),
        databaseAvailable: false
      };
    }

    const total = await this.db.menuItem.count({ where: { restaurantId } });
    const hasImage = await this.db.menuItem.count({ where: { restaurantId, imagePath: { not: '' } } });
    const noApiKeys = !this.pexelsKey && !this.pixabayKey;
    return { total, hasImage, pending: total - hasImage, noApiKeys, imageProcessorAvailable: Boolean(this.sharp), databaseAvailable: true };
  }

  async close() {
    await this.db?.$disconnect().catch(() => {});
  }
}

module.exports = { MediaEnrichmentService };
