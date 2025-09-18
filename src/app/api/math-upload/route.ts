import { NextRequest, NextResponse } from "next/server";
import { extractTextFromFile } from "@/lib/file-processing";
import { sanitizeAIText } from "@/lib/sanitize";

// Rough token estimator to budget input/output and avoid runaway memory usage
function approxTokens(s: string): number {
  const str = typeof s === "string" ? s : String(s ?? "");
  return Math.ceil(str.length / 4);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg"]);
const ALLOWED_EXTS = new Set(["pdf", "png", "jpg", "jpeg"]);

function getGroqKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
  if (process.env.GROQ_API_KEY_1) keys.push(process.env.GROQ_API_KEY_1);
  if (process.env.GROQ_API_KEY_2) keys.push(process.env.GROQ_API_KEY_2);
  return Array.from(new Set(keys.filter(Boolean)));
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type GroqChatRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  max_tokens?: number;
};

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

function extOf(name: string | undefined | null): string {
  if (!name) return "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export async function POST(req: NextRequest) {
  try {
    if (getGroqKeys().length === 0) {
      return NextResponse.json(
        { error: "Mohon Maaf, Server sedang down" },
        { status: 500 }
      );
    }

    // Parse multipart form using Web API
    const form = await req.formData();
    const file = (form.get("file") || form.get("image")) as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided. Kirim field 'file'" }, { status: 400 });
    }
    // Size check (10MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "Ukuran file maksimal 10MB" }, { status: 413 });
    }
    // Type allowlist check
    const filename = file.name || "upload";
    const mime = file.type || "application/octet-stream";
    const ext = extOf(filename);
    const typeAllowed = ALLOWED_MIMES.has(mime) || ALLOWED_EXTS.has(ext);
    if (!typeAllowed) {
      return NextResponse.json({ error: "Hanya mendukung PDF, PNG, atau JPG" }, { status: 415 });
    }
    // Extract text (images use Gemini Vision internally)
    const text = await extractTextFromFile(file);
    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Tidak ada konten yang dapat diekstrak dari file" },
        { status: 400 }
      );
    }

    // Math-focused system instruction (Indonesian) — expects OCR text as user content
    const systemInstruction: ChatMessage = {
      role: "system",
      content: [
        "Anda adalah asisten pemecah soal matematika berbahasa Indonesia.",
        "Input pengguna adalah teks hasil OCR dari gambar/PDF (dapat berisi satu atau beberapa soal).",
        "Tugas Anda: pahami setiap soal dan selesaikan secara runtut serta ringkas dengan notasi LaTeX yang rapi.",
        "Format dan aturan:",
        "1) Gunakan Markdown untuk penjelasan.",
        "2) Notasi matematika WAJIB memakai LaTeX dengan delimiter:",
        "   - Inline: $...$",
        "   - Block/bagian terpisah: $$...$$ (pastikan tanda $$ berdiri sendiri di barisnya).",
        "3) Jangan gunakan tanda kurung siku [ ... ] untuk persamaan dan jangan pakai code fence untuk rumus.",
        "4) Sajikan langkah-langkah inti saja (jelas, tidak bertele-tele): sebut konsep yang dipakai (substitusi, integral parsial, identitas trigonometrik, aturan turunan, dll).",
        "5) Tampilkan jawaban akhir secara tegas (mis. \"Jawaban akhir: ...\"). Untuk pilihan ganda, jelaskan opsi yang benar.",
        "6) Jika input memuat beberapa nomor soal, bedakan tiap soal dengan subjudul atau poin bernomor (mis. Soal 1, Soal 2, ...).",
        "7) Jika ada bagian OCR yang tidak terbaca, tulis secara eksplisit [tidak terbaca] dan lanjutkan dengan asumsi minimal yang wajar bila memungkinkan.",
        "8) Hindari meminta pengguna mengirim ulang teks; gunakan data yang tersedia dalam input.",
      ].join("\n"),
    };

    // Trim user content to stay within approximate token budget
    const MAX_INPUT_TOKENS = Number(process.env.GROQ_MAX_INPUT_TOKENS) || 6000;
    const systemTokens = approxTokens(systemInstruction.content);
    const userBudgetTokens = Math.max(500, MAX_INPUT_TOKENS - systemTokens);
    const keepChars = Math.max(0, userBudgetTokens * 4);
    const trimmedUser = text.length > keepChars ? text.slice(-keepChars) : text;

    const userMessage: ChatMessage = { role: "user", content: trimmedUser };
    const messages: ChatMessage[] = [
      systemInstruction,
      userMessage,
    ];

    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    const MAX_OUTPUT_TOKENS = Number(process.env.GROQ_MAX_TOKENS) || 4048;

    const response = await callGroqWithFallback({
      model,
      messages,
      temperature: 0.3,
      stream: true,
      max_tokens: MAX_OUTPUT_TOKENS,
    }, req.signal);

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
        // Periodic SSE keep-alive comments to prevent idle timeouts
        const keepAliveMs = Number(process.env.SSE_KEEPALIVE_MS) || 15000;
        const sendKeepAlive = () => {
          try { controller.enqueue(encoder.encode(": keep-alive\n\n")); } catch {}
        };
        // Send reconnection hint and an initial keep-alive to promptly open the stream
        try { controller.enqueue(encoder.encode(`retry: ${keepAliveMs}\n\n`)); } catch {}
        sendKeepAlive();
        const abortHandler = () => { try { reader.cancel(); } catch {} };
        try { req.signal.addEventListener("abort", abortHandler); } catch {}
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
          // reader may throw on client abort; just close below
        } finally {
          try { clearInterval(keepAliveTimer); } catch {}
          try { req.signal.removeEventListener("abort", abortHandler); } catch {}
          try { controller.close(); } catch {}
          try { await reader.cancel(); } catch {}
        }
      },
    });

    return new Response(stream, { status: 200, headers });
  } catch (error: unknown) {
    console.error("Math-upload API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process math upload";
    return NextResponse.json(
      { error: { message: errorMessage } },
      { status: 500 }
    );
  }
}
