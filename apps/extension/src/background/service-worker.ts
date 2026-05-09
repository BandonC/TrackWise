import type { Message, MessageResponse } from '../lib/types'

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (response: MessageResponse) => void) => {
    void handle(message).then(sendResponse)
    return true
  },
)

async function handle(message: Message): Promise<MessageResponse> {
  switch (message.type) {
    case 'save_application':
    case 'get_recent':
    case 'sign_in':
    case 'sign_out':
    case 'get_session':
      return { ok: false, error: 'not implemented' }
    default:
      return assertNever(message)
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled message: ${JSON.stringify(x)}`)
}
