import type { Message, MessageResponse } from '../lib/types'
import type { AuthUser } from '../background/auth'

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL
if (!DASHBOARD_URL) {
  throw new Error('Missing VITE_DASHBOARD_URL in extension env')
}

const loadingEl = document.getElementById('loading') as HTMLDivElement
const signedOutEl = document.getElementById('signed-out') as HTMLDivElement
const signedInEl = document.getElementById('signed-in') as HTMLDivElement
const emailEl = document.getElementById('email') as HTMLSpanElement
const signInBtn = document.getElementById('sign-in-btn') as HTMLButtonElement
const signOutBtn = document.getElementById('sign-out-btn') as HTMLButtonElement
const dashboardLink = document.getElementById('dashboard-link') as HTMLAnchorElement
const statusEl = document.getElementById('status') as HTMLDivElement
const onboardingEl = document.getElementById('onboarding') as HTMLDivElement

dashboardLink.href = DASHBOARD_URL

async function send<T>(message: Message): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<T>
  if (!response.ok) throw new Error(response.error)
  return response.data
}

function render(user: AuthUser | null) {
  loadingEl.hidden = true
  statusEl.textContent = ''
  if (user) {
    signedOutEl.hidden = true
    signedInEl.hidden = false
    emailEl.textContent = user.email ?? user.id
    // Lazily fetch the application count to decide whether to
    // show first-run onboarding. The card stays hidden until the
    // count is known, then appears only if zero. Failures stay
    // silent -- a missing onboarding hint is not worth surfacing
    // an error for.
    void send<number>({ type: 'get_application_count' })
      .then((count) => {
        onboardingEl.hidden = count > 0
      })
      .catch(() => {
        onboardingEl.hidden = true
      })
  } else {
    signedInEl.hidden = true
    signedOutEl.hidden = false
    onboardingEl.hidden = true
  }
}

function showError(e: unknown) {
  statusEl.textContent = e instanceof Error ? e.message : String(e)
}

signInBtn.addEventListener('click', async () => {
  signInBtn.disabled = true
  statusEl.textContent = ''
  try {
    render(await send<AuthUser>({ type: 'sign_in' }))
  } catch (e) {
    showError(e)
  } finally {
    signInBtn.disabled = false
  }
})

signOutBtn.addEventListener('click', async () => {
  signOutBtn.disabled = true
  try {
    await send<null>({ type: 'sign_out' })
    render(null)
  } catch (e) {
    showError(e)
  } finally {
    signOutBtn.disabled = false
  }
})

try {
  render(await send<AuthUser | null>({ type: 'get_session' }))
} catch (e) {
  showError(e)
  loadingEl.hidden = true
}
