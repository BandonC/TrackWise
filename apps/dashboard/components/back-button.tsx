'use client'

import { useRouter } from 'next/navigation'

export function BackButton() {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back()
        } else {
          router.push('/')
        }
      }}
      className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
    >
      ← Back
    </button>
  )
}
