import { NextResponse } from "next/server";
import { analyzeMarketDataWithGroq } from "@/lib/groq";
import YahooFinance from "yahoo-finance2"; // v3 requires instantiation
import { getCryptoData, CoinGeckoData } from "@/lib/coingecko";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const { symbol, type } = await req.json();

        if (!symbol) {
            return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
        }

        let aiContextData = "";
        let mobileChartData: any[] = [];
        let sourceUsed = "YAHOO";

        // === 1. COINGECKO STRATEGY (Priority for Crypto AI) ===
        // Smart Cleaning is handled INSIDE getCryptoData()
        let cgData: CoinGeckoData | null = null;
        if (type === "CRYPTO") {
            try {
                // Kirim Raw Symbol (biar helper yang bersih-bersih)
                cgData = await getCryptoData(symbol);

                if (cgData) {
                    sourceUsed = "COINGECKO";
                    aiContextData = `
                        Data Source: CoinGecko (Priority for Crypto)
                            Symbol: ${cgData.symbol}
                        Current Price: $${cgData.price}
                        Market Cap: $${cgData.marketCap.toLocaleString()}
                        24h Volume: ${cgData.volume24h.toLocaleString()}
                        24h Change: ${cgData.change24h.toFixed(2)}%

                            Price History (Last 14 Days):
                        ${cgData.history.price.map((p: number, i: number) => {
                        const ts = cgData?.history.timestamp[i] || Date.now();
                        const date = new Date(ts).toISOString().split('T')[0];
                        return `- ${date}: $${p.toFixed(4)}`;
                    }).join("\n")
                        }
                    `.trim();
                }
            } catch (cgError) {
                console.warn("CoinGecko Fetch Failed, falling back to Yahoo:", cgError);
            }
        }

        // === 2. YAHOO FINANCE STRATEGY (Fallback & Stocks) ===
        // Yahoo always needs specific format, but we start with raw
        let yahooSymbol = symbol.toUpperCase().trim();

        // Yahoo Symbol Mapping Logic
        switch (type) {
            case "CRYPTO":
                // Standard Yahoo logic: needs "-USD"
                // Jika input "BTC", ubah jadi "BTC-USD"
                // Jika input "BTC-USD", biarkan.
                // Clean symbol for Yahoo: Remove USDT/USD suffix first to get base content
                // Example: "BTCUSDT" -> "BTC", "BTCUSD" -> "BTC", "BTC" -> "BTC"
                let cleanSymbol = yahooSymbol.replace(/USDT?$/, "");

                // Then append -USD standard
                yahooSymbol = `${cleanSymbol}-USD`;

                console.log(`[API] Yahoo Symbol Transformed: ${symbol} -> ${yahooSymbol}`);
                break;
            case "FOREX":
                if (["XAU", "GOLD", "XAUUSD"].includes(yahooSymbol)) yahooSymbol = "GC=F";
                else if (!yahooSymbol.endsWith("=X")) yahooSymbol += "=X";
                break;
        }

        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 30);

            // Fetch using v3 instance
            const yahooFinance = new YahooFinance();
            const yahooResult: any[] = await yahooFinance.historical(yahooSymbol, {
                period1: startDate,
                period2: endDate,
                interval: "1d",
            });

            if (yahooResult && yahooResult.length > 0) {
                // Populate Mobile Chart Data
                mobileChartData = yahooResult.map((item: any) => ({
                    time: item.date.toISOString().split("T")[0],
                    open: item.open,
                    high: item.high,
                    low: item.low,
                    close: item.close,
                }));

                // Fallback for AI if CoinGecko failed (or if Stock/Forex)
                if (!aiContextData) {
                    sourceUsed = "YAHOO_FALLBACK";
                    // create a copy before reversing to avoid mutating the original array
                    aiContextData = [...yahooResult].reverse().slice(0, 14).map((d: any) => {
                        const dateStr = d.date.toISOString().split("T")[0];
                        return `- ${dateStr}: Open = ${d.open}, High = ${d.high}, Low = ${d.low}, Close = ${d.close} `;
                    }).join("\n");
                }
            }
        } catch (yahooError) {
            console.error("Yahoo Finance Error:", yahooError);
        }

        // === 3. FINAL RESPONSE ===
        if (!aiContextData && mobileChartData.length === 0) {
            return NextResponse.json({
                symbol: symbol,
                result: `## ⚠️ Data Tidak Ditemukan\n\nMaaf, sistem tidak dapat menemukan data market untuk ** ${symbol}** di CoinGecko maupun Yahoo Finance.`
            });
        }

        // Perform AI Analysis
        const analysis = await analyzeMarketDataWithGroq(symbol, aiContextData);

        return NextResponse.json({
            symbol: symbol,
            source: sourceUsed,
            result: analysis,
            data: mobileChartData
        });

    } catch (error: any) {
        console.error("Market API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
