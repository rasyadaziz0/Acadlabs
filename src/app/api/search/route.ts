import { NextRequest, NextResponse } from "next/server";
import { sanitizeSearchQuery, sanitizeUserText } from "@/lib/sanitize";

export async function POST(request: NextRequest) {
  try {
    const { query, isMathQuery } = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter is required" },
        { status: 400 }
      );
    }

    const cleanQuery = sanitizeSearchQuery(String(query));
    if (!cleanQuery) {
      return NextResponse.json(
        { error: "Query parameter is invalid" },
        { status: 400 }
      );
    }

    const braveApiKey = process.env.BRAVE_API_KEY;
    if (!braveApiKey) {
      throw new Error("API key is not configured");
    }

    // Jika ini adalah query matematika, tambahkan parameter untuk pencarian matematika
    const searchUrl = isMathQuery
      ? `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
          cleanQuery + " math solution step by step"
        )}&count=5`
      : `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
          cleanQuery
        )}&count=5`;

    const response = await fetch(
      searchUrl,
      {
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": braveApiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${error}`);
    }

    const data = await response.json();
    
    // Format the results
    const results = data.web?.results?.map((result: any) => ({
      title: sanitizeUserText(result.title || ""),
      url: typeof result.url === "string" && /^https?:\/\//i.test(result.url) ? result.url : "",
      description: sanitizeUserText(result.description || ""),
    })) || [];

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process search request" },
      { status: 500 }
    );
  }
}