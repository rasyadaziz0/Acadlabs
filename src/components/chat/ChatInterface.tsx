"use client";

import { useChatHistory } from "@/hooks/chat/useChatHistory";
import { useChatActions } from "@/hooks/chat/useChatActions";
import { useChatScroll } from "@/hooks/chat/useChatScroll";
import ChatMessage from "@/components/chat/ChatMessage";
import { EmptyState } from "@/components/chat/EmptyState";
import SearchResults from "@/components/search-results";
import AiInput from "@/components/ui/ai-input";

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
        attachedFile,
        setAttachedFile,
        useSearch,
        setUseSearch,
        searchResults,
        streamingContainerRef,
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

    return (
        <div className="flex flex-col h-full relative" id="app-scroll">
            <div className="flex-1 overflow-y-auto w-full pb-[9rem]" id="app-scroll">
                <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                    {messages.length === 0 && !isLoadingMessages ? (
                        <EmptyState setInput={setInput} />
                    ) : (
                        messages.map((msg, i) => (
                            <ChatMessage
                                key={msg.id || i}
                                message={msg}
                                chatTitle="" // derivedChatTitle logic removed or needs re-adding if essential
                                onMessageUpdated={handleMessageUpdated}
                                onResend={handleResendFromMessage}
                            />
                        ))
                    )}

                    <div ref={streamingContainerRef} className="prose dark:prose-invert w-full max-w-[72ch] min-w-0 break-words text-[15px] sm:text-[16px] leading-relaxed whitespace-pre-wrap" />

                    {isStreaming && (
                        <span className="ml-0.5 inline-block align-[-0.15em] w-[8px] h-[1em] bg-current/70 rounded-sm animate-pulse" />
                    )}

                    <div ref={messagesEndRef} className="h-4" />
                </div>
            </div>

            <div
                ref={inputContainerRef}
                className="fixed bottom-0 z-20 w-full bg-gradient-to-t from-background via-background/90 to-transparent pt-6 pb-2 px-4 md:left-64 md:w-[calc(100%-16rem)]"
            >
                <div className="max-w-3xl mx-auto space-y-4">
                    {searchResults.length > 0 && <SearchResults results={searchResults} />}
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
                    <div className="text-center mt-2 mb-1">
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            Acadlabs dapat membuat kesalahan. Periksa kembali informasi penting.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
