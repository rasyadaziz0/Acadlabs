import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";

// Generic interface for our rate limiter
type RateLimitContext = {
    ip: string;
};

type RateLimitResult = {
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
};

// In-memory fallback if Redis/KV is not configured
const cache = new Map<string, { count: number; reset: number }>();

export async function rateLimit(identifier: string): Promise<RateLimitResult> {
    // If we have KV/Redis credentials, use Upstash
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        const ratelimit = new Ratelimit({
            redis: kv,
            limiter: Ratelimit.slidingWindow(10, "60 s"), // 10 requests per minute
            analytics: true,
            prefix: "@upstash/ratelimit",
        });

        const { success, limit, remaining, reset } = await ratelimit.limit(identifier);
        return { success, limit, remaining, reset };
    }

    // Fallback: In-Memory Fixed Window
    const limit = 10;
    const window = 60 * 1000;
    const now = Date.now();
    const key = identifier;

    let record = cache.get(key);

    if (!record || now > record.reset) {
        record = { count: 0, reset: now + window };
        cache.set(key, record);
    }

    record.count += 1;

    const success = record.count <= limit;
    const remaining = Math.max(0, limit - record.count);

    return {
        success,
        limit,
        remaining,
        reset: record.reset,
    };
}
