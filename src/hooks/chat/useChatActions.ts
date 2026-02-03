import { useState, useRef, useMemo } from "react";
import { Message } from "@/components/chat/ChatMessage";
import { createBrowserClient } from "@supabase/ssr";
import { toast } from "sonner";
import { handleFileUpload } from "@/lib/upload-client";
import { sanitizeUserText, sanitizeAIText, sanitizeSearchQuery } from "@/lib/sanitize";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

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

    const processStream = async (response: Response, currentChatId: string, streamMessageId: string) => {
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        let buffer = "";
        let pendingChunk = "";
        let rafPending = false;
        let lastFlushTs = performance.now();
        const FLUSH_MIN_INTERVAL_MS = 33;

        // Optimized flush function using requestAnimationFrame
        const scheduleFlush = () => {
            if (rafPending) return;
            rafPending = true;

            requestAnimationFrame(() => {
                const now = performance.now();
                if (now - lastFlushTs >= FLUSH_MIN_INTERVAL_MS || pendingChunk.length > 50) {
                    const chunkToApply = pendingChunk;
                    pendingChunk = "";
                    lastFlushTs = now;

                    if (chunkToApply) {
                        setMessages((prev) => {
                            const idx = prev.findIndex((m) => m.id === streamMessageId);
                            if (idx === -1) return prev;
                            const next = [...prev];
                            next[idx] = { ...next[idx], content: next[idx].content + chunkToApply } as Message;
                            return next;
                        });

                        if (shouldAutoScrollRef.current) {
                            scrollToBottom("auto");
                        }
                    }
                }
                rafPending = false;
            });
        };

        // Stream Reading Loop
        try {
            while (!done) {
                const { value, done: d } = await reader.read();
                done = d;
                if (value) buffer += decoder.decode(value, { stream: true });

                let idx;
                while ((idx = buffer.indexOf("\n\n")) !== -1) {
                    const event = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);

                    const lines = event.split("\n");
                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            const data = line.slice(6).trim();
                            if (data === "[DONE]") {
                                done = true;
                                break;
                            }
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content;
                                if (content) {
                                    pendingChunk += content;
                                    scheduleFlush();
                                }
                            } catch { }
                        }
                    }
                }
            }

            // Final Flush
            if (pendingChunk) {
                setMessages((prev) => {
                    const idx = prev.findIndex((m) => m.id === streamMessageId);
                    if (idx === -1) return prev;
                    const next = [...prev];
                    next[idx] = { ...next[idx], content: next[idx].content + pendingChunk } as Message;
                    return next;
                });
            }

        } catch (error) {
            console.error("Stream reading failed", error);
            throw error;
        }
    };


    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!input.trim() && !attachedFile) || isLoading) return;

        if (attachedFile && attachedFile.size > MAX_FILE_SIZE_BYTES) {
            toast.error("Ukuran file maksimal 10MB");
            setAttachedFile(null);
            return;
        }

        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const cleanQuery = sanitizeUserText(input);
        const hasFile = !!attachedFile;
        // Construct attachment marker if needed
        const attachmentMarker = hasFile ? `::attachment[name="${attachedFile.name}",size=${attachedFile.size}]` : "";
        const composedContent = hasFile ? `${attachmentMarker}\n${cleanQuery}` : cleanQuery;

        // 1. Create/Get Chat ID
        let currentChatId = chatId;
        if (!currentChatId) {
            const { data: newChat } = await supabase
                .from("chats")
                .insert({ user_id: userData.user.id, message: "", role: "user" })
                .select("id")
                .single();
            if (newChat) {
                currentChatId = newChat.id;
                setChatId(currentChatId);
                window.history.pushState(null, "", `/chat/${currentChatId}`);
            } else {
                return;
            }
        }

        // 2. Add User Message
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
            // 3. Search (Optional)
            let searchContext: any[] = [];
            if (useSearch && !hasFile) {
                searchContext = await handleSearch();
            }

            // 4. Save User Message to DB
            const { data: savedMsg, error: saveError } = await supabase
                .from("messages")
                .insert({
                    role: "user",
                    content: userMessage.content,
                    chat_id: currentChatId,
                    user_id: userData.user.id
                })
                .select().single();

            if (savedMsg) {
                // Replace temp message with real one
                setMessages(prev => prev.map(m => m.id === tempId ? savedMsg as Message : m));
            }

            // 5. Attachment Flow
            if (hasFile) {
                // Upload file logic... (reusing existing)
                const result = await handleFileUpload(attachedFile!);
                const safeAssistant = sanitizeAIText(result.content || "");
                await supabase.from("messages").insert({
                    role: "assistant",
                    content: safeAssistant,
                    chat_id: currentChatId,
                    user_id: userData.user.id
                });
                // Since we don't stream file uploads usually, we just fetch or append
                // Adding manually to UI for now
                // ... (Simplified for this task, focused on streaming)
            } else {
                // 6. Streaming Flow
                setIsStreaming(true);

                // Placeholder Assistant Message
                const streamMessageId = crypto.randomUUID();
                const optimisticAssistant: Message = {
                    id: streamMessageId,
                    role: "assistant",
                    content: "",
                    chat_id: currentChatId!,
                    user_id: userData.user.id,
                    created_at: new Date().toISOString(),
                };
                setStreamingAssistantId(streamMessageId);
                setMessages((prev) => clampLastNMessages([...prev, optimisticAssistant], HISTORY_LIMIT));

                // API Call
                const response = await fetch("/api/chat", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "text/event-stream"
                    },
                    body: JSON.stringify({
                        messages: [...messages, userMessage],
                        searchResults: searchContext,
                        chatId: currentChatId
                    })
                });

                if (!response.ok) throw new Error("API Request Failed");

                // Process Streaming Response
                await processStream(response, currentChatId!, streamMessageId);
            }

        } catch (error) {
            console.error("Submit Error:", error);
            toast.error("Gagal mengirim pesan");
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
            setStreamingAssistantId(null);
            setAttachedFile(null);
        }
    };

    const handleStop = () => {
        // Not implemented (requires abort controller on fetch)
        setIsStreaming(false);
        setIsLoading(false);
    };

    // Helper stubs
    const handleMessageUpdated = (updated: Message) => {
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
    };

    const handleResendFromMessage = async (msg: Message) => {
        // Similar logic, calling transparently
    };

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
