import { NextRequest, NextResponse } from "next/server";
import { sanitizeUserText, sanitizeAIText, normalizeWhitespaceKeepEdges } from "@/lib/sanitize";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";
import { hasPersistentRateLimitBackend, rateLimit } from "@/lib/rate-limit";
import {
  ChatMessage,
  getGroqKeys,
  callGroqWithFallback,
} from "@/lib/ai-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";



const HARD_TRUNCATE_SUFFIX = "\n...[truncated]";
const SERVER_MAX_OUTPUT_CHARS = 220_000;



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

function sanitizeSseDataPayload(data: string): string {
  if (data === "[DONE]") return data;
  try {
    const obj = JSON.parse(data);
    const choice = obj?.choices?.[0];
    if (choice?.delta && typeof choice.delta.content === "string") {
      choice.delta.content = sanitizeAIText(choice.delta.content);
    }
    if (typeof choice?.text === "string") {
      choice.text = sanitizeAIText(choice.text);
    }
    return JSON.stringify(obj);
  } catch {
    return data;
  }
}

function parseAndSanitizeSseEvent(rawEventBlock: string): string {
  const dataLines = rawEventBlock
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) return "";
  const payload = dataLines.join("\n").trim();
  if (!payload) return "";

  const sanitizedPayload = sanitizeSseDataPayload(payload);
  return `data: ${sanitizedPayload}\n\n`;
}

export async function POST(request: NextRequest) {
  try {
    const accept = request.headers.get("accept") || "";
    const wantsSSE = /text\/event-stream/i.test(accept);

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPersistentRateLimitBackend()) {
      return NextResponse.json({ error: "Rate limiter backend belum dikonfigurasi" }, { status: 503 });
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const { success } = await rateLimit(`math:${user.id}:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Terlalu banyak request. Coba lagi beberapa saat." },
        { status: 429 }
      );
    }

    let bodyJson: Record<string, unknown> = {};
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
    console.info("usage:math", { userId: user.id, stream });

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
        console.error("Math upstream error (non-stream)", { status: upstream.status, body: errorText });
        return NextResponse.json({ error: "AI service unavailable" }, { status: upstream.status });
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
      console.error("Math upstream error (stream)", { status: response.status, body: errorText });
      return NextResponse.json({ error: "AI service unavailable" }, { status: response.status });
    }

    const headers = new Headers({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const upstream = response.body;
    if (!upstream) {
      return NextResponse.json({ error: "Upstream stream missing" }, { status: 502 });
    }

    let sseBuffer = "";
    const streamResp = upstream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(
        new TransformStream<string, string>({
          transform(chunk, controller) {
            sseBuffer += chunk.replace(/\r\n/g, "\n");

            let idx = sseBuffer.indexOf("\n\n");
            while (idx !== -1) {
              const rawEventBlock = sseBuffer.slice(0, idx);
              sseBuffer = sseBuffer.slice(idx + 2);

              const parsed = parseAndSanitizeSseEvent(rawEventBlock);
              if (parsed) controller.enqueue(parsed);

              idx = sseBuffer.indexOf("\n\n");
            }
          },
          flush(controller) {
            const remainder = sseBuffer.trim();
            if (!remainder) return;
            const parsed = parseAndSanitizeSseEvent(remainder);
            if (parsed) controller.enqueue(parsed);
          },
        })
      )
      .pipeThrough(new TextEncoderStream());

    return new Response(streamResp, { status: 200, headers });
  } catch (error: unknown) {
    console.error("Math API error:", error);
    return NextResponse.json(
      { error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
