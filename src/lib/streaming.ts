/**
 * Streaming response helper that defeats every common cause of
 * "stream idle timeout" errors:
 *
 * 1. **2KB whitespace prelude.** Some proxies (Vercel CDN, Cloudflare,
 *    nginx) buffer responses until enough bytes accumulate before
 *    forwarding. We immediately emit ~2KB of whitespace so the client
 *    sees data inside the first millisecond, regardless of buffer size.
 *
 * 2. **`X-Accel-Buffering: no`** — explicit signal to nginx/Cloudflare
 *    that this response should not be buffered.
 *
 * 3. **`Cache-Control: no-cache, no-transform`** — prevents any
 *    intermediary from compressing/transforming/caching, both of which
 *    can hold the response.
 *
 * 4. **`Content-Encoding: identity`** — disables gzip, which holds bytes
 *    until the compression buffer fills.
 *
 * 5. **Keep-alive every 5 seconds** — well under any reasonable proxy
 *    idle timeout (Vercel's is 25s; Cloudflare's varies by plan).
 *
 * 6. **Plain newline payload** — visible in network logs, parseable by
 *    a simple split-on-newline client.
 *
 * Output format: pad bytes + keep-alive newlines + final JSON payload as
 * the last non-empty line. Clients should read until done and parse the
 * last non-empty line as JSON.
 */
export function keepAliveStream<T>(work: () => Promise<T>): Response {
  const encoder = new TextEncoder()
  const PAD_BYTES = ' '.repeat(2048) + '\n'

  const stream = new ReadableStream({
    async start(controller) {
      // Defeat upstream buffers immediately.
      try { controller.enqueue(encoder.encode(PAD_BYTES)) } catch {}

      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode('\n')) } catch {}
      }, 5000)

      try {
        const result = await work()
        controller.enqueue(encoder.encode(JSON.stringify(result) + '\n'))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error'
        controller.enqueue(encoder.encode(JSON.stringify({ error: msg }) + '\n'))
      } finally {
        clearInterval(ping)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'Content-Encoding': 'identity',
      'Connection': 'keep-alive',
    },
  })
}
