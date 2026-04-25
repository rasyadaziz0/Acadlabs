"use client";

import { useSupabase } from "./supabase-provider";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/animate-ui/radix/sidebar";

export default function Header() {
  const { user, signOut } = useSupabase();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const avatarUrl =
    (user as any)?.user_metadata?.avatar_url ||
    (user as any)?.user_metadata?.picture ||
    null;

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b border-border/50 bg-background/60 supports-[backdrop-filter]:bg-background/40 backdrop-blur-2xl p-4 relative"
      >

        <div className="flex items-center justify-between w-full relative z-10">
          {/* Left section: menu button (mobile) + logo */}
          <div className="flex items-center gap-3">
            <SidebarTrigger className="md:hidden" />

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="flex items-center"
            >
              <h1 className="text-xl font-bold text-yellow-500">
                <span className="text-foreground font-bold text-yellow-500">Acadlabs.</span>
              </h1>
            </motion.div>
          </div>

          {/* Right section: theme toggle + avatar */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {mounted ? (
                theme === "dark" ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )
              ) : (
                <div className="h-5 w-5" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={avatarUrl || undefined}
                      alt={(user as any)?.user_metadata?.full_name || "User Avatar"}
                    />
                    <AvatarFallback>
                      {user?.user_metadata?.full_name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={signOut}>Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </>
  );
}