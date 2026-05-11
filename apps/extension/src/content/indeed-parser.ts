import type { Parser } from './parser-types'
import type { ParsedJob } from '../lib/types'

function textOf(selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    const text = el?.textContent?.trim()
    if (text) return text
  }
  return null
}

export const indeedParser: Parser = {
  name: 'indeed',

  readySelector:
    '[data-testid="jobsearch-JobInfoHeader-title"], .jobsearch-JobInfoHeader-title',

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

    return {
      company,
      role,
      location,
      salary_min: null,
      salary_max: null,
      source_url: window.location.href,
      source_site: 'indeed',
      notes: null,
    }
  },
}
