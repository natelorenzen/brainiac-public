/**
 * Robust JSON extraction from a Claude text response.
 *
 * Handles common Claude quirks:
 *   - markdown fences (```json ... ```)
 *   - leading/trailing prose ("Here is the JSON:" etc.)
 *   - leading/trailing whitespace
 *   - trailing commas in objects/arrays
 *   - smart quotes that snuck in
 *
 * On parse failure, throws an Error whose message includes a snippet of
 * the raw output so the client (and server logs) can see what Claude
 * actually returned. Without that snippet, "Expected ',' or '}' at
 * position 19" is impossible to debug.
 */
export function parseClaudeJson<T = Record<string, unknown>>(raw: string): T {
  if (!raw || !raw.trim()) {
    throw new Error('Claude returned an empty response')
  }

  // Strip markdown fences
  let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  // Replace smart quotes that occasionally slip in
  cleaned = cleaned
    .replace(/[“”]/g, '"')   // " "
    .replace(/[‘’]/g, "'")   // ' '

  // Find the first { or [ and the last matching } or ] — strips any
  // leading/trailing prose Claude wrapped around the JSON.
  const firstObj = cleaned.indexOf('{')
  const firstArr = cleaned.indexOf('[')
  let firstBracket = -1
  let lastBracketChar = ''
  if (firstObj === -1 && firstArr === -1) {
    throw new Error(
      `Claude response contained no JSON object or array. Output starts with: "${snippet(cleaned, 200)}"`,
    )
  }
  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    firstBracket = firstObj
    lastBracketChar = '}'
  } else {
    firstBracket = firstArr
    lastBracketChar = ']'
  }
  const lastBracket = cleaned.lastIndexOf(lastBracketChar)
  if (lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1)
  }

  // Strip trailing commas before } or ] — a common Claude mistake.
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

  // Fix double-quoted string values — Claude sometimes outputs "headline": ""value""
  // when the extracted text itself starts/ends with a quote character.
  // Pattern: ": "" followed by content followed by "" — collapse the outer extra quotes.
  // We target the pattern: ": ""<content>"" and normalize to ": "<content>"
  // Only apply when the inner content doesn't itself contain unescaped quotes.
  cleaned = cleaned.replace(/:\s*""((?:[^"\\]|\\.)*)""(\s*[,}\]])/g, ': "$1"$2')

  try {
    return JSON.parse(cleaned) as T
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'unknown parse error'
    // Use the original raw output for the snippet so debugging shows the
    // ACTUAL Claude output, not our cleaned version.
    throw new Error(
      `Failed to parse Claude JSON: ${errMsg}. Output starts with: "${snippet(raw, 300)}"`,
    )
  }
}

function snippet(s: string, max: number): string {
  const trimmed = s.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? trimmed.slice(0, max) + '…' : trimmed
}
