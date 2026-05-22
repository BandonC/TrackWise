// Side-effect-only module imported first by the service worker (before
// anything that constructs the Supabase client). The chrome://extensions
// Errors panel captures BOTH unhandled rejections AND console.error
// calls. Supabase's refresh-token path uses both -- it rejects the
// promise *and* logs the error directly via console.error inside its
// own catch blocks. Suppress both pathways, but only for the specific
// auth-noise messages; everything else still surfaces.

const NOISE_PATTERNS = [
  'Refresh Token Not Found',
  'refresh_token_not_found',
  'Auth session missing',
]

function isAuthNoise(text: string): boolean {
  return NOISE_PATTERNS.some((p) => text.includes(p))
}

self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : ''
  if (isAuthNoise(message)) event.preventDefault()
})

const originalConsoleError = console.error.bind(console)
console.error = (...args: unknown[]) => {
  const joined = args
    .map((a) =>
      a instanceof Error ? a.message : typeof a === 'string' ? a : '',
    )
    .join(' ')
  if (isAuthNoise(joined)) return
  originalConsoleError(...args)
}
