export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
    role: ChatRole;
    content: string;
};

export type GroqChatRequest = {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    stream?: boolean;
    max_tokens?: number;
};

export function getGroqKeys(): string[] {
    const keys: string[] = [];
    if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
    if (process.env.GROQ_API_KEY_1) keys.push(process.env.GROQ_API_KEY_1);
    if (process.env.GROQ_API_KEY_2) keys.push(process.env.GROQ_API_KEY_2);
    return Array.from(new Set(keys.filter(Boolean)));
}

export async function callGroqWithFallback(
    body: GroqChatRequest,
    signal?: AbortSignal
): Promise<Response> {
    const keys = getGroqKeys();
    const url = "https://api.groq.com/openai/v1/chat/completions";
    let lastResponse: Response | null = null;

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        let res: Response | null = null;
        try {
            res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${key}`,
                },
                body: JSON.stringify(body),
                signal,
            });
        } catch (e) {
            if (i < keys.length - 1) continue;
            return new Response(JSON.stringify({ error: "Upstream network error" }), {
                status: 502,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (res.ok) return res;
        lastResponse = res;
        if (i < keys.length - 1 && [401, 402, 403, 429].includes(res.status)) {
            continue;
        } else {
            break;
        }
    }

    return (
        lastResponse ||
        new Response(JSON.stringify({ error: "No GROQ API key configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        })
    );
}
