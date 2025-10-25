"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Share2 } from "lucide-react";
import ShareDialog from "./ShareDialog";

export interface ShareButtonsProps {
  content: string;
  chatTitle?: string;
}

export default function ShareButtons({ content, chatTitle }: ShareButtonsProps) {
  const [justShared, setJustShared] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)") : null;
    const update = () => setIsMobile(!!mq?.matches);
    update();
    mq?.addEventListener ? mq.addEventListener("change", update) : mq?.addListener?.(update);
    return () => {
      mq?.removeEventListener ? mq.removeEventListener("change", update) : mq?.removeListener?.(update);
    };
  }, []);

  const previewText = useMemo(() => {
    const max = 900;
    const t = content || "";
    return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
  }, [content]);

  const buildShareUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = content || "";
    const title = chatTitle || "";
    const b64 = (s: string) => {
      try {
        return typeof window !== "undefined" && window.btoa ? window.btoa(unescape(encodeURIComponent(s))) : "";
      } catch {
        return "";
      }
    };
    const m = encodeURIComponent(b64(text));
    const t = title ? `&t=${encodeURIComponent(b64(title))}` : "";
    return `${origin}/share?m=${m}${t}`;
  };

  async function handleCopyAnswer() {
    try {
      await navigator.clipboard?.writeText(content || "");
      setJustShared(true);
      setTimeout(() => setJustShared(false), 1500);
    } catch {}
  }

  async function handleMobileShare() {
    try {
      const url = buildShareUrl();
      const navAny = navigator as any;
      if (navAny && typeof navAny.share === "function") {
        await navAny.share({ title: chatTitle || "AI Answer", url });
        return;
      }
      await navigator.clipboard?.writeText(url);
      setJustShared(true);
      setTimeout(() => setJustShared(false), 1500);
    } catch {}
  }

  return (
    <div className="mt-2 flex items-center gap-1 text-zinc-500">
      <Button
        variant="ghost"
        className="h-8 w-8 p-0 hover:bg-transparent"
        onClick={handleCopyAnswer}
        aria-label="Copy this answer"
        title={justShared ? "Copied" : "Copy"}
      >
        <Copy size={16} />
      </Button>
      <Button
        variant="ghost"
        className="h-8 w-8 p-0 hover:bg-transparent"
        onClick={async () => {
          if (isMobile) {
            await handleMobileShare();
          } else {
            setShareOpen(true);
          }
        }}
        aria-label="Share this answer"
        title={justShared ? "Copied to clipboard" : "Share"}
      >
        <Share2 size={16} />
      </Button>
      {justShared ? <span className="text-xs text-zinc-500">Copied</span> : null}

      <ShareDialog
        open={shareOpen}
        onOpenChange={(open: boolean) => setShareOpen(open)}
        content={content}
        chatTitle={chatTitle}
        onCopied={() => {
          setJustShared(true);
          setTimeout(() => setJustShared(false), 1500);
        }}
      />
    </div>
  );
}
