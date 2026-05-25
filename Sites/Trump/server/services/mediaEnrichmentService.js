'use strict';
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');

class MediaEnrichmentService {
  constructor(config) {
    this.uploadDir = path.join(config.directories.uploads, 'menu-media');
    this.pexelsKey = process.env.PEXELS_API_KEY || '';
    this.pixabayKey = process.env.PIXABAY_API_KEY || '';
    this.db = new PrismaClient();
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
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await sharp(buffer)
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
    const total = await this.db.menuItem.count({ where: { restaurantId } });
    const hasImage = await this.db.menuItem.count({ where: { restaurantId, imagePath: { not: '' } } });
    const noApiKeys = !this.pexelsKey && !this.pixabayKey;
    return { total, hasImage, pending: total - hasImage, noApiKeys };
  }

  async close() {
    await this.db.$disconnect().catch(() => {});
  }
}

module.exports = { MediaEnrichmentService };
