import { useEffect, useRef, useState, useCallback } from "react";
import { createSupabaseClient } from "@/lib/supabaseClient";
import { sanitizeUserText } from "@/lib/sanitize";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chat_id: string;
  user_id: string;
  created_at: string;
};

export function useRealtimeMessages(chatId?: string | null, userId?: string | null) {
  const supabase = createSupabaseClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initial fetch when both chatId and userId are available
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!chatId || !userId) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("Initial fetch error:", error.message);
      }
      if (!active) return;
      if (data) setMessages(data as Message[]);
      setLoading(false);
    };
    run();
    return () => {
      active = false;
    };
  }, [chatId, userId, supabase]);

  // Realtime subscription for INSERT events on this chat
  useEffect(() => {
    if (!chatId || !userId) return;
    const channel = supabase
      .channel(`realtime:messages:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const row = payload.new as Message;
          if (!row || row.user_id !== userId) return;
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === row.id);
            const next = exists ? prev : [...prev, row];
            return next
              .slice()
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          });
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [chatId, userId, supabase]);

  const sendMessage = useCallback(
    async (contentRaw: string) => {
      if (!chatId || !userId) throw new Error("Missing chatId or userId");
      const content = sanitizeUserText(contentRaw || "").trim();
      if (!content) return;

      // Optimistic add
      const tempId = `temp-${Date.now()}`;
      const temp: Message = {
        id: tempId,
        role: "user",
        content,
        chat_id: chatId,
        user_id: userId,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, temp]);

      const { error } = await supabase
        .from("messages")
        .insert({ role: "user", content, chat_id: chatId, user_id: userId });

      if (error) {
        // Rollback optimistic
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw error;
      } else {
        // Remove temp; the realtime INSERT will add the persisted row
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    },
    [chatId, userId, supabase]
  );

  return { messages, loading, sendMessage } as const;
}
