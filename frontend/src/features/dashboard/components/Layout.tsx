import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { AppSidebar } from './Sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { useImageStore } from '@/store/imageStore'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export function Layout() {
  const fetchS3PublicUrl = useImageStore((state) => state.fetchS3PublicUrl)

  useEffect(() => {
    fetchS3PublicUrl()
  }, [fetchS3PublicUrl])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <ErrorBoundary label="this page">
            <Outlet />
          </ErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
