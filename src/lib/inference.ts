// Modal worker dispatch helpers.
//
// Two workers, two endpoints:
//   dispatchThumbnailJob  → BrainiacThumbnailInference (BERG, CPU)  — YouTube static thumbnails
//   dispatchInferenceJob  → BrainiacInference (TRIBE v2, GPU)        — uploaded videos

export interface ThumbnailJobPayload {
  analysis_id: string
  supabase_url: string
  thumbnail_url?: string  // public YouTube CDN URL
  storage_key?: string    // key in 'creatives' bucket (manual uploads)
}

export interface VideoJobPayload {
  analysis_id: string
  supabase_url: string
  content_type: 'video'
  storage_key: string     // key in 'videos' bucket
}

async function _dispatch(url: string, payload: object, label: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${label} dispatch failed (${res.status}): ${body}`)
  }
}

/** YouTube thumbnail analysis — BERG CPU worker. */
export async function dispatchThumbnailJob(payload: ThumbnailJobPayload): Promise<void> {
  const url = process.env.MODAL_THUMBNAIL_URL
  if (!url) throw new Error('MODAL_THUMBNAIL_URL is not configured')
  await _dispatch(url, payload, 'BERG thumbnail')
}

/** Uploaded video analysis — TRIBE v2 GPU worker. */
export async function dispatchInferenceJob(payload: VideoJobPayload): Promise<void> {
  const url = process.env.MODAL_INFERENCE_URL
  if (!url) throw new Error('MODAL_INFERENCE_URL is not configured')
  await _dispatch(url, payload, 'TRIBE v2 video')
}

export const ATTRIBUTION = {
  model: 'BERG fmri-nsd-fwrf (Gifale et al.) via Natural Scenes Dataset',
  license: 'CC-BY-NC-4.0',
  license_url: 'https://creativecommons.org/licenses/by-nc/4.0/',
}

export const VIDEO_ATTRIBUTION = {
  model: 'Meta FAIR TRIBE v2',
  license: 'CC-BY-NC-4.0',
  license_url: 'https://creativecommons.org/licenses/by-nc/4.0/',
}
