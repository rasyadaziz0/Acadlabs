"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ChatMessage, { type Message } from "@/components/chat/ChatMessage";
import SearchResults from "@/components/search-results";
import AiInput from "@/components/ui/ai-input";
import { handleFileUpload } from "@/lib/upload-client";
import { sanitizeUserText, sanitizeAIText, sanitizeSearchQuery } from "@/lib/sanitize";
import { generateChatTitleFromUserInput } from "@/lib/title";
import { useChatScroll } from "@/hooks/chat/useChatScroll";
import { useChatHistory } from "@/hooks/chat/useChatHistory";
import { useChatActions } from "@/hooks/chat/useChatActions";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

interface ChatInterfaceProps {
    initialChatId?: string;
}

export default function ChatInterface({ initialChatId }: ChatInterfaceProps) {
    const {
        messages,
        setMessages,
        chatId,
        setChatId,
        isLoadingMessages,
        clampLastNMessages,
        dedupeAndSort,
        HISTORY_LIMIT
    } = useChatHistory(initialChatId);

    // Extracted scroll/resize logic
    // We pass isStreaming=false because useChatScroll's auto-scroll effect is handled manually by useChatActions during streaming
    const {
        messagesEndRef,
        inputContainerRef,
        inputHeight,
        scrollToBottom,
        shouldAutoScrollRef
    } = useChatScroll(messages, isLoadingMessages, false);

    const {
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
        streamingContainerRef,
        streamingTextNodeRef,
        isSearching,
        handleMessageUpdated,
        handleResendFromMessage
    } = useChatActions(
        messages,
        setMessages,
        chatId,
        setChatId,
        scrollToBottom,
        shouldAutoScrollRef,
        clampLastNMessages,
        dedupeAndSort,
        HISTORY_LIMIT
    );

    const isCodeRequest = false;
    const [shareSlug, setShareSlug] = useState<string | undefined>(undefined);

    const supabase = useMemo(
        () =>
            createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            ),
        []
    );
    const router = useRouter();



    useEffect(() => {
        const fetchShareSlug = async () => {
            if (!chatId) return;
            const { data: userData } = await supabase.auth.getUser();
            if (!userData?.user) return;
            const { data, error } = await supabase
                .from("chats")
                .select("share_slug")
                .eq("id", chatId)
                .eq("user_id", userData.user.id)
                .single();
            if (!error && data) setShareSlug((data as any).share_slug || undefined);
        };
        fetchShareSlug();
    }, [chatId, supabase]);

    // Realtime updates for new messages (INSERT-only) when an id exists
    const derivedChatTitle = useMemo(() => {
        try {
            const firstUser = [...messages].find((m) => m.role === "user")?.content || "";
            if (!firstUser) return "";
            const body = firstUser.replace(/^::attachment\[[^\]]+\]\s*\n?/, "");
            return generateChatTitleFromUserInput(body);
        } catch {
            return "";
        }
    }, [messages]);



    // Initialize/cleanup streaming DOM text node when streaming toggles
    useEffect(() => {
        const container = streamingContainerRef.current;
        if (isStreaming) {
            if (container) {
                container.textContent = "";
                const node = document.createTextNode("");
                container.appendChild(node);
                streamingTextNodeRef.current = node;
            }
        } else {
            if (container) container.textContent = "";
            streamingTextNodeRef.current = null;
        }
    }, [isStreaming]);



    return (
        <div className="flex min-h-full flex-col">
            {/* Scrollable content within main */}
            <div
                id="app-scroll"
                ref={messagesEndRef} // Use messagesEndRef to scroll? No this is contentRef in previous component.
                // Wait, previously `contentRef` was used for resize observer? No, scroller.
                // It was <div id="app-scroll">
                className="flex flex-1 flex-col px-2 py-4 sm:px-4 mx-auto w-full sm:max-w-[680px] md:max-w-[820px] lg:max-w-[980px]"
                style={{ paddingBottom: (inputHeight ?? 0) + 16 }}
            >
                <AnimatePresence initial={false}>
                    {isLoadingMessages ? (
                        <div className="space-y-3 sm:space-y-4">
                            <div className="h-4 w-1/3 rounded bg-muted/50 animate-pulse" />
                            <div className="h-24 w-full rounded bg-muted/50 animate-pulse" />
                            <div className="h-4 w-2/5 rounded bg-muted/50 animate-pulse" />
                        </div>
                    ) : messages.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-1 flex-col items-center justify-center text-center"
                        >
                            <h2 className="mb-2 text-2xl font-bold flex items-center">
                                Welcome to <span className="ml-2 text-yellow-500">Acadlabs</span>
                            </h2>
                            <p className="mb-8 text-muted-foreground">
                                Mulai ngobrol dengan personal AI kamu.
                            </p>
                        </motion.div>
                    ) : (
                        <div className="space-y-3 sm:space-y-4">
                            {messages
                                .filter(Boolean)
                                .map((message) => (
                                    <ChatMessage
                                        key={message.id}
                                        message={message}
                                        chatTitle={derivedChatTitle}
                                        shareSlug={shareSlug}
                                        onMessageUpdated={handleMessageUpdated}
                                        onResend={handleResendFromMessage}
                                    />
                                ))}
                            {isStreaming && (
                                <div className="w-full">
                                    <div
                                        ref={streamingContainerRef}
                                        className="prose dark:prose-invert w-full max-w-[72ch] min-w-0 break-words text-[15px] sm:text-[16px] leading-relaxed whitespace-pre-wrap"
                                    />
                                    <motion.span
                                        aria-hidden
                                        initial={{ opacity: 0.25 }}
                                        animate={{ opacity: [0.25, 1, 0.25] }}
                                        transition={{ duration: 1, repeat: Infinity }}
                                        className="ml-0.5 inline-block align-[-0.15em] w-[8px] h-[1em] bg-current/70 rounded-sm"
                                    />
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </AnimatePresence>

                {searchResults.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="my-4"
                    >
                        <SearchResults results={searchResults} />
                    </motion.div>
                )}
            </div>

            {/* Fixed bottom input/footer */}
            <div
                ref={inputContainerRef}
                className="fixed bottom-0 z-10 w-full sm:w-[calc(100%-240px)] bg-background/80 backdrop-blur-lg border-t border-border/40"
            >
                <div className="mx-auto w-full sm:max-w-[680px] md:max-w-[820px] lg:max-w-[980px] px-2 sm:px-4 py-3">
                    <AiInput
                        value={input}
                        onChange={setInput}
                        onSubmit={() => handleSubmit()}
                        isLoading={isLoading}
                        onFileSelected={setAttachedFile}
                        attachedFile={attachedFile}

                        useSearch={useSearch}
                        onSearchToggle={() => setUseSearch(!useSearch)}

                        placeholder={isCodeRequest ? "Minta kode, penjelasan, atau perbaikan..." : "Ketik pesan..."}
                    />
                    <div className="mt-2 text-center">
                        <p className="text-[10px] sm:text-xs text-muted-foreground/60">
                            Acadlabs dapat membuat kesalahan. Periksa kembali informasi penting.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
