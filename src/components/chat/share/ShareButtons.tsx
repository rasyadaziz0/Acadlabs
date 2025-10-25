"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { createBrowserClient } from "@supabase/ssr";
import ShareDialog from "./ShareDialog";

export interface ShareButtonsProps {
  content: string;
  chatTitle?: string;
  shareSlug?: string;
  chatId?: string;
  messageId?: string;
}

export default function ShareButtons({ content, chatTitle, shareSlug, chatId, messageId }: ShareButtonsProps) {
  const [justShared, setJustShared] = useState(false);
  const [slugOverride, setSlugOverride] = useState<string | undefined>(undefined); // message-level slug when available
  const [isSharing, setIsSharing] = useState(false);
  const [open, setOpen] = useState(false);

  const supabase = useMemo(
    () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
    []
  );

  const buildShortShareUrl = () => {
    const effective = slugOverride || shareSlug;
    if (!effective) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/s/${encodeURIComponent(effective)}`;
  };

  async function handleCopyAnswer() {
    try {
      await navigator.clipboard?.writeText(content || "");
      setJustShared(true);
      setTimeout(() => setJustShared(false), 1500);
    } catch {}
  }

  async function handleShareClick() {
    try {
      setIsSharing(true);
      let effectiveSlug = slugOverride || shareSlug;

      // 1) Per-message share: gunakan messages.share_slug
      if (!effectiveSlug && messageId) {
        // Re-check row message
        const { data: msgRow } = await supabase
          .from("messages")
          .select("share_slug")
          .eq("id", messageId)
          .maybeSingle();
        if (msgRow?.share_slug) {
          effectiveSlug = msgRow.share_slug as string;
          setSlugOverride(effectiveSlug);
        } else {
          const gen = () => crypto.randomUUID().split('-')[0];
          let attempts = 0;
          while (attempts < 6 && !effectiveSlug) {
            const candidate = gen();
            // cek unik di messages
            const { data: existsMsg } = await supabase
              .from("messages")
              .select("id")
              .eq("share_slug", candidate)
              .maybeSingle();
            if (!existsMsg) {
              const { data: updatedMsg, error: updErr } = await supabase
                .from("messages")
                .update({ share_slug: candidate })
                .eq("id", messageId)
                .select("share_slug")
                .single();
              if (!updErr && updatedMsg?.share_slug) {
                effectiveSlug = updatedMsg.share_slug as string;
                setSlugOverride(effectiveSlug);
                break;
              }
            }
            attempts++;
          }
        }
      }

      // 2) Fallback (optional): per-chat kalau messageId tidak diberikan
      if (!effectiveSlug && !messageId && chatId) {
        const { data: chatRow, error: chatErr } = await supabase
          .from("chats")
          .select("share_slug")
          .eq("id", chatId)
          .single();
        if (!chatErr && chatRow?.share_slug) {
          effectiveSlug = chatRow.share_slug as string;
          setSlugOverride(effectiveSlug);
        } else {
          const gen = () => crypto.randomUUID().split('-')[0];
          let attempts = 0;
          while (attempts < 6 && !effectiveSlug) {
            const candidate = gen();
            const { data: existsChat } = await supabase
              .from("chats")
              .select("id")
              .eq("share_slug", candidate)
              .maybeSingle();
            if (!existsChat) {
              const { data: updated, error: updErr } = await supabase
                .from("chats")
                .update({ share_slug: candidate })
                .eq("id", chatId)
                .select("share_slug")
                .single();
              if (!updErr && updated?.share_slug) {
                effectiveSlug = updated.share_slug as string;
                setSlugOverride(effectiveSlug);
                break;
              }
            }
            attempts++;
          }
        }
      }

      if (!effectiveSlug) {
        toast.error("Tidak bisa membuat tautan pendek. Coba lagi nanti.");
        setIsSharing(false);
        return;
      }
      const url = buildShortShareUrl();
      if (!url) { setIsSharing(false); return; }

      // Mobile: langsung Web Share jika tersedia; fallback copy
      const navAny = navigator as any;
      const isCoarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (navAny && typeof navAny.share === 'function' && isCoarse) {
        try {
          await navAny.share({ title: chatTitle || 'Shared Chat', url });
          setIsSharing(false);
          return;
        } catch {
          // fallback copy to clipboard
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(url);
            } else {
              const ta = document.createElement('textarea');
              ta.value = url;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            }
            setJustShared(true);
            toast.success('Tautan disalin');
            setTimeout(() => setJustShared(false), 1500);
          } catch {}
          setIsSharing(false);
          return;
        }
      }

      // Desktop: buka preview modal ala ChatGPT
      setIsSharing(false);
      setOpen(true);
    } catch {
      setIsSharing(false);
      toast.error("Terjadi kesalahan saat membagikan");
    }
  }

  return (
    <div className="mt-2 flex items-center gap-1 text-zinc-500">
      {/* Desktop preview modal */}
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        content={content}
        chatTitle={chatTitle}
        shareSlug={slugOverride || shareSlug}
        onCopied={() => {
          setJustShared(true);
          toast.success('Tautan disalin');
          setTimeout(() => setJustShared(false), 1500);
        }}
      />
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
        onClick={handleShareClick}
        disabled={isSharing}
        aria-label="Share this answer"
        title={isSharing ? "Generating link..." : justShared ? "Copied to clipboard" : "Share link"}
      >
        <Share2 size={16} />
      </Button>
      {justShared ? <span className="text-xs text-zinc-500">Copied</span> : null}
    </div>
  );
}
