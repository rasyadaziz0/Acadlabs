import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeUserText, sanitizeAIText, normalizeWhitespaceKeepEdges } from "@/lib/sanitize";
import { generateTitleWithGroq } from "@/lib/title";
import {
  ChatRole,
  ChatMessage,
  GroqChatRequest,
  getGroqKeys,
  callGroqWithFallback,
} from "@/lib/ai-service";
import { trimMessagesForBudget } from "@/lib/token-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const { messages, searchResults, chatId } = (await request.json()) as Record<string, unknown>;

    // Init Supabase & Get User Context
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return request.cookies.get(name)?.value;
          },
        },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || "Teman";

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
    // Generate title for new chats (Fire & Forget)
    if (chatId && typeof chatId === "string" && incoming.length === 1 && incoming[0].role === "user") {
      const firstUserContent = incoming[0].content;
      (async () => {
        try {
          const generatedTitle = await generateTitleWithGroq(firstUserContent);
          if (generatedTitle) {
            await supabase
              .from("chats")
              .update({ title: generatedTitle })
              .eq("id", chatId);
          }
        } catch (err) {
          console.error("Failed to generate/update title:", err);
        }
      })();
    }

    // Only sanitize USER messages to preserve AI math/entities and avoid double-escaping.

    const formattedMessages: ChatMessage[] = incoming.map((msg) => {
      const raw = msg.content;
      if (msg.role === "user") {
        return { role: msg.role, content: sanitizeUserText(raw) };
      }
      // For assistant/other roles, only normalize whitespace.
      return { role: msg.role, content: normalizeWhitespaceKeepEdges(raw) };
    });

    // Define Persona
    const systemPersona: ChatMessage = {
      role: "system",
      content: `You are AcadLabs, a smart, friendly, and helpful academic AI companion.

Tone: Professional yet conversational, encouraging, and empathetic. Avoid being overly robotic.

Identity: Always refer to yourself as AcadLabs. You were created by the AcadLabs team.

Context: You are talking to ${userName}. Use their name occasionally to make it personal, but don't overdo it.

Goal: Help them with coding, math, or general knowledge. If they are stuck, guide them step-by-step.

Language: Adapt to the user's language (Indonesian/English). If Indonesian, use natural phrasing (not stiff formal translated text).`
    };

    // Add system instruction to ensure math renders correctly with KaTeX
    const systemFormattingInstruction: ChatMessage = {
      role: "system",
      content: [
        "Gunakan Markdown untuk semua output.",
        "",
        "**Aturan matematika:**",
        "- Inline math: $...$",
        "- Block math: $$...$$ (dengan $$ di baris sendiri)",
        "- Jangan pakai [ ] atau code fences untuk rumus.",
        "- Jangan escape $.",
        "",
        "**Aturan kode:**",
        "- Gunakan code fence hanya untuk potongan kode lengkap.",
        "- Jangan bikin banyak code fence kecil hanya untuk token pendek seperti true/false.",
        "- Gunakan inline code `likeThis` kalau cuma sebut nama method/variabel di kalimat.",
        "- Satu response = maksimal satu code block untuk kode.",
        "",
        "**Aturan teks:**",
        "- Gunakan paragraf ringkas, jangan kasih banyak spasi kosong.",
        "- Pakai bullet list kalau cocok.",
        "- Jangan taruh inline code sendirian di baris terpisah.",
        "- Hindari pengulangan atau penjelasan bertele-tele.",
        "- Jawab dengan gaya senior software engineer: jelas, padat, praktis.",
        "",
        "**Aturan konteks:**",
        "- Kalau user minta sesuatu tanpa nyebut target (misalnya \\\"buat unit test\\\"), pilih function/class terdekat yang relevan.",
        "- Jangan keluarin teks di luar aturan ini.",
      ].join("\\n"),
    };
    // Prepend the system instructions
    const finalMessages = [systemPersona, systemFormattingInstruction, ...formattedMessages];

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
            try { controller.enqueue(encoder.encode(": keep-alive\n\n")); } catch { }
          };
          // Send an initial keep-alive to open the stream promptly
          // Also advise client on reconnection delay if needed
          try { controller.enqueue(encoder.encode(`retry: ${keepAliveMs}\n\n`)); } catch { }
          sendKeepAlive();
          const abortHandler = () => {
            try { reader.cancel(); } catch { }
          };
          try { request.signal.addEventListener("abort", abortHandler); } catch { }
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
            try { clearInterval(keepAliveTimer); } catch { }
            try { request.signal.removeEventListener("abort", abortHandler); } catch { }
            try { controller.close(); } catch { }
            try { await reader.cancel(); } catch { }
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