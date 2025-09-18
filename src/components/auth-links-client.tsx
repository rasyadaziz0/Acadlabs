"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { useSupabase } from "./supabase-provider";

function shouldShow(pathname: string) {
  // Only show on the home page
  return pathname === "/";
}

export default function AuthLinksClient() {
  const pathname = usePathname();
  const { user } = useSupabase();

  if (!pathname) return null;
  if (user) return null; // hide when logged in
  if (!shouldShow(pathname)) return null; // show only on home page

  return (
    <div className="fixed top-4 right-4 z-[60] flex items-center gap-2">
      <Link
        href="/login"
        className={`${buttonVariants({ variant: "ghost", size: "sm" })} rounded-full bg-white text-black hover:bg-white/90 shadow-sm`}
      >
        Log in
      </Link>
      <Link
        href="/register"
        className={`${buttonVariants({ variant: "ghost", size: "sm" })} rounded-full bg-yellow-400 hover:bg-yellow-500 hidden sm:inline-flex`}
      >
        Sign up free
      </Link>
    </div>
  );
}
