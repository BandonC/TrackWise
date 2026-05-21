import type { ParsedJob } from '../lib/types'

export type Parser = {
  name: string
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
}
