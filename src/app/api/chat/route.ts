import { NextRequest, NextResponse } from "next/server";
import { sanitizeUserText, sanitizeAIText, normalizeWhitespaceKeepEdges } from "@/lib/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type GroqChatRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  max_tokens?: number;
};

// Approximate token counting and context trimming to avoid exceeding TPM/quotas
function approxTokens(s: string): number {
  const str = typeof s === "string" ? s : String(s ?? "");
  return Math.ceil(str.length / 4); // rough heuristic
}

function trimMessagesForBudget(
  messages: ChatMessage[],
  maxInputTokens: number
): ChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const first = messages[0];
  const hasSystem = first && first.role === "system";
  const systemMsg = hasSystem ? first : null;
  const rest = hasSystem ? messages.slice(1) : messages.slice();

  let used = systemMsg ? approxTokens(String(systemMsg.content || "")) : 0;
  const picked: ChatMessage[] = [];

  for (let i = rest.length - 1; i >= 0; i--) {
    const m = rest[i];
    const c = String(m?.content ?? "");
    const t = approxTokens(c);
    if (used + t <= maxInputTokens || picked.length === 0) {
      // Always include at least the most recent message
      picked.push({ role: m.role, content: c });
      used += t;
    } else {
      break;
    }
  }
  picked.reverse();

  const result: ChatMessage[] = systemMsg
    ? [{ role: systemMsg.role, content: String(systemMsg.content || "") }, ...picked]
    : picked;

  // If we still exceed the budget, truncate the last (most recent) message tail
  const totalTokens = result.reduce((sum, m) => sum + approxTokens(String(m.content || "")), 0);
  if (totalTokens > maxInputTokens && result.length > 0) {
    const lastIdx = result.length - 1;
    const last = result[lastIdx];
    const over = totalTokens - maxInputTokens;
    const content = String(last.content || "");
    const keepChars = Math.max(0, content.length - over * 4);
    result[lastIdx] = { ...last, content: content.slice(-keepChars) };
  }

  return result;
}

function getGroqKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
  if (process.env.GROQ_API_KEY_1) keys.push(process.env.GROQ_API_KEY_1);
  if (process.env.GROQ_API_KEY_2) keys.push(process.env.GROQ_API_KEY_2);
  // De-duplicate and filter empties
  return Array.from(new Set(keys.filter(Boolean)));
}

async function callGroqWithFallback(body: GroqChatRequest, signal?: AbortSignal): Promise<Response> {
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
      // Network error; try next key if available
      if (i < keys.length - 1) {
        continue;
      }
      // No more keys; synthesize a 502 response
      return new Response(JSON.stringify({ error: "Upstream network error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (res.ok) return res;

    lastResponse = res;
    // Only fallback on auth/quota/rate-limit type failures
    if (i < keys.length - 1 && [401, 402, 403, 429].includes(res.status)) {
      continue; // try next key
    } else {
      break; // return this failure
    }
  }

  // If no keys or all failed, return the last failure (or a synthetic 500)
  return (
    lastResponse ||
    new Response(JSON.stringify({ error: "No GROQ API key configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function isChatMessage(val: unknown): val is ChatMessage {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  const role = obj.role;
  const content = obj.content;
  return (
    (role === "system" || role === "user" || role === "assistant") &&
    typeof content === "string"
  );
}

export async function POST(request: NextRequest) {
  try {
    const { messages, searchResults } = (await request.json()) as Record<string, unknown>;

    // Validate request
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid request format" },
        { status: 400 }
      );
    }

    if (getGroqKeys().length === 0) {
      return NextResponse.json(
        { error: "Mohon Maaf, Server sedang down" },
        { status: 500 }
      );
    }

    // Filter and ensure valid messages
    const incoming: ChatMessage[] = (messages as unknown[]).filter(isChatMessage) as ChatMessage[];

    // Ensure there is at least one user message
    const hasUserMessage = incoming.some(
      (m) => m.role === "user" && m.content.trim().length > 0
    );
    if (!hasUserMessage) {
      return NextResponse.json(
        { error: "No user message provided" },
        { status: 400 }
      );
    }

    // Format and sanitize messages for Groq API
    // Only sanitize USER messages to preserve AI math/entities and avoid double-escaping.
    const formattedMessages: ChatMessage[] = incoming.map((msg) => {
      const raw = msg.content;
      if (msg.role === "user") {
        return { role: msg.role, content: sanitizeUserText(raw) };
      }
      // For assistant/other roles, only normalize whitespace.
      return { role: msg.role, content: normalizeWhitespaceKeepEdges(raw) };
    });

    // Add system instruction to ensure math renders correctly with KaTeX
    const systemFormattingInstruction: ChatMessage = {
      role: "system",
      content: [
        "Use Markdown.",
        "For mathematics, ALWAYS use LaTeX delimiters:",
        "- Inline math: $...$",
        "- Display/block math: $$...$$ (place $$ on its own lines).",
        "Do NOT wrap equations in square brackets [] or code fences.",
        "Do NOT escape the dollar signs unnecessarily.",
        "If you include code, use code fences only for programming code, not math.",
      ].join("\n"),
    };

    // Prepend the system instruction
    const finalMessages = [systemFormattingInstruction, ...formattedMessages];

    // Add search results context if available
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      const items = (searchResults as unknown[]).map((r) => {
        const o = r as Record<string, unknown>;
        const title = typeof o.title === "string" ? o.title : "";
        const url = typeof o.url === "string" ? o.url : "";
        const description = typeof o.description === "string" ? o.description : "";
        return { title, url, description };
      });
      const searchContextRaw = `Here are some search results that might be relevant to the user's query:\n\n${items
        .map((result, index) => `${index + 1}. ${result.title}\n${result.url}\n${result.description}\n`)
        .join("\n")}\n\nPlease use this information to provide a more accurate response.`;
      const SEARCH_CONTEXT_MAX_CHARS = Number(process.env.SEARCH_CONTEXT_MAX_CHARS) || 2000;
      const searchContext = sanitizeUserText(searchContextRaw).slice(0, SEARCH_CONTEXT_MAX_CHARS);

      finalMessages.push({
        role: "system",
        content: searchContext,
      });
    }

    // Decide response mode by Accept header
    const accept = request.headers.get("accept") || "";
    const wantsSSE = /text\/event-stream/i.test(accept);

    // Trim messages to stay under approximate token budget to reduce TPM pressure
    const MAX_INPUT_TOKENS = Number(process.env.GROQ_MAX_INPUT_TOKENS) || 6000;
    const trimmedMessages = trimMessagesForBudget(finalMessages, MAX_INPUT_TOKENS);

    // Call Groq API
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b"; // default Groq model
    const MAX_OUTPUT_TOKENS = Number(process.env.GROQ_MAX_TOKENS) || 4048;
    const response = await callGroqWithFallback({
      model,
      messages: trimmedMessages,
      temperature: 0.7,
      stream: wantsSSE,
      max_tokens: MAX_OUTPUT_TOKENS,
    }, request.signal);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API non-OK:", errorText);
      try {
        const json = JSON.parse(errorText);
        return NextResponse.json(
          { error: json.error?.message || json.message || "API error" },
          { status: response.status }
        );
      } catch {
        return NextResponse.json(
          { error: errorText || "API error" },
          { status: response.status }
        );
      }
    }

    if (wantsSSE) {
      // Sanitize and proxy the SSE stream to the client
      const headers = new Headers({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const upstream = response.body;
      if (!upstream) {
        return NextResponse.json(
          { error: "Upstream stream missing" },
          { status: 502 }
        );
      }

      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const reader = upstream.getReader();
          let buffer = "";
          // Periodic SSE keep-alive comments to prevent idle timeouts on proxies/browsers
          const keepAliveMs = Number(process.env.SSE_KEEPALIVE_MS) || 15000;
          const sendKeepAlive = () => {
            try { controller.enqueue(encoder.encode(": keep-alive\n\n")); } catch {}
          };
          // Send an initial keep-alive to open the stream promptly
          // Also advise client on reconnection delay if needed
          try { controller.enqueue(encoder.encode(`retry: ${keepAliveMs}\n\n`)); } catch {}
          sendKeepAlive();
          const abortHandler = () => {
            try { reader.cancel(); } catch {}
          };
          try { request.signal.addEventListener("abort", abortHandler); } catch {}
          let keepAliveTimer: ReturnType<typeof setInterval> = setInterval(sendKeepAlive, keepAliveMs);
          let sawDone = false;
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) buffer += decoder.decode(value, { stream: true });

              let idx: number;
              while ((idx = buffer.indexOf("\n\n")) !== -1) {
                const rawEvent = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);

                const lines = rawEvent.split("\n");
                for (const line of lines) {
                  if (!line.startsWith("data:")) continue;
                  const data = line.slice(5).trim();
                  if (!data) continue;
                  if (data === "[DONE]") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    sawDone = true;
                    break;
                  }
                  try {
                    const obj = JSON.parse(data);
                    const choice = obj?.choices?.[0];
                    if (choice && choice.delta && typeof choice.delta.content === "string") {
                      choice.delta.content = sanitizeAIText(choice.delta.content);
                    }
                    if (choice && typeof choice.text === "string") {
                      choice.text = sanitizeAIText(choice.text);
                    }
                    const out = `data: ${JSON.stringify(obj)}\n\n`;
                    controller.enqueue(encoder.encode(out));
                  } catch (e) {
                    // Forward raw data line if not JSON (keep-alive/comments)
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                  }
                }
                if (sawDone) break;
              }
              if (sawDone) break;
            }
          } catch (e) {
            // On error, terminate stream
          } finally {
            try { clearInterval(keepAliveTimer); } catch {}
            try { request.signal.removeEventListener("abort", abortHandler); } catch {}
            try { controller.close(); } catch {}
            try { await reader.cancel(); } catch {}
          }
        },
      });

  return new Response(stream, { status: 200, headers });
}

// Non-streaming: return sanitized JSON
const json = await response.json();
const choice = json?.choices?.[0] || {};
const rawContent: string = (choice.message?.content as string) || (choice.text as string) || "";
const content = sanitizeAIText(rawContent);
return NextResponse.json({ content });
} catch (error: unknown) {
  console.error("Chat API error:", error);
  const errorMessage = error instanceof Error ? error.message : "Failed to process request";
  return NextResponse.json(
    { error: { message: errorMessage } },
    { status: 500 }
  );
}
}