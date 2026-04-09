// YouTube RSS thumbnail fetcher — no API key required for thumbnail URLs.
// View count enrichment: parsed from RSS <media:statistics> and optionally
// enriched via YouTube Data API v3 (YOUTUBE_DATA_API_KEY) for accuracy.

export interface YTVideoMeta {
  video_id: string
  title: string
  published: string
  view_count: number | null
  thumbnail_url: string
}

export async function fetchChannelThumbnails(
  channelHandle: string,
  count: number
): Promise<Array<YTVideoMeta & { thumbnail_bytes: Buffer }>> {
  const channelId = await resolveChannelId(channelHandle)
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`

  const feedRes = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brainiac/1.0)' },
  })
  if (!feedRes.ok) throw new Error(`YouTube feed fetch failed: ${feedRes.status}`)

  const xml = await feedRes.text()
  const videos = parseYouTubeFeed(xml, count)

  // Optionally enrich view counts via YouTube Data API v3 for accuracy
  const enriched = await enrichViewCounts(videos)

  const results: Array<YTVideoMeta & { thumbnail_bytes: Buffer }> = []

  for (const video of enriched) {
    try {
      const thumbnail_bytes = await fetchThumbnailBytes(video.video_id)
      results.push({ ...video, thumbnail_bytes })
    } catch {
      continue
    }
  }

  return results
}

async function enrichViewCounts(videos: YTVideoMeta[]): Promise<YTVideoMeta[]> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY
  if (!apiKey || videos.length === 0) return videos

  try {
    const ids = videos.map(v => v.video_id).join(',')
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${apiKey}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brainiac/1.0)' } }
    )
    if (!res.ok) return videos

    const data = await res.json() as { items?: { id: string; statistics?: { viewCount?: string } }[] }
    const countMap = new Map<string, number>()
    for (const item of data.items ?? []) {
      const vc = parseInt(item.statistics?.viewCount ?? '', 10)
      if (!isNaN(vc)) countMap.set(item.id, vc)
    }

    return videos.map(v => ({
      ...v,
      view_count: countMap.get(v.video_id) ?? v.view_count,
    }))
  } catch {
    return videos
  }
}

async function resolveChannelId(handle: string): Promise<string> {
  const cleaned = handle.replace(/^@/, '').trim()

  // Already a raw channel ID (UC + 22 chars)
  if (/^UC[\w-]{22}$/.test(cleaned)) return cleaned

  const UA = 'Mozilla/5.0 (compatible; Brainiac/1.0)'

  // Strategy 1: RSS ?user= endpoint — free, no API key, works for most channels
  // that have a legacy username (which includes nearly all large channels).
  // The feed XML contains <yt:channelId> even on a 404-free channel page.
  try {
    const rssRes = await fetch(
      `https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(cleaned)}`,
      { headers: { 'User-Agent': UA } }
    )
    if (rssRes.ok) {
      const xml = await rssRes.text()
      const m = xml.match(/<yt:channelId>(UC[\w-]{22})<\/yt:channelId>/)
      if (m) return m[1]
    }
  } catch { /* fall through */ }

  // Strategy 2: YouTube Data API v3 (requires YOUTUBE_DATA_API_KEY env var)
  const apiKey = process.env.YOUTUBE_DATA_API_KEY
  if (apiKey) {
    try {
      const apiRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent('@' + cleaned)}&key=${apiKey}`,
        { headers: { 'User-Agent': UA } }
      )
      if (apiRes.ok) {
        const data = await apiRes.json() as { items?: { id: string }[] }
        const id = data.items?.[0]?.id
        if (id) return id
      }
    } catch { /* fall through */ }
  }

  throw new Error(
    `Could not resolve YouTube channel "@${cleaned}". ` +
    `Try entering the channel ID directly (e.g. UCgoFStVyEsm8tBZP5NC-aBQ). ` +
    `You can find it at youtube.com/@${cleaned}/about.`
  )
}

function parseYouTubeFeed(xml: string, count: number): YTVideoMeta[] {
  const entries: YTVideoMeta[] = []

  // Simple regex-based RSS parser — no xml2js needed
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let match: RegExpExecArray | null

  while ((match = entryRegex.exec(xml)) !== null && entries.length < count) {
    const entry = match[1]
    const videoIdMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)
    const titleMatch = entry.match(/<title>(.*?)<\/title>/)
    const publishedMatch = entry.match(/<published>(.*?)<\/published>/)
    const viewCountMatch = entry.match(/<media:statistics\s+views="(\d+)"/)

    if (videoIdMatch && titleMatch) {
      const video_id = videoIdMatch[1]
      entries.push({
        video_id,
        title: titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
        published: publishedMatch?.[1] ?? '',
        view_count: viewCountMatch ? parseInt(viewCountMatch[1], 10) : null,
        thumbnail_url: `https://img.youtube.com/vi/${video_id}/hqdefault.jpg`,
      })
    }
  }

  return entries
}

async function fetchThumbnailBytes(videoId: string): Promise<Buffer> {
  const urls = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
  ]

  for (const url of urls) {
    const res = await fetch(url)
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > 5000) return buf
    }
  }

  throw new Error(`No thumbnail found for video ${videoId}`)
}
