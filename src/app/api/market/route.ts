import { NextResponse } from "next/server";
import { analyzeMarketDataWithGroq } from "@/lib/groq";
import YahooFinance from "yahoo-finance2"; // Default import IS the class

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const { symbol, type, interval = "1d" } = await req.json();

        if (!symbol) {
            return NextResponse.json(
                { error: "Symbol is required" },
                { status: 400 }
            );
        }

        const yahooFinance = new YahooFinance();

        // 1. Logic Mapping Simbol Cerdas
        let yahooSymbol = symbol.toUpperCase().trim();

        switch (type) {
            case "CRYPTO":
                // Jika tidak ada "-", tambahkan "-USD"
                if (!yahooSymbol.includes("-")) {
                    yahooSymbol += "-USD";
                }
                break;
            case "FOREX":
                // Special Mapping untuk Gold
                if (["XAU", "GOLD", "XAUUSD"].includes(yahooSymbol)) {
                    yahooSymbol = "GC=F"; // Gold Futures
                } else {
                    // Jika Forex biasa dan belum ada "=X", tambahkan
                    if (!yahooSymbol.endsWith("=X")) {
                        yahooSymbol += "=X";
                    }
                }
                break;
            case "STOCK":
            default:
                // Biarkan apa adanya
                break;
        }

        // 2. Fetching Data (Adjust based on interval)
        const endDate = new Date();
        const startDate = new Date();

        let yahooInterval: "1d" | "1wk" | "1mo" = "1d";

        // Map frontend interval to Yahoo Finance interval
        if (interval === "1w") {
            yahooInterval = "1wk";
            startDate.setDate(endDate.getDate() - (30 * 7)); // ~30 weeks
        } else if (interval === "1m") {
            yahooInterval = "1mo";
            startDate.setDate(endDate.getDate() - (30 * 30)); // ~30 months
        } else {
            // Default 1d
            startDate.setDate(endDate.getDate() - 45); // 45 days (buffer for 30 trading days)
        }

        // Bungkus dalam try-catch khusus fetch
        let result: any[] = [];
        try {
            result = await yahooFinance.historical(yahooSymbol, {
                period1: startDate,
                period2: endDate,
                interval: yahooInterval,
            });
        } catch (fetchErr: any) {
            console.error(`Yahoo Finance Fetch Error (${yahooSymbol}):`, fetchErr);
            if (fetchErr.message?.includes("404") || fetchErr.message?.includes("Not Found")) {
                return NextResponse.json(
                    { error: `Symbol '${yahooSymbol}' not found. Please check your input.` },
                    { status: 404 }
                );
            }
            throw fetchErr;
        }

        if (!result || result.length === 0) {
            return NextResponse.json(
                { error: `No data found for symbol: ${yahooSymbol}` },
                { status: 404 }
            );
        }

        // Format Data untuk Frontend (Lightweight Charts)
        // Ascending Date (Oldest -> Newest)
        const chartData = result.map((quote: any) => ({
            time: quote.date.toISOString().split("T")[0], // YYYY-MM-DD
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.close,
        }));

        // Limit data points (e.g. last 50 candles for clarity)
        const limitChartData = chartData.slice(-50);

        // 3. AI Integration
        // Format string untuk AI (Descending - Newest First -> Last 14 candles)
        const aiData = [...limitChartData].reverse().slice(0, 14).map((d: any) => {
            return `- ${d.time}: Open=${d.open}, High=${d.high}, Low=${d.low}, Close=${d.close}`;
        }).join("\n");

        const analysis = await analyzeMarketDataWithGroq(symbol, aiData);

        // Return Data
        return NextResponse.json({
            symbol: yahooSymbol,
            chartData: limitChartData,
            result: analysis
        });

    } catch (error: any) {
        console.error("Market Analysis Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to analyze market data" },
            { status: 500 }
        );
    }
}
