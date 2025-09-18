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

const HARD_TRUNCATE_SUFFIX = "\n...[truncated]";
const SERVER_MAX_OUTPUT_CHARS = 220_000;

function getGroqKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
  if (process.env.GROQ_API_KEY_1) keys.push(process.env.GROQ_API_KEY_1);
  if (process.env.GROQ_API_KEY_2) keys.push(process.env.GROQ_API_KEY_2);
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
      if (i < keys.length - 1) {
        continue;
      }
      return new Response(JSON.stringify({ error: "Upstream network error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (res.ok) return res;

    lastResponse = res;
    if (i < keys.length - 1 && [401, 402, 403, 429].includes(res.status)) {
      continue; // try next key
    } else {
      break; // return this failure
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
    const contentType = request.headers.get("content-type") || "";
    const accept = request.headers.get("accept") || "";
    const wantsSSE = /text\/event-stream/i.test(accept);

    let bodyJson: any = {};
    try {
      bodyJson = await request.json();
    } catch {
      bodyJson = {};
    }

    const queryRaw: unknown = bodyJson?.query;
    const streamFlag: unknown = bodyJson?.stream;
    const messagesRaw: unknown = bodyJson?.messages;
    const stream = typeof streamFlag === "boolean" ? streamFlag : wantsSSE;

    if (getGroqKeys().length === 0) {
      return NextResponse.json({ error: "Mohon Maaf, Server sedang down" }, { status: 500 });
    }

    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const MAX_OUTPUT_TOKENS = Number(process.env.GROQ_MAX_TOKENS) || 4048;

    // If non-streaming requested with a simple query
    if (!stream && typeof queryRaw === "string" && queryRaw.trim().length > 0) {
      const userContent = sanitizeUserText(queryRaw);
      const systemInstruction: ChatMessage = {
        role: "system",
        content: [
          "Kamu adalah asisten matematika. Jawab dengan langkah-langkah jelas dalam Bahasa Indonesia.",
          "Gunakan Markdown.",
          "Untuk matematika, SELALU gunakan delimiter LaTeX:",
          "- Inline: $...$",
          "- Display: $$...$$ (letakkan $$ di baris terpisah).",
          "Jangan bungkus rumus dengan tanda kurung [] atau code fences.",
          "Berikan jawaban akhir yang jelas di bagian akhir.",
        ].join("\n"),
      };
      const messages: ChatMessage[] = [systemInstruction, { role: "user", content: userContent }];

      const upstream = await callGroqWithFallback(
        {
          model,
          messages,
          temperature: 0.3,
          stream: false,
          max_tokens: MAX_OUTPUT_TOKENS,
        },
        request.signal
      );

      if (!upstream.ok) {
        const errorText = await upstream.text();
        try {
          const json = JSON.parse(errorText);
          return NextResponse.json(
            { error: json?.error?.message || json?.message || "API error" },
            { status: upstream.status }
          );
        } catch {
          return NextResponse.json(
            { error: errorText || "API error" },
            { status: upstream.status }
          );
        }
      }

      const json = await upstream.json();
      const choice = json?.choices?.[0] || {};
      const rawContent: string = (choice.message?.content as string) || (choice.text as string) || "";
      let answer = sanitizeAIText(String(rawContent || ""));
      if (answer.length > SERVER_MAX_OUTPUT_CHARS) {
        answer = answer.slice(0, SERVER_MAX_OUTPUT_CHARS) + HARD_TRUNCATE_SUFFIX;
      }
      return NextResponse.json({ answer });
    }

    // Else: streaming branch (for other pages) — requires messages[]
    const messagesArr: ChatMessage[] = Array.isArray(messagesRaw)
      ? (messagesRaw as unknown[]).filter(isChatMessage) as ChatMessage[]
      : [];
    if (messagesArr.length === 0) {
      return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
    }

    // Sanitize only user messages, normalize others
    const formattedMessages: ChatMessage[] = messagesArr.map((msg) => {
      const raw = msg.content;
      if (msg.role === "user") {
        return { role: msg.role, content: sanitizeUserText(raw) };
      }
      return { role: msg.role, content: normalizeWhitespaceKeepEdges(raw) };
    });

    const response = await callGroqWithFallback(
      {
        model,
        messages: formattedMessages,
        temperature: 0.3,
        stream: true,
        max_tokens: MAX_OUTPUT_TOKENS,
      },
      request.signal
    );

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const json = JSON.parse(errorText);
        return NextResponse.json(
          { error: json?.error?.message || json?.message || "API error" },
          { status: response.status }
        );
      } catch {
        return NextResponse.json(
          { error: errorText || "API error" },
          { status: response.status }
        );
      }
    }

    const headers = new Headers({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const upstream = response.body;
    if (!upstream) {
      return NextResponse.json({ error: "Upstream stream missing" }, { status: 502 });
    }

    const streamResp = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const reader = upstream.getReader();
        let buffer = "";
        const keepAliveMs = Number(process.env.SSE_KEEPALIVE_MS) || 15000;
        const sendKeepAlive = () => {
          try { controller.enqueue(encoder.encode(": keep-alive\n\n")); } catch {}
        };
        try { controller.enqueue(encoder.encode(`retry: ${keepAliveMs}\n\n`)); } catch {}
        sendKeepAlive();
        const abortHandler = () => { try { reader.cancel(); } catch {} };
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
                } catch {
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }
              }
              if (sawDone) break;
            }
            if (sawDone) break;
          }
        } catch {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'stream_error' })}\n\n`)); } catch {}
        } finally {
          try { clearInterval(keepAliveTimer); } catch {}
          try { request.signal.removeEventListener("abort", abortHandler); } catch {}
          try { controller.close(); } catch {}
          try { await reader.cancel(); } catch {}
        }
      },
    });

    return new Response(streamResp, { status: 200, headers });
  } catch (error: unknown) {
    console.error("Math API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process math request";
    return NextResponse.json(
      { error: { message: errorMessage } },
      { status: 500 }
    );
  }
}
