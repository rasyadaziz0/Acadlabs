import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeUserText, sanitizeAIText, normalizeWhitespaceKeepEdges } from "@/lib/sanitize";
import { generateChatTitle } from "@/lib/title";
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
    const body = await request.json();
    const { messages, searchResults, chatId } = body as Record<string, unknown>;

    // 1. Supabase & User
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return request.cookies.get(name)?.value; },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || "Teman";

    // 2. Validate
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const groqKeys = getGroqKeys();
    if (groqKeys.length === 0) {
      return NextResponse.json({ error: "No API Keys" }, { status: 500 });
    }
    const apiKey = groqKeys[0];
    const groq = new Groq({ apiKey });

    const incoming: ChatMessage[] = (messages as unknown[]).filter(isChatMessage) as ChatMessage[];
    const hasUserMessage = incoming.some(m => m.role === "user" && m.content.trim().length > 0);
    if (!hasUserMessage) {
      return NextResponse.json({ error: "User message empty" }, { status: 400 });
    }

    // 3. Auto Title (Fire & Forget)
    if (chatId && typeof chatId === "string" && incoming.length === 1 && incoming[0].role === "user") {
      const first = incoming[0].content;
      (async () => {
        try {
          const t = await generateChatTitle(first);
          if (t) await supabase.from("chats").update({ title: t }).eq("id", chatId);
        } catch (e) {
          console.error("Auto title error", e);
        }
      })();
    }

    // 4. Formatter
    const formatted: ChatMessage[] = incoming.map((msg) => {
      if (msg.role === "user") return { role: "user", content: sanitizeUserText(msg.content) };
      return { role: msg.role, content: normalizeWhitespaceKeepEdges(msg.content) };
    });

    const systemPersona: ChatMessage = {
      role: "system",
      content: `You are AcadLabs, a smart academic companion for ${userName}.
Goal: Help with coding, math, sciences.
Tone: Friendly, concise, professional.
Language: Adaptive (Indonesian/English).`
    };

    const systemInstructions: ChatMessage = {
      role: "system",
      content: `Gunakan Markdown.
Math: $inline$ atau $$block$$.
Code: Pakai code fences.
Jawab to the point.`
    };

    const finalMessages = [systemPersona, systemInstructions, ...formatted];

    if (Array.isArray(searchResults) && searchResults.length > 0) {
      const sr = searchResults.map((r: any) => `- ${r.title} (${r.url}): ${r.description}`).join("\n");
      finalMessages.push({ role: "system", content: `Search Context:\n${sr}` });
    }

    // 5. Trim
    const trimmed = trimMessagesForBudget(
      finalMessages,
      Number(process.env.GROQ_MAX_INPUT_TOKENS) || 6000
    );

    // 6. Stream Call
    const stream = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      messages: trimmed as any,
      temperature: 0.7,
      max_tokens: Number(process.env.GROQ_MAX_TOKENS) || 4048,
      stream: true,
    });

    // 7. Readable Stream Response
    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullContent = "";

        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullContent += content;
              const sse = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
              controller.enqueue(encoder.encode(sse));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("Stream error", err);
          controller.error(err);
        } finally {
          controller.close();
          // 8. Save to DB
          if (chatId && typeof chatId === "string" && fullContent.trim()) {
            await supabase.from("messages").insert({
              role: "assistant",
              content: sanitizeAIText(fullContent),
              chat_id: chatId,
              user_id: user?.id
            });
          }
        }
      }
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });

  } catch (err: any) {
    console.error("API Panic:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}