import { useState, useRef, useMemo, useEffect } from "react";
import { Message } from "@/components/chat/ChatMessage";
import { createBrowserClient } from "@supabase/ssr";
import { toast } from "sonner";
import { handleFileUpload } from "@/lib/upload-client";
import { uploadChatAttachment } from "@/lib/upload-service";
import { sanitizeUserText, sanitizeSearchQuery } from "@/lib/sanitize";

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

    // Double-lock cleanup: Force clear search results when idle with delay for smoothness
    useEffect(() => {
        if (!isLoading && !isStreaming && searchResults.length > 0) {
            const timer = setTimeout(() => setSearchResults([]), 1000);
            return () => clearTimeout(timer);
        }
    }, [isLoading, isStreaming, searchResults.length]);

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

    const processReader = async (reader: ReadableStreamDefaultReader<Uint8Array>, streamMessageId: string, chatIdToUse: string) => {
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
                if (now - lastFlush > 30 || pendingChunk.length > 20) {
                    const chunk = pendingChunk;
                    pendingChunk = "";
                    lastFlush = now;

                    if (chunk) {
                        setMessages(prev => {
                            const idx = prev.findIndex(m => m.id === streamMessageId);
                            if (idx === -1) {
                                // RESILIENCE: If message is missing (e.g. wiped by history sync), restore it!
                                // We reconstruct a partial message so the stream can continue showing
                                const restoredMsg: Message = {
                                    id: streamMessageId,
                                    role: "assistant",
                                    content: chunk,
                                    chat_id: chatIdToUse,
                                    user_id: "",
                                    created_at: new Date().toISOString()
                                };
                                return [...prev, restoredMsg];
                            }
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
            // Final flush
            if (pendingChunk) {
                setMessages(prev => {
                    const idx = prev.findIndex(m => m.id === streamMessageId);
                    if (idx === -1) {
                        // Resilience for final chunk too
                        const restoredMsg: Message = {
                            id: streamMessageId,
                            role: "assistant",
                            content: pendingChunk,
                            chat_id: chatIdToUse,
                            user_id: "",
                            created_at: new Date().toISOString()
                        };
                        return [...prev, restoredMsg];
                    }
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

        const hasFile = !!attachedFile;
        const attachmentMarker = hasFile ? `::attachment[name="${attachedFile.name}",size=${attachedFile.size}]` : "";
        const originalInput = sanitizeUserText(input);

        // Init Chat ID
        let currentChatId = chatId;
        if (!currentChatId) {
            const { data: newChat } = await supabase.from("chats").insert({ user_id: userData.user.id, message: "", role: "user" }).select("id").single();
            if (newChat) {
                currentChatId = newChat.id;
                setChatId(currentChatId);
                window.history.pushState(null, "", `/chat/${currentChatId}`);
            } else { return; }
        }

        // Optimistic Message Construction
        let optimisticContent = originalInput;
        let optimisticAttachmentUrl: string | null = null;
        let optimisticAttachmentType: string | null = null;

        if (hasFile) {
            // Use local object URL for immediate preview
            optimisticAttachmentUrl = URL.createObjectURL(attachedFile!);
            optimisticAttachmentType = attachedFile!.type;

            // For images/files, we want clean content now
            optimisticContent = originalInput;
        }

        // Add User Message Optimistically
        const tempId = Date.now().toString();
        const userMessage: Message = {
            id: tempId,
            role: "user",
            content: optimisticContent,
            chat_id: currentChatId!,
            user_id: userData.user.id,
            created_at: new Date().toISOString(),
            attachment_url: optimisticAttachmentUrl,
            attachment_type: optimisticAttachmentType
        };

        setMessages((prev) => clampLastNMessages([...prev, userMessage], HISTORY_LIMIT));
        setInput("");
        setIsLoading(true);
        setIsStreaming(true);

        let streamMessageId: string | null = null;

        try {
            // Search
            let searchResult: any[] = [];
            if (useSearch && !hasFile) searchResult = await handleSearch();

            // Handle File: Upload & OCR
            let finalAttachmentUrl = optimisticAttachmentUrl;
            let finalContentForAI = originalInput;

            if (hasFile) {
                try {
                    // Parallel: Upload to Storage AND Process OCR
                    const [uploadResult, ocrRes] = await Promise.all([
                        uploadChatAttachment(attachedFile!),
                        handleFileUpload(attachedFile!)
                    ]);

                    finalAttachmentUrl = uploadResult.url;
                    const ocrText = ocrRes.content || "[No text found in file]";
                    finalContentForAI = `User Input: ${originalInput}\n\n[Attached File Content/OCR Result]:\n${ocrText}`;
                } catch (error) {
                    console.error("File processing error:", error);
                    toast.error("Failed to upload or process file");
                    // Remove optimistic messages? Or just fail?
                    // For now, let's stop.
                    setMessages((prev) => prev.filter(m => m.id !== tempId && m.id !== streamMessageId));
                    setIsLoading(false);
                    return;
                }
            }

            // Persist User Message
            const { data: savedUserMsg } = await supabase.from("messages").insert({
                role: "user",
                content: optimisticContent,
                chat_id: currentChatId!,
                user_id: userData.user.id,
                attachment_url: finalAttachmentUrl, // Use the real storage URL
                attachment_type: attachedFile ? attachedFile.type : null
            }).select().single();

            if (savedUserMsg) {
                setMessages(prev => prev.map(m => m.id === tempId ? savedUserMsg as Message : m));
            }

            // Create assistant placeholder after user message is persisted to keep chronological order stable.
            streamMessageId = crypto.randomUUID();
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

            // Call Chat API with Streaming
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
                body: JSON.stringify({
                    messages: [
                        ...messages,
                        {
                            role: "user",
                            content: finalContentForAI
                        }
                    ],
                    searchResults: searchResult,
                    chatId: currentChatId
                })
            });

            if (!response.ok) {
                const errorJson = await response.json();
                throw new Error(errorJson.error || "API Failure");
            }

            if (!response.body) throw new Error("No response body");

            // SYNC ID: Get the server-generated ID
            const serverMessageId = response.headers.get("X-Message-Id");
            let finalStreamId = streamMessageId!;

            if (serverMessageId) {
                finalStreamId = serverMessageId;
                setStreamingAssistantId(serverMessageId); // Update state ref
                // Update the placeholder message with the real ID to prevent duplicates
                setMessages(prev => prev.map(m => m.id === streamMessageId ? { ...m, id: serverMessageId } : m));
            }

            const reader = response.body.getReader();
            await processReader(reader, finalStreamId, currentChatId!);

        } catch (e: any) {
            console.error(e);
            toast.error("Gagal mengirim pesan: " + e.message);
            // Cleanup based on current known ID
            setMessages(prev => prev.filter(m => m.id !== streamMessageId && m.id !== streamingAssistantId));
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
            setStreamingAssistantId(null);
            setAttachedFile(null);
            setSearchResults([]); // Cleanup in finally block too
        }
    };

    const handleStop = () => {
        setIsStreaming(false);
        setIsLoading(false);
    };

    const handleMessageUpdated = (updated: Message) => {
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
    };

    const handleResendFromMessage = async (msg: Message) => {
        if (isLoading || isStreaming) return;

        const msgIndex = messages.findIndex((m) => m.id === msg.id);
        if (msgIndex === -1) return;

        const newHistory = messages.slice(0, msgIndex);

        const updatedHistory = [...newHistory, msg];
        setMessages(updatedHistory);

        setIsLoading(true);
        setIsStreaming(true);

        const streamMessageId = crypto.randomUUID();
        const assistantPlaceholder: Message = {
            id: streamMessageId,
            role: "assistant",
            content: "",
            chat_id: chatId!,
            user_id: msg.user_id,
            created_at: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantPlaceholder]);
        setStreamingAssistantId(streamMessageId);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
                body: JSON.stringify({
                    messages: updatedHistory,
                    searchResults: [],
                    chatId: chatId
                })
            });

            if (!response.ok) {
                const errorJson = await response.json();
                throw new Error(errorJson.error || "API Failure");
            }

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            await processReader(reader, streamMessageId, chatId!);

        } catch (e: any) {
            console.error(e);
            toast.error("Gagal mengirim ulang: " + e.message);
            setMessages(prev => prev.filter(m => m.id !== streamMessageId));
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
            setStreamingAssistantId(null);
        }
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
