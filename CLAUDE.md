# Brainiac — Project Context for Claude Code

> Shared patterns: `../../LESSONS.md` | Stack reference: `../../STACK.md`

---

## What This Is

A free, non-commercial YouTube thumbnail brain activation analyzer.
Users enter a YouTube channel handle. The app pulls the 25 most recent videos via the
YouTube Data API, runs each thumbnail through BERG (fmri-nsd-fwrf, CC-BY-NC-4.0) on
Modal CPU workers, then correlates each brain region's activation score against the
video's actual view count — showing which visual signals statistically track with
performance on that specific channel.

The Video Analyzer tab uses Meta FAIR TRIBE v2 (CC-BY-NC-4.0) on Modal GPU workers for
uploaded video files.

**Two Modal workers:**
- `BrainiacThumbnailInference` — BERG, CPU, YouTube thumbnails. Weights in `brainiac-berg-weights` volume.
- `BrainiacInference` — TRIBE v2, L4 GPU, uploaded videos. Weights in `brainiac-tribe-weights` volume.

**No revenue is generated. No performance claims are made. CC-BY-NC-4.0 on both models.**

**Live URL:** https://brainiac-ivory.vercel.app
**GitHub:** https://github.com/natelorenzen/brainiac
**Operator:** Literally Anything LLC

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.1 (App Router) |
| Database & Auth | Supabase (Postgres + RLS + auth.users) |
| Storage | Supabase Storage (bucket: `heatmaps` only — thumbnails now fetched directly from YouTube by Modal) |
| Thumbnail Inference | Modal CPU — BERG fmri-nsd-fwrf (`BrainiacThumbnailInference`) |
| Video Inference | Modal L4 GPU — TRIBE v2 (`BrainiacInference`) |
| Hosting | Vercel |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Language | TypeScript (Next.js) + Python (Modal worker) |

**No Stripe. No Redis. No separate backend. No Cloudflare R2.**

**Note:** Next.js 16 has breaking changes. `middleware.ts` is renamed to `proxy.ts`;
export is `proxy`, not `middleware`.

---

## Environment Variables

All required vars are in `.env.local`. See `.env.example` for full list.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-only, never expose client-side

MODAL_THUMBNAIL_URL=https://natelorenzen--brainiac-thumbnail-inference.modal.run
MODAL_INFERENCE_URL=https://natelorenzen--brainiac-inference.modal.run

ENCRYPTION_KEY=                     # 64-char hex (openssl rand -hex 32)

META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=

YOUTUBE_DATA_API_KEY=               # Required — channel resolution + video list + view counts

NEXT_PUBLIC_APP_URL=
MONTHLY_BUDGET_CAP_USD=300.0
COST_PER_ANALYSIS_USD=0.0002        # BERG CPU inference ~$0.0002/thumbnail (was $0.03 on T4)
CURRENT_LEGAL_VERSION=1.0.0
```

### Modal Secrets

**`brainiac-supabase`** (both workers)
- `SUPABASE_SERVICE_ROLE_KEY`

**`brainiac-hf`** (BrainiacInference / video worker only)
- `HF_TOKEN` — HuggingFace read token (requires LLaMA 3.2-3B access approval from Meta)
- `MOCK_MODE` — set to `true` to use image-statistics fallback, `false` for real TRIBE v2

BERG thumbnail worker reads `MOCK_MODE` from the environment but does **not** require `HF_TOKEN`.

---

## Database Schema

### `profiles` (extends auth.users)
```sql
id, email, daily_count, monthly_count, daily_reset_at, monthly_reset_at,
account_status ('active'|'suspended'|'deleted'), deletion_requested_at, deletion_scheduled_at
```

### `user_consents`
```sql
user_id, consent_type ('terms_of_service'|'privacy_policy'|'data_aggregation'|'ad_account_connection'),
consented_at, ip_address, user_agent, legal_version
```

### `analyses`
```sql
user_id, type ('thumbnail'|'channel_batch'|'ad_creative'),
status ('queued'|'processing'|'complete'|'failed'),
input_storage_key, heatmap_storage_key, heatmap_url,
roi_data (JSONB), mean_top_roi_score, source, error_message
```

### `monthly_budget`
```sql
month (UNIQUE), analyses_run, estimated_cost_usd, budget_cap_usd (300.0), is_exhausted
```

### `connected_accounts`, `ad_creatives`, `creative_performance`
OAuth tokens encrypted at rest with AES-256-GCM. See `src/lib/encryption.ts`.

### `aggregate_signals`
Anonymized only — no user_id, no creative_id. Written after analyses with performance data.

### RPC functions (003_rpc_functions.sql)
- `increment_usage_counts(uid, n)` — atomic daily/monthly counter increment
- `increment_budget(p_month, p_cost, p_count)` — atomic budget increment

---

## Route Map

### Public pages (no auth)
```
/                   Landing page
/auth/login
/auth/signup
/auth/reset-password
/auth/update-password
/legal/terms
/legal/privacy
```

### Authenticated app (gated by proxy.ts)
```
/dashboard          Main analysis UI (upload + YouTube channel)
/account            Settings (data export, deletion, connected accounts)
```

### API routes
```
POST /api/analyze/thumbnail           Upload image → queue inference
GET  /api/analyze/[id]               Poll analysis status
POST /api/analyze/channel            YouTube channel batch analysis
GET  /api/users/me/usage             Daily/monthly cap status
GET  /api/users/me/consent           Check consent status
POST /api/users/me/consent           Record consents
GET  /api/users/me/data-export       Full JSON export (GDPR/CCPA)
DELETE /api/users/me                 Schedule 30-day account deletion
GET  /api/oauth/meta/connect         Get Meta OAuth URL
GET  /api/oauth/meta/callback        Exchange code, store encrypted token
POST /api/oauth/meta/disconnect      Revoke + deactivate account
```

---

## Inference Architecture

### YouTube Channel Analyzer (thumbnails → BERG)

```
User enters @channelhandle
  → YouTube Data API: resolves handle → channel ID
  → YouTube Data API: uploads playlist → 25 most recent video IDs
  → YouTube Data API: batch statistics → view counts for all 25
  → Next.js API validates auth + consent + usage caps
  → All 25 thumbnails dispatched in parallel to MODAL_THUMBNAIL_URL:
      → Supabase: insert analyses row (status: queued → processing)
      → POST { analysis_id, thumbnail_url } to BrainiacThumbnailInference

BrainiacThumbnailInference (BERG, CPU):
  → Downloads thumbnail directly from YouTube CDN URL
  → Center-crops and resizes to 224×224 (no ffmpeg, no video conversion)
  → Runs BERG fmri-nsd-fwrf (subject 1) for 9 ROI models:
      FFA-1, FFA-2, V1, V2, hV4, lateral, PPA, VWFA-1, VWFA-2
  → Aggregates to 6 output ROI keys: FFA, V1_V2, V4, LO, PPA, VWFA
  → Normalizes scores to [0, 1]
  → Generates viridis heatmap overlay using spatial priors
  → Uploads heatmap to Supabase Storage (bucket: heatmaps)
  → Updates analyses row (status: complete, roi_data, heatmap_url)

Client polls all 25 analysis IDs every 3s (parallel)
  → When all settle: computes Pearson r per ROI vs log(view_count)
  → Renders ranked correlation table + scatter chart for top region
```

### Video Analyzer (uploaded videos → TRIBE v2)

```
User uploads MP4 → BrainiacInference (TRIBE v2, L4 GPU)
  → Downloads video from Supabase Storage
  → Strips audio, downsamples to 4 fps
  → Runs TRIBE v2 → (n_timesteps, 20484) vertex activations
  → Extracts 10 ROI scores via Destrieux atlas
  → Generates heatmap, writes results to Supabase
```

### Key architecture decisions
- **Two separate Modal workers**: thumbnails run CPU-only (BERG), videos run on L4 GPU (TRIBE v2).
- **No thumbnail storage**: thumbnails are never stored in Supabase. Modal downloads directly from YouTube CDN.
- **BERG weights in volume**: pre-downloaded once via `download_berg_weights`, loaded at cold start.
- **Static image input**: BERG takes JPEG directly — no ffmpeg, no MP4 conversion needed.
- **6 visual-cortex ROIs** for thumbnails (FFA, V1_V2, V4, LO, PPA, VWFA); 10 full-cortex ROIs for video.

---

## Model Details

### BERG fmri-nsd-fwrf (thumbnail worker)
- **Source**: `github.com/gifale95/BERG`, pip-installable
- **Weights**: public AWS S3 `s3://brain-encoding-response-generator`, cached in `brainiac-berg-weights` Modal volume
- **Input**: `(1, 3, 224, 224)` uint8 numpy array (no GPU required)
- **Output**: per-voxel activation per ROI, averaged to a scalar per ROI key
- **Subject**: hardcoded subject=1 (NSD dataset, 8 subjects available)
- **ROI mapping**: BERG native keys → 6 output keys (FFA, V1_V2, V4, LO, PPA, VWFA)
- **Inference time**: ~5–10 seconds per thumbnail on CPU
- **License**: CC-BY-NC-4.0

### TRIBE v2 (video worker)
- **Source**: `github.com/facebookresearch/tribev2`
- **Weights**: `facebook/tribev2` on HuggingFace, cached in `brainiac-tribe-weights` Modal volume
- **Input**: MP4 video (strips audio, 4fps)
- **Output**: `(n_timesteps, 20484)` — vertex activations on fsaverage5 cortical mesh
- **ROI mapping**: Destrieux atlas → 10 functional regions
- **Inference time**: ~2 minutes per video on L4 GPU
- **License**: CC-BY-NC-4.0

---

## Usage Cap Logic

Hard limits enforced **before** any job is queued:
- **Currently: 10,000/day and 10,000/month** (caps raised for development/testing)
- $300/month global GPU budget
- Batch channel analyses count as N against both caps
- Reset manually: `UPDATE profiles SET daily_count = 0, monthly_count = 0 WHERE email = '...';`

429 responses include `{ reason, limit_type, resets_at }`.

> Restore production caps by setting `DAILY_LIMIT = 10` and `MONTHLY_LIMIT = 50` in `src/lib/usage.ts` before launch.

---

## Modal Worker

```bash
# Deploy
modal deploy modal/inference.py

# Secrets required (Modal dashboard):
#   brainiac-supabase: SUPABASE_SERVICE_ROLE_KEY
#   brainiac-hf: HF_TOKEN, MOCK_MODE

# Endpoint URL (already set in Vercel):
#   https://natelorenzen--brainiac-inference.modal.run
```

---

## Compliance Hardcodes

- `COMMERCIAL_USE_BLOCKED.md` at repo root — do not remove
- Attribution footer required on every results page (see `AttributionFooter` component)
- Attribution in every API response under `attribution` key
- Required disclaimer on every result display
- No Stripe or payment flows while on CC-BY-NC-4.0

**Banned UI strings (never use):**
- "predicts viral" / "guarantees CTR" / "will improve performance"
- "proven to increase views" / "optimize for the algorithm"
- "brain scan" → use "brain activation model" instead

---

## Supabase Storage Buckets

| Bucket | Access | Contents |
|--------|--------|----------|
| `creatives` | Private | Unused for channel batch (kept for single thumbnail upload flow) |
| `heatmaps` | Public | Viridis overlay PNGs generated by Modal |

---

## Conventions

- Next.js 16: `proxy.ts`, export is `proxy` not `middleware`
- Server components (no `'use client'`) for all SEO/public pages
- API routes: `export const dynamic = 'force-dynamic'`
- Always `await` Supabase mutations
- Tailwind v4: use explicit color classes only
- OAuth tokens encrypted with AES-256-GCM before storage
- Commit directly to main — no feature branches or PRs

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Anon key client (client-side) |
| `src/lib/supabase-server.ts` | Service role client (server-side only) |
| `src/lib/usage.ts` | Cap enforcement (daily/monthly/budget) |
| `src/lib/consent.ts` | Consent recording and checking |
| `src/lib/roi.ts` | ROI registry and activation extraction |
| `src/lib/inference.ts` | Modal web endpoint caller (passes thumbnail_url, not storage_key) |
| `src/lib/encryption.ts` | AES-256-GCM for OAuth tokens |
| `src/lib/meta-ads.ts` | Meta Graph API + OAuth state tokens |
| `src/lib/youtube.ts` | YouTube Data API + RSS fallback (channel resolution, video list, view counts) |
| `src/lib/aggregate.ts` | Anonymized signal writer |
| `src/lib/storage.ts` | Supabase Storage wrapper |
| `src/proxy.ts` | Auth middleware |
| `src/components/ConsentGate.tsx` | Blocking consent UI (first login) |
| `src/components/AttributionFooter.tsx` | Required CC-BY-NC-4.0 attribution |
| `src/components/CorrelationResults.tsx` | Ranked ROI correlation table + scatter chart |
| `src/components/ChannelInput.tsx` | YouTube channel handle input |
| `modal/inference.py` | Python GPU worker (real TRIBE v2, @app.cls pattern) |
| `COMMERCIAL_USE_BLOCKED.md` | License enforcement notice |
| `supabase/migrations/001_initial.sql` | profiles, RLS, handle_new_user trigger |
| `supabase/migrations/002_brainiac_schema.sql` | All brainiac tables |
| `supabase/migrations/003_rpc_functions.sql` | increment_usage_counts, increment_budget |

---

## Migrations Applied

| File | Description |
|------|-------------|
| 001_initial.sql | profiles table, RLS, handle_new_user trigger |
| 002_brainiac_schema.sql | user_consents, analyses, monthly_budget, connected_accounts, ad_creatives, creative_performance, aggregate_signals, deletion_log |
| 003_rpc_functions.sql | increment_usage_counts(), increment_budget() RPCs |

---

## What's Been Built

### Core Infrastructure
- [x] Project initialized, deployed to Vercel via GitHub integration
- [x] Supabase connected (auth + profiles + brainiac schema + RLS)
- [x] All 3 migrations applied in Supabase SQL editor
- [x] Supabase Storage buckets created (`creatives` private, `heatmaps` public)
- [x] Auth pages (login, signup, reset, update-password)
- [x] Consent gate (3 explicit checkboxes, versioned, IP-logged)
- [x] Modal GPU worker deployed (`modal deploy modal/inference.py`)
- [x] Modal secrets configured (`brainiac-supabase`, `brainiac-hf`)
- [x] All env vars set in Vercel (Supabase, Modal, YouTube, Encryption)
- [x] Legal pages (terms, privacy — need lawyer review before public launch)
- [x] COMMERCIAL_USE_BLOCKED.md

### YouTube Correlation Analyzer
- [x] YouTube Data API integration — channel resolution, video list, batch view count fetch
- [x] RSS fallback for channels without API key (15-video limit)
- [x] Channel analysis API route — parallel dispatch of 25 jobs, returns in ~5s
- [x] Batch polling — client polls all 25 analysis IDs in parallel with progress bar
- [x] Pearson correlation engine — computes r per ROI vs log(view_count)
- [x] CorrelationResults component — ranked table with directional bars + scatter chart
- [x] Quota warning surfaced when batch is capped by usage limits

### Real TRIBE v2 Inference (completed)
- [x] TRIBE v2 installed from GitHub in Modal image
- [x] HuggingFace token + LLaMA 3.2-3B access configured
- [x] ROI vertex map built from Destrieux atlas at container startup
- [x] Thumbnail → 4-second MP4 conversion via ffmpeg
- [x] Real fMRI vertex activations: (4, 20484) shape, 0% NaN
- [x] ROI scores extracted and written to Supabase (all 25 completing successfully)
- [x] Heatmaps generated and uploaded
- [x] Fire-and-forget endpoint (returns immediately, inference runs in background thread)
- [x] Modal downloads thumbnails directly from YouTube — no Supabase storage upload needed

### Pending Before Public Launch
- [ ] **Fix UI: site shows "channel analysis failed" due to 504 timeout on channel route** (parallel pipeline deployed, needs verification after latest Vercel build)
- [ ] Fix PPA (Scene Recognition) scoring 0 — investigate Destrieux atlas vertex mapping
- [ ] Restore production usage caps: `DAILY_LIMIT = 10`, `MONTHLY_LIMIT = 50` in `src/lib/usage.ts`
- [ ] Lawyer review of Terms + Privacy pages
- [ ] Remove debug fields from channel API response (`can_run`, `daily_count`, `loop_error`, etc.)
- [ ] Set live domain in CLAUDE.md and Vercel
- [ ] Slide deck PDF analyzer — each slide → TRIBE v2 → mental load score per slide (next feature)
