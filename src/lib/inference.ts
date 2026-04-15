// Calls the Modal GPU worker via its web endpoint.
// The worker handles: TRIBE v2 inference → heatmap generation → Supabase Storage upload → DB update.
// Next.js fires the request and returns immediately; the worker updates the analyses row when done.

export interface InferenceJobPayload {
  analysis_id: string
  supabase_url: string
  // Provide one of:
  thumbnail_url?: string     // public YouTube thumbnail URL — Modal downloads directly
  storage_key?: string       // key in 'creatives' bucket — for user-uploaded images
}

export async function dispatchInferenceJob(payload: InferenceJobPayload): Promise<void> {
  const modalUrl = process.env.MODAL_INFERENCE_URL
  if (!modalUrl) throw new Error('MODAL_INFERENCE_URL is not configured')

  // Fire-and-forget — Modal worker updates Supabase directly when done.
  // We don't await the inference result here; clients poll /api/analyze/[id].
  const res = await fetch(modalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    // Do not set a short timeout here — the request kicks off the job then returns.
    // Modal web endpoints respond 200 immediately for async functions.
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Modal dispatch failed (${res.status}): ${body}`)
  }
}

export const ATTRIBUTION = {
  model: 'Meta FAIR TRIBE v2',
  license: 'CC-BY-NC-4.0',
  license_url: 'https://creativecommons.org/licenses/by-nc/4.0/',
}
