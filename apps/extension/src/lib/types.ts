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

export type Message =
  | { type: 'save_application'; payload: ParsedJob }
  | { type: 'get_recent'; limit: number }
  | { type: 'sign_in' }
  | { type: 'sign_out' }
  | { type: 'get_session' }

export type MessageResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }
