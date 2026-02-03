"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Search, Globe } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  isSearching: boolean;
}

function getDomain(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return "website.com";
  }
}

function cleanText(text: string) {
  return text.replace(/<[^>]*>?/gm, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

export default function SearchResults({ results, isSearching }: SearchResultsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to start when new results appear
  useEffect(() => {
    if (results.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  }, [results]);

  if (!isSearching && results.length === 0) return null;

  return (
    <div className="w-full relative group">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`p-1.5 rounded-full bg-blue-500/10 text-blue-500 ${isSearching ? 'animate-pulse' : ''}`}>
          <Search className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {isSearching ? "Searching Web..." : "Sources"}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-4 px-1 snap-x scrollbar-thin scrollbar-thumb-muted/20 scrollbar-track-transparent hover:scrollbar-thumb-muted/40 transition-colors mask-linear-fade"
        style={{
          scrollbarWidth: 'thin',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <AnimatePresence mode="popLayout">
          {isSearching && results.length === 0 ? (
            // Skeleton Loading State
            Array.from({ length: 3 }).map((_, i) => (
              <motion.div
                key={`skeleton-${i}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, delay: i * 0.1 }}
                className="flex-none w-64 h-32 bg-muted/40 rounded-xl border border-border/50 p-4 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="h-4 bg-muted-foreground/10 rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-muted-foreground/10 rounded w-full animate-pulse" />
                </div>
                <div className="flex items-center gap-2 mt-auto">
                  <div className="w-4 h-4 rounded-full bg-muted-foreground/10 animate-pulse" />
                  <div className="h-3 w-20 bg-muted-foreground/10 rounded animate-pulse" />
                </div>
              </motion.div>
            ))
          ) : (
            // Actual Results
            results.map((result, idx) => (
              <motion.a
                key={`${result.url}-${idx}`}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.4, delay: idx * 0.1, type: "spring", stiffness: 100 }}
                whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
                whileTap={{ scale: 0.98 }}
                className="flex-none snap-start w-64 h-auto min-h-[140px] bg-card hover:bg-muted/30 border border-border/60 hover:border-blue-500/30 rounded-xl p-4 flex flex-col justify-between transition-all cursor-pointer shadow-sm hover:shadow-md group/card relative overflow-hidden"
              >
                {/* Decorative gradient blob */}
                <div className="absolute -top-10 -right-10 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover/card:bg-blue-500/10 transition-colors" />

                <div className="relative z-10">
                  <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-relaxed mb-1.5 group-hover/card:text-blue-500 transition-colors">
                    {cleanText(result.title)}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {cleanText(result.description)}
                  </p>
                </div>

                <div className="relative z-10 flex items-center justify-between mt-3 pt-3 border-t border-border/40">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="p-1 rounded-md bg-background border border-border/50 shadow-sm shrink-0">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${getDomain(result.url)}&sz=32`}
                        alt=""
                        className="w-3.5 h-3.5 object-contain opacity-80"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <Globe className="w-3.5 h-3.5 text-muted-foreground hidden" />
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[120px]">
                      {getDomain(result.url)}
                    </span>
                  </div>
                  <ExternalLink className="w-3 h-3 text-muted-foreground/60 group-hover/card:text-blue-500 transition-colors" />
                </div>
              </motion.a>
            ))
          )}
        </AnimatePresence>

        {/* Spacer for right padding in scrolling container */}
        <div className="w-2 flex-none" />
      </div>
    </div>
  );
}