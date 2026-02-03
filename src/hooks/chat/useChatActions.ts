import { useState, useRef, useMemo } from "react";
import { Message } from "@/components/chat/ChatMessage";
import { createBrowserClient } from "@supabase/ssr";
import { toast } from "sonner";
import { handleFileUpload } from "@/lib/upload-client";
import { sanitizeUserText, sanitizeAIText, sanitizeSearchQuery } from "@/lib/sanitize";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function useChatActions(
    messages: Message[],
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    chatId: string | undefined,
    setChatId: React.Dispatch<React.SetStateAction<string | undefined>>,
    scrollToBottom: (behavior?: ScrollBehavior) => void,
    shouldAutoScrollRef: React.MutableRefObject<boolean>,
    clampLastNMessages: (arr: Message[], n: number) => Message[],
    dedupeAndSort: (arr: Message[]) => Message[],
    HISTORY_LIMIT: number
) {
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [useSearch, setUseSearch] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState<boolean>(false);

    const supabase = useMemo(
        () =>
            createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            ),
        []
    );

    const handleSearch = async (): Promise<any[]> => {
        if (!input.trim()) return [];
        setIsSearching(true);
        try {
            const response = await fetch("/api/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: sanitizeSearchQuery(input) }),
            });
            const data = await response.json();
            const results = Array.isArray(data?.results) ? data.results : [];
            setSearchResults(results);
            return results;
        } catch (error) {
            console.error("Search error:", error);
            return [];
        } finally {
            setIsSearching(false);
        }
    };

    const processReader = async (reader: ReadableStreamDefaultReader<Uint8Array>, streamMessageId: string) => {
        const decoder = new TextDecoder();
        let buffer = "";
        let pendingChunk = "";
        let rafPending = false;
        let lastFlush = performance.now();

        const flush = () => {
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                const now = performance.now();
                // Flush if enough time passed or chunk is large enough
                if (now - lastFlush > 30 || pendingChunk.length > 20) {
                    const chunk = pendingChunk;
                    pendingChunk = "";
                    lastFlush = now;

                    if (chunk) {
                        setMessages(prev => {
                            const idx = prev.findIndex(m => m.id === streamMessageId);
                            if (idx === -1) return prev;
                            const next = [...prev];
                            next[idx] = { ...next[idx], content: next[idx].content + chunk } as Message;
                            return next;
                        });
                        if (shouldAutoScrollRef.current) scrollToBottom("auto");
                    }
                }
                rafPending = false;
            });
        };

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let idx;
                while ((idx = buffer.indexOf("\n\n")) !== -1) {
                    const event = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);

                    const lines = event.split("\n");
                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            const data = line.slice(6).trim();
                            if (data === "[DONE]") return;
                            try {
                                const parsed = JSON.parse(data);
                                const token = parsed.choices?.[0]?.delta?.content;
                                if (token) {
                                    pendingChunk += token;
                                    flush();
                                }
                            } catch { }
                        }
                    }
                }
            }
        } finally {
            // Final flush ensuring nothing left behind
            if (pendingChunk) {
                setMessages(prev => {
                    const idx = prev.findIndex(m => m.id === streamMessageId);
                    if (idx === -1) return prev;
                    const next = [...prev];
                    next[idx] = { ...next[idx], content: next[idx].content + pendingChunk } as Message;
                    return next;
                });
            }
        }
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!input.trim() && !attachedFile) || isLoading) return;

        if (attachedFile && attachedFile.size > MAX_FILE_SIZE_BYTES) {
            toast.error("File limit 10MB");
            setAttachedFile(null);
            return;
        }

        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const cleanQuery = sanitizeUserText(input);
        const hasFile = !!attachedFile;
        const attachmentMarker = hasFile ? `::attachment[name="${attachedFile.name}",size=${attachedFile.size}]` : "";
        const composedContent = hasFile ? `${attachmentMarker}\n${cleanQuery}` : cleanQuery;

        // Init Chat ID if needed
        let currentChatId = chatId;
        if (!currentChatId) {
            const { data: newChat } = await supabase.from("chats").insert({ user_id: userData.user.id, message: "", role: "user" }).select("id").single();
            if (newChat) {
                currentChatId = newChat.id;
                setChatId(currentChatId);
                window.history.pushState(null, "", `/chat/${currentChatId}`);
            } else { return; }
        }

        // Add User Message Optimistically
        const tempId = Date.now().toString();
        const userMessage: Message = {
            id: tempId,
            role: "user",
            content: composedContent,
            chat_id: currentChatId!,
            user_id: userData.user.id,
            created_at: new Date().toISOString(),
        };

        setMessages((prev) => clampLastNMessages([...prev, userMessage], HISTORY_LIMIT));
        setInput("");
        setIsLoading(true);

        try {
            // Search
            let searchResult: any[] = [];
            if (useSearch && !hasFile) searchResult = await handleSearch();

            // Persist User Message
            const { data: savedUserMsg } = await supabase.from("messages").insert({
                role: "user",
                content: userMessage.content,
                chat_id: currentChatId!,
                user_id: userData.user.id
            }).select().single();

            if (savedUserMsg) {
                setMessages(prev => prev.map(m => m.id === tempId ? savedUserMsg as Message : m));
            }

            // File Upload logic
            if (hasFile) {
                const res = await handleFileUpload(attachedFile!);
                const sanitizedAssistant = sanitizeAIText(res.content || "");
                await supabase.from("messages").insert({
                    role: "assistant", content: sanitizedAssistant,
                    chat_id: currentChatId!, user_id: userData.user.id
                });
                // Reload or manual append here (skipping for this task focus)
            }
            else {
                // TEXT STREAMING FLOW
                setIsStreaming(true);
                const streamMessageId = crypto.randomUUID();
                const assistantPlaceholder: Message = {
                    id: streamMessageId,
                    role: "assistant",
                    content: "",
                    chat_id: currentChatId!,
                    user_id: userData.user.id,
                    created_at: new Date().toISOString(),
                };
                setStreamingAssistantId(streamMessageId);
                setMessages(prev => clampLastNMessages([...prev, assistantPlaceholder], HISTORY_LIMIT));

                const response = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
                    body: JSON.stringify({
                        messages: [...messages, userMessage],
                        searchResults: searchResult,
                        chatId: currentChatId
                    })
                });

                if (!response.ok || !response.body) throw new Error("API Failure");

                const reader = response.body.getReader();
                await processReader(reader, streamMessageId);
            }

        } catch (e: any) {
            console.error(e);
            toast.error("Gagal mengirim pesan: " + e.message);
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
            setStreamingAssistantId(null);
            setAttachedFile(null);
        }
    };

    const handleStop = () => {
        setIsStreaming(false);
        setIsLoading(false);
    };

    const handleMessageUpdated = (updated: Message) => {
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
    };

    const handleResendFromMessage = async (msg: Message) => { }; // Placeholder

    return {
        input, setInput,
        isLoading, isStreaming,
        handleSubmit, handleStop,
        attachedFile, setAttachedFile,
        useSearch, setUseSearch,
        searchResults, isSearching,
        handleMessageUpdated, handleResendFromMessage
    };
}
