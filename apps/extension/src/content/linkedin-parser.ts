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

export const linkedinParser: Parser = {
  name: 'linkedin',

  readySelector:
    'h1.t-24, .job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title',

  matches(url) {
    try {
      const u = new URL(url)
      if (u.hostname !== 'www.linkedin.com') return false
      if (u.pathname.startsWith('/jobs/view/')) return true
      if (u.searchParams.has('currentJobId')) return true
      return false
    } catch {
      return false
    }
  },

  parse(): ParsedJob {
    const role = textOf([
      'h1.t-24',
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
    ])

    const company = textOf([
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
    ])

    const location = textOf([
      '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
      '.jobs-unified-top-card__bullet',
    ])

    return {
      company,
      role,
      location,
      salary_min: null,
      salary_max: null,
      source_url: window.location.href,
      source_site: 'linkedin',
      notes: null,
    }
  },
}
