"use client";

import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link2, Linkedin } from "lucide-react";
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

  const shareToLinkedIn = () => {
    const url = buildShareUrl();
    // LinkedIn sharing is best done via URL. 
    // If we don't have a public URL, we can only really share text if we use their API, 
    // but standard intent is via url `https://www.linkedin.com/sharing/share-offsite/?url={url}`
    // If no URL (local dev), we might just copy. 
    // Assuming production has URL.
    if (!url) {
      // Fallback to generic share if no URL
      shareGeneric();
      return;
    }
    const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    openWindow(linkedinUrl);
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
    } catch { }
  };

  const handleCopyLink = async () => {
    const url = buildShareUrl();
    if (url) {
      await navigator.clipboard?.writeText(url);
      onCopied?.();
      onOpenChange(false);
    } else {
      // Fallback if no slug yet
      shareGeneric();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] p-0 border-0 bg-zinc-900 text-zinc-50 rounded-[50px] overflow-hidden shadow-2xl duration-700 data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100">
        <DialogTitle className="sr-only">Bagikan jawaban</DialogTitle>
        <DialogDescription className="sr-only">Pratinjau konten yang akan dibagikan</DialogDescription>

        <div className="p-10 pb-12">
          <h2 className="text-[26px] font-bold mb-8 text-zinc-100 px-2 text-center">Bagikan jawaban</h2>

          {/* Preview Box */}
          <div className="relative rounded-[24px] bg-zinc-800/50 p-6 min-h-[200px] border border-zinc-700/50">
            {/* Title in Preview */}
            {chatTitle && (
              <div className="mb-4 font-semibold text-xl text-zinc-100 line-clamp-1">
                {chatTitle}
              </div>
            )}

            {/* Content */}
            <div className="max-h-[300px] overflow-hidden relative">
              <div className="prose prose-invert prose-base max-w-none text-zinc-300">
                <MarkdownRenderer content={previewText} role="assistant" isStreaming={false} />
              </div>
            </div>

            {/* Gradient Fade */}
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-800 to-transparent rounded-b-[40px] pointer-events-none" />

            {/* Acadlabs Badge */}
            <div className="absolute bottom-5 right-6 z-10">
              <span className="text-white font-bold text-xl tracking-wide">Acadlabs</span>
            </div>
          </div>

          {/* Footer Text */}
          <div className="mt-6 flex items-center justify-center text-zinc-500 text-sm">
            <span>Hanya jawaban ini yang akan dibagikan</span>
          </div>

          {/* Social Buttons */}
          <div className="mt-8 flex items-center justify-center gap-6 sm:gap-10">
            <ShareButton
              icon={<Link2 size={22} className="text-zinc-900" />}
              label="Salin tautan"
              onClick={handleCopyLink}
            />
            <ShareButton
              icon={<XIcon className="w-5 h-5 text-zinc-900" />}
              label="X"
              onClick={shareToX}
            />
            <ShareButton
              icon={<Linkedin size={22} className="text-zinc-900 stroke-zinc-900" fill="currentColor" style={{ strokeWidth: 0 }} />}
              label="LinkedIn"
              onClick={shareToLinkedIn}
            />
            <ShareButton
              icon={<RedditIcon className="w-6 h-6 text-zinc-900" />}
              label="Reddit"
              onClick={shareToReddit}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 group cursor-pointer" onClick={onClick}>
      <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center transition-transform group-hover:scale-110 shadow-lg group-active:scale-95">
        {icon}
      </div>
      <span className="text-sm font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
        {label}
      </span>
    </div>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 1227" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z" fill="currentColor" />
    </svg>
  )
}

function RedditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M12 0C5.373 0 0 5.373 0 12C0 18.627 5.373 24 12 24C18.627 24 24 18.627 24 12C24 5.373 18.627 0 12 0ZM17.442 7.842C17.962 7.842 18.384 8.264 18.384 8.784C18.384 9.304 17.962 9.726 17.442 9.726C16.922 9.726 16.5 9.304 16.5 8.784C16.5 8.264 16.922 7.842 17.442 7.842ZM14.172 17.064C13.602 17.658 12.846 17.988 12 17.988C11.154 17.988 10.398 17.658 9.828 17.064C9.552 16.788 9.552 16.338 9.828 16.062C10.104 15.786 10.554 15.786 10.83 16.062C11.142 16.374 11.55 16.554 12 16.554C12.45 16.554 12.858 16.374 13.17 16.062C13.446 15.786 13.896 15.786 14.172 16.062C14.448 16.338 14.448 16.788 14.172 17.064ZM8.784 9.726C8.264 9.726 7.842 9.304 7.842 8.784C7.842 8.264 8.264 7.842 8.784 7.842C9.304 7.842 9.726 8.264 9.726 8.784C9.726 9.304 9.304 9.726 8.784 9.726ZM19.5 12.912C19.5 13.632 19.122 14.28 18.534 14.652C18.666 16.506 17.154 18.666 12 18.666C6.846 18.666 5.334 16.506 5.466 14.652C4.878 14.28 4.5 13.632 4.5 12.912C4.5 11.97 5.256 11.214 6.198 11.214C6.864 11.214 7.44 11.604 7.716 12.18C8.586 11.286 10.158 10.668 11.988 10.584L12.822 6.564L15.39 7.158C15.486 6.576 15.99 6.144 16.584 6.144C17.304 6.144 17.886 6.726 17.886 7.446C17.886 8.166 17.304 8.748 16.584 8.748C16.044 8.748 15.582 8.412 15.396 7.938L12.528 7.272L11.604 11.754C10.74 11.778 9.948 12.018 9.294 12.42C9.408 12.564 9.516 12.726 9.594 12.912C9.594 12.924 9.594 12.924 9.594 12.936C9.654 14.232 10.812 15.222 12 15.222C13.188 15.222 14.346 14.232 14.406 12.912C14.478 12.75 14.586 12.594 14.706 12.456C14.07 12.06 13.296 11.832 12.474 11.802C14.196 11.892 15.654 12.45 16.488 13.26C16.914 12.042 18.09 11.214 19.5 11.214C20.442 11.214 21.198 11.97 21.198 12.912H19.5Z" />
    </svg>
  )
}
