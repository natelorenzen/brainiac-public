import { createClient } from '@supabase/supabase-js'

// Client-side: anon key only — safe to expose in browser.
// Fallbacks let `next build` succeed when env vars aren't set at build time
// (e.g. on Vercel before the first deploy). Runtime uses the real values.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
)
