import type { Message, MessageResponse } from '../lib/types'
import { signInWithGoogle, signOut, getCurrentUser } from './auth'
import { saveApplication } from './applications'

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
  const url = sender.tab?.url ?? sender.url ?? ''
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return false
  }
  const fromExtension = origin === `chrome-extension://${chrome.runtime.id}`
  const fromSite =
    origin === 'https://www.linkedin.com' || origin === 'https://www.indeed.com'

  switch (message.type) {
    case 'sign_in':
    case 'sign_out':
    case 'get_session':
      return fromExtension
    case 'save_application':
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
      case 'get_recent':
        return { ok: false, error: 'not implemented' }
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
