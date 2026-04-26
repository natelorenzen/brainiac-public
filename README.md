# Brainiac

**Brain activation analysis for visual content.** Brainiac uses peer-reviewed fMRI encoding models to predict how the human visual cortex responds to thumbnails, landing pages, and videos — then gives actionable design recommendations grounded in the neuroscience data.

Free, non-commercial, open source. Powered by [BERG](https://github.com/gifale95/BERG) and [Meta FAIR TRIBE v2](https://github.com/facebookresearch/tribev2), both CC-BY-NC-4.0.

> **Non-commercial research use only.** This repository is published for research and educational purposes. The underlying models (BERG and Meta FAIR TRIBE v2) are licensed under CC-BY-NC-4.0, which prohibits commercial use. This codebase is not designed, tested, or licensed for commercial deployment. Do not use it to generate revenue, charge users, or integrate into commercial products without first obtaining appropriate commercial licenses from the respective model authors.

---

## What it does

### YouTube Channel Analyzer

Enter any channel handle. Brainiac pulls the 25 most recent videos, runs each thumbnail through the BERG brain encoding model, then computes Pearson correlations between each brain region's predicted activation and the video's actual view count. The result: a ranked table showing which visual signals statistically track with performance on *that specific channel*.

![YouTube Channel Analyzer — dark mode](docs/screenshots/channel-dark.png)

Click any thumbnail to see its individual brain activation breakdown across all six visual cortex regions.

![Individual thumbnail brain activation scores](docs/screenshots/thumbnail-modal.png)

Dark and light mode supported throughout.

![YouTube Channel Analyzer — light mode](docs/screenshots/channel-light.png)

---

### Landing Page Analyzer

Enter any public URL. Brainiac screenshots it at desktop (1280×720) and mobile (390×844) above the fold using headless Chromium, suppresses cookie banners and popups automatically, then runs each screenshot through BERG independently. You get separate brain activation scores and viewport-specific design recommendations for both.

![Landing Page Analyzer](docs/screenshots/landing-page.png)

---

### Video Analyzer

Upload an MP4. Meta FAIR TRIBE v2 — a full-cortex fMRI encoding model trained on the Natural Scenes Dataset — predicts neural activation across 10 brain regions as the video plays, second by second. Brainiac surfaces engagement dip timestamps, a viridis heatmap overlay, a time-series activation chart, and AI-generated editing recommendations.

![Video Analyzer](docs/screenshots/video-analyzer.png)

---

## How the models work

Brainiac doesn't use engagement heuristics or audience behavior data. It uses models trained on real fMRI recordings from people viewing thousands of images and videos. Those models learn to predict which brain regions activate in response to visual input.

| Model | Input | Output | Regions |
|-------|-------|--------|---------|
| [BERG fmri-nsd-fwrf](https://github.com/gifale95/BERG) | Static image (224×224) | 6 visual-cortex ROI scores | Face Detection, Scene Recognition, Object Recognition, Color & Form, Low-Level Signal, Text Processing |
| [Meta FAIR TRIBE v2](https://github.com/facebookresearch/tribev2) | MP4 video | 10 full-cortex ROI scores × time | Face Detection, Text Processing, Object Recognition, Color & Form, Audio-Visual Association, Low-Level Visual Signal, Spatial Attention, Social & Motion Cues, Default Mode Network, Scene Recognition |

Scores are normalized 0–1. Higher means stronger predicted neural response in that region. No score is inherently better or worse — the channel correlation analysis is what makes them actionable.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Database & Auth | Supabase (Postgres + RLS + Storage) |
| Inference | Modal (CPU worker for BERG, GPU L4 for TRIBE v2) |
| AI recommendations | Anthropic Claude Haiku |
| Screenshots | Puppeteer + `@sparticuz/chromium` |
| Hosting | Vercel |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Language | TypeScript + Python |

---

## Self-hosting

### Prerequisites

- Node.js 20+
- Python 3.11+
- [Supabase](https://supabase.com) project (free tier works)
- [Modal](https://modal.com) account (CPU usage for BERG is cheap; GPU L4 billed per-second for video)
- [Anthropic API key](https://console.anthropic.com) for AI recommendations
- [HuggingFace account](https://huggingface.co) with a read token — required for the TRIBE v2 video worker. You must also request access to [meta-llama/Llama-3.2-3B](https://huggingface.co/meta-llama/Llama-3.2-3B) from Meta on HuggingFace (approval is typically automatic but required). The BERG thumbnail worker does **not** need HuggingFace.
- YouTube Data API v3 key (optional — enables view count correlation; without it, channel analysis uses RSS with a 15-video cap)

### 1. Clone and install

```bash
git clone https://github.com/your-org/brainiac-public.git
cd brainiac-public
npm install
pip install modal
```

### 2. Supabase setup

1. Create a new Supabase project
2. Run the migrations in order in the Supabase SQL editor:
   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_brainiac_schema.sql`
   - `supabase/migrations/003_rpc_functions.sql`
3. Create two storage buckets:
   - `creatives` — private (landing page screenshots)
   - `heatmaps` — public (BERG and TRIBE v2 heatmap overlays)

### 3. Modal setup

```bash
# Authenticate with Modal
modal token new

# Create two secrets in the Modal dashboard (https://modal.com/secrets):
#
#   "your-app-supabase"  →  SUPABASE_SERVICE_ROLE_KEY   (used by both workers)
#
#   "your-app-hf"        →  HF_TOKEN    your HuggingFace read token
#                            MOCK_MODE   set to "false" for real TRIBE v2 inference,
#                                        or "true" to use an image-statistics fallback
#                                        if you don't have LLaMA 3.2-3B access yet
#                            (video worker only — BERG does not need HuggingFace)

# One-time: download BERG weights (~2 GB) into a Modal volume
modal run modal/inference.py::download_berg_weights

# Deploy both workers
modal deploy modal/inference.py
```

> **Note:** The Modal worker file uses `brainiac-` prefixed volume and secret names by default. Search for `brainiac-supabase`, `brainiac-hf`, `brainiac-berg-weights`, and `brainiac-tribe-weights` in `modal/inference.py` and replace with your own names to match what you created in the Modal dashboard.

Copy the two endpoint URLs shown in the Modal dashboard after deployment — you'll need them for the next step.

### 4. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `MODAL_THUMBNAIL_URL` | BERG worker endpoint (from Modal dashboard) |
| `MODAL_INFERENCE_URL` | TRIBE v2 worker endpoint (from Modal dashboard) |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` — used for OAuth tokens at rest |
| `ANTHROPIC_API_KEY` | Anthropic API key for design recommendations |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL, e.g. `https://yourapp.vercel.app` |
| `YOUTUBE_DATA_API_KEY` | Optional — enables view count enrichment and 25-video batches |
| `MONTHLY_BUDGET_CAP_USD` | Global GPU spend cap (default: `300.0`) |

**Modal secrets** (set in the [Modal dashboard](https://modal.com/secrets), not in `.env.local`):

| Secret name | Key | Value |
|-------------|-----|-------|
| `your-app-supabase` | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `your-app-hf` | `HF_TOKEN` | HuggingFace read token (requires LLaMA 3.2-3B access) |
| `your-app-hf` | `MOCK_MODE` | `"false"` for real TRIBE v2, `"true"` to use stats fallback |

### 5. Run locally

```bash
npm run dev
```

### 6. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/brainiac-public)

Set all variables from `.env.example` in the Vercel dashboard before deploying.

---

## Architecture

```
YouTube Channel
  └── YouTube Data API → 25 thumbnail URLs dispatched in parallel
        └── Modal CPU (BERG) → 6 ROI scores + heatmap → Supabase
              └── Client: Pearson r per ROI vs log(view_count)

Landing Page URL
  └── Next.js API → fire-and-forget to /api/analyze/webpage/capture
        └── Puppeteer (Vercel, maxDuration=300s)
              ├── Desktop screenshot (1280×720)
              └── Mobile screenshot (390×844, iPhone UA)
                    └── Each → Modal CPU (BERG) → scores + heatmap

MP4 Upload
  └── Supabase Storage
        └── Modal GPU L4 (TRIBE v2) → 10 ROI scores × time + heatmap
```

The landing page analyzer uses a fire-and-forget self-invocation pattern: the main route returns analysis IDs in under a second; a separate Vercel function with a 300-second timeout does the heavy Chromium + inference work. The client polls both IDs every 3 seconds and shows the screenshot as soon as it's available, before BERG finishes.

---

## Usage limits

Development caps are set high in `src/lib/usage.ts`. Lower these before a public deployment:

```typescript
const DAILY_LIMIT = 10     // per user per day
const MONTHLY_LIMIT = 50   // per user per month
```

Global GPU budget is enforced via `MONTHLY_BUDGET_CAP_USD`. The 429 response includes `{ reason, limit_type, resets_at }`.

---

## Legal pages

`src/app/legal/terms/page.tsx` and `src/app/legal/privacy/page.tsx` are content briefs — not lawyer-reviewed. Replace `[YOUR COMPANY NAME]` and `[EMAIL]` throughout, and have a lawyer draft the final versions before any public launch.

---

## License

Application code: **MIT** — see `LICENSE`.

The BERG and TRIBE v2 model weights are **CC-BY-NC-4.0**. Non-commercial use only. Attribution required on every results page (see `src/components/AttributionFooter.tsx`). See `COMMERCIAL_USE_BLOCKED.md` for details.
