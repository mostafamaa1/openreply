"use client";

import { Suspense, useState } from "react";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/top-bar";
import MobileTabs from "@/components/mobile-tabs";
import { RangeProvider } from "@/components/range-context";

interface DashboardShellProps {
  children: React.ReactNode;
  workspaceName: string;
  instagramUsername: string | null;
  instagramAccountCount: number;
}

export default function DashboardShell({
  children,
  workspaceName,
  instagramUsername,
  instagramAccountCount,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    // useSearchParams (the range) needs a Suspense boundary above it.
    <Suspense>
      <RangeProvider>
        {/* h-dvh, not h-screen: on mobile browsers the URL bar eats into
            100vh, which would push controls below the fold. */}
        <div className="flex h-dvh overflow-hidden bg-background">
          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            workspaceName={workspaceName}
          />

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar
              onMenuClick={() => setSidebarOpen(true)}
              instagramUsername={instagramUsername}
              instagramAccountCount={instagramAccountCount}
            />

            {/* overflow-x-hidden: a wide child must not drag the page
                sideways on a phone. Bottom padding clears the tab bar. */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
              <div className="mx-auto max-w-[1400px] px-4 py-5 sm:py-6 lg:px-8">
                {children}
              </div>
            </main>
          </div>

          <MobileTabs onMore={() => setSidebarOpen(true)} />
        </div>
      </RangeProvider>
    </Suspense>
  );
}
