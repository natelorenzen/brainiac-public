# API Integration Notes

> Before adding any external API, document it here: auth method, rate limits, gotchas.

---

## Supabase

- **Client (browser):** anon key — respects RLS
- **Server (API routes):** service role key — bypasses RLS; never expose to browser
- **Migrations:** apply via Supabase SQL editor; keep files in `supabase/migrations/`

## Modal

- **Thumbnail worker:** `MODAL_THUMBNAIL_URL` — BERG CPU inference, ~5–10s per image
- **Video worker:** `MODAL_INFERENCE_URL` — TRIBE v2 GPU inference, ~2 min per video
- **Auth:** internal secret header (`x-internal-secret: SUPABASE_SERVICE_ROLE_KEY`) on the capture route; Modal endpoints are public URLs secured only by obscurity — keep them in env vars
- **Gotcha:** Modal cold starts add ~10–30s on first request after inactivity

## Anthropic

- **Used for:** design recommendations in `/api/analyze/image-summary`
- **Model:** `claude-haiku-4-5-20251001` — cheap, fast, sufficient for bullet-point suggestions
- **Auth:** `ANTHROPIC_API_KEY` in server env; never expose to browser
- **Proxy through server** — never call Anthropic directly from the browser

## YouTube Data API v3

- **Used for:** channel resolution, video list, batch view count fetch
- **Auth:** `YOUTUBE_DATA_API_KEY` — simple API key, no OAuth
- **Rate limits:** 10,000 quota units/day on free tier; a channel batch costs ~150 units
- **Fallback:** RSS feed used when API key is absent (15-video cap, no view counts)
- **Gotcha:** Shorts must be filtered manually — the API does not exclude them

## Meta OAuth (optional)

- **Used for:** connecting Meta Ads accounts to pull creative performance data
- **Auth:** standard OAuth2 — tokens encrypted at rest with AES-256-GCM (`src/lib/encryption.ts`)
- **Scopes needed:** `ads_read`, `read_insights`
- **Gotcha:** long-lived tokens expire after 60 days — handle refresh or prompt reconnect

---

## Adding a New API

When integrating a new external API, add a section here covering:
1. Auth method and where credentials live
2. Rate limits and quota reset schedule
3. Any known gotchas (encoding issues, content-type requirements, silent failures)
4. Whether to call directly from client or proxy through server
