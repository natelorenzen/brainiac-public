// Modal worker dispatch helper for BERG thumbnail inference.

export interface ThumbnailJobPayload {
  analysis_id: string
  supabase_url: string
  thumbnail_url?: string  // public CDN URL
  storage_key?: string    // key in 'creatives' bucket (manual uploads)
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

/** Static ad image analysis — BERG CPU worker. */
export async function dispatchThumbnailJob(payload: ThumbnailJobPayload): Promise<void> {
  const url = process.env.MODAL_THUMBNAIL_URL
  if (!url) throw new Error('MODAL_THUMBNAIL_URL is not configured')
  await _dispatch(url, payload, 'BERG thumbnail')
}

export const ATTRIBUTION = {
  model: 'BERG fmri-nsd-fwrf (Gifale et al.) via Natural Scenes Dataset',
  license: 'CC-BY-NC-4.0',
  license_url: 'https://creativecommons.org/licenses/by-nc/4.0/',
}
