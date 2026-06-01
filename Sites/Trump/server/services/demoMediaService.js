/**
 * Demo media service.
 *
 * Scans the demo media folder and builds a manifest describing which showcase
 * items have an image, a video, both, or neither. Powers the auto-detection
 * used by the UI and the Admin → Demo Media page. Drop a file into the folder
 * and it is detected on the next request — no code change required.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const demo = require('../config/trumpDemo');

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const VIDEO_EXTS = ['.mp4', '.mov'];
const SERVED_FROM = '/Trump/media/trump';

function pickDir() {
  const { dist, pub } = demo.mediaDir();
  // Prefer the built copy (what production actually serves); fall back to the
  // committed source so the manifest works in dev too.
  if (fs.existsSync(dist)) return dist;
  return pub;
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir).filter(name => {
      try {
        return fs.statSync(path.join(dir, name)).isFile();
      } catch (_) {
        return false;
      }
    });
  } catch (_) {
    return [];
  }
}

function priorityFor(hasImage, hasVideo) {
  if (hasImage && hasVideo) return 1;
  if (hasImage) return 2;
  if (hasVideo) return 3;
  return 4;
}

class DemoMediaService {
  constructor() {
    this._cache = null;
    this._cachedAt = 0;
    this._ttlMs = 4000;
  }

  /** Build (or return cached) manifest of detected media. */
  getManifest() {
    const now = Date.now();
    if (this._cache && now - this._cachedAt < this._ttlMs) return this._cache;

    const dir = pickDir();
    const files = listFiles(dir).filter(f => !f.toLowerCase().endsWith('.md'));

    const imageByBase = new Map();
    const videoByBase = new Map();
    const allImages = [];
    const allVideos = [];

    files.forEach(file => {
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file, ext).toLowerCase();
      if (IMAGE_EXTS.includes(ext)) {
        allImages.push(file);
        if (!imageByBase.has(base)) imageByBase.set(base, file);
      } else if (VIDEO_EXTS.includes(ext)) {
        allVideos.push(file);
        if (!videoByBase.has(base)) videoByBase.set(base, file);
      }
    });

    const items = demo.SHOWCASE_ITEMS.map(showcase => {
      const image = imageByBase.get(showcase.slug) || null;
      const video = videoByBase.get(showcase.slug) || null;
      const hasImage = Boolean(image);
      const hasVideo = Boolean(video);
      return {
        slug: showcase.slug,
        name: showcase.name,
        course: showcase.course,
        hasImage,
        hasVideo,
        image,
        video,
        priority: priorityFor(hasImage, hasVideo),
      };
    });

    const knownBases = new Set(demo.SHOWCASE_SLUGS);
    const extras = [...new Set([...imageByBase.keys(), ...videoByBase.keys()])]
      .filter(base => !knownBases.has(base))
      .map(base => ({ base, image: imageByBase.get(base) || null, video: videoByBase.get(base) || null }));

    const complete = items.filter(i => i.hasImage && i.hasVideo).length;
    const missing = items.filter(i => !i.hasImage && !i.hasVideo).length;
    const partial = items.filter(i => (i.hasImage ? 1 : 0) + (i.hasVideo ? 1 : 0) === 1).length;

    const manifest = {
      folder: dir,
      servedFrom: SERVED_FROM,
      supportedFormats: { image: IMAGE_EXTS, video: VIDEO_EXTS },
      counts: {
        images: allImages.length,
        videos: allVideos.length,
        slugs: items.length,
        complete,
        partial,
        missing,
      },
      items,
      extras,
      files: { images: allImages.sort(), videos: allVideos.sort() },
    };

    this._cache = manifest;
    this._cachedAt = now;
    return manifest;
  }

  /** Media priority for a slug (1 best … 4 none) — used by recommendation ranking. */
  priorityForSlug(slug) {
    const entry = this.getManifest().items.find(i => i.slug === slug);
    return entry ? entry.priority : 4;
  }
}

module.exports = { DemoMediaService };
