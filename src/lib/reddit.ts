export interface RedditPost { title: string; url: string; snippet: string }

export async function fetchRedditPosts(topic: string): Promise<RedditPost[] | null> {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=relevance&limit=5&type=link`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Brainiac-AdAnalyzer/1.0' },
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json() as { data?: { children?: Array<{ data: { title: string; permalink: string; selftext?: string } }> } }
    const posts = (data?.data?.children ?? []).map(c => ({
      title: c.data.title,
      url: `https://www.reddit.com${c.data.permalink}`,
      snippet: (c.data.selftext ?? '').slice(0, 250).replace(/\n+/g, ' '),
    })).filter(p => p.title).slice(0, 5)
    return posts.length > 0 ? posts : null
  } catch { return null }
}
