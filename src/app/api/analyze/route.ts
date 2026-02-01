import { NextRequest, NextResponse } from "next/server";
import { analyzeWithGemini } from "@/lib/gemini";
import { refineWithGPToss } from "@/lib/groq";

export const runtime = "nodejs"; // Use Node runtime since we use Buffer
export const dynamic = "force-dynamic"; // Ensure not statically optimized
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

type AnalyzeSuccess = {
  ok: true;
  gemini: string;
  refined?: string;
  model: {
    gemini: string;
    gptoss?: string;
  };
  meta: {
    mimeType: string;
    size: number;
  };
};

type AnalyzeError = {
  ok: false;
  error: string;
  details?: any;
};

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    // Accept either 'image' or 'file' key
    const file = (form.get("image") || form.get("file")) as File | null;
    const refine = String(form.get("refine") || "false").toLowerCase() === "true";

    if (!file) {
      return NextResponse.json<AnalyzeError>({ ok: false, error: "No file provided: expected field 'image'" }, { status: 400 });
    }

    if (typeof file.arrayBuffer !== "function") {
      return NextResponse.json<AnalyzeError>({ ok: false, error: "Invalid file object" }, { status: 400 });
    }

    const mimeType = file.type || "image/png";
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json<AnalyzeError>({ ok: false, error: "Unsupported file type. Only images are allowed." }, { status: 415 });
    }

    // Enforce 10MB max image size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json<AnalyzeError>({ ok: false, error: "Ukuran file maksimal 10MB" }, { status: 413 });
    }

    // Convert to base64
    const ab = await file.arrayBuffer();

    // Node: Buffer is available
    const base64 = Buffer.from(ab).toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Call Gemini Vision helper
    const geminiText = await analyzeWithGemini(dataUrl);

    let refined: string | undefined;
    if (refine) {
      try {
        refined = await refineWithGPToss(geminiText);
      } catch (err: any) {
        // Don't fail the whole request; return Gemini result and attach refinement error detail
        return NextResponse.json<AnalyzeSuccess | AnalyzeError>(
          {
            ok: true,
            gemini: geminiText,
            model: { gemini: process.env.GEMINI_MODEL || "gemini-2.5-flash" },
            meta: { mimeType, size: file.size },
          },
          { headers: { "X-Refine-Error": err?.message || "Refinement failed" } }
        );
      }
    }

    return NextResponse.json<AnalyzeSuccess>({
      ok: true,
      gemini: geminiText,
      refined,
      model: {
        gemini: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        ...(refined ? { gptoss: process.env.GROQ_MODEL || "openai/gpt-oss-120b" } : {}),
      },
      meta: {
        mimeType,
        size: file.size,
      },
    });
  } catch (error: any) {
    const message = error?.message || "Failed to analyze image";
    return NextResponse.json<AnalyzeError>({ ok: false, error: message, details: error }, { status: 500 });
  }
}
