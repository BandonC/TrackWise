import type { Parser } from './parser-types'
import type { ParsedJob } from '../lib/types'
import { extractFormattedText } from './parser-utils'

function textOf(selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    const text = el?.textContent?.trim()
    if (text) return text
  }
  return null
}

// See linkedin-parser.ts for the cap rationale. Indeed's JD
// container is generally cleaner than LinkedIn's (single
// #jobDescriptionText element) but the same defense-in-depth
// cap applies.
const MAX_JD_LEN = 10000

function jdOf(selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (!el) continue
    const text = extractFormattedText(el)
    if (text) return text.slice(0, MAX_JD_LEN)
  }
  return null
}

export const indeedParser: Parser = {
  name: 'indeed',

  readySelector:
    '[data-testid="jobsearch-JobInfoHeader-title"], .jobsearch-JobInfoHeader-title',

  jdSelector:
    '#jobDescriptionText, [data-testid="jobsearch-JobComponent-description"]',

  matches(url) {
    try {
      const u = new URL(url)
      if (u.hostname !== 'indeed.com' && !u.hostname.endsWith('.indeed.com')) return false
      if (u.pathname === '/viewjob' && u.searchParams.has('jk')) return true
      if (u.pathname === '/jobs' && u.searchParams.has('vjk')) return true
      return false
    } catch {
      return false
    }
  },

  parse(): ParsedJob {
    const rawRole = textOf([
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      '.jobsearch-JobInfoHeader-title',
    ])
    const role = rawRole?.replace(/\s*-\s*job post\s*$/i, '').trim() ?? null

    const company = textOf([
      '[data-testid="inlineHeader-companyName"] a',
      '[data-testid="inlineHeader-companyName"]',
      '.jobsearch-CompanyInfoContainer a',
      '.jobsearch-CompanyInfoWithoutHeaderImage a',
    ])

    const location = textOf([
      '[data-testid="inlineHeader-companyLocation"]',
      '[data-testid="job-location"]',
    ])

    const job_description = jdOf([
      '#jobDescriptionText',
      '[data-testid="jobsearch-JobComponent-description"]',
      '.jobsearch-JobComponent-description',
    ])

    return {
      company,
      role,
      location,
      salary_min: null,
      salary_max: null,
      source_url: window.location.href,
      source_site: 'indeed',
      notes: null,
      job_description,
    }
  },
}
