import { useRef, useState, useEffect } from "react";
import { Message } from "@/components/chat/ChatMessage";

export function useChatScroll(messages: Message[], isLoading: boolean, isStreaming: boolean) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputContainerRef = useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const shouldAutoScrollRef = useRef(shouldAutoScroll);

    useEffect(() => {
        shouldAutoScrollRef.current = shouldAutoScroll;
    }, [shouldAutoScroll]);

    const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
        messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    };

    useEffect(() => {
        if (shouldAutoScroll) {
            scrollToBottom(isLoading || isStreaming ? "auto" : "smooth");
        }
    }, [messages, shouldAutoScroll, isLoading, isStreaming]);

    return { messagesEndRef, inputContainerRef, shouldAutoScroll, setShouldAutoScroll, scrollToBottom, shouldAutoScrollRef };
}
