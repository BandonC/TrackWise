import type { Message, MessageResponse } from '../lib/types'
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
  // Indeed: park just above the right pane, aligned to its right edge.
  // Stays clean on narrower viewports because the pane is much narrower than the page.
  const indeedPane = document.querySelector('.jobsearch-RightPane, #jobsearch-ViewjobPaneWrapper')
  if (indeedPane) {
    const rect = indeedPane.getBoundingClientRect()
    if (rect.width > 0) {
      wrapper.style.top = `${Math.max(rect.top - 48, 12)}px`
      wrapper.style.right = `${Math.max(window.innerWidth - rect.right, 12)}px`
      wrapper.style.left = 'auto'
      wrapper.style.bottom = 'auto'
      return
    }
  }

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
  `
  shadow.appendChild(style)

  const btn = document.createElement('button')
  btn.textContent = 'Save to TrackWise'
  btn.addEventListener('click', () => handleClick(parser, btn))
  shadow.appendChild(btn)

  document.body.appendChild(wrapper)
  host = wrapper
}

async function handleClick(parser: Parser, btn: HTMLButtonElement) {
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

async function detectAndInject() {
  removeButton()

  const parser = parsers.find((p) => p.matches(location.href))
  if (!parser) return

  const ready = await waitForSelector(parser.readySelector, 5000)
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
