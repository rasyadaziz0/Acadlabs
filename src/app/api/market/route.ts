import { NextResponse } from "next/server";
import { analyzeMarketDataWithGroq } from "@/lib/groq";

export async function POST(req: Request) {
    try {
        const { symbol, type } = await req.json();

        if (!symbol) {
            return NextResponse.json(
                { error: "Symbol is required" },
                { status: 400 }
            );
        }

        const apiKey = process.env.ALPHA_VANTAGE_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: "Alpha Vantage API key not configured" },
                { status: 500 }
            );
        }

        let url = "";
        // Map type to Alpha Vantage endpoints
        // Types: 'CRYPTO' | 'FOREX' | 'STOCK'
        switch (type) {
            case "CRYPTO":
                // For crypto, we often need a market (e.g., USD). Default to USD.
                url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol}&market=USD&apikey=${apiKey}`;
                break;
            case "FOREX":
                // Requires 'from_symbol' and 'to_symbol'. Assuming input like "EUR/USD" or "EUR" (default to USD)
                // Simple logic: if symbol contains '/', split it. Else assume vs USD.
                let from = symbol;
                let to = "USD";
                if (symbol.includes("/")) {
                    [from, to] = symbol.split("/");
                }
                url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${from}&to_symbol=${to}&apikey=${apiKey}`;
                break;
            case "STOCK":
            default:
                url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;
                break;
        }

        const avRes = await fetch(url);
        if (!avRes.ok) {
            throw new Error(`Alpha Vantage API error: ${avRes.statusText}`);
        }

        const data = await avRes.json();

        // Check for API errors or empty data
        if (data["Error Message"] || data["Note"]) {
            console.error("Alpha Vantage Data Error:", data);
            throw new Error(data["Error Message"] || "Limit reached or invalid symbol");
        }

        // Process data to get last 14 days
        // The keys depend on the function used.
        let timeSeries: any = {};
        if (type === "CRYPTO") {
            timeSeries = data["Time Series (Digital Currency Daily)"];
        } else if (type === "FOREX") {
            timeSeries = data["Time Series FX (Daily)"];
        } else {
            timeSeries = data["Time Series (Daily)"];
        }

        if (!timeSeries) {
            throw new Error("No market data found for this symbol");
        }

        // Get dates, sort desc, take top 14
        // Get dates, sort desc
        const allDates = Object.keys(timeSeries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

        // 1. Chart Data (Last 100 points, sorted ASCENDING for lightweight-charts)
        const chartData = allDates.slice(0, 100).sort((a, b) => new Date(a).getTime() - new Date(b).getTime()).map(date => {
            const d = timeSeries[date];
            const getVal = (k: string) => parseFloat(d[Object.keys(d).find(key => key.includes(k))!] || "0");
            return {
                time: date,
                open: getVal("open"),
                high: getVal("high"),
                low: getVal("low"),
                close: getVal("close"),
            };
        });

        // 2. AI Analysis Data (Last 14 points, DESCENDING)
        const aiDates = allDates.slice(0, 14);
        let formattedData = aiDates.map(date => {
            const d = timeSeries[date];
            const getVal = (k: string) => d[Object.keys(d).find(key => key.includes(k))!] || "0";
            return `- ${date}: Open=${getVal("open")}, High=${getVal("high")}, Low=${getVal("low")}, Close=${getVal("close")}, Vol=${getVal("volume")}`;
        }).join("\n");

        const analysis = await analyzeMarketDataWithGroq(symbol, formattedData);

        return NextResponse.json({ result: analysis, chartData });

    } catch (error: any) {
        console.error("Market Analysis Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to analyze market data" },
            { status: 500 }
        );
    }
}
