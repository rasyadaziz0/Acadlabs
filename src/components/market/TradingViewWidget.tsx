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

        // 2. Crypto (Usually ends with -USD in our app logic)
        // Map "BTC-USD" -> "BINANCE:BTCUSDT"
        if (s.endsWith("-USD")) {
            const coin = s.replace("-USD", "");
            return `${coin}`;
        }

        // 3. Indo Stocks (Ends with .JK)
        // Map "BBCA.JK" -> "IDX:BBCA"
        if (s.endsWith(".JK")) {
            const stock = s.replace(".JK", "");
            return `IDX:${stock}`;
        }

        // 4. Default / US Stocks
        // Stick to NASDAQ if no specific prefix, or let TV handle it.
        // Usually good to try NASDAQ or NYSE, but just returning raw might be safer if unsure?
        // User requested: Default -> "NASDAQ:" or simple.
        // Let's prepend NASDAQ if it looks like a ticker (letters only).
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
            "timezone": "Etc/UTC",
            "theme": isDark ? "dark" : "light",
            "style": "1",
            "locale": "en",
            "enable_publishing": false,
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
