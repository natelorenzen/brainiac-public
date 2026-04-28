import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export interface HeadlineDNA {
  word_count: number | null
  char_count: number | null
  reading_level: 'simple' | 'moderate' | 'complex' | null
  voice: 'direct' | 'indirect' | null
  person: 'first' | 'second' | 'third' | 'none' | null
  tense: 'present' | 'past' | 'future' | 'mixed' | null
  sentence_type: 'declarative' | 'imperative' | 'interrogative' | 'fragmentary' | null
  structure_type:
    | 'pain_agitation' | 'curiosity_gap' | 'question' | 'desire_statement'
    | 'identity' | 'mechanism_reveal' | 'social_proof_lead' | 'direct_offer'
    | 'contrast' | 'story_lead' | 'command' | 'negation_lead' | null
  specificity_level: 'high' | 'medium' | 'low' | null
  mechanism_present: boolean | null
  audience_explicit: boolean | null
  outcome_explicit: boolean | null
  time_bound: boolean | null
  number_present: boolean | null
  power_words: string[]
  emotional_register:
    | 'pain' | 'fear' | 'desire' | 'curiosity' | 'empowerment'
    | 'social_belonging' | 'anger' | 'hope' | 'neutral' | null
  tone_register:
    | 'formal' | 'casual' | 'raw' | 'clinical' | 'conversational'
    | 'authoritative' | 'intimate' | null
  uses_metaphor: boolean | null
  uses_negation: boolean | null
  uses_contrast: boolean | null
  punctuation_signals: string[]
}

export interface SubheadlineDNA {
  word_count: number | null
  char_count: number | null
  length_relative_to_headline: 'shorter' | 'same' | 'longer' | null
  role:
    | 'bridge_to_benefits' | 'bridge_to_solution' | 'standalone_claim'
    | 'clarification' | 'amplification' | 'absent' | null
  introduces_mechanism: boolean | null
  introduces_proof: boolean | null
  introduces_specificity: boolean | null
  introduces_audience: boolean | null
  person_continuity: 'maintains' | 'shifts_to_product' | 'shifts_to_audience' | 'absent' | null
  tonal_shift: 'maintains' | 'softens' | 'sharpens' | 'absent' | null
  emotional_register:
    | 'pain' | 'fear' | 'desire' | 'curiosity' | 'empowerment'
    | 'social_belonging' | 'reassurance' | 'neutral' | 'absent' | null
  tense: 'present' | 'past' | 'future' | 'mixed' | 'absent' | null
}

export interface BodyDNA {
  word_count: number | null
  paragraph_count: number | null
  sentence_count: number | null
  avg_sentence_length: number | null
  frame:
    | 'story' | 'list' | 'comparison' | 'instruction'
    | 'testimonial' | 'claim_proof' | 'absent' | null
  personal_pronoun_density: 'high' | 'medium' | 'low' | 'absent' | null
}

export interface BenefitsDNA {
  count: number
  avg_word_count: number | null
  pattern_uniformity: 'parallel' | 'mixed' | 'absent' | null
  outcome_vs_feature_split:
    | 'mostly_outcomes' | 'mostly_features' | 'balanced' | 'absent' | null
  specificity: 'high' | 'medium' | 'low' | 'absent' | null
}

export interface TrustDNA {
  count: number
  types_present: string[]
  has_specific_quantifiers: boolean | null
  source_attribution: 'named' | 'anonymous' | 'mixed' | 'absent' | null
}

export interface CtaDNA {
  verb: string | null
  word_count: number | null
  framing: 'first_person' | 'second_person' | 'imperative' | 'absent' | null
  friction_level: 'low' | 'medium' | 'high' | 'absent' | null
  has_value_anchor: boolean | null
  has_urgency_signal: boolean | null
}

export interface ExtractedElements {
  headline: string | null
  subheadline: string | null
  body_copy: string | null
  benefits: string[]
  trust_signals: string[]
  safety_signals: string[]
  proof_signals: string[]
  cta: string | null
  offer_details: string | null
  visual_description: string
  ad_format_guess: string

  headline_dna: HeadlineDNA | null
  subheadline_dna: SubheadlineDNA | null
  body_dna: BodyDNA | null
  benefits_dna: BenefitsDNA | null
  trust_dna: TrustDNA | null
  cta_dna: CtaDNA | null
  composition_tag: string
}

const anthropic = new Anthropic({ timeout: 60000 })

const EXTRACT_SCHEMA = `{
  "headline": "<exact headline text, or null if no headline present>",
  "subheadline": "<exact subheadline text, or null>",
  "body_copy": "<main body paragraph text verbatim, or null>",
  "benefits": ["<benefit 1 verbatim>", "..."],
  "trust_signals": ["<e.g. '50,000 reviews', '★★★★★', logo name>", "..."],
  "safety_signals": ["<e.g. 'Money-back guarantee', 'Free returns', security badge>", "..."],
  "proof_signals": ["<e.g. 'Clinically tested', 'Before/after shown', '3x faster in study'>", "..."],
  "cta": "<exact CTA button or link text, or null>",
  "offer_details": "<any price, discount %, free trial, or promo text visible, or null>",
  "visual_description": "<one sentence: dominant visual subject, style, dominant colors>",
  "ad_format_guess": "<one of: direct_response | native_ugc | advertorial | brand_awareness | product_demo | testimonial | hybrid>",

  "headline_dna": {
    "word_count": <integer count of words in headline, or null if no headline>,
    "char_count": <integer count of characters including spaces, or null>,
    "reading_level": "<simple | moderate | complex | null>",
    "voice": "<direct | indirect | null — direct uses 'you/your'; indirect is third-person/abstract>",
    "person": "<first | second | third | none | null>",
    "tense": "<present | past | future | mixed | null>",
    "sentence_type": "<declarative | imperative | interrogative | fragmentary | null>",
    "structure_type": "<pain_agitation | curiosity_gap | question | desire_statement | identity | mechanism_reveal | social_proof_lead | direct_offer | contrast | story_lead | command | negation_lead | null>",
    "specificity_level": "<high | medium | low | null — high = specific numbers/times/outcomes; low = abstract>",
    "mechanism_present": <true | false | null — does headline name HOW something works?>,
    "audience_explicit": <true | false | null — does it explicitly name the audience?>,
    "outcome_explicit": <true | false | null — does it state a specific outcome?>,
    "time_bound": <true | false | null — references a timeframe (in 7 days, by 3pm, overnight)?>,
    "number_present": <true | false | null — contains a numeric value?>,
    "power_words": ["<verbatim power word from text, e.g. 'free', 'proven', 'instantly', 'guaranteed', 'breakthrough', 'secret', 'new'>"],
    "emotional_register": "<pain | fear | desire | curiosity | empowerment | social_belonging | anger | hope | neutral | null>",
    "tone_register": "<formal | casual | raw | clinical | conversational | authoritative | intimate | null>",
    "uses_metaphor": <true | false | null>,
    "uses_negation": <true | false | null — uses 'no/not/without/never' framing?>,
    "uses_contrast": <true | false | null — sets up before/after, but, yet, despite?>,
    "punctuation_signals": ["<question_mark | exclamation | ellipsis | em_dash | colon — list of any present>"]
  },

  "subheadline_dna": {
    "word_count": <integer or null>,
    "char_count": <integer or null>,
    "length_relative_to_headline": "<shorter | same | longer | null>",
    "role": "<bridge_to_benefits | bridge_to_solution | standalone_claim | clarification | amplification | absent>",
    "introduces_mechanism": <true | false | null>,
    "introduces_proof": <true | false | null>,
    "introduces_specificity": <true | false | null>,
    "introduces_audience": <true | false | null>,
    "person_continuity": "<maintains | shifts_to_product | shifts_to_audience | absent>",
    "tonal_shift": "<maintains | softens | sharpens | absent>",
    "emotional_register": "<pain | fear | desire | curiosity | empowerment | social_belonging | reassurance | neutral | absent>",
    "tense": "<present | past | future | mixed | absent>"
  },

  "body_dna": {
    "word_count": <integer or null>,
    "paragraph_count": <integer or null>,
    "sentence_count": <integer or null>,
    "avg_sentence_length": <integer or null>,
    "frame": "<story | list | comparison | instruction | testimonial | claim_proof | absent>",
    "personal_pronoun_density": "<high | medium | low | absent>"
  },

  "benefits_dna": {
    "count": <integer count of benefits>,
    "avg_word_count": <integer or null>,
    "pattern_uniformity": "<parallel | mixed | absent — are they all same syntactic pattern?>",
    "outcome_vs_feature_split": "<mostly_outcomes | mostly_features | balanced | absent>",
    "specificity": "<high | medium | low | absent>"
  },

  "trust_dna": {
    "count": <integer count of trust signals>,
    "types_present": ["<testimonial | review_count | star_rating | award | media_logo | certification | press_quote | celebrity | expert | guarantee | before_after — list each type present>"],
    "has_specific_quantifiers": <true | false | null — '50,000 reviews' yes; 'thousands' no>,
    "source_attribution": "<named | anonymous | mixed | absent>"
  },

  "cta_dna": {
    "verb": "<primary verb from CTA text, e.g. 'Get', 'Buy', 'Try', 'Shop', 'Start', 'Join', 'Discover', 'Learn', 'Claim', 'Save'; or null>",
    "word_count": <integer or null>,
    "framing": "<first_person | second_person | imperative | absent>",
    "friction_level": "<low | medium | high | absent — low='Try free'; medium='Get started'; high='Buy now $49'>",
    "has_value_anchor": <true | false | null — mentions price/free/value in CTA itself?>,
    "has_urgency_signal": <true | false | null — 'now', 'today', 'before midnight'?>
  },

  "composition_tag": "<canonical combination string, e.g. 'headline_only' | 'headline+cta' | 'headline+sub+cta' | 'headline+benefits+cta' | 'headline+sub+benefits+cta' | 'headline+benefits+cta+offer' | 'headline+sub+benefits+cta+offer' | 'headline+sub+benefits+trust+cta' | 'headline+sub+benefits+trust+cta+offer' | 'full_stack' | 'visual_only'>"
}`

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.image_base64) return NextResponse.json({ error: 'image_base64 required' }, { status: 400 })

  const { image_base64, mime_type = 'image/jpeg' } = body

  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode('\n')) } catch {}
      }, 15000)
      try {
        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mime_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: image_base64,
                },
              },
              {
                type: 'text',
                text: `Extract every text and visual element from this ad image AND classify its full structural DNA.

Rules:
- Quote exact text verbatim — do not paraphrase, interpret, or infer.
- For mechanical fields (word_count, char_count, sentence_count, etc.), COMPUTE from the extracted text — do not estimate.
- For enum fields, pick EXACTLY ONE value from the listed options. Use the literal string "absent" (not null) when the element does not exist.
- For boolean fields, return true or false based on what is observable. Use null only when truly indeterminable.
- For list fields (power_words, types_present, punctuation_signals), populate with verbatim items present; use [] when none.
- composition_tag is computed from which elements are present (non-null/non-empty) — derive it deterministically.

Return a JSON object with EXACTLY this structure — no markdown fences, no extra keys, no commentary:
${EXTRACT_SCHEMA}`,
              },
            ],
          }],
        })

        const textBlock = message.content.find(b => b.type === 'text')
        const raw = textBlock?.type === 'text' ? textBlock.text : ''
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        const extracted: ExtractedElements = JSON.parse(cleaned)
        controller.enqueue(encoder.encode(JSON.stringify({ extracted }) + '\n'))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Extraction failed'
        controller.enqueue(encoder.encode(JSON.stringify({ error: msg }) + '\n'))
      } finally {
        clearInterval(ping)
        controller.close()
      }
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'application/json' } })
}
