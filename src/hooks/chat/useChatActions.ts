import { useState, useRef, useMemo } from "react";
import { Message } from "@/components/chat/ChatMessage";
import { createBrowserClient } from "@supabase/ssr";
import { toast } from "sonner";
import { handleFileUpload } from "@/lib/upload-client"; // Assume this returns { content: "OCR Text" }
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
            // Final flush
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

        const hasFile = !!attachedFile;
        // Marker for UI to show attachment icon (optional logic could handle this better)
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

        // Add User Message Optimistically
        const tempId = Date.now().toString();
        const userMessage: Message = {
            id: tempId,
            role: "user",
            content: hasFile ? `${attachmentMarker}\n${originalInput}` : originalInput,
            chat_id: currentChatId!,
            user_id: userData.user.id,
            created_at: new Date().toISOString(),
        };

        setMessages((prev) => clampLastNMessages([...prev, userMessage], HISTORY_LIMIT));
        setInput("");
        setIsLoading(true);
        setIsStreaming(true);

        // Prep Stream Placeholder
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

        try {
            // Search
            let searchResult: any[] = [];
            if (useSearch && !hasFile) searchResult = await handleSearch();

            // Handle File First (OCR)
            let finalContentForAI = originalInput;
            if (hasFile) {
                // We use handleFileUpload which uses Gemini to get OCR text
                const res = await handleFileUpload(attachedFile!);
                // We do NOT save this as assistant message anymore.
                // We treat this as Context for the AI.
                const ocrText = res.content || "[No text found in image]";

                // Construct prompts
                finalContentForAI = `User Input: ${originalInput}\n\n[Attached Image Content/OCR Result]:\n${ocrText}`;

                // Update the persisted user message to include this context? 
                // NO, keep user message clean in DB for history legibility (or maybe include it?), 
                // but for now, we just pass it to the AI prompt without saving giant OCR blob to user message if not needed.
                // Actually, saving it is better for context resume. 
                // Let's stick to saving the original user input to DB, but sending the composite to the LLM.
                // For DB persistence of the file context, handleFileUpload usually saves the file ref.
                // We will rely on the "User just sent this" context.
            }

            // Persist User Message (Clean version)
            const { data: savedUserMsg } = await supabase.from("messages").insert({
                role: "user",
                content: userMessage.content,
                chat_id: currentChatId!,
                user_id: userData.user.id
            }).select().single();

            if (savedUserMsg) {
                setMessages(prev => prev.map(m => m.id === tempId ? savedUserMsg as Message : m));
            }

            // Call Chat API with Streaming
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
                body: JSON.stringify({
                    // If file, we inject the specific prompt. If not, just messages.
                    // IMPORTANT: We need to replace the last message content with our composite content if it changed.
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

            const reader = response.body.getReader();
            await processReader(reader, streamMessageId);

        } catch (e: any) {
            console.error(e);
            toast.error("Gagal mengirim pesan: " + e.message);
            // Remove the placeholder if it failed
            setMessages(prev => prev.filter(m => m.id !== streamMessageId));
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

    const handleResendFromMessage = async (msg: Message) => {
        // Implementation for resend
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
