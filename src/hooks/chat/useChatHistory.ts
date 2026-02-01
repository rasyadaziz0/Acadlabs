import { useState, useEffect, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Message } from "@/components/chat/ChatMessage";

// Keep only the last N messages in UI memory to prevent OOM
const HISTORY_LIMIT = 50;
function clampLastNMessages(arr: Message[], n: number): Message[] {
    return arr.length <= n ? arr : arr.slice(arr.length - n);
}

const dedupeAndSort = (arr: Message[]) => {
    const seen = new Set<string>();
    const out: Message[] = [];
    for (const m of arr) {
        if (!seen.has(m.id)) {
            seen.add(m.id);
            out.push(m);
        }
    }
    return out.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
};

export function useChatHistory(initialChatId?: string) {
    const [chatId, setChatId] = useState<string | undefined>(initialChatId);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(!!initialChatId);

    const supabase = useMemo(
        () =>
            createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            ),
        []
    );

    // Sync prop changes to state (e.g. navigation)
    useEffect(() => {
        setChatId(initialChatId);
        if (initialChatId) {
            setIsLoadingMessages(true);
        } else {
            setMessages([]);
            setIsLoadingMessages(false);
        }
    }, [initialChatId]);

    useEffect(() => {
        if (!chatId) {
            setIsLoadingMessages(false);
            return;
        }

        const fetchMessages = async () => {
            try {
                setIsLoadingMessages(true);
                // Fetch user ID from session
                const { data: userData, error: userError } = await supabase.auth.getUser();
                if (userError || !userData.user) {
                    setIsLoadingMessages(false);
                    return;
                }

                // Fetch messages for the chat
                const { data, error } = await supabase
                    .from("messages")
                    .select("*")
                    .eq("chat_id", chatId)
                    .eq("user_id", userData.user.id)
                    .order("created_at", { ascending: true });

                if (!error && data) {
                    setMessages((prev) => {
                        const map = new Map(prev.map((m) => [m.id, m] as const));
                        for (const m of data as Message[]) map.set(m.id, m as Message);
                        const merged = Array.from(map.values());
                        const out = clampLastNMessages(dedupeAndSort(merged), HISTORY_LIMIT);
                        return out;
                    });
                }
            } catch (err) {
                console.error("Error in fetchMessages:", err);
            } finally {
                setIsLoadingMessages(false);
            }
        };

        fetchMessages();
    }, [chatId, supabase]);

    // Realtime updates for new messages (INSERT-only) when an id exists
    useEffect(() => {
        if (!chatId) return; // only subscribe when we have a chat id
        let channel: ReturnType<typeof supabase.channel> | null = null;
        let mounted = true;
        const setup = async () => {
            const { data: userData } = await supabase.auth.getUser();
            if (!mounted || !userData.user) return;
            channel = supabase
                .channel(`realtime:messages:${chatId}`)
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
                    (payload) => {
                        const row = payload.new as Message;
                        if (!row || row.user_id !== userData.user!.id) return;
                        setMessages((prev) => {
                            const idx = prev.findIndex((m) => m.id === row.id);
                            let next: Message[];
                            if (idx !== -1) {
                                next = prev.slice();
                                next[idx] = { ...prev[idx], ...row } as Message;
                            } else {
                                next = [...prev, row];
                            }
                            const out = clampLastNMessages(dedupeAndSort(next), HISTORY_LIMIT);
                            return out;
                        });
                    }
                )
                .subscribe();
        };
        setup();
        return () => {
            mounted = false;
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [chatId, supabase]);

    return {
        messages,
        setMessages,
        chatId,
        setChatId,
        isLoadingMessages,
        clampLastNMessages, // Exporting helpers as they might be used by consumers to maintain consistency
        dedupeAndSort,
        HISTORY_LIMIT
    };
}
