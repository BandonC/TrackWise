import { Suspense } from 'react'
import { AppNav } from '@/components/app-nav'
import { RefreshOnFocus } from '@/components/refresh-on-focus'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense
        fallback={
          <div className="sticky top-0 z-10 border-b bg-background/80 py-3 backdrop-blur">
            <div className="mx-auto h-7 w-full max-w-7xl px-6" />
          </div>
        }
      >
        <AppNav />
      </Suspense>
      <RefreshOnFocus />
      {children}
    </>
  )
}
