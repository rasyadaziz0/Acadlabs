import { analyzeWithGemini } from "@/lib/gemini";
import { refineWithGPToss } from "@/lib/groq";
import { promises as fs } from "fs";

export type AnalysisSource = "gemini" | "gpt-oss";
export type AnalysisResult = {
  source: AnalysisSource;
  content: string;
  meta?: Record<string, unknown>;
};

const TEXT_MIN_THRESHOLD = 20; // characters; below this we consider it likely image-scan

function getExt(name: string | undefined | null): string {
  if (!name) return "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

// Server-side: extract text from a local file path without using File/arrayBuffer
export async function extractTextFromLocalFile(filePath: string, mime?: string, filename?: string): Promise<string> {
  if (!filePath) throw new Error("No file path provided");
  const buf = await fs.readFile(filePath);
  const inferred = filename ? inferMimeFromName(filename) : "";
  const m = mime || inferred || "application/octet-stream";

  if (m.startsWith("image/")) {
    const dataUrl = bufferToDataUrl(buf, m);
    const text = await analyzeWithGemini(dataUrl);
    return (text || "").trim();
  }

  if (m === "application/pdf") {
    const text = await extractTextFromPdf(buf);
    if (text && text.length >= TEXT_MIN_THRESHOLD) return text;
    throw new Error(
      "PDF tampak berbasis gambar (scan). OCR PDF belum diaktifkan di server. Konversi ke gambar (PNG/JPG) lalu upload, atau hubungi admin untuk mengaktifkan OCR PDF."
    );
  }

  if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const text = await extractTextFromDocx(buf);
    if (text && text.length >= TEXT_MIN_THRESHOLD) return text;
    const ocrText = await extractTextFromDocxImagesWithOCR(buf);
    if (ocrText && ocrText.length >= TEXT_MIN_THRESHOLD) return ocrText;
    throw new Error(
      "DOCX tidak memiliki teks yang dapat diekstrak. Pastikan dokumen berisi teks atau unggah gambar secara langsung."
    );
  }

  if (m.startsWith("text/")) {
    const text = buf.toString("utf8").trim();
    if (text && text.length > 0) return text;
    throw new Error("File teks kosong atau tidak dapat dibaca.");
  }

  // Extension fallbacks
  const ext = filename ? getExt(filename) : "";
  if (["txt", "md"].includes(ext)) {
    const text = buf.toString("utf8").trim();
    if (text && text.length > 0) return text;
    throw new Error("File teks kosong atau tidak dapat dibaca.");
  }

  throw new Error(
    `Tipe file tidak didukung untuk ekstraksi teks: ${m || filename}. Unggah PDF, DOCX, TXT, atau gambar.`,
  );
}

function inferMimeFromName(name: string): string {
  const ext = getExt(name);
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "txt":
    case "md":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

async function fileToBuffer(file: File): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

async function fileToDataUrl(file: File): Promise<string> {
  const mime = file.type || inferMimeFromName(file.name) || "application/octet-stream";
  const buf = await fileToBuffer(file);
  const base64 = buf.toString("base64");
  return `data:${mime};base64,${base64}`;
}

function bufferToDataUrl(buf: Buffer, mime: string): string {
  const base64 = buf.toString("base64");
  return `data:${mime};base64,${base64}`;
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // Some versions of pdf-parse bring in dev/test paths in dev mode.
  // Try a stable lib path first, then fallback to default import.
  type PdfParseFn = (dataBuffer: Buffer | Uint8Array | ArrayBuffer) => Promise<{ text?: string }>;
  let pdfParse: PdfParseFn;
  try {
    const modLib = await import("pdf-parse/lib/pdf-parse.js");
    const maybeDefault = (modLib as unknown as { default?: unknown }).default ?? (modLib as unknown);
    pdfParse = maybeDefault as unknown as PdfParseFn;
  } catch {
    const mod = await import("pdf-parse");
    const maybeDefault = (mod as unknown as { default?: unknown }).default ?? (mod as unknown);
    pdfParse = maybeDefault as unknown as PdfParseFn;
  }

  try {
    const result = await pdfParse(buffer);
    const text: string = (result?.text || "").trim();
    return text;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    // Guard against dev/test path leak like 'test/data/05-versions-space.pdf'
    if (/test[\/\\]data[\/\\]05-versions-space\.pdf/i.test(msg) || /ENOENT/i.test(msg)) {
      throw new Error(
        "Gagal mengekstrak teks dari PDF di lingkungan dev. Coba jalankan build production (npm run build && npm start) atau unggah sebagai gambar (PNG/JPG)."
      );
    }
    throw err;
  }
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer });
  return (value || "").trim();
}

async function extractTextFromDocxImagesWithOCR(buffer: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const imageEntries = Object.keys(zip.files).filter((k) => k.startsWith("word/media/"));
  if (imageEntries.length === 0) return "";

  const { recognize } = await import("tesseract.js");
  const parts: string[] = [];
  for (const k of imageEntries) {
    const file = zip.files[k];
    if (!file) continue;
    const u8 = await file.async("uint8array");
    const imgBuf = Buffer.from(u8);
    try {
      const { data } = await recognize(imgBuf, "eng");
      const txt = (data?.text || "").trim();
      if (txt) parts.push(txt);
    } catch {
      // ignore individual image OCR errors, continue others
    }
  }
  return parts.join("\n\n").trim();
}

async function extractTextFromTxtFile(file: File): Promise<string> {
  try {
    // Web File API on the server
    const text = await file.text();
    return (text || "").trim();
  } catch {
    // Fallback via buffer
    const buf = await fileToBuffer(file);
    return buf.toString("utf8").trim();
  }
}

export async function processWithGemini(file: File): Promise<AnalysisResult> {
  const dataUrl = await fileToDataUrl(file);
  const content = await analyzeWithGemini(dataUrl);
  return {
    source: "gemini",
    content,
    meta: {
      mimeType: file.type || inferMimeFromName(file.name),
      size: file.size,
    },
  };
}

export async function processWithGptOSS(text: string): Promise<AnalysisResult> {
  const content = await refineWithGPToss(String(text ?? ""));
  return {
    source: "gpt-oss",
    content,
  };
}

export async function extractTextFromFile(file: File): Promise<string> {
  if (!file) throw new Error("No file provided");
  const mime = file.type || inferMimeFromName(file.name);

  if (mime.startsWith("image/")) {
    const dataUrl = await fileToDataUrl(file);
    const text = await analyzeWithGemini(dataUrl);
    return (text || "").trim();
  }

  if (mime === "application/pdf") {
    const buf = await fileToBuffer(file);
    const text = await extractTextFromPdf(buf);
    if (text && text.length >= TEXT_MIN_THRESHOLD) return text;
    throw new Error(
      "PDF tampak berbasis gambar (scan). OCR PDF belum diaktifkan di server. Konversi ke gambar (PNG/JPG) lalu upload, atau hubungi admin untuk mengaktifkan OCR PDF."
    );
  }

  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const buf = await fileToBuffer(file);
    const text = await extractTextFromDocx(buf);
    if (text && text.length >= TEXT_MIN_THRESHOLD) return text;
    const ocrText = await extractTextFromDocxImagesWithOCR(buf);
    if (ocrText && ocrText.length >= TEXT_MIN_THRESHOLD) return ocrText;
    throw new Error(
      "DOCX tidak memiliki teks yang dapat diekstrak. Pastikan dokumen berisi teks atau unggah gambar secara langsung."
    );
  }

  if (mime.startsWith("text/")) {
    const text = await extractTextFromTxtFile(file);
    if (text && text.length > 0) return text;
    throw new Error("File teks kosong atau tidak dapat dibaca.");
  }

  // Extension fallbacks for missing/unknown mime
  const ext = getExt(file.name);
  if (["txt", "md"].includes(ext)) {
    const text = await extractTextFromTxtFile(file);
    if (text && text.length > 0) return text;
    throw new Error("File teks kosong atau tidak dapat dibaca.");
  }

  throw new Error(
    `Tipe file tidak didukung untuk ekstraksi teks: ${mime || file.name}. Unggah PDF, DOCX, atau TXT.`
  );
}

export async function handleFileUpload(file: File): Promise<AnalysisResult> {
  if (!file) throw new Error("No file provided");
  const mime = file.type || inferMimeFromName(file.name);

  // Images → Gemini Vision
  if (mime.startsWith("image/")) {
    return await processWithGemini(file);
  }

  // Documents → extract text first
  const buf = await fileToBuffer(file);

  if (mime === "application/pdf") {
    const text = await extractTextFromPdf(buf);
    if (text && text.length >= TEXT_MIN_THRESHOLD) {
      return await processWithGptOSS(text);
    }
    // TODO: PDF OCR. Converting PDF pages to images requires extra deps (pdfjs-dist + canvas or external tools).
    // For now, return a meaningful error so the caller can prompt user to upload as images instead.
    throw new Error(
      "PDF tampak berbasis gambar (scan). OCR PDF belum diaktifkan di server. Konversi ke gambar (PNG/JPG) lalu upload, atau hubungi admin untuk mengaktifkan OCR PDF."
    );
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const text = await extractTextFromDocx(buf);
    if (text && text.length >= TEXT_MIN_THRESHOLD) {
      return await processWithGptOSS(text);
    }
    // Likely image-only DOCX → OCR embedded images with Tesseract
    const ocrText = await extractTextFromDocxImagesWithOCR(buf);
    if (ocrText && ocrText.length >= TEXT_MIN_THRESHOLD) {
      return await processWithGptOSS(ocrText);
    }
    throw new Error(
      "DOCX tidak memiliki teks yang dapat diekstrak. Pastikan dokumen berisi teks atau unggah gambar secara langsung."
    );
  }

  if (mime.startsWith("text/")) {
    const text = await extractTextFromTxtFile(file);
    if (text && text.length > 0) return await processWithGptOSS(text);
    throw new Error("File teks kosong atau tidak dapat dibaca.");
  }

  // Extension fallbacks
  const ext = getExt(file.name);
  if (["txt", "md"].includes(ext)) {
    const text = await extractTextFromTxtFile(file);
    if (text && text.length > 0) return await processWithGptOSS(text);
    throw new Error("File teks kosong atau tidak dapat dibaca.");
  }

  throw new Error(
    `Tipe file tidak didukung untuk saat ini: ${mime || file.name}. Unggah gambar (image/*), PDF, DOCX, atau TXT.`
  );
}
