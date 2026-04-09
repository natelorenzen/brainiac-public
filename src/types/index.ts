// ─── Auth / Profile ───────────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string | null
  daily_count: number
  monthly_count: number
  daily_reset_at: string
  monthly_reset_at: string
  account_status: 'active' | 'suspended' | 'deleted'
  deletion_requested_at: string | null
  deletion_scheduled_at: string | null
  created_at: string
}

// ─── Usage ────────────────────────────────────────────────────────────────────

export interface UsageInfo {
  daily_used: number
  daily_limit: number
  monthly_used: number
  monthly_limit: number
  daily_resets_at: string   // ISO date string
  monthly_resets_at: string // ISO date string
}

// ─── Consent ──────────────────────────────────────────────────────────────────

export type ConsentType =
  | 'terms_of_service'
  | 'privacy_policy'
  | 'data_aggregation'
  | 'ad_account_connection'

export interface UserConsent {
  id: string
  user_id: string
  consent_type: ConsentType
  consented_at: string
  ip_address: string | null
  user_agent: string | null
  legal_version: string
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export type AnalysisType = 'thumbnail' | 'channel_batch' | 'ad_creative'
export type AnalysisStatus = 'queued' | 'processing' | 'complete' | 'failed'
export type AnalysisSource = 'manual_upload' | 'youtube_channel' | 'meta_ads'

export interface Analysis {
  id: string
  user_id: string
  type: AnalysisType
  status: AnalysisStatus
  input_storage_key: string | null
  heatmap_storage_key: string | null
  heatmap_url: string | null
  roi_data: ROIRegion[] | null
  mean_top_roi_score: number | null
  source: AnalysisSource
  error_message: string | null
  created_at: string
  completed_at: string | null
}

// ─── ROI ──────────────────────────────────────────────────────────────────────

export interface ROIRegion {
  region_key: string
  label: string
  activation: number
  description: string
}

export interface AnalysisResult {
  analysis_id: string
  status: AnalysisStatus
  heatmap_url: string | null
  roi_data: ROIRegion[] | null
  mean_top_roi_score: number | null
  error_message: string | null
  attribution: {
    model: string
    license: string
    license_url: string
  }
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export interface MonthlyBudget {
  id: number
  month: string
  analyses_run: number
  estimated_cost_usd: number
  budget_cap_usd: number
  is_exhausted: boolean
}

// ─── Connected Accounts ───────────────────────────────────────────────────────

export type Platform = 'meta_ads' | 'google_ads' | 'tiktok_ads'

export interface ConnectedAccount {
  id: string
  user_id: string
  platform: Platform
  platform_account_id: string | null
  platform_account_name: string | null
  token_expires_at: string | null
  scopes_granted: string[] | null
  connected_at: string
  last_synced_at: string | null
  is_active: boolean
}

// ─── Ad Creatives ─────────────────────────────────────────────────────────────

export interface AdCreative {
  id: string
  user_id: string
  connected_account_id: string
  platform_creative_id: string | null
  creative_type: 'image' | 'video'
  storage_key: string | null
  platform_name: string | null
  platform_status: string | null
  created_at: string
}

export interface CreativePerformance {
  id: string
  ad_creative_id: string
  analysis_id: string | null
  platform: string
  impressions: number
  clicks: number
  ctr: number
  spend_usd: number
  cpm: number
  roas: number | null
  recorded_at: string
}

// ─── YouTube ──────────────────────────────────────────────────────────────────

export interface VideoMeta {
  video_id: string
  title: string
  view_count: number | null
  thumbnail_url: string
}

// ─── Correlation ──────────────────────────────────────────────────────────────

export interface CorrelationEntry {
  region_key: string
  label: string
  description: string
  /** Pearson r against log(view_count + 1) */
  r: number
  data_points: Array<{ activation: number; log_views: number; title: string; thumbnail_url: string }>
}

// ─── API error shape for 429 / limit errors ───────────────────────────────────

export interface LimitError {
  reason: string
  limit_type: 'daily' | 'monthly' | 'global_budget'
  resets_at: string
}
