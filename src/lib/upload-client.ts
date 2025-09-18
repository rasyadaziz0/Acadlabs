"use client";

export type ClientAnalysisSource = "gemini" | "gpt-oss";
export type ClientAnalysisResult = {
  source: ClientAnalysisSource;
  content: string;
  meta?: Record<string, any>;
};

export async function processWithGemini(file: File, refine = false): Promise<ClientAnalysisResult> {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("refine", String(!!refine));

  const res = await fetch("/api/analyze", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error((data && (data.error || data.message)) || "Gagal analisis gambar");
  }
  return {
    source: "gemini",
    content: refine && data.refined ? data.refined : data.gemini,
    meta: { model: data.model, file: data.meta },
  };
}

export async function processWithGptOSS(text: string): Promise<ClientAnalysisResult> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: String(text ?? "") }] }),
  });
  const data = await res.json();
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || data?.error || "Gagal memproses teks di GPT-oss";
    throw new Error(msg);
  }
  return {
    source: "gpt-oss",
    content: data.content,
  };
}

export async function handleFileUpload(file: File, options?: { refineImage?: boolean }): Promise<ClientAnalysisResult> {
  if (!file) throw new Error("Pilih file terlebih dahulu");

  // Gambar → langsung ke analyzer gambar (Gemini)
  if (file.type?.startsWith("image/")) {
    return await processWithGemini(file, !!options?.refineImage);
  }

  // Dokumen → serahkan ke API server umum yang akan ekstrak teks dan kirim ke GPT-oss
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error((data && (data.error || data.message)) || "Gagal memproses dokumen");
  }
  return data.result as ClientAnalysisResult;
}
