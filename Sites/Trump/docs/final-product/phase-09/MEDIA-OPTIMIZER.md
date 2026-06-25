# MEDIA-OPTIMIZER.md — Phase 09 (FRP1) Step 4

**Tool:** `scripts/media-optimize.js` · **alias:** `npm run media:optimize` · **Status: ✅ built + validated (video −76%, images→WebP).**
**Purpose:** prepare menu media so it loads fast and cheaply — resize images, convert to WebP, compress video, make thumbnails — and validate every item has usable media. Reduces operational risk + bandwidth (Rule 3). Directly addresses the Phase 05 finding that **video dominates bandwidth** (1.5 GB / 51 MB avg).

---

## Dependency
Uses **ffmpeg** (on PATH) — handles both images (resize + WebP) and video (compress + poster); no native image library needed.

## Usage
```bash
node scripts/media-optimize.js                      # COVERAGE REPORT only (default)
node scripts/media-optimize.js --optimize           # optimize all images + videos (non-destructive)
node scripts/media-optimize.js --optimize --limit 5 # optimize a sample of 5 each
```
**Non-destructive:** originals are never touched. Outputs go to `Images/optimized/`, `Images/thumbnails/`, `Video/optimized/`, `Video/posters/` — review before swapping in.

## What it does
| Action | Detail |
|---|---|
| Coverage report | image/video counts + total size + **oversized images** (> 0.5 MB) + menu-item media check (fallback present?) |
| Resize images | `scale='min(1200,iw)'` (cap width, keep aspect) |
| WebP convert | smaller images at equal quality |
| Thumbnails | 300 px WebP for menu cards (load full image on tap) |
| Compress video | H.264 CRF 28, `+faststart` (web-streamable) |
| Video posters | a 1-frame JPG per video (poster-first, tap-to-play) |

## Validation done this phase (real run)
```
=== Media Coverage ===
  images : 118 files, 22.80MB total, avg 0.19MB
  videos : 26 files, 1499.42MB total
  oversized images (> 0.49MB): 7   (largest: Ice Cream & Bar-One Sauce.png 5.24MB)
  menu items : 439; image fallback present: yes (Tomahawk.jpg)

--optimize (sample):
  images optimized: 2  0.07MB → 0.05MB (29% smaller)
  videos optimized: 2  73.97MB → 17.49MB (76% smaller)
```
**Video compressed ~76%** — extrapolated, the 1.5 GB video set → **~360 MB**. The 7 oversized images (incl. the 5.24 MB outlier the Phase 05 audit flagged) are exactly the candidates to fix.

## Media coverage validation ("every item has usable media")
- Confirms the keyword/category **fallback image is present** (`Tomahawk.jpg`) so **every menu item renders an image** even before each photo is uploaded (via `imageResolver`).
- Flags oversized originals to optimize.
- Cross-checks the menu item count (439) against the media on disk.

## How it fits onboarding + the CDN plan
1. After menu import, run coverage → fix oversized images, fill obvious gaps.
2. `--optimize` → review `optimized/` + `thumbnails/` + `posters/` → swap in.
3. This is the **on-box** optimization; the longer-term **Spaces+CDN offload** ([../phase-05/MEDIA-BANDWIDTH.md](../phase-05/MEDIA-BANDWIDTH.md)) takes the optimized assets off the app server entirely — recommended before scaling.

## Safety
- Read-only on originals; all output to new subfolders.
- Coverage runs without ffmpeg; `--optimize` requires ffmpeg (clear error if absent).
- No core workflow change (Rule 2).
