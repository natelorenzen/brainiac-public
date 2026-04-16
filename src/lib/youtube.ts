// YouTube video fetcher.
// With YOUTUBE_DATA_API_KEY: uses playlistItems + videos API (up to 50 videos, accurate view counts).
// Without: falls back to RSS feed (hard-capped at 15 videos, view counts from media:statistics).

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
): Promise<YTVideoMeta[]> {
  const channelId = await resolveChannelId(channelHandle)
  const apiKey = process.env.YOUTUBE_DATA_API_KEY

  return apiKey
    ? await fetchVideosViaAPI(channelId, count, apiKey)
    : await fetchVideosViaRSS(channelId, count)
}

// ── YouTube Data API path (preferred) ────────────────────────────────────────
// Costs 3 quota units per call: channels.list (1) + playlistItems.list (1) + videos.list (1).
// Free tier: 10,000 units/day → ~3,333 channel analyses/day.

async function fetchVideosViaAPI(
  channelId: string,
  count: number,
  apiKey: string
): Promise<YTVideoMeta[]> {
  const UA = 'Mozilla/5.0 (compatible; Brainiac/1.0)'

  // Step 1: get uploads playlist ID
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`,
    { headers: { 'User-Agent': UA } }
  )
  if (!channelRes.ok) throw new Error(`YouTube channels API failed: ${channelRes.status}`)
  const channelData = await channelRes.json() as {
    items?: { contentDetails: { relatedPlaylists: { uploads: string } } }[]
  }
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploadsPlaylistId) throw new Error('Could not find uploads playlist for this channel')

  // Step 2: fetch more than needed up-front so we have enough after filtering Shorts.
  // Shorts are ≤ 60s — fetching 2× the requested count gives headroom.
  const fetchCount = Math.min(count * 2, 50)
  const playlistRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${fetchCount}&key=${apiKey}`,
    { headers: { 'User-Agent': UA } }
  )
  if (!playlistRes.ok) throw new Error(`YouTube playlistItems API failed: ${playlistRes.status}`)
  const playlistData = await playlistRes.json() as {
    items?: { contentDetails: { videoId: string; videoPublishedAt: string } }[]
  }
  const items = playlistData.items ?? []
  if (items.length === 0) throw new Error('No videos found in uploads playlist')

  const videoIds = items.map(i => i.contentDetails.videoId).join(',')

  // Step 3: batch-fetch statistics + snippet + contentDetails (for duration + aspect ratio filtering)
  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${videoIds}&key=${apiKey}`,
    { headers: { 'User-Agent': UA } }
  )
  if (!statsRes.ok) throw new Error(`YouTube videos API failed: ${statsRes.status}`)
  const statsData = await statsRes.json() as {
    items?: {
      id: string
      snippet: {
        title: string
        publishedAt: string
        thumbnails?: {
          maxres?: { width: number; height: number; url: string }
          high?:   { width: number; height: number; url: string }
        }
      }
      statistics: { viewCount?: string }
      contentDetails: { duration: string }
    }[]
  }

  return (statsData.items ?? [])
    .filter(item => !isVerticalVideo(item.snippet.thumbnails) && !isShort(item.contentDetails.duration))
    .slice(0, count)
    .map(item => ({
      video_id: item.id,
      title: item.snippet.title,
      published: item.snippet.publishedAt,
      view_count: item.statistics.viewCount ? parseInt(item.statistics.viewCount, 10) : null,
      // Prefer maxresdefault (1280×720); hqdefault (480×360) as fallback.
      thumbnail_url: item.snippet.thumbnails?.maxres?.url
        ?? `https://img.youtube.com/vi/${item.id}/maxresdefault.jpg`,
    }))
}

// ── Shorts filters ───────────────────────────────────────────────────────────
// Primary: thumbnail aspect ratio. YouTube Shorts have vertical thumbnails
// (maxres: 720×1280). Regular videos are horizontal (maxres: 1280×720).
// This catches Shorts of any duration, including the newer ≤3-minute Shorts.
//
// Secondary: duration ≤ 60s catches very short Shorts that lack a vertical
// maxres thumbnail (older uploads, auto-generated thumbnails, etc.).

function isVerticalVideo(
  thumbnails?: { maxres?: { width: number; height: number } }
): boolean {
  const maxres = thumbnails?.maxres
  if (maxres?.width && maxres?.height) {
    return maxres.height > maxres.width
  }
  return false
}

function isShort(isoDuration: string): boolean {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return false
  const hours   = parseInt(match[1] ?? '0', 10)
  const minutes = parseInt(match[2] ?? '0', 10)
  const seconds = parseInt(match[3] ?? '0', 10)
  const totalSeconds = hours * 3600 + minutes * 60 + seconds
  return totalSeconds <= 60
}

// ── RSS fallback (no API key) ─────────────────────────────────────────────────
// Hard-capped at 15 entries by YouTube. View counts from media:statistics.

async function fetchVideosViaRSS(channelId: string, count: number): Promise<YTVideoMeta[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brainiac/1.0)' },
  })
  if (!res.ok) throw new Error(`YouTube RSS feed failed: ${res.status}`)
  return parseYouTubeFeed(await res.text(), count)
}

// ── Channel ID resolution ─────────────────────────────────────────────────────

async function resolveChannelId(handle: string): Promise<string> {
  const cleaned = handle.replace(/^@/, '').trim()

  if (/^UC[\w-]{22}$/.test(cleaned)) return cleaned

  const UA = 'Mozilla/5.0 (compatible; Brainiac/1.0)'
  const apiKey = process.env.YOUTUBE_DATA_API_KEY

  // Strategy 1: YouTube Data API forHandle (preferred — authoritative for @handles)
  // Must run before RSS ?user= which can match unrelated legacy usernames.
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

  // Strategy 2: RSS ?user= (legacy usernames, no API key needed)
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

  throw new Error(
    `Could not resolve YouTube channel "@${cleaned}". ` +
    `Try entering the channel ID directly (e.g. UCX6OQ3DkcsbYNE6H8uQQuVA). ` +
    `You can find it at youtube.com/@${cleaned}/about.`
  )
}

// ── Parsers / helpers ─────────────────────────────────────────────────────────

function parseYouTubeFeed(xml: string, count: number): YTVideoMeta[] {
  const entries: YTVideoMeta[] = []
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
