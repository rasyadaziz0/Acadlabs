"use client";

import { useChatHistory } from "@/hooks/chat/useChatHistory";
import { useChatActions } from "@/hooks/chat/useChatActions";
import { useChatScroll } from "@/hooks/chat/useChatScroll";
import ChatMessage from "@/components/chat/ChatMessage";
import { EmptyState } from "@/components/chat/EmptyState";
import SearchResults from "@/components/search-results";
import AiInput from "@/components/ui/ai-input";
import React from "react";

interface ChatInterfaceProps {
    initialChatId?: string;
}

// Force hydration refresh
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

    const {
        messagesEndRef,
        inputContainerRef,
        scrollToBottom,
        shouldAutoScrollRef
    } = useChatScroll(messages, isLoadingMessages, false);

    const {
        input,
        setInput,
        isLoading,
        isStreaming,
        handleSubmit,
        attachedFile,
        setAttachedFile,
        useSearch,
        setUseSearch,
        searchResults,
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

    const hasMessages = messages.length > 0;

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden">
            <div className="w-full flex-1 overflow-y-auto px-4 py-6 pb-24 scroll-smooth">
                <div
                    className={
                        hasMessages
                            ? "max-w-3xl mx-auto space-y-6"
                            : "max-w-3xl mx-auto min-h-full flex flex-col justify-center"
                    }
                >
                    {messages.length === 0 && !isLoadingMessages ? (
                        <EmptyState setInput={setInput} />
                    ) : (
                        messages.map((msg, i) => {
                            const isLast = i === messages.length - 1;
                            // Inject Search Results ABOVE the active assistant message
                            if (msg.role === "assistant" && isLast && (isLoading || isStreaming || isSearching)) {
                                return (
                                    <div key={msg.id || i} className="flex flex-col gap-4">
                                        {(isSearching || searchResults.length > 0) && (
                                            <div className="w-full max-w-3xl mx-auto fade-in-up">
                                                <SearchResults results={searchResults} isSearching={isSearching} />
                                            </div>
                                        )}
                                        <ChatMessage
                                            message={msg}
                                            chatTitle=""
                                            onMessageUpdated={handleMessageUpdated}
                                            onResend={handleResendFromMessage}
                                        />
                                    </div>
                                );
                            }

                            return (
                                <ChatMessage
                                    key={msg.id || i}
                                    message={msg}
                                    chatTitle=""
                                    onMessageUpdated={handleMessageUpdated}
                                    onResend={handleResendFromMessage}
                                />
                            );
                        })
                    )}

                    {isStreaming && messages.length === 0 && ( /* Edge case */
                        <span className="ml-0.5 inline-block align-[-0.15em] w-[8px] h-[1em] bg-current/70 rounded-sm animate-pulse" />
                    )}

                    {hasMessages && <div ref={messagesEndRef} className="h-4 shrink-0" />}
                </div>
            </div>

            <div
                ref={inputContainerRef}
            >
                <div className="max-w-3xl mx-auto space-y-4">
                    <AiInput
                        value={input}
                        onChange={setInput}
                        onSubmit={() => handleSubmit()}
                        isLoading={isLoading}
                        onFileSelected={setAttachedFile}
                        attachedFile={attachedFile}
                        useSearch={useSearch}
                        onSearchToggle={() => setUseSearch(!useSearch)}
                        placeholder="Ketik pesan..."
                    />
                    <div className="text-center mt-1 mb-0.5">
                        <p className="text-[8px] text-zinc-400 dark:text-zinc-500">
                            Acadlabs dapat membuat kesalahan. Periksa kembali informasi penting.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
