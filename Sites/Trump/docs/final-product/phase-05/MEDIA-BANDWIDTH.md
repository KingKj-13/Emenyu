# MEDIA-BANDWIDTH.md — Phase 05 Step 6

**Date:** 2026-06-25. **Status: ✅ asset weights measured; bandwidth derived from those measurements + explicit session assumptions.**
**Method:** `du` / `find -printf` over `Sites/Trump/{Images,Video}` and `client/dist`; gzip sizes from curl.

> Asset sizes are **measured**. Daily/monthly/peak figures are **derived** (measured size × stated assumptions) — the assumptions are listed so they can be replaced with real analytics.

---

## Measured asset weights
| Asset class | Count | Total | Avg | Median | Max |
|---|---|---|---|---|---|
| **Images** (`/Trump/Images`) | 118 (96 jpg, 18 jpeg, 3 png, 1 webp) | **24 MB** | 202 KB | 90 KB | **5.49 MB** (one outlier) |
| **Videos** (`/Trump/Video`) | 31 mp4 | **1.5 GB** | **51 MB** | — | **164 MB** |
| **Menu JSON** (`/api/menu`) | 1 | 50 KB raw / **22.7 KB gzip** | — | — | — |
| **Client bundle** (`client/dist`) | — | 527 KB raw | vendor 224 KB, motion 133 KB, index 104 KB, CSS 65 KB | — | — |

Initial customer load (menu route) ≈ index + vendor + CSS + motion, gzipped on the wire ≈ **~150–180 KB** (hashed → immutable, cached after first visit).

## Per-session weight (derived)
| Component | Per session | Notes |
|---|---|---|
| App bundle | ~180 KB (first visit only) | hashed assets cache indefinitely |
| Menu JSON | ~22 KB | now `Cache-Control: max-age=30` + ETag/304 |
| Images viewed | ~7 MB (≈ 35 cards × 200 KB) | **assumes** a customer scrolls ~35 item images |
| Video played | ~51 MB **if** one is played | poster-first, tap-to-play (not auto-loaded) |

## Bandwidth estimates (1,000 customers/day)
**Assumptions (replace with analytics):** 70% first-time visitors (bundle uncached); each views ~35 images; **25%** play one video.

| Window | Bundle | Menu JSON | Images | Video | **Total** |
|---|---|---|---|---|---|
| **Daily** | ~126 MB | ~22 MB | ~7 GB | ~12.8 GB (250 × 51 MB) | **~20 GB/day** |
| **Monthly** | — | — | — | — | **~600 GB/month** |
| **Peak service** (≈150 customers / 2 h dinner rush; 30% play video) | — | — | ~1 GB | ~2.3 GB | **~3.3 GB / 2 h (~1.7 GB/h)** |

**Images + video are ~99% of bandwidth; video alone is the majority.** The menu JSON and bundle are negligible.

## The risk
All media is served **directly from the Node app server's static middleware on the 1 GB droplet**. Streaming 51 MB videos to multiple concurrent customers (a) consumes the droplet's egress bandwidth, (b) ties up Node's event loop / file handles competing with API serving, and (c) scales with peak diners. This is the bandwidth-side ceiling.

## Recommendations (evidence-based, priority order)
1. **Offload media to object storage + CDN.** DigitalOcean **Spaces + CDN** is already in the stack (Phase 02B backups). Move `/Images` and especially `/Video` (1.5 GB) behind the CDN: removes ~99% of egress + CPU from the droplet, adds edge caching, and is the single highest-impact change. **Justified by the 1.5 GB / 51 MB-avg video footprint.**
2. **Lazy-load images** on the menu (load as cards scroll into view) — caps per-session image transfer to what's actually seen.
3. **Generate thumbnails + serve WebP.** Avg image is 202 KB with **no small variant**; a ~20 KB thumbnail for cards (load full image on tap) is a ~10× reduction. Fix the **5.49 MB outlier** image specifically.
4. **Browser caching for media** — add long `Cache-Control: public, max-age=...immutable` for hashed/static images & video (repeat viewers re-fetch nothing). Hashed bundle assets already cache; images/video need the header.
5. The menu JSON is already handled (Phase 05 cache + `max-age=30` + gzip + ETag) and is trivial.

## Verdict
Bandwidth is dominated by **media, not API**. The platform is bandwidth-safe for the API/menu, but **video served from the droplet is the scaling risk** — move media to Spaces+CDN (already available) before scaling customer volume.
