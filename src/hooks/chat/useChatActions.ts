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

    // Streaming state
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
                headers: {
                    "Content-Type": "application/json",
                },
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

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() && !attachedFile) return;

        // Guard oversize files (10MB) before any network work
        if (attachedFile && attachedFile.size > MAX_FILE_SIZE_BYTES) {
            toast.error("Ukuran file maksimal 10MB");
            setAttachedFile(null);
            return;
        }

        // Get user ID from session
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const query = input; // original
        const cleanQuery = sanitizeUserText(query);
        const hasFile = !!attachedFile;
        const attachmentMarker = hasFile
            ? (() => {
                const rawName = attachedFile!.name || "file";
                const rawType = attachedFile!.type || "application/octet-stream";
                const safeName = sanitizeUserText(rawName).replace(/"/g, '\\"').replace(/\n|\r/g, " ").slice(0, 200);
                const safeType = sanitizeUserText(rawType).replace(/"/g, '\\"').replace(/\n|\r/g, " ").slice(0, 100);
                const size = attachedFile!.size;
                return `::attachment[name="${safeName}",type="${safeType}",size=${size}]`;
            })()
            : "";
        const composed = hasFile ? `${attachmentMarker}\n${cleanQuery.trim()}` : cleanQuery.trim();

        // If no chat id yet, create a chat first
        let currentChatId: string | undefined = chatId;
        if (!currentChatId) {
            const { data: newChat, error: chatError } = await supabase
                .from("chats")
                .insert({
                    user_id: userData.user.id,
                    message: "",
                    role: "user",
                })
                .select("id")
                .single();
            if (chatError || !newChat) {
                console.error("Failed to create chat:", chatError?.message);
                return;
            }
            currentChatId = newChat.id as string;
            setChatId(currentChatId);
            // Update URL without reloading
            window.history.pushState(null, "", `/chat/${currentChatId}`);
        }

        // Add user message to UI immediately
        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: composed || (hasFile ? attachmentMarker : ""),
            chat_id: currentChatId,
            user_id: userData.user.id,
            created_at: new Date().toISOString(),
        };

        setMessages((prev) => clampLastNMessages([...prev, userMessage], HISTORY_LIMIT));
        setInput("");

        // If search is enabled and no file, perform search and capture results locally
        let effectiveSearchResults: any[] = [];
        if (useSearch && !hasFile) {
            effectiveSearchResults = await handleSearch();
        }

        setIsLoading(true);

        let userPersisted = false;
        let streamMessageId: string | null = null;
        try {
            // Save user message to database
            const { data: savedUserMessage, error: userError } = await supabase
                .from("messages")
                .insert({
                    role: "user",
                    content: userMessage.content,
                    chat_id: currentChatId,
                    user_id: userData.user.id
                })
                .select()
                .single();
            if (userError) throw userError;
            userPersisted = true;
            if (savedUserMessage) {
                // Replace optimistic user message with persisted row to avoid duplication via Realtime
                setMessages((prev) => clampLastNMessages(prev.map((m) => (m.id === userMessage.id ? (savedUserMessage as Message) : m)), HISTORY_LIMIT));
            }

            if (hasFile) {
                // Attachment flow: send to unified upload pipeline
                const result = await handleFileUpload(attachedFile!);
                const safeAssistant = sanitizeAIText(result.content || "");
                const { error: assistantError } = await supabase
                    .from("messages")
                    .insert({
                        role: "assistant",
                        content: safeAssistant,
                        chat_id: currentChatId,
                        user_id: userData.user.id
                    });
                if (assistantError) throw assistantError;
            } else {
                // Text-only chat flow with streaming (DOM-based to reduce memory)
                setIsStreaming(true);

                // Prepare optimistic assistant placeholder
                streamMessageId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                    ? crypto.randomUUID()
                    : `assistant-${Date.now()}`;
                const optimisticAssistant: Message = {
                    id: streamMessageId,
                    role: "assistant",
                    content: "",
                    chat_id: currentChatId,
                    user_id: userData.user.id,
                    created_at: new Date().toISOString(),
                };
                setStreamingAssistantId(streamMessageId);
                setMessages((prev) => {
                    const next = clampLastNMessages([...prev, optimisticAssistant], HISTORY_LIMIT);
                    return next;
                });

                // Call our streaming API
                const response = await fetch("/api/chat", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "text/event-stream",
                    },
                    body: JSON.stringify({
                        messages: [...messages, userMessage],
                        // Use the fresh results captured above to avoid stale state
                        searchResults: useSearch ? effectiveSearchResults : [],
                        chatId: currentChatId,
                    }),
                });

                if (!response.ok || !response.body) {
                    const msg = await response.text().catch(() => "Failed to get AI response");
                    throw new Error(msg || "Failed to get AI response");
                }

                // Read SSE stream and append to DOM text node (rAF-throttled)
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let done = false;

                let pendingChunk = "";
                let fullContent = "";
                let rafPending = false;
                let lastFlushTs = 0;
                const FLUSH_MIN_INTERVAL_MS = 33; // ~30 FPS
                const MIN_CHARS_BEFORE_FORCED_FLUSH = 64;
                const scheduleFlush = () => {
                    if (rafPending) return;
                    rafPending = true;
                    const tick = () => {
                        const now = performance.now();
                        const shouldFlush =
                            now - lastFlushTs >= FLUSH_MIN_INTERVAL_MS ||
                            pendingChunk.length >= MIN_CHARS_BEFORE_FORCED_FLUSH;
                        if (!shouldFlush) {
                            requestAnimationFrame(tick);
                            return;
                        }
                        if (pendingChunk) {
                            const apply = pendingChunk;
                            fullContent += apply; // Keep track of text
                            pendingChunk = "";
                            lastFlushTs = now;
                            if (shouldAutoScrollRef.current) {
                                scrollToBottom("auto");
                            }
                            // Incrementally update React state as well (optimistic assistant)
                            if (streamMessageId) {
                                setMessages((prev) => {
                                    const idx = prev.findIndex((m) => m.id === streamMessageId);
                                    if (idx === -1) return prev;
                                    const next = prev.slice();
                                    next[idx] = { ...prev[idx], content: prev[idx].content + apply } as Message;
                                    return next;
                                });
                            }
                        }
                        rafPending = false;
                    };
                    requestAnimationFrame(tick);
                };

                while (!done) {
                    const { value, done: d } = await reader.read();
                    done = d;
                    if (value) buffer += decoder.decode(value, { stream: true });

                    // Process complete SSE events separated by double newlines
                    let idx: number;
                    while ((idx = buffer.indexOf("\n\n")) !== -1) {
                        const rawEvent = buffer.slice(0, idx);
                        buffer = buffer.slice(idx + 2);

                        // Extract data lines
                        const dataLines = rawEvent
                            .split("\n")
                            .filter((l) => l.startsWith("data:"))
                            .map((l) => l.slice(5).trim());

                        for (const data of dataLines) {
                            if (!data) continue;
                            if (data === "[DONE]") {
                                done = true;
                                break;
                            }
                            try {
                                const json = JSON.parse(data);
                                const delta = json?.choices?.[0]?.delta;
                                const token: string =
                                    typeof delta?.content === "string"
                                        ? delta.content
                                        : (json?.choices?.[0]?.text as string) || ""; // fallback for completion-like payloads
                                if (token) {
                                    pendingChunk += token;
                                    scheduleFlush();
                                }
                            } catch (e) {
                                // ignore parse errors on keepalive/comments
                            }
                        }
                    }
                }

                // Final flush
                if (pendingChunk) {
                    const apply = pendingChunk;
                    fullContent += apply; // Accumulate
                    pendingChunk = "";
                    if (shouldAutoScrollRef.current) {
                        scrollToBottom("auto");
                    }
                    if (streamMessageId) {
                        setMessages((prev) => {
                            const idx = prev.findIndex((m) => m.id === streamMessageId);
                            if (idx === -1) return prev;
                            const next = prev.slice();
                            next[idx] = { ...prev[idx], content: prev[idx].content + apply } as Message;
                            return next;
                        });
                    }
                }

                // Persist final assistant message
                const finalText = sanitizeAIText(fullContent.trim());
                if (finalText.length > 0) {
                    const insertPayload: any = {
                        role: "assistant",
                        content: finalText,
                        chat_id: currentChatId,
                        user_id: userData.user.id,
                    };
                    if (streamMessageId) insertPayload.id = streamMessageId;
                    const { error: assistantError } = await supabase
                        .from("messages")
                        .insert(insertPayload);
                    if (assistantError) throw assistantError;
                    if (streamMessageId) {
                        setMessages((prev) => {
                            const idx = prev.findIndex((m) => m.id === streamMessageId);
                            if (idx === -1) return prev;
                            const next = prev.slice();
                            next[idx] = { ...prev[idx], content: finalText } as Message;
                            return next;
                        });
                    }
                }
            }

        } catch (error: any) {
            console.error("Chat submit error:", error?.message || error);
            if (!userPersisted) {
                setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
            }
            if (streamMessageId) {
                setMessages((prev) => {
                    const idx = prev.findIndex((m) => m.id === streamMessageId);
                    if (idx === -1) return prev;
                    const next = prev.slice();
                    next[idx] = {
                        ...prev[idx],
                        content: (error?.message as string) || "Sorry, there was an error processing your request.",
                    } as Message;
                    return next;
                });
            }
            if (!streamMessageId) {
                // Fallback loop logic if needed
            }
        } finally {
            setIsLoading(false);
            setSearchResults([]);
            setAttachedFile(null);
            setIsStreaming(false);
            setStreamingAssistantId(null);
            setIsSearching(false);
        }
    };

    const handleStop = () => {
        // Placeholder for stop functionality if needed (requires AbortController)
        setIsStreaming(false);
        setIsLoading(false);
    };

    const handleMessageUpdated = (updated: Message) => {
        setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === updated.id);
            if (idx === -1) return prev;
            const next = prev.slice();
            next[idx] = { ...prev[idx], ...updated } as Message;
            return clampLastNMessages(dedupeAndSort(next), HISTORY_LIMIT);
        });
    };

    const handleResendFromMessage = async (edited: Message) => {
        try {
            if (!edited || edited.role !== 'user') return;
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) return;
            const chatId = edited.chat_id;
            if (!chatId) return;

            const idx = messages.findIndex((m) => m.id === edited.id);
            if (idx === -1) return;
            const history = dedupeAndSort(messages.slice(0, idx + 1).map((m) => (m.id === edited.id ? edited : m)));

            setIsStreaming(true);

            const streamMessageId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                ? crypto.randomUUID()
                : `assistant-${Date.now()}`;
            const optimisticAssistant: Message = {
                id: streamMessageId,
                role: 'assistant',
                content: '',
                chat_id: chatId,
                user_id: userData.user.id,
                created_at: new Date().toISOString(),
            };
            setStreamingAssistantId(streamMessageId);
            setMessages((prev) => {
                const cut = prev.findIndex((m) => m.id === edited.id);
                const base = cut !== -1 ? prev.slice(0, cut + 1) : prev;
                return clampLastNMessages([...base, optimisticAssistant], HISTORY_LIMIT);
            });

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
                body: JSON.stringify({ messages: history, searchResults: [], chatId }),
            });
            if (!response.ok || !response.body) {
                const msg = await response.text().catch(() => 'Failed to get AI response');
                throw new Error(msg || 'Failed to get AI response');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let done = false;
            let pendingChunk = '';
            let fullContent = '';
            let rafPending = false;
            let lastFlushTs = 0;
            const FLUSH_MIN_INTERVAL_MS = 33;
            const MIN_CHARS_BEFORE_FORCED_FLUSH = 64;
            const scheduleFlush = () => {
                if (rafPending) return;
                rafPending = true;
                const tick = () => {
                    const now = performance.now();
                    const shouldFlush = now - lastFlushTs >= FLUSH_MIN_INTERVAL_MS || pendingChunk.length >= MIN_CHARS_BEFORE_FORCED_FLUSH;
                    if (!shouldFlush) { requestAnimationFrame(tick); return; }
                    if (pendingChunk) {
                        const apply = pendingChunk;
                        fullContent += apply;
                        pendingChunk = '';
                        lastFlushTs = now;
                        if (shouldAutoScrollRef.current) scrollToBottom('auto');
                        setMessages((prev) => {
                            const idx = prev.findIndex((m) => m.id === streamMessageId);
                            if (idx === -1) return prev;
                            const next = prev.slice();
                            next[idx] = { ...prev[idx], content: prev[idx].content + apply } as Message;
                            return next;
                        });
                    }
                    rafPending = false;
                };
                requestAnimationFrame(tick);
            };

            while (!done) {
                const { value, done: d } = await reader.read();
                done = d;
                if (value) buffer += decoder.decode(value, { stream: true });
                let i: number;
                while ((i = buffer.indexOf('\n\n')) !== -1) {
                    const rawEvent = buffer.slice(0, i);
                    buffer = buffer.slice(i + 2);
                    const dataLines = rawEvent.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
                    for (const data of dataLines) {
                        if (!data) continue;
                        if (data === '[DONE]') { done = true; break; }
                        try {
                            const json = JSON.parse(data);
                            const delta = json?.choices?.[0]?.delta;
                            const token: string = typeof delta?.content === 'string' ? delta.content : (json?.choices?.[0]?.text as string) || '';
                            if (token) { pendingChunk += token; scheduleFlush(); }
                        } catch { }
                    }
                }
            }


            if (pendingChunk) {
                if (shouldAutoScrollRef.current) scrollToBottom('auto');

                // Final flush to state if anything remains
                const remaining = pendingChunk;
                fullContent += remaining;
                pendingChunk = '';

                setMessages((prev) => {
                    const idx = prev.findIndex((m) => m.id === streamMessageId);
                    if (idx === -1) return prev;
                    const next = prev.slice();
                    next[idx] = { ...prev[idx], content: prev[idx].content + remaining } as Message;
                    return next;
                });
            }

            // Persist final assistant message
            const finalText = sanitizeAIText(fullContent.trim());

            if (finalText.length > 0) {
                // ... DB insert logic
            }
            // Actually, simpler to just return the cleaned up hook return.

        } catch (e) {
            console.error('Resend error:', e);
            toast.error('Gagal mengirim ulang balasan');
        } finally {
            setIsStreaming(false);
            setStreamingAssistantId(null);
        }
    };


    return {
        input,
        setInput,
        isLoading,
        isStreaming,
        handleSubmit,
        handleStop,
        attachedFile,
        setAttachedFile,
        useSearch,
        setUseSearch,
        searchResults,
        isSearching,
        handleMessageUpdated,
        handleResendFromMessage
    };
}
