"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, BarChart3, AlertCircle, LineChart, Search } from "lucide-react";
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
        let s = symbol.trim().toUpperCase();
        if (!s) return null;
        if (type === "CRYPTO" && !s.includes("-")) s += "-USD";
        if (type === "FOREX" && !["XAU", "GOLD"].includes(s) && !s.endsWith("=X")) s += "=X";
        return s;
    };

    const handleAnalyze = async () => {
        const processedSymbol = processSymbol();
        if (!processedSymbol) return;

        setLoading(true);
        setResult(null);
        setChartData([]);

        // Locked Symbol for Chart
        setDisplaySymbol(processedSymbol);

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

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-background p-4 overflow-hidden">
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">

                {/* Chart Section (Responsive) */}
                <div className="lg:col-span-2 border rounded-lg overflow-hidden bg-card shadow-md relative min-h-[400px]">

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
                <div className="border rounded-lg bg-card shadow-md flex flex-col min-h-0">
                    <div className="p-3 border-b bg-muted/20">
                        <h2 className="font-semibold flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-purple-500" />
                            AcadLabs AI Insight
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {loading ? (
                            <div className="space-y-4 animate-pulse">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-5/6" />
                                <div className="h-32 bg-muted/20 rounded-lg" />
                            </div>
                        ) : result ? (
                            <MarkdownRenderer content={result} role="assistant" />
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
    );
}
