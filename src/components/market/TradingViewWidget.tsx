"use client";

import { useEffect, useRef, memo } from "react";
import { useTheme } from "next-themes";

interface TradingViewWidgetProps {
    symbol: string;
}

const TradingViewWidget = ({ symbol }: TradingViewWidgetProps) => {
    const container = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();

    // Helper: Safely map symbols to TradingView format
    const getTVSymbol = (sym: string): string => {
        const s = sym.toUpperCase().trim();

        // 1. If prefix exists (e.g. "BINANCE:BTCUSDT"), return as is
        if (s.includes(":")) {
            return s;
        }

        // 2. Handle Gold / XAU
        if (["XAU", "GOLD", "GC=F", "XAUUSD"].includes(s)) {
            return "OANDA:XAUUSD";
        }

        // 3. Handle Crypto standard (Ends with USD -> USDT)
        if (s.endsWith("USD") && !s.includes("USDT")) {
            const coin = s.replace("USD", "");
            return `${coin}USDT`;
        }

        // 4. Handle Crypto USDT raw (e.g. BTCUSDT -> BINANCE:BTCUSDT)
        if (s.endsWith("USDT")) {
            return `${s}`;
        }

        // 5. Indo Stocks (Ends with .JK -> IDX:...)
        if (s.endsWith(".JK")) {
            const stock = s.replace(".JK", "");
            return `IDX:${stock}`;
        }

        // 6. Default fallback
        return s;
    };

    useEffect(() => {
        if (!container.current) return;

        // Cleanup previous render
        container.current.innerHTML = "";

        // 1. Create Wrapper (MANDATORY for TradingView)
        const widgetContainer = document.createElement("div");
        widgetContainer.className = "tradingview-widget-container__widget";
        widgetContainer.style.height = "100%";
        widgetContainer.style.width = "100%";
        container.current.appendChild(widgetContainer);

        // 2. Create Script
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
            "hide_side_toolbar": false,
            "allow_symbol_change": true,
            "calendar": false,
            "support_host": "https://www.tradingview.com",
            "enabled_features": ["countdown"]
        };

        script.innerHTML = JSON.stringify(config);

        // 3. Append script AFTER wrapper
        container.current.appendChild(script);

    }, [symbol, theme]);

    return (
        <div
            className="tradingview-widget-container w-full h-full bg-card"
            ref={container}
            style={{ height: "100%", width: "100%" }}
        />
    );
};

export default memo(TradingViewWidget);
