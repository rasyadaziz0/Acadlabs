export interface CoinGeckoData {
    symbol: string;
    price: number;
    marketCap: number;
    volume24h: number;
    change24h: number;
    history: {
        price: number[];
        timestamp: number[];
    };
}

export async function getCryptoData(symbol: string): Promise<CoinGeckoData | null> {
    try {
        // 1. Clean Symbol (Remove -USD, lowercase)
        const cleanSymbol = symbol.replace("-USD", "").toLowerCase().trim();

        // 2. Add Headers to avoid Cloudflare Blocking
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept": "application/json"
        };

        // 3. Search ID
        const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${cleanSymbol}`, { headers });
        const searchData = await searchRes.json();

        if (!searchData.coins || searchData.coins.length === 0) {
            console.warn(`CoinGecko: Symbol ${symbol} not found.`);
            return null;
        }

        // 4. Smart Matching: Loop logic to find EXACT symbol
        // Default to the first result if no exact match found
        let coinId = searchData.coins[0].id;

        // Find exact match (e.g. user input "PEPE" -> find symbol "PEPE", ignore "PEPE2.0")
        const exactMatch = searchData.coins.find((c: any) => c.symbol.toLowerCase() === cleanSymbol);

        if (exactMatch) {
            coinId = exactMatch.id;
        }

        // 5. Fetch Info (Price, Market Cap, Vol)
        const priceRes = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`,
            { headers }
        );
        const priceData = await priceRes.json();
        const info = priceData[coinId];

        if (!info) return null;

        // 6. Fetch History (14 Days)
        const historyRes = await fetch(
            `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=14&interval=daily`,
            { headers }
        );
        const historyData = await historyRes.json();

        const prices: number[] = [];
        const timestamps: number[] = [];

        if (historyData.prices) {
            historyData.prices.forEach((item: [number, number]) => {
                timestamps.push(item[0]);
                prices.push(item[1]);
            });
        }

        return {
            symbol: symbol.toUpperCase(),
            price: info.usd,
            marketCap: info.usd_market_cap,
            volume24h: info.usd_24h_vol,
            change24h: info.usd_24h_change,
            history: {
                price: prices,
                timestamp: timestamps
            }
        };

    } catch (error) {
        console.error("CoinGecko API Error:", error);
        return null;
    }
}
