import type { Message, MessageResponse, ScoreResult } from '../lib/types'
import type { Parser } from './parser-types'
import { linkedinParser } from './linkedin-parser'
import { indeedParser } from './indeed-parser'

const parsers: Parser[] = [linkedinParser, indeedParser]

let host: HTMLElement | null = null
let lastUrl = location.href

function waitForSelector(selector: string, timeoutMs: number): Promise<Element | null> {
  const existing = document.querySelector(selector)
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector)
      if (found) {
        observer.disconnect()
        resolve(found)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      resolve(document.querySelector(selector))
    }, timeoutMs)
  })
}

function removeButton() {
  if (host) {
    host.remove()
    host = null
  }
}

// Body-level placement avoids LinkedIn's framework re-rendering and
// stripping our element from inside its component tree.
const BUTTON_TOP_PX = 80
const BUTTON_GAP_PX = 12

function getContentRightEdge(): number | null {
  const candidates = [
    '.scaffold-layout__main',
    '.jobs-search-two-pane__details',
    'main',
  ]
  for (const sel of candidates) {
    const el = document.querySelector(sel)
    const rect = el?.getBoundingClientRect()
    if (rect && rect.width > 0) return rect.right
  }
  return null
}

function positionButton(wrapper: HTMLElement) {
  const contentRight = getContentRightEdge()
  wrapper.style.top = `${BUTTON_TOP_PX}px`
  wrapper.style.bottom = 'auto'

  if (contentRight !== null) {
    const proposedLeft = contentRight + BUTTON_GAP_PX
    // Some sites (e.g. Indeed) expose a <main> that spans both the results
    // list and the detail pane; anchoring past its right edge pushes the
    // button off-screen. Fall back to viewport-right when that happens.
    if (proposedLeft + 160 <= window.innerWidth) {
      wrapper.style.left = `${proposedLeft}px`
      wrapper.style.right = 'auto'
    } else {
      wrapper.style.left = 'auto'
      wrapper.style.right = '24px'
    }
  } else {
    // No content container found: last-resort viewport-right.
    wrapper.style.left = 'auto'
    wrapper.style.right = '24px'
  }
}

function injectButton(parser: Parser) {
  const wrapper = document.createElement('div')
  wrapper.id = 'trackwise-host'
  Object.assign(wrapper.style, {
    position: 'fixed',
    zIndex: '2147483647',
  })
  positionButton(wrapper)

  const shadow = wrapper.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = `
    .row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }
    button {
      font: 500 14px system-ui, -apple-system, sans-serif;
      letter-spacing: 0.01em;
      padding: 11px 18px;
      border: none;
      border-radius: 8px;
      background: #0f172a;
      color: white;
      cursor: pointer;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25), 0 1px 3px rgba(0, 0, 0, 0.08);
      transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }
    button:hover {
      background: #1e293b;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    button:active { transform: translateY(0); }
    button:disabled { cursor: default; opacity: 0.9; transform: none; }
    button.success { background: #047857; }
    button.success:hover { background: #047857; }
    button.error { background: #b91c1c; }
    button.error:hover { background: #b91c1c; }
    button.secondary {
      background: white;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.1);
    }
    button.secondary:hover {
      background: #f1f5f9;
      box-shadow: 0 4px 10px rgba(15, 23, 42, 0.12);
    }
    .panel {
      margin-top: 4px;
      padding: 14px 16px 12px;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      color: #0f172a;
      font: 13px system-ui, -apple-system, sans-serif;
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
      min-width: 240px;
      position: relative;
    }
    .panel .close {
      position: absolute;
      top: 6px;
      right: 8px;
      background: transparent;
      color: #64748b;
      box-shadow: none;
      padding: 2px 6px;
      font-size: 16px;
      line-height: 1;
    }
    .panel .close:hover {
      background: #f1f5f9;
      transform: none;
      box-shadow: none;
    }
    .panel h4 {
      margin: 0 0 8px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #64748b;
    }
    .stat {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .stat:last-child { border-bottom: none; }
    .stat .label { color: #475569; font-size: 12px; }
    .stat .sub { color: #94a3b8; font-size: 11px; display: block; margin-top: 2px; }
    .stat .value {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      font-size: 15px;
    }
    .panel .empty {
      color: #64748b;
      font-size: 12px;
      padding: 4px 0;
    }
    .panel .footer {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #f1f5f9;
      color: #94a3b8;
      font-size: 10px;
    }
  `
  shadow.appendChild(style)

  const row = document.createElement('div')
  row.className = 'row'

  const saveBtn = document.createElement('button')
  saveBtn.textContent = 'Save to TrackWise'
  saveBtn.addEventListener('click', () => handleSaveClick(parser, saveBtn))
  row.appendChild(saveBtn)

  const fitBtn = document.createElement('button')
  fitBtn.className = 'secondary'
  fitBtn.textContent = 'Check fit'
  row.appendChild(fitBtn)

  const panel = document.createElement('div')
  panel.className = 'panel'
  panel.style.display = 'none'
  row.appendChild(panel)

  fitBtn.addEventListener('click', () =>
    handleFitClick(parser, fitBtn, panel),
  )

  shadow.appendChild(row)

  document.body.appendChild(wrapper)
  host = wrapper
}

async function handleSaveClick(parser: Parser, btn: HTMLButtonElement) {
  btn.disabled = true
  btn.className = ''
  btn.textContent = 'Saving...'

  try {
    const payload = parser.parse()
    const message: Message = { type: 'save_application', payload }
    const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<{
      id: string
    }>
    if (!response.ok) throw new Error(response.error)
    btn.className = 'success'
    btn.textContent = 'Saved'
  } catch (e) {
    btn.className = 'error'
    btn.textContent = e instanceof Error ? e.message : 'Error'
  }

  setTimeout(() => {
    btn.disabled = false
    btn.className = ''
    btn.textContent = 'Save to TrackWise'
  }, 2500)
}

async function handleFitClick(
  parser: Parser,
  btn: HTMLButtonElement,
  panel: HTMLElement,
) {
  btn.disabled = true
  const originalText = btn.textContent ?? 'Check fit'
  btn.textContent = 'Checking...'

  try {
    const parsed = parser.parse()
    if (!parsed.role || !parsed.company) {
      throw new Error("Couldn't read this listing")
    }
    const message: Message = {
      type: 'score_current_page',
      payload: {
        role: parsed.role,
        company: parsed.company,
        notes: parsed.notes,
        url: location.href,
      },
    }
    const response = (await chrome.runtime.sendMessage(
      message,
    )) as MessageResponse<ScoreResult>
    if (!response.ok) throw new Error(response.error)
    renderPanel(panel, response.data)
    panel.style.display = 'block'
  } catch (e) {
    renderError(panel, e instanceof Error ? e.message : 'Error')
    panel.style.display = 'block'
  }

  btn.disabled = false
  btn.textContent = originalText
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function renderPanel(panel: HTMLElement, result: ScoreResult) {
  panel.textContent = ''
  const close = document.createElement('button')
  close.className = 'close'
  close.textContent = '×'
  close.addEventListener('click', () => {
    panel.style.display = 'none'
  })
  panel.appendChild(close)

  const heading = document.createElement('h4')
  heading.textContent = 'TrackWise fit'
  panel.appendChild(heading)

  panel.appendChild(buildStat('Matches your history', result.history))
  panel.appendChild(buildResumeStat(result.resume))

  const footer = document.createElement('div')
  footer.className = 'footer'
  footer.textContent = 'Cached for 24h. Click again to refresh.'
  panel.appendChild(footer)
}

function buildStat(
  label: string,
  history: ScoreResult['history'],
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'stat'

  const left = document.createElement('div')
  const labelEl = document.createElement('div')
  labelEl.className = 'label'
  labelEl.textContent = label
  left.appendChild(labelEl)

  if (history) {
    const sub = document.createElement('div')
    sub.className = 'sub'
    sub.textContent = `closest: ${history.matched_application.role} at ${history.matched_application.company}`
    left.appendChild(sub)
  }

  const value = document.createElement('div')
  value.className = 'value'
  value.textContent = history ? pct(history.similarity) : '—'

  row.appendChild(left)
  row.appendChild(value)
  return row
}

function buildResumeStat(resume: ScoreResult['resume']): HTMLElement {
  const row = document.createElement('div')
  row.className = 'stat'

  const left = document.createElement('div')
  const labelEl = document.createElement('div')
  labelEl.className = 'label'
  labelEl.textContent = 'Matches your resume'
  left.appendChild(labelEl)

  if (resume) {
    const sub = document.createElement('div')
    sub.className = 'sub'
    sub.textContent = `vs "${resume.label}"`
    left.appendChild(sub)

    const matched = document.createElement('div')
    matched.className = 'sub'
    matched.textContent = `matched on: ${resume.section}`
    left.appendChild(matched)
  } else {
    const sub = document.createElement('div')
    sub.className = 'sub'
    sub.textContent = 'no active resume'
    left.appendChild(sub)
  }

  const value = document.createElement('div')
  value.className = 'value'
  value.textContent = resume ? pct(resume.similarity) : '—'

  row.appendChild(left)
  row.appendChild(value)
  return row
}

function renderError(panel: HTMLElement, message: string) {
  panel.textContent = ''
  const close = document.createElement('button')
  close.className = 'close'
  close.textContent = '×'
  close.addEventListener('click', () => {
    panel.style.display = 'none'
  })
  panel.appendChild(close)

  const heading = document.createElement('h4')
  heading.textContent = 'TrackWise fit'
  panel.appendChild(heading)

  const empty = document.createElement('div')
  empty.className = 'empty'
  empty.textContent = message
  panel.appendChild(empty)
}

async function detectAndInject() {
  removeButton()

  const parser = parsers.find((p) => p.matches(location.href))
  if (!parser) return

  // LinkedIn's job-title element renders late on cold load (cache-miss);
  // 30s covers slow first paints without burning a real "give up" signal.
  const ready = await waitForSelector(parser.readySelector, 30000)
  if (!ready) return

  // Re-check the URL didn't change while we were waiting.
  if (!parser.matches(location.href)) return

  try {
    injectButton(parser)
  } catch (e) {
    console.error('TrackWise: failed to inject save button', e)
  }
}

export function start() {
  void detectAndInject()
  // Polling chosen for simplicity. Event-driven alternatives if perf matters:
  // navigation API (chrome) or patching history.pushState/replaceState.
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      void detectAndInject()
    }
  }, 500)
  window.addEventListener('resize', () => {
    if (host) positionButton(host)
  })
}
