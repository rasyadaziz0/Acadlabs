"use client";

import { useEffect, useRef, memo } from "react";
import { useTheme } from "next-themes";

interface TradingViewWidgetProps {
    symbol: string;
}

const TradingViewWidget = ({ symbol }: TradingViewWidgetProps) => {
    const container = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();

    // Helper: Map Yahoo/Input Symbol to TradingView Symbol
    const getTVSymbol = (sym: string): string => {
        const s = sym.toUpperCase().trim();

        // 1. Gold
        if (["XAU", "GOLD", "GC=F", "XAUUSD"].includes(s)) {
            return "OANDA:XAUUSD";
        }

        if (s.endsWith("USD")) {
            const coin = s.replace("USD", "");
            return `${coin}USDT`;
        }

        // 3. Indo Stocks (Ends with .JK)
        // Map "BBCA.JK" -> "IDX:BBCA"
        if (s.endsWith(".JK")) {
            const stock = s.replace(".JK", "");
            return `${stock}`;
        }

        // 4. Default / US Stocks
        if (/^[A-Z]+$/.test(s)) {
            return `${s}`;
        }

        return s;
    };

    useEffect(() => {
        if (!container.current) return;

        // Clear previous widget
        container.current.innerHTML = "";

        const script = document.createElement("script");
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
        script.type = "text/javascript";
        script.async = true;

        const tvSymbol = getTVSymbol(symbol);
        const isDark = theme === "dark" || theme === "system";

        const config = {
            "autosize": true,
            "symbol": tvSymbol,
            "interval": "D",
            "timezone": "Asia/Jakarta",
            "theme": isDark ? "dark" : "light",
            "style": "1",
            "locale": "id",
            "enable_publishing": false,
            "hide_top_toolbar": false,
            "allow_symbol_change": true,
            "calendar": false,
            "support_host": "https://www.tradingview.com"
        };

        script.innerHTML = JSON.stringify(config);
        container.current.appendChild(script);

    }, [symbol, theme]); // Re-render on symbol or theme change

    return (
        <div className="w-full h-full border rounded-lg overflow-hidden bg-card" ref={container}>
            {/* Widget Injected Here */}
        </div>
    );
};

export default memo(TradingViewWidget);
