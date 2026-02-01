import { useState, useEffect, useRef } from "react";
import { Message } from "@/components/chat/ChatMessage";

export function useChatScroll(
    messages: Message[],
    isLoading: boolean,
    isStreaming: boolean
) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputContainerRef = useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const shouldAutoScrollRef = useRef<boolean>(true);
    const [inputHeight, setInputHeight] = useState<number>(160);

    const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
        messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    };

    useEffect(() => {
        if (shouldAutoScroll) scrollToBottom(isLoading ? "auto" : "smooth");
    }, [messages, shouldAutoScroll, isLoading]);

    // Auto-scroll when streaming starts
    useEffect(() => {
        if (isStreaming && shouldAutoScroll) {
            scrollToBottom("auto");
        }
    }, [isStreaming, shouldAutoScroll]);

    // Track whether user is near the bottom of the <main id="app-scroll"> container
    useEffect(() => {
        const scroller = document.getElementById("app-scroll");
        if (!scroller) return;
        const handleScroll = () => {
            const threshold = 100; // px from bottom to consider "at bottom"
            const atBottom =
                scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < threshold;
            setShouldAutoScroll(atBottom);
            shouldAutoScrollRef.current = atBottom;
        };
        scroller.addEventListener("scroll", handleScroll);
        // Initialize state based on current position
        handleScroll();
        return () => scroller.removeEventListener("scroll", handleScroll);
    }, []);

    // Observe input footer height changes and apply bottom padding to content
    useEffect(() => {
        const el = inputContainerRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const h = Math.ceil(entry.contentRect.height);
                setInputHeight(h);
            }
        });
        ro.observe(el);
        // Initialize immediately
        setInputHeight(Math.ceil(el.getBoundingClientRect().height));
        return () => ro.disconnect();
    }, []);

    return {
        messagesEndRef,
        inputContainerRef,
        inputHeight,
        scrollToBottom,
        setShouldAutoScroll,
        shouldAutoScrollRef, // Exporting this might be useful if needed in callbacks, though not requested explicitly.
    };
}
