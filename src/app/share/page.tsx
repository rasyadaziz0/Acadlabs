"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import MarkdownRenderer from "@/components/chat/markdown/MarkdownRenderer";

function decodeB64Utf8(input: string | null): string {
  if (!input) return "";
  try {
    const bin = atob(input);
    try {
      return decodeURIComponent(escape(bin));
    } catch {
      return bin;
    }
  } catch {
    return "";
  }
}

function ShareContent() {
  const params = useSearchParams();
  const m = params.get("m");
  const t = params.get("t");
  const router = useRouter();
  const [attemptedRedirect, setAttemptedRedirect] = useState(false);
  const supabase = useMemo(
    () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
    []
  );

  const title = useMemo(() => decodeB64Utf8(t), [t]) || "Shared Answer";
  const body = useMemo(() => decodeB64Utf8(m), [m]);

  // Rendering diseragamkan dengan ChatMessage melalui MarkdownRenderer

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!m || !body) { setAttemptedRedirect(true); return; }
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) { setAttemptedRedirect(true); return; }
        // Cari pesan assistant milik user yang sama persis dengan body (legacy share menyalin 1 jawaban)
        const { data: msg, error: msgErr } = await supabase
          .from("messages")
          .select("chat_id, created_at")
          .eq("user_id", userData.user.id)
          .eq("role", "assistant")
          .eq("content", body)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (msgErr || !msg) { setAttemptedRedirect(true); return; }

        const chatId = (msg as any).chat_id as string;
        // Ambil/generate share_slug pada chats
        let slug: string | undefined;
        const { data: chatRow } = await supabase
          .from("chats")
          .select("share_slug")
          .eq("id", chatId)
          .maybeSingle();
        if (chatRow?.share_slug) {
          slug = chatRow.share_slug as string;
        } else {
          const gen = () => crypto.randomUUID().split('-')[0];
          let tries = 0;
          while (tries < 6 && !slug) {
            const candidate = gen();
            const { data: exists } = await supabase
              .from("chats")
              .select("id")
              .eq("share_slug", candidate)
              .maybeSingle();
            if (!exists) {
              const { data: updated, error: updErr } = await supabase
                .from("chats")
                .update({ share_slug: candidate })
                .eq("id", chatId)
                .select("share_slug")
                .single();
              if (!updErr && updated?.share_slug) slug = updated.share_slug as string;
            }
            tries++;
          }
        }

        if (slug && mounted) {
          router.replace(`/s/${encodeURIComponent(slug)}`);
          return;
        }
      } finally {
        if (mounted) setAttemptedRedirect(true);
      }
    };
    run();
    return () => { mounted = false; };
  }, [m, body, router, supabase]);

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight mb-6">{title}</h1>
      <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5">
        <div className="prose dark:prose-invert w-full max-w-[72ch] min-w-0 break-words text-[15px] sm:text-[16px] leading-relaxed prose-headings:tracking-tight prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-2 prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:my-[6px] prose-strong:font-semibold prose-a:no-underline hover:prose-a:underline prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-ul:my-[6px] prose-ol:my-[6px] prose-li:my-1 prose-li:marker:text-zinc-500 dark:prose-li:marker:text-zinc-400 prose-pre:rounded-lg prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-hr:border-zinc-200 dark:prose-hr:border-zinc-800 prose-blockquote:border-l-4 prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-700 prose-blockquote:pl-4 prose-blockquote:italic">
          <MarkdownRenderer content={body} role="assistant" isStreaming={false} />
        </div>
      </div>
      {!attemptedRedirect ? (
        <div className="mt-4 text-sm text-zinc-500">Mengarahkan ke tautan pendek…</div>
      ) : (
        <div className="mt-4 text-sm text-zinc-500">Ini adalah format link lama. Bagikan ulang untuk mendapatkan tautan pendek.</div>
      )}
    </>
  );
}

export default function SharePage() {
  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto w-full sm:max-w-[720px] md:max-w-[820px]">
        <Suspense fallback={<div className="h-40 w-full animate-pulse rounded-2xl bg-zinc-100/60 dark:bg-zinc-800/60" />}> 
          <ShareContent />
        </Suspense>
      </div>
    </main>
  );
}
