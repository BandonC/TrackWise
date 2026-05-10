import type { ParsedJob } from '../lib/types'

export type Parser = {
  name: string
  readySelector: string
  matches(url: string): boolean
  parse(): ParsedJob
}
