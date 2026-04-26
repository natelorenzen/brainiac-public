# Brainiac — Architecture

## Overview

```
Browser
  └── Next.js App Router (Vercel)
        ├── Public pages  /  /legal/*  (Server Components)
        ├── Auth pages    /auth/*      (Client Components)
        └── Protected app /dashboard  /account  (gated by proxy.ts)
              └── API Routes
                    ├── /api/analyze/*     Inference dispatch + polling
                    ├── /api/users/me/*    Profile, consent, data export
                    └── /api/oauth/meta/*  Meta Ads OAuth flow

Supabase
  ├── Auth (email/password + session cookies)
  ├── Postgres (profiles, analyses, consents, monthly_budget, connected_accounts)
  └── Storage  creatives (private)  ·  heatmaps (public)

Modal
  ├── BrainiacThumbnailInference  (BERG, CPU)  — thumbnails + landing page screenshots
  └── BrainiacInference           (TRIBE v2, L4 GPU)  — uploaded videos

Anthropic
  └── Claude Haiku — design recommendations via /api/analyze/image-summary

YouTube Data API v3
  └── Channel resolution + video list + view counts
```

## Auth Flow

1. User visits protected route → `src/proxy.ts` redirects to `/auth/login`
2. User logs in → Supabase sets session cookie
3. `proxy.ts` reads cookie → allows access
4. First login → `ConsentGate` blocks UI until 3 consents are recorded

## Inference Flows

### YouTube Channel (thumbnails → BERG)
```
POST /api/analyze/channel
  → YouTube API: resolve handle → 25 video IDs + view counts
  → For each video: insert analyses row → POST to Modal BERG worker (parallel)
  → Return all analysis IDs immediately
Client polls /api/analyze/[id] every 3s until all complete
  → Computes Pearson r per ROI vs log(view_count)
```

### Landing Page (URL → BERG × 2 viewports)
```
POST /api/analyze/webpage
  → Insert 2 analyses rows (desktop + mobile)
  → Fire-and-forget POST to /api/analyze/webpage/capture
  → Return both IDs immediately (< 1s)

/api/analyze/webpage/capture  (maxDuration = 300s, separate Vercel function)
  → Puppeteer: desktop 1280×720 + mobile 390×844 screenshots
  → Upload each to Supabase Storage (creatives bucket)
  → POST each to Modal BERG worker
Client polls both IDs; screenshot appears as soon as input_storage_key is set
```

### Video Upload (MP4 → TRIBE v2)
```
POST /api/analyze/video
  → Upload MP4 to Supabase Storage
  → Insert analyses row → POST to Modal TRIBE v2 worker
  → Return analysis ID immediately
Modal worker runs in background thread, updates analyses row when done
```

## Key Constraints

- **Never** call rate-limited APIs in parallel — sequential + delay
- **Always** `await` Supabase mutations — fire-and-forget silently drops errors
- **Server-only secrets** never touch the browser bundle (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY`)
- `proxy.ts` not `middleware.ts` (Next.js 16 breaking change)
- OAuth tokens encrypted with AES-256-GCM before storage — see `src/lib/encryption.ts`
