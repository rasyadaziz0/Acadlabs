import { NextResponse } from "next/server";
import { analyzeMarketDataWithGroq } from "@/lib/groq";
import yahooFinance from "yahoo-finance2";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const { symbol, type } = await req.json();

        if (!symbol) {
            return NextResponse.json(
                { error: "Symbol is required" },
                { status: 400 }
            );
        }

        let yahooSymbol = symbol.toUpperCase().trim();

        switch (type) {
            case "CRYPTO":
                // e.g. BTC -> BTC-USD
                if (!yahooSymbol.includes("-")) {
                    yahooSymbol += "-USD";
                }
                break;
            case "FOREX":
                // Special mappings
                if (yahooSymbol === "XAU" || yahooSymbol === "GOLD") {
                    yahooSymbol = "GC=F"; // Gold Futures
                } else if (!yahooSymbol.endsWith("=X")) {
                    // e.g. EURUSD -> EURUSD=X
                    // But be careful if it already has it
                    yahooSymbol += "=X";
                }
                break;
            case "STOCK":
            default:
                // Pass through: BBCA.JK, NVDA
                break;
        }

        // 2. Fetch Historical Data (30 Days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 40); // Buffer for weekends

        // Using the default instance as per standard docs
        const result: any[] = await yahooFinance.historical(yahooSymbol, {
            period1: startDate,
            period2: endDate,
            interval: "1d",
        });

        if (!result || result.length === 0) {
            throw new Error(`No data found for symbol: ${yahooSymbol}`);
        }

        // 3. Format for Chart (Ascending)
        const chartData = result.map((quote: any) => ({
            time: quote.date.toISOString().split("T")[0],
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.close,
        }));

        // Take last 30
        const limitChartData = chartData.slice(-30);

        // 4. Strings for AI (Descending)
        const aiData = [...limitChartData].reverse().slice(0, 14).map((d: any) => {
            return `- ${d.time}: Open=${d.open}, High=${d.high}, Low=${d.low}, Close=${d.close}`;
        }).join("\n");

        // 5. Groq Analysis
        const analysis = await analyzeMarketDataWithGroq(symbol, aiData);

        return NextResponse.json({ result: analysis, chartData: limitChartData });

    } catch (error: any) {
        console.error("Market Analysis Error:", error);
        // Better error message
        let msg = error.message || "Failed to analyze market data";
        if (msg.includes("404")) msg = `Symbol '${symbol}' not found on Yahoo Finance.`;

        return NextResponse.json(
            { error: msg },
            { status: 500 }
        );
    }
}
