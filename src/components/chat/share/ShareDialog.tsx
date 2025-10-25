"use client";

import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Twitter, Linkedin, Share2 } from "lucide-react";
import MarkdownRenderer from "../markdown/MarkdownRenderer";

export interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  chatTitle?: string;
  shareSlug?: string;
  onCopied?: () => void;
}

export default function ShareDialog({ open, onOpenChange, content, chatTitle, shareSlug, onCopied }: ShareDialogProps) {
  const previewText = useMemo(() => {
    const max = 900;
    const t = content || "";
    return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
  }, [content]);

  function openWindow(url: string) {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      window.location.href = url;
    }
  }

  const buildShareUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (shareSlug) return `${origin}/s/${encodeURIComponent(shareSlug)}`;
    return '';
  };

  const shareToX = () => {
    const text = `${chatTitle ? chatTitle + "\n\n" : ""}${previewText}`.slice(0, 240);
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
    openWindow(url);
    onOpenChange(false);
  };

  const shareToReddit = () => {
    const title = chatTitle || "AI Answer";
    const text = previewText;
    const url = `https://www.reddit.com/submit?title=${encodeURIComponent(title)}&text=${encodeURIComponent(text)}`;
    openWindow(url);
    onOpenChange(false);
  };

  const shareGeneric = async () => {
    try {
      const text = content || "";
      const navAny = navigator as any;
      if (navAny && typeof navAny.share === "function") {
        await navAny.share({ title: "AI Answer", text });
        onOpenChange(false);
        return;
      }
      await navigator.clipboard?.writeText(text);
      onCopied?.();
      onOpenChange(false);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="text-[28px] font-bold leading-tight">{chatTitle || "Bagikan jawaban"}</DialogTitle>
          <DialogDescription className="sr-only">Pratinjau jawaban yang akan dibagikan</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/80 p-3 sm:p-4 shadow-inner relative">
          <div className="max-h-[360px] md:max-h-[420px] overflow-hidden">
            <div className="prose dark:prose-invert w-full max-w-[72ch] min-w-0 break-words text-[15px] sm:text-[16px] leading-relaxed prose-headings:tracking-tight prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-2 prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:my-[6px] prose-strong:font-semibold prose-a:no-underline hover:prose-a:underline prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-ul:my-[6px] prose-ol:my-[6px] prose-li:my-1 prose-li:marker:text-zinc-500 dark:prose-li:marker:text-zinc-400 prose-pre:rounded-lg prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-hr:border-zinc-200 dark:prose-hr:border-zinc-800 prose-blockquote:border-l-4 prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-700 prose-blockquote:pl-4 prose-blockquote:italic">
              <MarkdownRenderer content={previewText} role="assistant" isStreaming={false} />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-100 dark:from-zinc-900 to-transparent" />
          <div className="absolute bottom-2 right-3 text-sm font-semibold text-zinc-400 select-none">Acadlabs</div>
        </div>
        <div className="mt-2 text-xs text-zinc-500">Hanya jawaban ini yang akan dibagikan</div>
        <div className="mt-3 grid grid-cols-4 gap-4 justify-items-center">
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="ghost"
              className="h-12 w-12 rounded-full"
              onClick={async () => {
                const url = buildShareUrl();
                await navigator.clipboard?.writeText(url);
                onCopied?.();
                onOpenChange(false);
              }}
              aria-label="Salin tautan jawaban"
            >
              <Copy size={18} />
            </Button>
            <div className="text-xs text-zinc-500">Salin tautan</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Button variant="ghost" className="h-12 w-12 rounded-full" onClick={shareToX} aria-label="Bagikan ke X">
              <Twitter size={18} />
            </Button>
            <div className="text-xs text-zinc-500">X</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Button variant="ghost" className="h-12 w-12 rounded-full" onClick={shareGeneric} aria-label="Bagikan ke LinkedIn">
              <Linkedin size={18} />
            </Button>
            <div className="text-xs text-zinc-500">LinkedIn</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Button variant="ghost" className="h-12 w-12 rounded-full" onClick={shareToReddit} aria-label="Bagikan ke Reddit">
              <Share2 size={18} />
            </Button>
            <div className="text-xs text-zinc-500">Reddit</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
