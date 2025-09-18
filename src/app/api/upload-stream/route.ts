import { NextRequest, NextResponse } from "next/server";
import { extractTextFromFile } from "@/lib/file-processing";
import { sanitizeAIText } from "@/lib/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function getGroqKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
  if (process.env.GROQ_API_KEY_1) keys.push(process.env.GROQ_API_KEY_1);
  if (process.env.GROQ_API_KEY_2) keys.push(process.env.GROQ_API_KEY_2);
  return Array.from(new Set(keys.filter(Boolean)));
}

async function callGroqWithFallback(body: any): Promise<Response> {
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

export async function POST(req: NextRequest) {
  try {
    // Validate GROQ API key exists (any supported env)
    if (getGroqKeys().length === 0) {
      return NextResponse.json(
        { error: "Mohon Maaf, Server sedang down" },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = (form.get("file") || form.get("image")) as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Kirim field 'file' atau 'image'" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Ukuran file maksimal 10MB" },
        { status: 413 }
      );
    }

    // Extract plain text from supported document types
    const text = await extractTextFromFile(file);
    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Tidak ada teks yang dapat diekstrak dari dokumen" },
        { status: 400 }
      );
    }

    // System instruction (math-friendly, consistent with /api/chat)
    const systemFormattingInstruction = {
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
    } as const;

    const messages = [
      systemFormattingInstruction,
      { role: "user", content: text },
    ];

    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b"; // default Groq model

    // Stream from Groq and proxy SSE directly
    const response = await callGroqWithFallback({
      model,
      messages,
      temperature: 0.5,
      stream: true,
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const j = JSON.parse(errorText);
        return NextResponse.json(
          { error: j?.error?.message || j?.message || "API error" },
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
                  continue;
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
            }
          }
        } catch {
        } finally {
          try { controller.close(); } catch {}
          try { await reader.cancel(); } catch {}
        }
      },
    });

    return new Response(stream, { status: 200, headers });
  } catch (error: any) {
    console.error("Upload-stream API error:", error);
    const errorMessage = error?.message || "Failed to process upload";
    return NextResponse.json(
      { error: { message: errorMessage, details: error } },
      { status: 500 }
    );
  }
}
