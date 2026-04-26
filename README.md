# Brainiac

Brain activation analysis for visual content — thumbnails, landing pages, and videos.

---

## What it does

- **YouTube Channel Analyzer** — Enter a channel handle. Pulls the 25 most recent videos, runs each thumbnail through BERG (a neural encoding model trained on fMRI data), then correlates each brain region's activation score against actual view counts. Shows which visual signals statistically track with performance on that specific channel.

- **Landing Page Analyzer** — Enter any public URL. Screenshots desktop (1280×720) and mobile (390×844) above the fold, runs each through BERG, and gives separate brain activation scores and design recommendations for each viewport.

- **Video Analyzer** — Upload an MP4. Runs it through Meta FAIR TRIBE v2, which predicts full-cortex fMRI responses to the video and returns 10 ROI scores across visual and association cortex regions.

All results include AI-generated design recommendations grounded in the activation scores.

---

## Models

| Model | Worker | License |
|-------|--------|---------|
| [BERG fmri-nsd-fwrf](https://github.com/gifale95/BERG) | Modal CPU (`BrainiacThumbnailInference`) | CC-BY-NC-4.0 |
| [Meta FAIR TRIBE v2](https://github.com/facebookresearch/tribev2) | Modal GPU L4 (`BrainiacInference`) | CC-BY-NC-4.0 |

**Both models are CC-BY-NC-4.0. This project is non-commercial.** See `COMMERCIAL_USE_BLOCKED.md`.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Database & Auth | Supabase (Postgres + RLS + Storage) |
| Inference | Modal (CPU worker for BERG, GPU L4 for TRIBE v2) |
| AI recommendations | Anthropic Claude (Haiku) |
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
- [Modal](https://modal.com) account (free tier works for BERG; GPU usage billed per-second)
- [Anthropic API key](https://console.anthropic.com) for design recommendations
- YouTube Data API v3 key (optional — enables view count correlation)

### 1. Clone and install

```bash
git clone https://github.com/your-org/brainiac.git
cd brainiac
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
   - `creatives` — private
   - `heatmaps` — public

### 3. Modal setup

```bash
# Authenticate
modal token new

# Configure secrets in Modal dashboard (https://modal.com/secrets):
#   "your-app-supabase":  SUPABASE_SERVICE_ROLE_KEY
#   "your-app-hf":        HF_TOKEN, MOCK_MODE

# Download BERG weights (one-time, ~2 GB)
modal run modal/inference.py::download_berg_weights

# Deploy both workers
modal deploy modal/inference.py
```

> The Modal worker references volume names and secret names that contain `brainiac-` by default. Update these in `modal/inference.py` to match your own Modal secret/volume names.

Copy the endpoint URLs from the Modal dashboard after deployment.

### 4. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`. The required variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `MODAL_THUMBNAIL_URL` | BERG worker endpoint from Modal dashboard |
| `MODAL_INFERENCE_URL` | TRIBE v2 worker endpoint from Modal dashboard |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL (e.g. `https://yourapp.vercel.app`) |
| `YOUTUBE_DATA_API_KEY` | Optional — enables view count enrichment |

### 5. Run locally

```bash
npm run dev
```

### 6. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/brainiac)

Add all environment variables from `.env.example` in the Vercel dashboard.

---

## Architecture

```
User input
  ├── YouTube handle → YouTube Data API → 25 thumbnails dispatched in parallel
  │     └── Modal CPU: BERG → 6 ROI scores + heatmap → Supabase
  │
  ├── URL → Next.js API → fire-and-forget to /capture route
  │     └── Puppeteer: desktop + mobile screenshots → Supabase Storage
  │           └── Modal CPU: BERG → scores + heatmap (per viewport)
  │
  └── MP4 upload → Supabase Storage
        └── Modal GPU (L4): TRIBE v2 → 10 ROI scores + heatmap → Supabase

Client polls analysis IDs every 3s until complete.
```

---

## Usage limits

Default caps in `src/lib/usage.ts` are set high for development. Before a public launch, lower them:

```typescript
const DAILY_LIMIT = 10     // per user
const MONTHLY_LIMIT = 50   // per user
```

Global GPU budget is controlled by `MONTHLY_BUDGET_CAP_USD` in your environment.

---

## License

Application code: MIT — see `LICENSE`.

The BERG and TRIBE v2 model weights are **CC-BY-NC-4.0**. Non-commercial use only. Attribution required. See `COMMERCIAL_USE_BLOCKED.md` for details.
