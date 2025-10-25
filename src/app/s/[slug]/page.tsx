"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import ChatMessage, { type Message } from "@/components/chat-message";

function dedupeAndSort(arr: Message[]) {
  const seen = new Set<string>();
  const out: Message[] = [];
  for (const m of arr) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export default function SharedChatPage() {
  const { slug } = useParams<{ slug: string }>();
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(
    () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
    []
  );

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) Coba resolve sebagai message share terlebih dahulu
        const { data: oneMsg } = await supabase
          .from("messages")
          .select("*")
          .eq("share_slug", slug)
          .maybeSingle();

        if (oneMsg) {
          if (!mounted) return;
          const m = oneMsg as unknown as Message;
          setMessages([m]);
          setChatId(m.chat_id);
          // Optional: ambil judul chat untuk header
          const { data: c } = await supabase
            .from("chats")
            .select("title")
            .eq("id", m.chat_id)
            .maybeSingle();
          setChatTitle((c as any)?.title || "Shared Message");
          setLoading(false);
          return;
        }

        // 2) Fallback: resolve sebagai chat share
        const { data: chatRow, error: chatErr } = await supabase
          .from("chats")
          .select("id, title, share_slug")
          .eq("share_slug", slug)
          .single();
        if (chatErr || !chatRow) {
          setError("not_found");
          setLoading(false);
          return;
        }

        if (!mounted) return;
        const sharedChatId = (chatRow as any).id as string;
        setChatId(sharedChatId);
        setChatTitle((chatRow as any).title || "Shared Chat");

        // Load messages for that chat (requires RLS that allows public read for shared chats)
        const { data: msgs, error: msgErr } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", sharedChatId)
          .order("created_at", { ascending: true });
        if (msgErr) {
          setError("failed_messages");
          setLoading(false);
          return;
        }
        if (!mounted) return;
        const list = Array.isArray(msgs) ? (msgs as Message[]) : [];
        setMessages(dedupeAndSort(list));
        setLoading(false);
      } catch {
        setError("unknown");
        setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [slug, supabase]);

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8 sm:py-12">
        <div className="mx-auto w-full sm:max-w-[720px] md:max-w-[820px]">
          <div className="space-y-3 sm:space-y-4">
            <div className="h-4 w-1/3 rounded bg-muted/50 animate-pulse" />
            <div className="h-24 w-full rounded bg-muted/50 animate-pulse" />
            <div className="h-4 w-2/5 rounded bg-muted/50 animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  if (error === "not_found" || !chatId) {
    return (
      <main className="min-h-screen px-4 py-8 sm:py-12">
        <div className="mx-auto w-full sm:max-w-[720px] md:max-w-[820px]">
          <h1 className="text-2xl font-bold mb-2">Chat Not Found</h1>
          <p className="text-muted-foreground">Tautan yang Anda buka tidak ditemukan.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto w-full sm:max-w-[720px] md:max-w-[820px]">
        <h1 className="text-3xl font-bold tracking-tight mb-6">{chatTitle || "Shared Chat"}</h1>
        <div className="space-y-3 sm:space-y-4">
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} chatTitle={chatTitle} shareSlug={slug} />
          ))}
        </div>
      </div>
    </main>
  );
}
