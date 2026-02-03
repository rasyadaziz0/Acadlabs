import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeUserText, sanitizeAIText, normalizeWhitespaceKeepEdges } from "@/lib/sanitize";
import { generateTitleWithGroq } from "@/lib/title";
import {
  ChatMessage,
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

    // 1. Init Supabase & Get User
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

    // 2. Validate Request
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
    }

    const groqKeys = getGroqKeys();
    if (groqKeys.length === 0) {
      return NextResponse.json({ error: "Server AI sedang down (No API Key)" }, { status: 500 });
    }

    // Pick first key for simplicity
    const apiKey = groqKeys[0];
    const groq = new Groq({ apiKey });

    // Filter valid messages
    const incoming: ChatMessage[] = (messages as unknown[]).filter(isChatMessage) as ChatMessage[];

    // Ensure at least one user message
    const hasUserMessage = incoming.some((m) => m.role === "user" && m.content.trim().length > 0);
    if (!hasUserMessage) {
      return NextResponse.json({ error: "Pesan user kosong" }, { status: 400 });
    }

    // 3. Auto Title Generation (Fire & Forget)
    // Only for new chats (length 1 user msg)
    if (chatId && typeof chatId === "string" && incoming.length === 1 && incoming[0].role === "user") {
      const firstUserContent = incoming[0].content;
      (async () => {
        try {
          // Call dedicated title generation function (using Llama 3 8B)
          const generatedTitle = await generateTitleWithGroq(firstUserContent);
          if (generatedTitle) {
            await supabase
              .from("chats")
              .update({ title: generatedTitle })
              .eq("id", chatId);
          }
        } catch (err) {
          console.error("Auto-title error:", err);
        }
      })();
    }

    // 4. Sanitize Messages
    const formattedMessages: ChatMessage[] = incoming.map((msg) => {
      const raw = msg.content;
      if (msg.role === "user") {
        return { role: msg.role, content: sanitizeUserText(raw) };
      }
      return { role: msg.role, content: normalizeWhitespaceKeepEdges(raw) };
    });

    // 5. System Prompts & Context
    const systemPersona: ChatMessage = {
      role: "system",
      content: `You are AcadLabs, a smart, friendly, and helpful academic AI companion.
Tone: Professional yet conversational, encouraging.
Identity: AcadLabs (created by AcadLabs team).
Context: User is ${userName}.
Goal: Help with coding, math, general knowledge.
Language: Adapt to user (Indonesian/English).`
    };

    const systemFormattingInstruction: ChatMessage = {
      role: "system",
      content: `Gunakan Markdown.
Aturan Matematika:
- Inline: $...$
- Block: $$...$$
- Jangan escape $.
Aturan Kode:
- Gunakan code fence untuk blok kode.
`
    };

    const finalMessages = [systemPersona, systemFormattingInstruction, ...formattedMessages];

    // Search Results Injection
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      const items = searchResults.map((r: any, i: number) =>
        `${i + 1}. ${r.title}\n${r.url}\n${r.description}\n`
      ).join("\n");

      finalMessages.push({
        role: "system",
        content: `Search Results:\n${items}\nUse this info to answer.`
      });
    }

    // 6. Token Budgeting
    const MAX_INPUT_TOKENS = Number(process.env.GROQ_MAX_INPUT_TOKENS) || 6000;
    const trimmedMessages = trimMessagesForBudget(finalMessages, MAX_INPUT_TOKENS);
    const MAX_OUTPUT_TOKENS = Number(process.env.GROQ_MAX_TOKENS) || 4048;
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    // 7. Call Groq with Streaming
    const completion = await groq.chat.completions.create({
      model: model,
      messages: trimmedMessages as any,
      temperature: 0.7,
      stream: true, // IMPORTANT: Stream enabled
      max_tokens: MAX_OUTPUT_TOKENS,
    });

    // 8. Create ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullContent = "";

        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullContent += content;
              // Send SSE data
              const ssePayload = `data: ${JSON.stringify({
                choices: [{ delta: { content } }]
              })}\n\n`;
              controller.enqueue(encoder.encode(ssePayload));
            }
          }
          // Stream Done
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("Stream processing error:", err);
          controller.error(err);
        } finally {
          controller.close();

          // 9. Save History to Database (After stream)
          if (chatId && typeof chatId === "string" && fullContent.trim()) {
            const sanitizedContent = sanitizeAIText(fullContent);
            if (sanitizedContent) {
              await supabase.from("messages").insert({
                role: "assistant",
                content: sanitizedContent,
                chat_id: chatId,
                user_id: user?.id,
              });
            }
          }
        }
      }
    });

    // 10. Return Stream Response
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      }
    });

  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: { message: error.message || "Internal Error" } }, { status: 500 });
  }
}