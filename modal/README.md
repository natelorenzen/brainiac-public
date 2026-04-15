# Brainiac — Modal GPU Worker

## Setup

1. Install Modal: `pip install modal`
2. Authenticate: `modal token new`
3. Create secret in Modal dashboard named `brainiac-supabase` with:
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key
4. Create secret in Modal dashboard named `brainiac-hf` with:
   - `HF_TOKEN` = your HuggingFace read token (requires LLaMA 3.2-3B access approval)
5. Deploy: `modal deploy modal/inference.py`
6. Copy the web endpoint URL from the Modal dashboard (it will change from the old function-based URL)
7. Update `MODAL_INFERENCE_URL` in Vercel env vars with the new URL

## MOCK_MODE

Set `MOCK_MODE=true` in your Modal environment to run with image-statistics scores
instead of real TRIBE v2 inference. Useful while waiting for HuggingFace access approval.
Add it as a key in the `brainiac-hf` secret or as a Modal env var override.

## How it works

- Next.js API routes POST to the Modal web endpoint with `{ analysis_id, storage_key, supabase_url }`
- The endpoint runs on a T4 GPU, loads TRIBE v2 from HuggingFace (cached in a Modal volume)
- Inference runs → heatmap is generated → both are written back to Supabase
- The analyses row status is updated to `complete`; the Next.js client polls for this

## Model weights

TRIBE v2 weights are downloaded from HuggingFace on first run and cached in the
`brainiac-tribe-weights` Modal volume. Subsequent cold starts reuse the cached weights.

## License

TRIBE v2 is licensed under CC-BY-NC-4.0. See `COMMERCIAL_USE_BLOCKED.md` at repo root.
