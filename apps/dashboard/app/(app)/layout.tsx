import { Suspense } from 'react'
import { AppNav } from '@/components/app-nav'
import { RefreshOnFocus } from '@/components/refresh-on-focus'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <Suspense
        fallback={
          <div className="h-14 shrink-0 border-b bg-sidebar md:h-svh md:w-56 md:border-r md:border-b-0" />
        }
      >
        <AppNav />
      </Suspense>
      <RefreshOnFocus />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
