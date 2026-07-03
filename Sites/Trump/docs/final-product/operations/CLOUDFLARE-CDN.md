# CLOUDFLARE-CDN.md — enabling Cloudflare on emenyu.com (operator runbook)

**Status: NOT YET ENABLED — this is the procedure for when you flip it on. DNS changes are yours to make; nothing in the codebase or on the box needs to change first.**

The origin is already CDN-friendly (2026-07-03 media work): images/video/uploads are served
directly by nginx from disk with `Cache-Control: public, max-age=2592000, immutable`, all
menu images are ≤1600px WebP/JPEG (~50–100 KB) with 300px thumbnails, and the app cleanly
separates cacheable media paths from API/socket paths.

---

## 1. Add the site
1. Cloudflare dashboard → **Add a site** → `emenyu.com` → Free plan is sufficient to start.
2. Cloudflare scans existing DNS records. Verify it found: `emenyu.com` A → `134.122.99.78`
   and `www` (same target). Add anything missing manually.
3. Leave both records **Proxied** (orange cloud) — that's what enables the CDN.

## 2. Switch nameservers (the only DNS change)
At your registrar, replace the current nameservers with the two Cloudflare assigns
(e.g. `xxx.ns.cloudflare.com` / `yyy.ns.cloudflare.com`). Propagation: minutes to ~24 h.
Nothing on the droplet changes; TLS keeps working (see §5).

## 3. Cache rule for Trump media
Dashboard → **Caching → Cache Rules → Create rule**, name `trump-media-cache-everything`:

- **When incoming requests match** (custom filter expression):
  ```
  (starts_with(http.request.uri.path, "/Trump/Images/"))
  or (starts_with(http.request.uri.path, "/Trump/uploads/"))
  or (starts_with(http.request.uri.path, "/Trump/Video/"))
  ```
- **Then:**
  - Cache eligibility: **Eligible for cache** ("Cache Everything").
  - **Edge Cache TTL: 1 month** — matches the origin's `max-age=2592000, immutable`.
    (Respecting origin headers also works; setting it explicitly survives origin mistakes.)
  - Browser TTL: **Respect origin** (origin already sends 30d immutable).

## 4. Image optimization toggles (plan-dependent)
- **Speed → Optimization → Image Optimization → Polish**: enable **Lossy** + **WebP**
  if the plan offers it (Pro+). Origin already serves WebP, so Polish is a bonus for the
  remaining JPEGs, not a requirement.
- **Speed → Optimization**: Brotli **on** (helps HTML/JSON/JS; images are already compressed).

## 5. TLS mode
**SSL/TLS → Overview → Full (strict)** — the origin has a valid Let's Encrypt cert for
emenyu.com, so strict works immediately. Do NOT use "Flexible" (it would talk HTTP to the
origin, which redirects to HTTPS → redirect loop).

> Let's Encrypt renewal: certbot's HTTP-01 challenge (`/.well-known/acme-challenge/`) still
> works through Cloudflare's proxy over port 80. If a renewal ever fails, temporarily
> grey-cloud the A record, renew, re-enable.

## 6. What must NOT be cached (verify, don't assume)
Cloudflare's default is to cache only static file extensions, so dynamic paths are safe by
default — the rule in §3 is the only "cache everything" carve-out. Explicitly confirm these
stay UNCACHED and un-tampered:

| Path | Why |
|---|---|
| `/Trump/api/*` (and `/trump/api/*`) | menu JSON (30s origin cache), orders, auth, config — must always hit origin |
| `/Trump/api/auth/*`, cookies `trump_session` | auth — never cache; Cloudflare bypasses cache on cookies by default only for HTML; the §3 rule must not match these paths (it doesn't) |
| `/Trump/socket.io/*` | WebSocket — Cloudflare proxies WS fine (Network → WebSockets: **On**); never cached |
| `/healthz`, `/readyz` | monitoring probes should reflect origin truth |
| `/Trump/Admin`, `/Trump/waiter`, SPA HTML routes | HTML must stay fresh (deploys) — default: not cached |

If in doubt add a second Cache Rule *above* §3: match `starts_with(..., "/Trump/api/")` →
**Bypass cache**.

## 7. Purging after media changes
Replacing an image file in place (same URL) requires a purge to show up within the month:
- **Caching → Purge Cache → Custom purge** → paste the exact URLs
  (e.g. `https://emenyu.com/Trump/Images/mixed_grill.webp` + its `thumbnails/` twin), or
- purge the prefixes `emenyu.com/Trump/Images/*` (prefix purge needs a paid plan; Free plan
  can purge individual URLs or everything).
The admin upload flow generates a NEW timestamped filename per upload, so uploaded media
never needs purging — only hand-replaced files in `Images/` do.

## 8. Verification after enabling
```bash
# proxied + cached: expect cf-cache-status HIT on the 2nd request
curl -sI https://emenyu.com/Trump/Images/thumbnails/mixed_grill.webp | grep -iE "cf-cache-status|cache-control|server"
# API must be DYNAMIC/BYPASS, never HIT
curl -sI https://emenyu.com/Trump/api/config | grep -iE "cf-cache-status|server"
# sockets still connect (browser: waiter app join; or check for 101 upgrade in devtools)
```
Success = media `cf-cache-status: HIT`, API `DYNAMIC`, menu + ordering + waiter app all
behave normally, droplet egress for media ≈ 0 after warm-up.

## Rollback
Grey-cloud (DNS-only) the A records in Cloudflare — traffic goes straight to the droplet
again within minutes. Nothing on the box depends on Cloudflare being present.
