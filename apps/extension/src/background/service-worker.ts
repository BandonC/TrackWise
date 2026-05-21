import type { Message, MessageResponse } from '../lib/types'
import { signInWithGoogle, signOut, getCurrentUser } from './auth'
import { saveApplication, getApplicationCount } from './applications'
import { scoreCurrentPage } from './scoring'

// Supabase's background auto-refresh fires on a timer inside the
// service worker. When the user is signed out (or the refresh
// token was just cleared by signOut), the refresh attempt throws
// "Invalid Refresh Token: Refresh Token Not Found" which bubbles
// to chrome://extensions as a red error banner. That's noise --
// the signed-out state is the correct state. Swallow only this
// specific class of refresh-noise error so real errors still
// surface to the panel.
self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : ''
  if (
    message.includes('Refresh Token Not Found') ||
    message.includes('refresh_token_not_found') ||
    message.includes('Auth session missing')
  ) {
    event.preventDefault()
  }
})

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse: (response: MessageResponse) => void) => {
    if (!isValidSender(message, sender)) {
      sendResponse({ ok: false, error: 'Forbidden sender' })
      return false
    }
    void handle(message).then(sendResponse)
    return true
  },
)

function isValidSender(message: Message, sender: chrome.runtime.MessageSender): boolean {
  const rawUrl = sender.tab?.url ?? sender.url ?? ''
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  const fromExtension = parsed.origin === `chrome-extension://${chrome.runtime.id}`
  const fromSite =
    parsed.protocol === 'https:' &&
    (parsed.hostname === 'www.linkedin.com' ||
      parsed.hostname === 'indeed.com' ||
      parsed.hostname.endsWith('.indeed.com'))

  switch (message.type) {
    case 'sign_in':
    case 'sign_out':
    case 'get_session':
    case 'get_application_count':
      return fromExtension
    case 'save_application':
    case 'score_current_page':
    case 'get_recent':
      return fromExtension || fromSite
    default:
      return assertNever(message)
  }
}

async function handle(message: Message): Promise<MessageResponse> {
  try {
    switch (message.type) {
      case 'sign_in':
        return { ok: true, data: await signInWithGoogle() }
      case 'sign_out':
        await signOut()
        return { ok: true, data: null }
      case 'get_session':
        return { ok: true, data: await getCurrentUser() }
      case 'save_application':
        return { ok: true, data: await saveApplication(message.payload) }
      case 'score_current_page':
        return { ok: true, data: await scoreCurrentPage(message.payload) }
      case 'get_recent':
        return { ok: false, error: 'not implemented' }
      case 'get_application_count':
        return { ok: true, data: await getApplicationCount() }
      default:
        return assertNever(message)
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled message: ${JSON.stringify(x)}`)
}
