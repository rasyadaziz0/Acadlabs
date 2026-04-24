import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { getGroqKeys } from "@/lib/ai-service";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

// Helper to convert file to GoogleGenerativeAI Part
async function fileToGenerativePart(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const base64Image = Buffer.from(arrayBuffer).toString("base64");
  return {
    inlineData: {
      data: base64Image,
      mimeType: file.type,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth Check
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parsers
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userInstruction = formData.get("instruction") as string || "";

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });
    if (!ALLOWED_MIMES.has(file.type)) return NextResponse.json({ error: "Supported: PNG, JPG, WEBP" }, { status: 415 });

    // 3. STEP 1: GEMINI VISION (OCR ONLY)
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return NextResponse.json({ error: "Server AI Config Error (Gemini)" }, { status: 500 });

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const visionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const imagePart = await fileToGenerativePart(file);

    // Strict OCR Prompt
    const ocrPrompt = `
        Transcribe ALL text, numbers, mathematical formulas, and CODE blocks from this image exactly as they appear.
        - Use LaTeX for math expressions (inline $...$, block $$...$$).
        - Use Markdown code blocks for code snippets (e.g. cpp, python, go, etc).
        - Do NOT solve the problem.
        - Do NOT add explanations.
        - Output ONLY the raw content.
        `;

    const ocrResult = await visionModel.generateContent([ocrPrompt, imagePart]);
    const extractedText = ocrResult.response.text();

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json({ error: "Failed to read text from image." }, { status: 400 });
    }

    // 4. STEP 2: GROQ (SOLVER)
    const groqKeys = getGroqKeys();
    if (groqKeys.length === 0) return NextResponse.json({ error: "Server AI Config Error (Groq)" }, { status: 500 });
    const apiKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      console.error("Invalid Groq API key selected");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.info("usage:math-upload", { userId: user.id, fileSize: file.size, mimeType: file.type });
    const groq = new Groq({ apiKey });

    const systemPrompt = `
        Role: You are an expert STEM (Math & Coding) Tutor for Indonesian students.
        Task: Solve the problem provided in the User Input (which is OCR text from an image).
        
        Guidelines:
        1.  **Analyze**: Identify the problem (Math or Coding).
        2.  **Step-by-Step**: Show detailed calculation or logic.
        3.  **Math**: Use LaTeX for formulas ($...$, $$...$$).
        4.  **Coding**: Use Code Blocks for code solution.
        5.  **Language**: Explain in Indonesian.
        6.  **Format**: Use Markdown.
        
        Output Structure:
        ## Identifikasi Soal
        (Rewrite the problem)
        
        ## Langkah Penyelesaian / Kode Solusi
        (Step-by-step solution or Code with explanation)
        
        ## Kesimpulan / Jawaban Akhir
        (Final Answer/Output)
        `;

    // Create Stream
    const stream = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `OCR Result from Image:\n\n${extractedText}\n\nUser Instruction:\n${userInstruction}` }
      ],
      model: "openai/gpt-oss-120b",
      temperature: 0.3,
      max_tokens: 4096,
      stream: true,
    });

    // 5. Proxy Stream to Client
    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              const sse = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
              controller.enqueue(encoder.encode(sse));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (error: any) {
    console.error("Math Solver Pipeline Error:", error);
    return NextResponse.json({
      error: "Internal Server Error"
    }, { status: 500 });
  }
}
