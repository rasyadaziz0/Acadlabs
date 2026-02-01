"use client";

import { useChatHistory } from "@/hooks/chat/useChatHistory";
import { useChatActions } from "@/hooks/chat/useChatActions";
import { useChatScroll } from "@/hooks/chat/useChatScroll";
import ChatMessage from "@/components/chat/ChatMessage";
import SearchResults from "@/components/search-results";
import AiInput from "@/components/ui/ai-input";

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
            <div className="flex-1 overflow-y-auto w-full pb-[200px]" id="app-scroll">
                <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                    {messages.length === 0 && !isLoadingMessages ? (
                        <div className="flex flex-col items-center justify-center text-center h-full pt-20">
                            <h2 className="mb-2 text-2xl font-bold flex items-center">
                                Welcome to <span className="ml-2 text-yellow-500">Acadlabs</span>
                            </h2>
                            <p className="mb-8 text-muted-foreground">
                                Mulai ngobrol dengan personal AI kamu.
                            </p>
                        </div>
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
                className="fixed bottom-0 md:left-[240px] left-0 right-0 z-20 bg-gradient-to-t from-background via-background to-transparent pt-10 pb-6 px-4"
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
