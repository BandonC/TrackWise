import type { Message, MessageResponse } from '../lib/types'
import { signInWithGoogle, signOut, getCurrentUser } from './auth'

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (response: MessageResponse) => void) => {
    void handle(message).then(sendResponse)
    return true
  },
)

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
