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
  attachment_url?: string | null;
  attachment_type?: string | null;
};

export function useRealtimeMessages(chatId?: string | null) {
  const supabase = createSupabaseClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let active = true;
    const loadAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setCurrentUserId(data.user?.id ?? null);
    };
    loadAuthUser();
    return () => {
      active = false;
    };
  }, [supabase]);

  // Initial fetch when both chatId and userId are available
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!chatId || !currentUserId) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .eq("user_id", currentUserId)
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
  }, [chatId, currentUserId, supabase]);

  // Realtime subscription for INSERT events on this chat
  useEffect(() => {
    if (!chatId || !currentUserId) return;
    const channel = supabase
      .channel(`realtime:messages:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const row = payload.new as Message;
          if (!row || row.user_id !== currentUserId) return;
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
  }, [chatId, currentUserId, supabase]);

  const sendMessage = useCallback(
    async (contentRaw: string) => {
      if (!chatId || !currentUserId) throw new Error("Missing chatId or authenticated user");
      const content = sanitizeUserText(contentRaw || "").trim();
      if (!content) return;

      // Optimistic add
      const tempId = `temp-${Date.now()}`;
      const temp: Message = {
        id: tempId,
        role: "user",
        content,
        chat_id: chatId,
        user_id: currentUserId,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, temp]);

      const { error } = await supabase
        .from("messages")
        .insert({ role: "user", content, chat_id: chatId, user_id: currentUserId });

      if (error) {
        // Rollback optimistic
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw error;
      } else {
        // Remove temp; the realtime INSERT will add the persisted row
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    },
    [chatId, currentUserId, supabase]
  );

  return { messages, loading, sendMessage } as const;
}
