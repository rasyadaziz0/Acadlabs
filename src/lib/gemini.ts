import { GoogleGenerativeAI } from "@google/generative-ai";

export async function analyzeWithGemini(imageBase64: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in server environment");
  }

  let mimeType = "image/png";
  let rawBase64 = imageBase64;
  const dataUrlMatch = /^data:(.+);base64,(.*)$/i.exec(imageBase64);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    rawBase64 = dataUrlMatch[2];
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  });

  // IMPORTANT: use OCR-style instructions tailored for math content.
  // The goal is to TRANSCRIBE all visible text faithfully, not to describe the picture.
  const prompt = [
    "TUGAS: Lakukan OCR terstruktur pada gambar/halaman berisi soal matematika.",
    "KELUARAN HARUS HANYA TEKS (tanpa penjelasan atau opini).",
    "INSTRUKSI:",
    "- Salin semua teks yang terlihat secara lengkap dan rapi: nomor soal, pernyataan soal, rumus, satuan, dan pilihan jawaban A–E.",
    "- Tulis ekspresi matematika menggunakan LaTeX: inline pakai $...$ dan baris terpisah pakai $$...$$ (tanda $$ berdiri sendiri di barisnya).",
    "- Pertahankan penomoran aslinya. Untuk pilihan ganda, gunakan format: A) ..., B) ..., C) ..., D) ..., E) ...",
    "- Jangan menambah penjelasan, jangan meringkas, jangan menilai jawaban. Fokus hanya menyalin konten apa adanya sejelas mungkin.",
    "- Jika ada beberapa soal dalam satu gambar, pisahkan dengan baris kosong di antara tiap nomor.",
    "- Jika teks tidak terbaca di bagian tertentu, tulis [tidak terbaca] pada bagian tersebut, jangan mengarang.",
  ].join("\n");

  try {
    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          data: rawBase64,
          mimeType,
        },
      },
    ] as unknown as Parameters<typeof model.generateContent>[0]);

    const response = await result.response;
    const text = response.text();
    return text?.trim() || "";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gemini API error";
    throw new Error(message);
  }
}
