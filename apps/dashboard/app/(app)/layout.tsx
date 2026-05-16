import { AppNav } from '@/components/app-nav'
import { RefreshOnFocus } from '@/components/refresh-on-focus'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      <RefreshOnFocus />
      {children}
    </>
  )
}
