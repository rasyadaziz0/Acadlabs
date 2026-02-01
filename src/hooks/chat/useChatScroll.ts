import { useRef, useState, useEffect } from "react";
import { Message } from "@/components/chat/ChatMessage";

export function useChatScroll(messages: Message[], isLoading: boolean, isStreaming: boolean) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputContainerRef = useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const shouldAutoScrollRef = useRef(shouldAutoScroll);
    const [inputHeight, setInputHeight] = useState(160);

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

    useEffect(() => {
        const el = inputContainerRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) setInputHeight(Math.ceil(entry.contentRect.height));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return { messagesEndRef, inputContainerRef, inputHeight, shouldAutoScroll, setShouldAutoScroll, scrollToBottom, shouldAutoScrollRef };
}
