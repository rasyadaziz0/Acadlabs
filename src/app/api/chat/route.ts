import { NextRequest, NextResponse } from "next/server";
import { sanitizeUserText, sanitizeAIText, normalizeWhitespaceKeepEdges } from "@/lib/sanitize";
import { generateChatTitle } from "@/lib/title";
import { ChatMessage, getGroqKeys } from "@/lib/ai-service";
import { trimMessagesForBudget } from "@/lib/token-utils";
import Groq from "groq-sdk";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zod Schemas
const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema),
  searchResults: z.array(z.any()).optional(),
  chatId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting
    const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
    const { success, limit, reset, remaining } = await rateLimit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        }
      );
    }

    const body = await request.json();

    // 2. Validation with Zod
    const validation = ChatRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request data", details: validation.error.format() }, { status: 400 });
    }

    const { messages, searchResults, chatId } = validation.data;

    // 3. Supabase & User
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;
    const userName = user.user_metadata?.full_name || user.user_metadata?.name || "Teman";

    const groqKeys = getGroqKeys();
    if (groqKeys.length === 0) {
      return NextResponse.json({ error: "No API Keys configured" }, { status: 500 });
    }
    const apiKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      console.error("Invalid Groq API key selected");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    const groq = new Groq({ apiKey });

    // Filter empty user messages
    const validMessages = messages.filter(m => m.content.trim().length > 0);
    const hasUserMessage = validMessages.some(m => m.role === "user");

    if (!hasUserMessage) {
      return NextResponse.json({ error: "User message empty" }, { status: 400 });
    }
    console.info("usage:chat", { userId, chatId: chatId ?? null, messageCount: validMessages.length });

    // 4. Auto Title (Ensure Completion)
    if (chatId && validMessages.length === 1 && validMessages[0].role === "user") {
      const first = validMessages[0].content;
      try {
        const t = await generateChatTitle(first);
        if (t) {
          await supabase.from("chats").update({ title: t }).eq("id", chatId);
        }
      } catch (e) {
        console.error("Auto title error", e);
      }
    }

    // 5. Formatter
    const formatted: ChatMessage[] = validMessages.map((msg) => {
      if (msg.role === "user") return { role: "user", content: sanitizeUserText(msg.content) };
      return { role: msg.role as "system" | "user" | "assistant", content: normalizeWhitespaceKeepEdges(msg.content) };
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
Jawab to the point.
Jika user bertanya yang tidak relevan dengan akademik, jawab sopan tapi arahkan kembali.`
    };

    const finalMessages = [systemPersona, systemInstructions, ...formatted];

    if (Array.isArray(searchResults) && searchResults.length > 0) {
      const sr = searchResults.map((r: any) => `- ${r.title} (${r.url}): ${r.description}`).join("\n");
      finalMessages.push({ role: "system", content: `Search Context:\n${sr}` });
    }

    // 6. Trim
    const trimmed = trimMessagesForBudget(
      finalMessages,
      Number(process.env.GROQ_MAX_INPUT_TOKENS) || 6000
    );

    // 7. Stream Call
    let stream;
    try {
      stream = await groq.chat.completions.create({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages: trimmed as any,
        temperature: 0.7,
        max_tokens: Number(process.env.GROQ_MAX_TOKENS) || 4048,
        stream: true,
      });
    } catch (e: any) {
      if (e.status === 429) {
        return NextResponse.json({ error: "Sistem sedang sibuk (Rate Limit). Coba beberapa saat lagi." }, { status: 429 });
      }
      throw e;
    }

    // 8. Readable Stream Response
    const assistantMessageId = randomUUID(); // Generate ID on server to sync with frontend
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
          // 9. Save to DB using the PRE-GENERATED ID
          if (userId && chatId && fullContent.trim()) {
            await supabase.from("messages").insert({
              id: assistantMessageId, // Use the same ID!
              role: "assistant",
              content: sanitizeAIText(fullContent),
              chat_id: chatId,
              user_id: userId
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
        "X-Accel-Buffering": "no",
        "X-Message-Id": assistantMessageId // Send ID to frontend
      }
    });

  } catch (err: any) {
    console.error("API Panic:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
