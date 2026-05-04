import { createClient } from '@supabase/supabase-js'

// Server-side only — service role bypasses RLS.
// NEVER import this in client components or expose SUPABASE_SERVICE_ROLE_KEY client-side.
// Fallbacks let `next build` succeed when env vars aren't set at build time
// (e.g. on Vercel before the first deploy). Runtime uses the real values.
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-role-key'
)
