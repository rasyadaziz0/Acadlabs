import Header from "@/components/header";
import AppSidebarContent from "@/components/app-sidebar-content";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarInset,
} from "@/components/animate-ui/radix/sidebar";

// Ensure this layout is dynamic since it depends on auth cookies
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side auth check for all (dashboard) routes
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // No-op in layout to avoid TS/runtime issues; route handlers can set cookies when needed
        set(_name: string, _value: string, _options: CookieOptions) { },
        remove(_name: string, _options: CookieOptions) { },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <SidebarProvider className="h-dvh w-full overflow-hidden bg-background">
      <Sidebar side="left" variant="sidebar" collapsible="offcanvas">
        <SidebarHeader />
        <SidebarContent>
          <AppSidebarContent />
        </SidebarContent>
        <SidebarFooter>
          <div className="p-1 w-full">

            <Button asChild variant="ghost" className="w-full justify-start h-auto px-2 py-2 rounded-lg">
              <Link href="/donatur" className="flex w-full items-center" aria-label="Buka halaman Donatur">
                <span className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-600/10 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400">
                  <Heart className="h-4 w-4" />
                </span>
                <div className="flex flex-col items-start min-w-0 flex-1 whitespace-normal">
                  <span className="text-sm font-medium leading-5">Donasi maintenance</span>
                  <span className="text-xs text-muted-foreground break-words">Bisa kali buat maintenance server 😁</span>
                </div>
              </Link>
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0 h-full overflow-hidden">
        <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
          <Header />
          <main id="app-scroll" className="relative flex-1 min-h-0 w-full overflow-hidden">
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
