import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeUserText, sanitizeAIText, normalizeWhitespaceKeepEdges } from "@/lib/sanitize";
import { generateTitleWithGroq } from "@/lib/title";
import {
  ChatRole,
  ChatMessage,
  GroqChatRequest,
  getGroqKeys,
} from "@/lib/ai-service";
import { trimMessagesForBudget } from "@/lib/token-utils";
import Groq from "groq-sdk";

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

    const groqKeys = getGroqKeys();
    if (groqKeys.length === 0) {
      return NextResponse.json(
        { error: "Mohon Maaf, Server sedang down" },
        { status: 500 }
      );
    }
    const apiKey = groqKeys[0]; // Simple selection strategy
    const groq = new Groq({ apiKey });

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
        "- Kalau user minta sesuatu tanpa nyebut target (misalnya \"buat unit test\"), pilih function/class terdekat yang relevan.",
        "- Jangan keluarin teks di luar aturan ini.",
      ].join("\n"),
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

    // Trim messages to stay under approximate token budget to reduce TPM pressure
    const MAX_INPUT_TOKENS = Number(process.env.GROQ_MAX_INPUT_TOKENS) || 6000;
    const trimmedMessages = trimMessagesForBudget(finalMessages, MAX_INPUT_TOKENS);

    // Call Groq API with Streaming
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const MAX_OUTPUT_TOKENS = Number(process.env.GROQ_MAX_TOKENS) || 4048;

    const completion = await groq.chat.completions.create({
      model: model,
      messages: trimmedMessages as any, // sdk types slight mismatch fallback
      temperature: 0.7,
      stream: true, // Force streaming
      max_tokens: MAX_OUTPUT_TOKENS,
    });

    // Create a readable stream that proxies Groq chunks and saves history at the end
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullContent = "";

        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullContent += content;
              // Format SSE: data: {"choices":[{"delta":{"content":"..."}}]}
              const ssePayload = `data: ${JSON.stringify({
                choices: [{ delta: { content } }]
              })}\n\n`;
              controller.enqueue(encoder.encode(ssePayload));
            }
          }
          // Signal done to client
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("Stream error:", err);
          controller.error(err);
        } finally {
          controller.close();

          // Save history to Supabase ONLY after streaming is done
          if (chatId && typeof chatId === "string" && fullContent.trim()) {
            const sanitizedContent = sanitizeAIText(fullContent);
            if (sanitizedContent) {
              const { error } = await supabase.from("messages").insert({
                role: "assistant",
                content: sanitizedContent,
                chat_id: chatId,
                user_id: user?.id,
              });
              if (error) {
                console.error("Failed to save assistant message:", error);
              }
            }
          }
        }
      },
    });

    const headers = new Headers({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    return new Response(stream, { headers });

  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json(
      { error: { message: errorMessage } },
      { status: 500 }
    );
  }
}