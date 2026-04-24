'use server'

import { GoogleGenerativeAI } from "@google/generative-ai";
import { analyzeWithGemini } from "@/lib/gemini";
import { refineWithGPToss } from "@/lib/groq";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Helper to get identifier for rate limiting (IP address)
 */
async function getRateLimitIdentifier() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0] : "127.0.0.1";
  return ip;
}

/**
 * Generic AI response generation
 */
export async function generateAIResponse(prompt: string) {
  try {
    const ip = await getRateLimitIdentifier();
    const { success } = await rateLimit(`ai-text-${ip}`);
    
    if (!success) {
      return { success: false, error: "Terlalu banyak permintaan. Coba lagi nanti." };
    }

    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return { success: true, data: response.text() };
  } catch (error) {
    console.error("AI Action Error:", error);
    return { success: false, error: "Gagal dapet respon dari AI" };
  }
}

/**
 * Specialized Math Solver Action
 * Prompts are kept on the server for security and consistency
 */
export async function solveMathAction(query: string) {
  try {
    const ip = await getRateLimitIdentifier();
    const { success } = await rateLimit(`math-solver-${ip}`);
    
    if (!success) {
      return { success: false, error: "Sabar bos, jangan nge-spam. Tunggu semenit ya." };
    }

    const prompt = `
      Kamu adalah asisten matematika. Jawab dengan langkah-langkah jelas dalam Bahasa Indonesia.
      Gunakan Markdown.
      Untuk matematika, SELALU gunakan delimiter LaTeX:
      - Inline: $...$
      - Display: $$...$$ (letakkan $$ di baris terpisah).
      Jangan bungkus rumus dengan tanda kurung [] atau code fences.
      Berikan jawaban akhir yang jelas di bagian akhir.
      
      Pertanyaan: ${query}
    `;

    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return { success: true, data: response.text() };
  } catch (error) {
    console.error("Math Solver Action Error:", error);
    return { success: false, error: "Gagal memproses soal matematika" };
  }
}

/**
 * Image Analysis Action with Rate Limiting
 */
export async function analyzeImageAction(formData: FormData) {
  try {
    const ip = await getRateLimitIdentifier();
    const { success } = await rateLimit(`ai-image-${ip}`);
    
    if (!success) {
      return { success: false, error: "Sabar, upload gambar itu berat. Coba lagi nanti." };
    }

    const file = formData.get("image") as File | null;
    const refine = formData.get("refine") === "true";

    if (!file) {
      return { success: false, error: "Tidak ada file yang diunggah" };
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/png";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const geminiText = await analyzeWithGemini(dataUrl);

    let refined: string | undefined;
    if (refine) {
      try {
        refined = await refineWithGPToss(geminiText);
      } catch (err) {
        console.error("Refinement Error:", err);
      }
    }

    return {
      success: true,
      gemini: geminiText,
      refined,
      model: {
        gemini: process.env.GEMINI_MODEL || "gemini-1.5-flash",
        ...(refined ? { gptoss: process.env.GROQ_MODEL || "openai/gpt-oss-120b" } : {}),
      },
      meta: {
        mimeType,
        size: file.size,
      }
    };
  } catch (error) {
    console.error("AI Action Error (Image):", error);
    return { success: false, error: error instanceof Error ? error.message : "Gagal menganalisis gambar" };
  }
}
