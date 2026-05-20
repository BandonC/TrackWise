export type ParsedJob = {
  company: string | null
  role: string | null
  location: string | null
  salary_min: number | null
  salary_max: number | null
  source_url: string | null
  source_site: string | null
  notes: string | null
}

export type ScorePayload = {
  role: string
  company: string
  notes: string | null
  url: string
}

export type ScoreResult = {
  history: {
    similarity: number
    matched_application: {
      id: string
      role: string
      company: string
    }
  } | null
  resume: {
    similarity: number
    label: string
    section: string
  } | null
}

export type Message =
  | { type: 'save_application'; payload: ParsedJob }
  | { type: 'score_current_page'; payload: ScorePayload }
  | { type: 'get_recent'; limit: number }
  | { type: 'sign_in' }
  | { type: 'sign_out' }
  | { type: 'get_session' }

export type MessageResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }
