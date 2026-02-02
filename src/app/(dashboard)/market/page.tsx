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

// Dynamic import for chart to avoid SSR issues
const TradingChart = dynamic(() => import("@/components/market/TradingChart"), { ssr: false });

export default function MarketPage() {
    const [symbol, setSymbol] = useState("");
    const [type, setType] = useState("STOCK");
    const [result, setResult] = useState<string | null>(null);
    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!symbol) return;

        setLoading(true);
        setError(null);
        setResult(null);
        setChartData([]);

        try {
            const res = await fetch("/api/market", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol, type }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to analyze data");
            }

            setResult(data.result);
            setChartData(data.chartData || []);
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background p-6 space-y-6">
            <div className="flex items-center space-x-2">
                <TrendingUp className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">Market Intelligence</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                {/* Left Panel: Inputs */}
                <div className="lg:col-span-3 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Search className="h-4 w-4" />
                                Analysis Parameters
                            </CardTitle>
                            <CardDescription>
                                Select asset type and symbol.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Asset Type</Label>
                                <Select value={type} onValueChange={setType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="STOCK">Stock (e.g., IBM)</SelectItem>
                                        <SelectItem value="CRYPTO">Crypto (e.g., BTC)</SelectItem>
                                        <SelectItem value="FOREX">Forex (e.g., EUR/USD)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Symbol</Label>
                                <Input
                                    placeholder={type === 'CRYPTO' ? 'BTC' : (type === 'FOREX' ? 'EUR/USD' : 'IBM')}
                                    value={symbol}
                                    onChange={(e) => setSymbol(e.target.value)}
                                />
                            </div>

                            <Button
                                className="w-full"
                                onClick={handleAnalyze}
                                disabled={loading || !symbol}
                            >
                                {loading ? (
                                    <>
                                        <span className="animate-spin mr-2">⏳</span> Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <BarChart3 className="mr-2 h-4 w-4" /> Analyze Market
                                    </>
                                )}
                            </Button>

                            {error && (
                                <div className="p-3 text-sm text-red-500 bg-red-500/10 rounded-md flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    {error}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="p-4 rounded-lg bg-muted/50 border text-sm text-muted-foreground">
                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                            <LineChart className="h-4 w-4" />
                            Intelligence Source
                        </h4>
                        <p className="mb-2">
                            <strong>Data:</strong> Alpha Vantage (100 Days)
                        </p>
                        <p>
                            <strong>Analysis:</strong> Groq AI (Technical)
                        </p>
                    </div>
                </div>

                {/* Right Panel: Chart & Results */}
                <div className="lg:col-span-9 flex flex-col space-y-4">
                    {/* Chart Section */}
                    {chartData.length > 0 ? (
                        <div className="w-full">
                            <TradingChart data={chartData} />
                        </div>
                    ) : (
                        !loading && (
                            <div className="w-full h-[400px] border rounded-lg bg-muted/10 flex items-center justify-center text-muted-foreground">
                                <div className="text-center">
                                    <LineChart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                    <p>Enter a symbol to view chart</p>
                                </div>
                            </div>
                        )
                    )}

                    {/* Analysis Result */}
                    <Card className="flex-1">
                        <CardHeader className="pb-2">
                            <CardTitle>AI Technical Analysis</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                    <Skeleton className="h-16 w-full" />
                                </div>
                            ) : result ? (
                                <CardContent className="p-6">
                                    <div className="w-full max-w-none min-h-[200px]">
                                        <MarkdownRenderer content={result} role="assistant" />
                                    </div>
                                </CardContent>
                            ) : (
                                <div className="text-sm text-muted-foreground">
                                    Running analysis will display AI insights here.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
