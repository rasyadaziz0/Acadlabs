"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, BarChart3, AlertCircle,  Search } from "lucide-react";
import MarkdownRenderer from "@/components/chat/markdown/MarkdownRenderer";
import dynamic from "next/dynamic";

// Dynamic imports
const TradingChart = dynamic(() => import("@/components/market/TradingChart"), { ssr: false });
const TradingViewWidget = dynamic(() => import("@/components/market/TradingViewWidget"), { ssr: false });

export default function MarketPage() {
    const [symbol, setSymbol] = useState("");
    const [type, setType] = useState("STOCK");

    // State to lock symbol for display (Chart & AI Result)
    const [displaySymbol, setDisplaySymbol] = useState<string>("BTCUSDT");
    const [result, setResult] = useState<string | null>(null);
    const [chartData, setChartData] = useState<any[]>([]); // Data for Mobile Chart
    const [loading, setLoading] = useState(false);

    // Quick Mapping logic on Frontend (to align with Backend mostly)
    const processSymbol = () => {
        // Return raw symbol for API (let backend handle it)
        return symbol.trim().toUpperCase();
    };

    const handleAnalyze = async () => {
        const processedSymbol = processSymbol();
        if (!processedSymbol) return;

        setLoading(true);
        setResult(null);
        setChartData([]);

        // MAPPING UNTUK TRADINGVIEW WIDGET
        let tvSymbol = processedSymbol;

        if (type === "CRYPTO") {
            // Requirement User: BINANCE:${symbol.replace("-USD","")}USDT
            // Pastikan formatnya valid untuk Binance (Raw Ticker + USDT)
            const raw = processedSymbol
                .replace("-USD", "")
                .replace("USD", "")
                .replace("USDT", "") // Clean all to be safe
                .trim();

            tvSymbol = `BINANCE:${raw}USDT`;

        } else if (type === "STOCK") {
            // Requirement User: IDX:${symbol} atau default
            tvSymbol = `IDX:${processedSymbol}`;
        }

        // Locked Symbol for Chart & Widget
        setDisplaySymbol(tvSymbol);

        try {
            const res = await fetch("/api/market", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol: processedSymbol, type }),
            });

            const data = await res.json();

            // Note: API now returns success logic even for 404 (AI says "Data not found")
            if (data.result) {
                setResult(data.result);
            } else {
                setResult("## Gagal Memuat\nTidak ada respon dari server.");
            }

            if (data.data) {
                setChartData(data.data);
            }
        } catch (err: any) {
            setResult(`## Error\nTerjadi kesalahan jaringan: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Locking via CSS is preferred. Removed aggressive JS lock to fix "stuck" scroll.
    // UPDATE: User confirmed "Page scrolls" is unwanted. We strictly lock the DASHBOARD MAIN CONTAINER (#app-scroll).
    useEffect(() => {
        // Elements to lock: html, body, and the dashboard constraint
        // We use a "Nuclear" approach because likely global CSS or Sidebar layout is forcing a scrollbar.
        const targets = [
            document.documentElement,
            document.body,
            document.getElementById("app-scroll")
        ];

        const originalStyles = targets.map(el => el ? el.style.overflow : null);

        // Apply Lock
        targets.forEach(el => {
            if (el) el.style.setProperty("overflow", "hidden", "important");
        });

        return () => {
            // Restore
            targets.forEach((el, i) => {
                if (el) {
                    if (originalStyles[i]) {
                        el.style.overflow = originalStyles[i]!;
                    } else {
                        el.style.removeProperty("overflow");
                    }
                }
            });
        };
    }, []);

    return (
        <div className="flex flex-col h-full bg-background p-4 sm:p-6 lg:p-8 overflow-y-auto">
            {/* Header / Toolbar */}
            <div className="flex flex-wrap items-center gap-4 mb-4 p-4 border rounded-lg bg-card shadow-sm shrink-0">
                <div className="flex items-center gap-2 mr-auto">
                    <TrendingUp className="h-6 w-6 text-primary" />
                    <h1 className="text-xl font-bold hidden md:block">Market Analysis</h1>
                </div>

                {/* Input Group */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Select value={type} onValueChange={setType}>
                        <SelectTrigger className="w-[110px]">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="STOCK">Stock</SelectItem>
                            <SelectItem value="CRYPTO">Crypto</SelectItem>
                            <SelectItem value="FOREX">Forex/Gold</SelectItem>
                        </SelectContent>
                    </Select>

                    <Input
                        className="w-full md:w-[150px]"
                        placeholder="Symbol"
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                    />

                    <Button onClick={handleAnalyze} disabled={loading || !symbol}>
                        {loading ? <span className="animate-spin">⏳</span> : <Search className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* Main Hybrid Layout: 2 Cols */}
            {/* ABSOLUTE WRAPPER STRATEGY: Forces Grid to fit exactly 100% of remaining space */}
            <div className="flex-1 min-h-0 relative w-full">
                <div className="absolute inset-0 grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-1 gap-4">

                    {/* Chart Section (Responsive) */}
                    <div className="lg:col-span-2 border rounded-lg overflow-hidden bg-card shadow-md relative min-h-[400px] lg:min-h-0 h-full">

                        {/* MOBILE: Static Chart (Lightweight Charts) */}
                        <div className="block md:hidden h-full w-full">
                            {chartData.length > 0 ? (
                                <div className="h-full w-full p-2">
                                    <TradingChart data={chartData} />
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm p-6">
                                    <BarChart3 className="h-10 w-10 mb-2 opacity-50" />
                                    <p>Chart Static (Mobile)</p>
                                    <p className="text-xs">Cari simbol untuk melihat data.</p>
                                </div>
                            )}
                        </div>

                        {/* DESKTOP: Widget TradingView Pro */}
                        <div className="hidden md:block absolute inset-0">
                            <TradingViewWidget symbol={displaySymbol} />
                        </div>
                    </div>

                    {/* Right: AI Analysis (1/3) */}
                    <div className="border rounded-lg bg-card shadow-md flex flex-col min-h-0 h-full">
                        <div className="p-3 border-b bg-muted/20 shrink-0">
                            <h2 className="font-semibold flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-purple-500" />
                                AcadLabs AI Insight
                            </h2>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 pb-8 scroll-smooth">
                            {loading ? (
                                <div className="space-y-4 animate-pulse">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-5/6" />
                                    <div className="h-32 bg-muted/20 rounded-lg" />
                                </div>
                            ) : result ? (
                                <div className="prose dark:prose-invert w-full max-w-none break-words text-sm leading-relaxed prose-headings:tracking-tight prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-2 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:leading-6 prose-li:leading-6 prose-p:my-[4px] prose-strong:font-semibold prose-a:no-underline hover:prose-a:underline prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-ul:my-[4px] prose-ol:my-[4px] prose-li:my-0.5 prose-li:marker:text-zinc-500 dark:prose-li:marker:text-zinc-400 prose-pre:rounded-lg prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-hr:border-zinc-200 dark:prose-hr:border-zinc-800 prose-blockquote:border-l-4 prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-700 prose-blockquote:pl-4 prose-blockquote:italic">
                                    <MarkdownRenderer content={result} role="assistant" />
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-6 opacity-60">
                                    <AlertCircle className="h-12 w-12 mb-3" />
                                    <p>Ready to Analyze.</p>
                                    <p className="text-xs mt-1">Select asset and click search to generate AI insights.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
