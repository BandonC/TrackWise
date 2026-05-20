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

// JD bodies can run 5-10KB; LinkedIn occasionally embeds whole
// company-about sections in the description container. Cap at 10K
// so we don't ship pathologically large payloads. The downstream
// embed/score paths re-cap at their own limits (8K for embedding
// input, 4K for the Haiku query).
const MAX_JD_LEN = 10000

function jdOf(selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    // .textContent strips tags but preserves the text. LinkedIn
    // renders the JD as nested HTML with bullets; textContent
    // collapses it into a readable plain string.
    const text = el?.textContent
      ?.replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (text) return text.slice(0, MAX_JD_LEN)
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

    const job_description = jdOf([
      // Current (2025+) job-details layout.
      '#job-details',
      '.jobs-description__content .jobs-description-content__text',
      '.jobs-description-content__text',
      // Older layouts that LinkedIn still serves for some URLs.
      '.show-more-less-html__markup',
      '.jobs-description__container',
      '.jobs-description',
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
      job_description,
    }
  },
}
