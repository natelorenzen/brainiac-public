import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { keepAliveStream } from '@/lib/streaming'
import Anthropic from '@anthropic-ai/sdk'
import {
  getWinningPatterns,
  getAllWinningAnalyses,
  getLosingPatterns,
  getAllLosersForSynthesis,
  getFrameworkPrinciples,
  getLatestBaselineEvolution,
  storeComprehensiveAnalysis,
  enqueueSynthesis,
} from '@/lib/pattern-library'
import { buildPatternContext, buildComprehensiveVisionPrompt, parseBergBullets, runBergAnalysis } from '../comprehensive/route'
import type { ComprehensiveAnalysis } from '../comprehensive/route'
import type { ExtractedElements, HeadlineDNA, SubheadlineDNA, TrustDNA, CtaDNA } from '../extract-elements/route'
import { parseClaudeJson } from '@/lib/parseClaudeJson'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const anthropic = new Anthropic({ timeout: 120000 })

/** Reconstruct an ExtractedElements object from a stored ComprehensiveAnalysis.
 *  Used for re-analysis when the original image is no longer available. */
function reconstructFromComprehensive(ca: ComprehensiveAnalysis): ExtractedElements {
  return {
    headline: ca.copy?.headline?.text ?? null,
    subheadline: ca.copy?.subheadline?.text || null,
    body_copy: null,
    benefits: ca.copy?.benefits_features?.identified ?? [],
    trust_signals: ca.copy?.trust_signals?.identified ?? [],
    safety_signals: ca.copy?.safety_signals?.identified ?? [],
    proof_signals: ca.copy?.proof_signals?.identified ?? [],
    cta: ca.copy?.cta?.text ?? null,
    offer_details: ca.offer_architecture?.offer_text ?? null,
    visual_description: '',
    ad_format_guess: ca.ad_format?.type ?? '',
    vertical_category: 'other',
    headline_dna: (ca.copy?.headline?.dna as HeadlineDNA | null | undefined) ?? null,
    subheadline_dna: (ca.copy?.subheadline?.dna as SubheadlineDNA | null | undefined) ?? null,
    body_dna: ca.body_dna ?? null,
    benefits_dna: (ca.copy?.benefits_features?.dna as ExtractedElements['benefits_dna']) ?? null,
    trust_dna: (ca.copy?.trust_signals?.dna as TrustDNA | null | undefined) ?? null,
    cta_dna: (ca.copy?.cta?.dna as CtaDNA | null | undefined) ?? null,
    composition_tag: ca.composition_tag ?? 'headline_only',
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.analysis_id) return NextResponse.json({ error: 'analysis_id required' }, { status: 400 })

  const analysisId: string = body.analysis_id

  // Fetch the stored analysis — owned by this user only.
  const { data: row, error: fetchErr } = await supabaseServer
    .from('analyses')
    .select('id, user_id, comprehensive_analysis, roi_data, spend_usd, is_winner')
    .eq('id', analysisId)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !row) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })

  const existingCa = row.comprehensive_analysis as unknown as ComprehensiveAnalysis | null
  if (!existingCa) return NextResponse.json({ error: 'No prior analysis data to re-analyze from' }, { status: 400 })

  const roiAverages = (row.roi_data as unknown as Array<{ region_key: string; label: string; description: string; activation: number }>) ?? []
  const spendUsd: number | undefined = row.spend_usd ?? undefined
  const confirmedElements = reconstructFromComprehensive(existingCa)

  return keepAliveStream(async () => {
    const [patterns, winningExamples, losingPatterns, losingExamples, frameworkPrinciples, evolvedBaseline] = await Promise.all([
      getWinningPatterns(),
      getAllWinningAnalyses(),
      getLosingPatterns(),
      getAllLosersForSynthesis(),
      getFrameworkPrinciples(),
      getLatestBaselineEvolution(),
    ])

    const patternContext = buildPatternContext(patterns, winningExamples, losingPatterns, losingExamples, frameworkPrinciples)

    // Determine mode from spend_usd (same logic as the main comprehensive route).
    const mode = spendUsd !== undefined
      ? (spendUsd >= 1000 ? 'historical_winner' : 'historical_loser')
      : 'feedback'

    // Run BERG text summary and text-only vision analysis in parallel.
    const [bergText, visionResult] = await Promise.all([
      runBergAnalysis(roiAverages, patternContext, confirmedElements.visual_description, mode, spendUsd),
      (async () => {
        const prompt = buildComprehensiveVisionPrompt(roiAverages, patternContext, confirmedElements, mode, spendUsd, evolvedBaseline)
        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 32000,
          messages: [{
            role: 'user',
            // Text-only: no image available for re-analysis. Claude works from
            // the confirmed extraction context and BERG scores.
            content: prompt,
          }],
        })
        const textBlock = message.content.find(b => b.type === 'text')
        const raw = textBlock?.type === 'text' ? textBlock.text : ''
        return parseClaudeJson<Omit<ComprehensiveAnalysis, 'berg_recommendations'>>(raw)
      })(),
    ])

    const bergBullets = parseBergBullets(bergText)
    const comprehensive: ComprehensiveAnalysis = { ...visionResult, berg_recommendations: bergBullets }

    await storeComprehensiveAnalysis(analysisId, comprehensive as unknown as Record<string, unknown>, spendUsd)

    if (spendUsd !== undefined) {
      await enqueueSynthesis(analysisId)
      fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/analyze/synthesize-patterns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {})
    }

    return { comprehensive }
  })
}
