import type { ParsedJob } from '../lib/types'

export type Parser = {
  name: string
  // Viewport offset for the injected button stack. Defaults to 80px
  // in the detector; override when the site's detail-pane header
  // occupies that band (LinkedIn grew into it in mid-2026).
  buttonTopPx?: number
  // Selector that resolves once the page shell has rendered.
  // The detector waits for this before injecting buttons.
  readySelector: string
  // Selector targeting the JD container. The detector polls
  // this for non-trivial content before calling parse(), so
  // lazy-loaded job descriptions don't get captured empty on a
  // fast Save click.
  jdSelector: string
  matches(url: string): boolean
  parse(): ParsedJob
  // Stable identity for the job posting itself, derived from the
  // site's job id in the URL (e.g. linkedin:4012345678). Search-page
  // URLs mutate unrelated query params while showing the same job, so
  // keying the fit cache on the full href causes misses and duplicate
  // scoring. Null when no id can be extracted; callers fall back to
  // the full href.
  jobKey(url: string): string | null
}
