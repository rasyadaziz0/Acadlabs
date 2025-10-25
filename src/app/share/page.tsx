"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { createBrowserClient } from "@supabase/ssr";

function remarkBrToBreak() {
  return (tree: any) => {
    const splitRe = /(?:<br\s*\/?\s*>|&lt;br\s*\/?\s*&gt;)/gi;
    function shouldSkip(node: any) {
      return node?.type === "code" || node?.type === "inlineCode" || node?.type === "math" || node?.type === "inlineMath";
    }
    function transform(node: any) {
      if (!node || shouldSkip(node)) return;
      const children: any[] = node.children;
      if (Array.isArray(children)) {
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (!child) continue;
          if (child.type === "text" && typeof child.value === "string" && splitRe.test(child.value)) {
            splitRe.lastIndex = 0;
            const parts = child.value.split(splitRe);
            const newNodes: any[] = [];
            parts.forEach((part: string, idx: number) => {
              if (part) newNodes.push({ type: "text", value: part });
              if (idx < parts.length - 1) newNodes.push({ type: "break" });
            });
            children.splice(i, 1, ...newNodes);
            i += newNodes.length - 1;
          } else if (child.children && !shouldSkip(child)) {
            transform(child);
          }
        }
      }
    }
    transform(tree);
  };
}

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

  const components = useMemo<Components>(
    () => ({
      p(props: any) {
        const { children } = props as any;
        return <div className="break-words whitespace-pre-wrap w-full max-w-full my-2">{children}</div>;
      },
      code(props: any) {
        const { inline, children } = props as any;
        const raw = Array.isArray(children) ? children.join("") : String(children || "");
        if (inline) {
          return <code className="bg-zinc-200 text-zinc-900 dark:bg-[#1e1e1e] dark:text-white px-1 py-0.5 rounded break-words">{raw}</code>;
        }
        return <pre className="my-3 whitespace-pre-wrap break-words text-sm bg-zinc-200/60 dark:bg-zinc-900/60 px-3 py-2 rounded overflow-x-auto">{raw}</pre>;
      },
      img(props: any) {
        const { src, alt } = props as any;
        return <img src={String(src || "")} alt={String(alt || "")} className="rounded-2xl max-w-full h-auto" />;
      },
    }),
    []
  );

  const remarkPluginsArr = useMemo(() => [remarkMath, remarkGfm, remarkBrToBreak], []);
  const rehypePluginsArr = useMemo(() => [rehypeKatex], []);

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
        <div className="prose dark:prose-invert w-full max-w-[72ch] text-[15px] leading-relaxed">
          <ReactMarkdown remarkPlugins={remarkPluginsArr as any} rehypePlugins={rehypePluginsArr as any} components={components}>
            {body}
          </ReactMarkdown>
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
