"use client";

import { useEffect, useRef, useState } from "react";

interface TurnstileProps {
    siteKey: string;
    onVerify: (token: string) => void;
    onError?: (error?: string) => void;
    onExpire?: () => void;
    theme?: "light" | "dark" | "auto";
}

export default function Turnstile({
    siteKey,
    onVerify,
    onError,
    onExpire,
    theme = "auto",
}: TurnstileProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [widgetId, setWidgetId] = useState<string | null>(null);

    useEffect(() => {
        // Check if script is already present
        let script = document.querySelector(
            'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
        ) as HTMLScriptElement;

        if (!script) {
            script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }

        const renderWidget = () => {
            if (!containerRef.current || !window.turnstile) return;

            const id = window.turnstile.render(containerRef.current, {
                sitekey: siteKey,
                theme,
                callback: (token) => {
                    onVerify(token);
                },
                "error-callback": (err) => {
                    if (onError) onError(err);
                },
                "expired-callback": () => {
                    if (onExpire) onExpire();
                },
            });
            setWidgetId(id);
        };

        if (window.turnstile) {
            renderWidget();
        } else {
            script.onload = renderWidget;
        }

        return () => {
            if (widgetId && window.turnstile) {
                window.turnstile.remove(widgetId);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteKey, theme]);

    return <div ref={containerRef} />;
}
